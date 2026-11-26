import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { useLocation, useNavigate } from "react-router-dom";

import { ask } from "./engine/call.mjs";
import { buildShip, setThrust, disposeShip } from "./engine/shipModels";
import { PHASE_SEQUENCE } from "./flight/phases.mjs";
import { stateAt, totalDays, isPlayable, phaseLogLine } from "./flight/playback.mjs";
import ShipPicker from "./components/ShipPicker";
import "./AMDS.css";

// Phase colours are shared with the playback module so the badge, the strip and
// the log cannot disagree about what ANCHORING looks like.
const PHASE_COLORS = PHASE_SEQUENCE;

/** The manual commands, in order. One per phase that takes time. */
const MANUAL_STEPS = [
  { phase: "TRANSIT", label: "Execute transfer burn", desc: "Fire for the target" },
  { phase: "APPROACH", label: "Begin approach", desc: "Match rotation and close in" },
  { phase: "ANCHORING", label: "Deploy anchors", desc: "Harpoon into the surface" },
  { phase: "DRILLING", label: "Begin drilling", desc: "Spin up the drill head" },
  { phase: "EXTRACTING", label: "Transfer ore to the hold", desc: "Move rock into storage" },
  { phase: "RETURNING", label: "Execute return burn", desc: "Release anchors and fire for home" },
];

const DEFAULT_SHIP = "ion-freighter";

/** Six seconds per command, whatever the phase really takes. */
const MANUAL_SECONDS_PER_PHASE = 6;

const FILTERS = [
  { id: "all", label: "All" },
  { id: "reachable", label: "Reachable" },
  { id: "water", label: "Water" },
  { id: "metal", label: "Metal" },
];

export default function AMDS() {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const frameRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const shipRef = useRef(null);
  const particlesRef = useRef(null);
  const asteroidMeshRef = useRef(null);
  const phaseRef = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();

  // ── What the engine told us ──
  const [fleet, setFleet] = useState(null);
  const [rocks, setRocks] = useState(null);
  const [engineError, setEngineError] = useState(null);

  // ── What the operator picked ──
  const [shipId, setShipId] = useState(DEFAULT_SHIP);
  const [asteroidId, setAsteroidId] = useState(null);
  const [tonnage, setTonnage] = useState(500);
  const [filter, setFilter] = useState("all");

  // ── The mission ──
  const [check, setCheck] = useState(null);
  const [envelope, setEnvelope] = useState(null);
  const [sim, setSim] = useState(null);
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [manualMode, setManualMode] = useState(true);
  const [manualStep, setManualStep] = useState(0);
  const [manualTarget, setManualTarget] = useState(null);
  const [log, setLog] = useState([{ t: "00:00", msg: "Awaiting a target and a ship." }]);

  // The viewport can lose its WebGL context: the browser hands out a limited
  // number and takes them back under pressure, which in development is reached
  // easily because StrictMode mounts every effect twice and each hot reload
  // builds another renderer. Rather than leave a dead canvas, the loss is
  // caught and the scene can be rebuilt. Bumping sceneKey does that.
  const [sceneKey, setSceneKey] = useState(0);
  const [viewportLost, setViewportLost] = useState(false);

  const addLog = useCallback((msg) => {
    setLog((prev) => {
      const mins = Math.floor((prev.length * 3) / 60).toString().padStart(2, "0");
      const secs = ((prev.length * 3) % 60).toString().padStart(2, "0");
      return [...prev.slice(-14), { t: `${mins}:${secs}`, msg }];
    });
  }, []);

  // ── Derived ──
  const ship = useMemo(() => fleet?.ships?.find((s) => s.id === shipId) ?? null, [fleet, shipId]);
  const asteroid = useMemo(
    () => rocks?.find((r) => r.id === asteroidId) ?? null,
    [rocks, asteroidId],
  );
  const frames = useMemo(() => (isPlayable(sim?.timeline) ? sim.timeline : null), [sim]);
  const total = useMemo(() => (frames ? totalDays(frames) : 0), [frames]);
  const mission = useMemo(() => (frames ? stateAt(frames, day) : null), [frames, day]);

  const hold = ship?.cargo_capacity_tons ?? null;
  const specsKnown = ship ? ship.exhaust_velocity_m_s != null : false;
  const canFly = Boolean(check?.feasible) && specsKnown;
  const flying = Boolean(frames);
  const done = Boolean(mission?.done);

  // ── Load the catalogues once ──
  useEffect(() => {
    let live = true;
    (async () => {
      const [ships, search] = await Promise.all([
        ask("list_ships"),
        ask("search_asteroids", { limit: 50 }),
      ]);
      if (!live) return;
      if (ships.error || search.error) {
        setEngineError(ships.hint ?? search.hint ?? "The physics engine did not load.");
        return;
      }
      setFleet(ships);
      const list = (search.asteroids ?? []).slice().sort((a, b) => a.delta_v_km_s - b.delta_v_km_s);
      setRocks(list);
      setAsteroidId((cur) => cur ?? list[0]?.id ?? null);
    })();
    return () => {
      live = false;
    };
  }, []);

  // ── A target handed over from the asteroid browser at /asteroids ──
  useEffect(() => {
    const wanted = location.state?.asteroid?.name;
    if (!wanted || !rocks) return;
    const needle = wanted.toLowerCase();
    const hit = rocks.find(
      (r) =>
        r.name?.toLowerCase().includes(needle) ||
        needle.includes((r.des ?? "").toLowerCase()) ||
        needle.includes((r.name ?? "").toLowerCase()),
    );
    if (hit) {
      setAsteroidId(hit.id);
      addLog(`Target ${hit.name} carried over from the browser.`);
    }
  }, [location.state, rocks, addLog]);

  // ── Keep the haul inside the hold ──
  useEffect(() => {
    if (hold == null || hold <= 0) return;
    setTonnage((t) => Math.min(Math.max(t, hold / 1000), hold));
  }, [hold]);

  // ── What this ship can do, and whether this mission is possible ──
  useEffect(() => {
    let live = true;
    (async () => {
      if (!ship) return;
      const env = await ask("ship_envelope", { ship_id: ship.id });
      if (live) setEnvelope(env.error ? null : env);
    })();
    return () => {
      live = false;
    };
  }, [ship]);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!ship || !asteroid) return;
      if (!specsKnown || !hold || hold <= 0) {
        setCheck(null);
        return;
      }
      const out = await ask("check_ship", {
        asteroid_id: asteroid.id,
        ship_id: ship.id,
        target_tons: tonnage,
      });
      if (live) setCheck(out);
    })();
    return () => {
      live = false;
    };
  }, [ship, asteroid, tonnage, specsKnown, hold]);

  // ── The scene. Built once; the ship inside it is swapped separately. ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth;
    const H = mount.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, W / H, 0.01, 500);
    camera.position.set(0, 5, 10);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 3;
    controls.maxDistance = 25;
    controlsRef.current = controls;

    const starVerts = [];
    for (let i = 0; i < 3000; i++) {
      starVerts.push(
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
      );
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starVerts, 3));
    scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.8 }),
      ),
    );

    const sunLight = new THREE.DirectionalLight(0xfff5e0, 2.5);
    sunLight.position.set(20, 10, 15);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0x0a0f1a, 0.8));

    // The rock. Its shape is decoration: one of five lumpy presets. The
    // numbers about it all come from the engine, never from this mesh.
    const asteroidPresets = [
      { lumpScale: [2.1, 1.8, 2.5, 2.2, 1.9, 2.4], lumpAmp: [0.35, 0.28, 0.22], noise: 0.06, color: 0x999980 },
      { lumpScale: [3.2, 2.8, 3.5, 3.1, 2.9, 3.3], lumpAmp: [0.12, 0.1, 0.08], noise: 0.12, color: 0x888878 },
      { lumpScale: [1.4, 1.2, 1.8, 1.5, 1.3, 1.6], lumpAmp: [0.45, 0.38, 0.3], noise: 0.05, color: 0xaaa890 },
      { lumpScale: [1.0, 3.5, 1.2, 3.8, 1.1, 3.6], lumpAmp: [0.55, 0.15, 0.12], noise: 0.07, color: 0x777768 },
      { lumpScale: [2.8, 2.2, 2.5, 2.9, 2.3, 2.7], lumpAmp: [0.2, 0.18, 0.22], noise: 0.15, color: 0x666658 },
    ];
    const preset = asteroidPresets[Math.floor(Math.random() * asteroidPresets.length)];
    const astGeo = new THREE.SphereGeometry(1.4, 128, 128);
    const pos = astGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const lump1 = Math.sin(x * preset.lumpScale[0]) * Math.cos(y * preset.lumpScale[1]) * preset.lumpAmp[0];
      const lump2 = Math.sin(y * preset.lumpScale[2]) * Math.cos(z * preset.lumpScale[3]) * preset.lumpAmp[1];
      const lump3 = Math.sin(z * preset.lumpScale[4]) * Math.cos(x * preset.lumpScale[5]) * preset.lumpAmp[2];
      const noise = (Math.random() - 0.5) * preset.noise;
      const scale = 1 + lump1 + lump2 + lump3 + noise;
      pos.setXYZ(i, x * scale, y * scale, z * scale);
    }
    astGeo.computeVertexNormals();

    const astLoader = new THREE.TextureLoader();
    const astTexture = astLoader.load(
      "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/moon_1024.jpg",
    );
    const astMesh = new THREE.Mesh(
      astGeo,
      new THREE.MeshStandardMaterial({
        map: astTexture,
        bumpMap: astTexture,
        bumpScale: 1.2,
        roughness: 1.0,
        metalness: 0.05,
        color: preset.color,
      }),
    );
    scene.add(astMesh);
    asteroidMeshRef.current = astMesh;

    const partVerts = new Float32Array(300);
    for (let i = 0; i < 300; i += 3) {
      partVerts[i] = (Math.random() - 0.5) * 0.5;
      partVerts[i + 1] = (Math.random() - 0.5) * 0.5;
      partVerts[i + 2] = (Math.random() - 0.5) * 0.5;
    }
    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute("position", new THREE.Float32BufferAttribute(partVerts, 3));
    const particles = new THREE.Points(
      partGeo,
      new THREE.PointsMaterial({ color: 0xc8a96e, size: 0.04, transparent: true, opacity: 0 }),
    );
    scene.add(particles);
    particlesRef.current = particles;

    const clock = new THREE.Clock();
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      astMesh.rotation.y = t * 0.04;
      astMesh.rotation.x = t * 0.01;
      // Shimmer whatever solar arrays this ship happens to have. Tagged in
      // userData rather than found by child index, because every ship has a
      // different number of them.
      for (const panel of shipRef.current?.userData?.panels ?? []) {
        panel.material.emissiveIntensity = 0.2 + Math.sin(t * 2) * 0.1;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // Calling preventDefault is what makes a restore possible at all. Without
    // it the browser never offers the context back.
    const canvas = renderer.domElement;
    const onContextLost = (event) => {
      event.preventDefault();
      cancelAnimationFrame(frameRef.current);
      setViewportLost(true);
    };
    const onContextRestored = () => {
      setViewportLost(false);
      setSceneKey((k) => k + 1);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    return () => {
      cancelAnimationFrame(frameRef.current);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      controls.dispose();
      window.removeEventListener("resize", onResize);
      // dispose alone leaves the GPU context alive until it is collected, so
      // a double mount or a hot reload quietly leaks one every time. This
      // hands it back immediately.
      renderer.forceContextLoss();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      shipRef.current = null;
      particlesRef.current = null;
      asteroidMeshRef.current = null;
    };
  }, [sceneKey]);

  // ── Swap the ship in the viewport when a different one is picked ──
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !ship) return;

    const previous = shipRef.current;
    if (previous) {
      previous.parent?.remove(previous);
      disposeShip(previous);
    }

    const mesh = buildShip(ship.model, { dryMassTons: ship.dry_mass_tons });
    mesh.position.set(0, 0.5, 4);
    scene.add(mesh);
    shipRef.current = mesh;
    phaseRef.current = null;
  }, [ship, sceneKey]);

  // How fast a manual command plays, in days per second. Set per phase so a
  // long cruise and a short anchoring both take about six seconds.
  const manualPaceRef = useRef(10);

  // ── The clock. One input, the day. ──
  useEffect(() => {
    if (!frames) return;
    if (!playing && manualTarget == null) return;

    const stepMs = 80;
    const id = setInterval(() => {
      setDay((d) => {
        const perSecond = manualTarget != null ? manualPaceRef.current : speed;
        const next = Math.min(d + (perSecond * stepMs) / 1000, total);
        if (manualTarget != null && next >= manualTarget) {
          return manualTarget;
        }
        return next;
      });
    }, stepMs);
    return () => clearInterval(id);
  }, [frames, playing, manualTarget, speed, total]);

  // Reaching a manual waypoint, or the end, stops the clock.
  useEffect(() => {
    if (manualTarget != null && day >= manualTarget) setManualTarget(null);
  }, [day, manualTarget]);

  useEffect(() => {
    if (done && playing) setPlaying(false);
  }, [done, playing]);

  // ── A phase change is the only thing that logs or moves the ship on the rock ──
  useEffect(() => {
    if (!frames || !mission) return;
    if (phaseRef.current === mission.phase) return;
    phaseRef.current = mission.phase;

    addLog(phaseLogLine(frames[mission.index]));

    const mesh = shipRef.current;
    if (!mesh) return;

    setThrust(
      mesh,
      mission.phase === "TRANSIT" || mission.phase === "RETURNING"
        ? 2
        : mission.phase === "APPROACH"
          ? 0.8
          : 0,
    );
    if (particlesRef.current) {
      particlesRef.current.material.opacity =
        mission.phase === "DRILLING" || mission.phase === "EXTRACTING" ? 0.8 : 0;
    }

    const rock = asteroidMeshRef.current;
    if (mission.attached && rock && mesh.parent !== rock) {
      const world = new THREE.Vector3();
      mesh.getWorldPosition(world);
      rock.add(mesh);
      rock.worldToLocal(world);
      mesh.position.copy(world);
      mesh.rotation.set(0, 0, 0);
    } else if (!mission.attached && sceneRef.current && mesh.parent !== sceneRef.current) {
      const world = new THREE.Vector3();
      mesh.getWorldPosition(world);
      sceneRef.current.add(mesh);
      mesh.position.copy(world);
    }
  }, [frames, mission, addLog]);

  // ── Where the ship sits on the way out and the way home ──
  useEffect(() => {
    if (!mission || mission.attached) return;
    const mesh = shipRef.current;
    if (!mesh) return;
    const away =
      mission.phase === "TRANSIT"
        ? mission.phase_progress
        : mission.phase === "RETURNING"
          ? 1 - mission.phase_progress
          : mission.phase === "STANDBY" || mission.phase === "COMPLETE"
            ? 0
            : 1;
    mesh.position.z = 4 - away * 2.5;
    mesh.position.y = 0.5 + Math.sin(away * Math.PI) * 0.3;
  }, [mission]);

  // ── Commands ──
  const launch = useCallback(async () => {
    if (!ship || !asteroid) return;
    const out = await ask("simulate_mission", {
      asteroid_id: asteroid.id,
      ship_id: ship.id,
      tons: tonnage,
    });
    if (out.error) {
      addLog(`Refused: ${out.error}. ${out.hint ?? ""}`);
      return;
    }
    setSim(out);
    setDay(0);
    setManualStep(0);
    setManualTarget(null);
    phaseRef.current = null;
    setLog([
      {
        t: "00:00",
        msg: `${ship.name} cleared for ${asteroid.name} with ${tonnage.toLocaleString("en-US")} tons planned over ${out.totals.mission_days} days.`,
      },
    ]);
    setPlaying(!manualMode);
  }, [ship, asteroid, tonnage, manualMode, addLog]);

  const advanceManual = useCallback(() => {
    if (!frames) return;
    const step = MANUAL_STEPS[manualStep];
    if (!step) return;
    const frame = frames.find((f) => f.phase === step.phase);
    if (!frame) {
      setManualStep((i) => i + 1);
      return;
    }
    // Each command takes about the same wall time whatever the phase costs in
    // days, so a 265 day cruise does not stall the demo. The day counter still
    // shows the truth.
    manualPaceRef.current = Math.max(frame.duration_days / MANUAL_SECONDS_PER_PHASE, 0.05);
    setDay(Math.max(frame.start_day, day));
    setManualTarget(Math.max(frame.end_day - 0.001, frame.start_day));
    setManualStep((i) => i + 1);
  }, [frames, manualStep, day]);

  const reset = useCallback(() => {
    setSim(null);
    setDay(0);
    setPlaying(false);
    setManualStep(0);
    setManualTarget(null);
    phaseRef.current = null;
    setLog([{ t: "00:00", msg: "Reset. Pick a target and a ship." }]);
    const mesh = shipRef.current;
    if (mesh && sceneRef.current) {
      sceneRef.current.add(mesh);
      mesh.position.set(0, 0.5, 4);
      mesh.rotation.set(0, 0, 0);
      setThrust(mesh, 0);
    }
    if (particlesRef.current) particlesRef.current.material.opacity = 0;
  }, []);

  // ── Render ──
  const phase = mission?.phase ?? "STANDBY";
  const phaseColor = PHASE_COLORS[phase] ?? "#8892a4";
  const totals = sim?.totals ?? null;

  const visible = useMemo(() => {
    if (!rocks) return [];
    return rocks.filter((r) => {
      if (filter === "water") return (r.water_fraction ?? 0) >= 0.05;
      if (filter === "metal") return ["M", "X", "E"].includes(r.composition_class);
      if (filter === "reachable") {
        return envelope ? r.delta_v_km_s * 1000 <= (envelope.delta_v_capacity_km_s ?? 0) * 1000 : true;
      }
      return true;
    });
  }, [rocks, filter, envelope]);

  const nextStep = MANUAL_STEPS[manualStep];

  return (
    <div className="amds-root">
      <div className="amds-topbar">
        <div className="amds-topbar-left">
          <button className="amds-btn-back" onClick={() => navigate(-1)}>
            Back
          </button>
          <div className="amds-title-group">
            <div
              className="amds-status-dot"
              style={{ background: phaseColor, boxShadow: `0 0 8px ${phaseColor}` }}
            />
            <span className="amds-title">Mining Operations Dashboard</span>
          </div>
          <div
            className="amds-phase-badge"
            style={{
              background: `${phaseColor}18`,
              border: `1px solid ${phaseColor}44`,
              color: phaseColor,
            }}
          >
            {phase}
          </div>
          {fleet && <div className="amds-wasm-badge">RUST WASM</div>}
        </div>

        <div className="amds-topbar-right">
          {[
            {
              label: "Delta v needed",
              val: asteroid ? `${asteroid.delta_v_km_s} km/s` : "pick a target",
              ok: true,
            },
            {
              label: "Delta v aboard",
              val: envelope?.delta_v_capacity_km_s
                ? `${envelope.delta_v_capacity_km_s} km/s`
                : "not published",
              ok: Boolean(envelope?.delta_v_capacity_km_s),
            },
            {
              label: totals ? "Profit" : "Feasible",
              val: totals
                ? money(totals.profit_usd)
                : check
                  ? check.feasible
                    ? "yes"
                    : "no"
                  : "pick a ship",
              ok: totals ? totals.profit_usd > 0 : Boolean(check?.feasible),
            },
          ].map(({ label, val, ok }) => (
            <div key={label} className="amds-stat">
              <div className="amds-stat-label">{label}</div>
              <div className={`amds-stat-val ${ok ? "ok" : "warn"}`}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="amds-main">
        {/* LEFT: what to fly, where to, and how much */}
        <div className="amds-sidebar">
          {engineError && <div className="amds-ship-error">{engineError}</div>}

          <div className="amds-section" style={{ paddingBottom: "0.5rem" }}>
            <span className="amds-section-label">
              Target {rocks && <span className="amds-rust-note">({visible.length} of {rocks.length})</span>}
            </span>
            <div className="amds-filters">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={"amds-filter" + (filter === f.id ? " amds-filter-on" : "")}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="amds-target-list">
              {visible.map((r) => (
                <div
                  key={r.id}
                  className="amds-target-item"
                  onClick={() => !flying && setAsteroidId(r.id)}
                  style={{
                    cursor: flying ? "not-allowed" : "pointer",
                    background:
                      asteroidId === r.id ? "rgba(104,211,145,0.1)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${asteroidId === r.id ? "rgba(104,211,145,0.35)" : "rgba(104,211,145,0.06)"}`,
                    opacity: flying && asteroidId !== r.id ? 0.4 : 1,
                  }}
                >
                  <div className="amds-target-header">
                    <span className="amds-target-name">{r.name}</span>
                    <span className="amds-target-type">{r.composition_class}</span>
                  </div>
                  <div className="amds-target-meta">
                    {r.delta_v_km_s} km/s · {r.round_trip_days} days
                    {r.diameter_m ? ` · ${Math.round(r.diameter_m)} m` : ""}
                    <span className="amds-src-tag">{sourceWord(r.composition_source)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="amds-section" style={{ paddingBottom: "0.5rem" }}>
            <span className="amds-section-label">Ship</span>
            <ShipPicker shipId={shipId} onPick={setShipId} disabled={flying} />
          </div>

          <div className="amds-section" style={{ paddingBottom: "0.5rem" }}>
            <span className="amds-section-label">
              Haul <span className="amds-rust-note">(Rust checks it)</span>
            </span>
            {hold == null ? (
              <div className="amds-dv-warning">
                This ship does not publish a hold size, so there is nothing to plan.
              </div>
            ) : hold === 0 ? (
              <div className="amds-dv-warning">
                {ship?.name} has no hold at all. It can fly, it just cannot bring anything back.
              </div>
            ) : (
              <>
                <div className="amds-slider-row">
                  <div className="amds-slider-header">
                    <span className="amds-slider-label">Tons to bring home</span>
                    <span className="amds-slider-val">{formatTons(tonnage)}</span>
                  </div>
                  <input
                    type="range"
                    className="amds-slider"
                    min={hold / 1000}
                    max={hold}
                    step={hold / 1000}
                    value={Math.min(tonnage, hold)}
                    disabled={flying}
                    onChange={(e) => setTonnage(parseFloat(e.target.value))}
                  />
                  <div className="amds-slider-ends">
                    <span>{formatTons(hold / 1000)}</span>
                    <span>hold {formatTons(hold)}</span>
                  </div>
                </div>

                {check && <Feasibility check={check} />}
              </>
            )}
          </div>

          <div className="amds-launch-area">
            {!flying && (
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                {["Auto", "Manual"].map((m) => (
                  <button
                    key={m}
                    onClick={() => setManualMode(m === "Manual")}
                    className={
                      "amds-mode-btn" + ((m === "Manual") === manualMode ? " amds-mode-on" : "")
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            {!flying ? (
              <button
                className={"amds-btn amds-btn-launch" + (canFly ? "" : " insufficient")}
                disabled={!canFly}
                onClick={launch}
              >
                {!fleet ? "Loading the engine" : canFly ? "Launch mission" : "Not possible"}
              </button>
            ) : done ? (
              <button className="amds-btn amds-btn-reset" onClick={reset}>
                New mission
              </button>
            ) : manualMode ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {manualTarget != null ? (
                  <div className="amds-executing">Executing. {phase.toLowerCase()}</div>
                ) : nextStep ? (
                  <div>
                    <div className="amds-next-label">Next command</div>
                    <div className="amds-next-desc">{nextStep.desc}</div>
                    <button className="amds-btn amds-btn-command" onClick={advanceManual}>
                      {nextStep.label}
                    </button>
                  </div>
                ) : (
                  <div className="amds-executing">Mission complete.</div>
                )}
                <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
                  {MANUAL_STEPS.map((s, i) => (
                    <div
                      key={s.phase}
                      title={s.phase}
                      style={{
                        flex: 1,
                        height: 3,
                        borderRadius: 2,
                        background:
                          i < manualStep ? "#68d391" : i === manualStep ? "#c8a96e" : "rgba(255,255,255,0.08)",
                      }}
                    />
                  ))}
                </div>
                <button className="amds-btn amds-btn-abort" onClick={reset}>
                  Abort
                </button>
              </div>
            ) : (
              <div className="amds-auto-controls">
                <button className="amds-btn amds-btn-launch" onClick={() => setPlaying((p) => !p)}>
                  {playing ? "Pause" : "Resume"}
                </button>
                <div className="amds-speeds">
                  {[1, 10, 100].map((s) => (
                    <button
                      key={s}
                      className={"amds-speed" + (speed === s ? " amds-speed-on" : "")}
                      onClick={() => setSpeed(s)}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
                <button className="amds-btn amds-btn-abort" onClick={reset}>
                  Abort
                </button>
              </div>
            )}
          </div>
        </div>

        {/* CENTRE: the viewport */}
        <div className="amds-viewport">
          <div ref={mountRef} className="amds-canvas" />

          {viewportLost && (
            <div className="amds-viewport-lost">
              <div className="amds-viewport-lost-title">The 3D viewport lost its graphics context</div>
              <p>
                The browser took the WebGL context back, which it does when too many are open or
                when the graphics driver resets. Nothing about the mission is affected: every number
                on this page comes from the engine, not from the viewport.
              </p>
              <button className="amds-btn amds-btn-launch" onClick={() => {
                setViewportLost(false);
                setSceneKey((k) => k + 1);
              }}>
                Rebuild the viewport
              </button>
            </div>
          )}

          <div className="amds-telemetry-overlay">
            <div className="amds-telemetry-title">Live Telemetry</div>
            {[
              { label: "Ship", val: ship?.name ?? "none" },
              { label: "Target", val: asteroid?.name ?? "none" },
              {
                label: "Mission day",
                val: frames ? `${Math.round(day)} of ${Math.round(total)}` : "on the pad",
              },
              {
                label: "Round trip",
                val: asteroid ? `${asteroid.round_trip_days} days published` : "n/a",
              },
            ].map(({ label, val }) => (
              <div key={label} className="amds-telemetry-row">
                <span className="amds-telemetry-key">{label}</span>
                <span className="amds-telemetry-val">{val}</span>
              </div>
            ))}
          </div>

          {frames && (
            <div className="amds-strip-overlay">
              <div className="amds-strip">
                {frames.map((f, i) => (
                  <div
                    key={f.phase + i}
                    className={"amds-strip-seg" + (i === mission.index ? " amds-strip-on" : "")}
                    title={`${f.phase}, ${f.duration_days} days`}
                    style={{
                      flexGrow: Math.max(f.duration_days, total * 0.012),
                      background:
                        i <= mission.index ? PHASE_COLORS[f.phase] ?? "#8892a4" : "rgba(255,255,255,0.08)",
                    }}
                  />
                ))}
              </div>
              {/* A read only progress bar rather than a slider. Dragging the
                  playhead fought with the manual commands, which are the point
                  of manual mode, and there was nothing it could do that the
                  pause and speed controls do not. */}
              <div
                className="amds-progress"
                role="progressbar"
                aria-label="mission progress"
                aria-valuemin={0}
                aria-valuemax={Math.round(total)}
                aria-valuenow={Math.round(day)}
              >
                <div
                  className="amds-progress-fill"
                  style={{ width: `${total ? (day / total) * 100 : 0}%` }}
                />
              </div>
              <div className="amds-strip-note">
                <span>{mission.note}</span>
                <span className="amds-strip-day">
                  day {Math.round(day)} of {Math.round(total)}
                </span>
              </div>
            </div>
          )}

          <div className="amds-bars-overlay amds-bars-right">
            {[
              {
                label: "Propellant",
                pct: pct(mission?.propellant_tons, totals?.propellant_tons),
                val: formatTons(mission?.propellant_tons ?? ship?.propellant_capacity_tons),
                color: "#68d391",
              },
              {
                label: "Ore",
                pct: pct(mission?.cargo_tons, totals?.tons),
                val: formatTons(mission?.cargo_tons ?? 0),
                color: "#c8a96e",
              },
            ].map(({ label, pct: p, val, color }) => (
              <div key={label} className="amds-bar-row">
                <div className="amds-bar-header">
                  <span className="amds-bar-label">{label}</span>
                  <span className="amds-bar-val" style={{ color }}>
                    {val}
                  </span>
                </div>
                <div className="amds-bar-track">
                  <div
                    className="amds-bar-fill"
                    style={{ width: `${p}%`, background: color, boxShadow: `0 0 6px ${color}` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="amds-hints">
            {["Drag to rotate", "Scroll to zoom"].map((t) => (
              <span key={t} className="amds-hint">
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* RIGHT: the numbers and the log */}
        <div className="amds-right-panel">
          <div className="amds-section">
            <span className="amds-section-label">
              Mission <span className="amds-rust-note">(Rust)</span>
            </span>
            {totals ? (
              <div className="amds-spec-table">
                {[
                  ["Delta v", `${totals.delta_v_km_s} km/s`],
                  ["Mission length", `${totals.mission_days} days`],
                  ["Propellant", formatTons(totals.propellant_tons)],
                  ["Ore", formatTons(totals.tons)],
                  ["Revenue", money(totals.revenue_usd)],
                  ["Cost", money(totals.cost_usd)],
                  ["Profit", money(totals.profit_usd)],
                ].map(([k, v]) => (
                  <div key={k} className="amds-spec-row">
                    <span className="amds-spec-key">{k}</span>
                    <span className="amds-spec-val">{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="amds-ship-status">
                Pick a target, a ship and a haul. The engine works out whether it can be done before
                you launch.
              </p>
            )}
          </div>

          {asteroid && (
            <div className="amds-section">
              <span className="amds-section-label">Target profile</span>
              <div className="amds-profile-name">{asteroid.name}</div>
              <div className="amds-spec-table">
                {[
                  ["Class", `${asteroid.composition_class} (${sourceWord(asteroid.composition_source)})`],
                  ["Delta v", `${asteroid.delta_v_km_s} km/s, JPL NHATS`],
                  ["Round trip", `${asteroid.round_trip_days} days`],
                  ["Diameter", asteroid.diameter_m ? `${Math.round(asteroid.diameter_m)} m` : "unknown"],
                  ["Water fraction", asteroid.water_fraction != null ? `${(asteroid.water_fraction * 100).toFixed(0)}%` : "unknown"],
                ].map(([k, v]) => (
                  <div key={k} className="amds-spec-row">
                    <span className="amds-spec-key">{k}</span>
                    <span className="amds-spec-val">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="amds-log-section">
            <span className="amds-section-label">Mission log</span>
            <div className="amds-log-entries">
              {log.map((entry, i) => (
                <div key={i} className="amds-log-entry">
                  <span className="amds-log-time">{entry.t}</span>
                  <span className={`amds-log-msg${i === log.length - 1 ? " latest" : ""}`}>
                    {entry.msg}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Whether this ship can do this haul, in the engine's own words. */
function Feasibility({ check }) {
  if (check.error === "specs_not_published") {
    return <div className="amds-dv-warning">{check.hint}</div>;
  }
  if (check.error) {
    return <div className="amds-dv-warning">{check.hint ?? check.error}</div>;
  }

  const cargo = check.checks?.cargo;
  const prop = check.checks?.propellant;

  return (
    <div className="amds-feas">
      <div className={"amds-feas-head" + (check.feasible ? " ok" : " bad")}>
        {check.feasible ? "This mission works" : `Blocked by ${check.binding_constraint.replace(/_/g, " ")}`}
      </div>
      <div className="amds-spec-table">
        <div className="amds-spec-row">
          <span className="amds-spec-key">Hold</span>
          <span className={"amds-spec-val" + (cargo?.ok ? "" : " amds-feas-fail")}>
            {formatTons(cargo?.needed_tons)} of {formatTons(cargo?.capacity_tons)}
          </span>
        </div>
        <div className="amds-spec-row">
          <span className="amds-spec-key">Propellant</span>
          <span className={"amds-spec-val" + (prop?.ok ? "" : " amds-feas-fail")}>
            {typeof prop?.needed_tons === "number" ? formatTons(prop.needed_tons) : "beyond reach"} of{" "}
            {formatTons(prop?.capacity_tons)}
          </span>
        </div>
        {check.profit_usd_if_flown != null && (
          <div className="amds-spec-row">
            <span className="amds-spec-key">Profit if flown</span>
            <span className="amds-spec-val">{money(check.profit_usd_if_flown)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const pct = (v, of) => (!of || v == null ? 0 : Math.max(0, Math.min(100, Math.round((v / of) * 100))));

const money = (n) =>
  n == null ? "n/a" : (n < 0 ? "minus $" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

function formatTons(tons) {
  if (tons == null) return "n/a";
  if (tons === 0) return "0 t";
  if (tons < 0.001) return (tons * 1_000_000).toFixed(1) + " g";
  if (tons < 1) return (tons * 1000).toFixed(1) + " kg";
  return Math.round(tons).toLocaleString("en-US") + " t";
}

const sourceWord = (s) =>
  s === "spectral_taxonomy" ? "measured" : s === "albedo_inference" ? "inferred" : "assumed";
