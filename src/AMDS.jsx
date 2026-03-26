import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { useLocation, useNavigate } from "react-router-dom";
import "./AMDS.css";

// ── Load Rust WASM module ──
let wasmModule = null;
async function loadWasm() {
  if (wasmModule) return wasmModule;
  try {
    const mod = await import(
      /* webpackIgnore: true */ "/static-wasm/mining_physics.js"
    );
    await mod.default("/static-wasm/mining_physics_bg.wasm");
    wasmModule = mod;
    return mod;
  } catch (e) {
    console.error("WASM load failed:", e);
    return null;
  }
}

const ASTEROIDS = [
  {
    id: 1,
    name: "433 Eros",
    dist_km: 218000000,
    type: "S",
    pgm: 38,
    mass_est: "6.69 × 10¹⁵ kg",
  },
  {
    id: 2,
    name: "16 Psyche",
    dist_km: 370000000,
    type: "M",
    pgm: 92,
    mass_est: "2.41 × 10¹⁹ kg",
  },
  {
    id: 3,
    name: "1986 DA",
    dist_km: 280000000,
    type: "M",
    pgm: 88,
    mass_est: "~1 × 10¹³ kg",
  },
  {
    id: 4,
    name: "2011 UW158",
    dist_km: 64000000,
    type: "X",
    pgm: 75,
    mass_est: "~5 × 10¹⁰ kg",
  },
  {
    id: 5,
    name: "Bennu",
    dist_km: 168000000,
    type: "C",
    pgm: 18,
    mass_est: "7.33 × 10¹⁰ kg",
  },
];

const pgmColor = (s) => (s >= 70 ? "#63b3ed" : s >= 40 ? "#c8a96e" : "#8892a4");

const PHASE_COLORS = {
  STANDBY: "#8892a4",
  TRANSIT: "#c8a96e",
  APPROACH: "#f6ad55",
  ANCHORING: "#fc8181",
  DRILLING: "#68d391",
  EXTRACTING: "#63b3ed",
  RETURNING: "#fc8181",
  COMPLETE: "#63b3ed",
};

// Manual mode steps in order
const MANUAL_STEPS = [
  {
    key: "TRANSIT",
    label: "▶ Execute Transfer Burn",
    desc: "Fire thrusters toward target",
  },
  {
    key: "APPROACH",
    label: "⊕ Begin Approach",
    desc: "Match asteroid rotation, slow down",
  },
  {
    key: "ANCHORING",
    label: "⚓ Deploy Anchors",
    desc: "Harpoon into surface — zero-G lock",
  },
  { key: "DRILLING", label: "⛏ Begin Drilling", desc: "Activate drill head" },
  {
    key: "EXTRACTING",
    label: "◉ Transfer Ore to Hold",
    desc: "Move extracted material to storage",
  },
  {
    key: "RETURNING",
    label: "← Execute Return Burn",
    desc: "Release anchors, fire for home",
  },
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
  const missionStateRef = useRef(null);
  const wasmRef = useRef(null);
  const tickRef = useRef(null);
  const asteroidMeshRef = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();

  const [wasmReady, setWasmReady] = useState(false);
  const [selectedAsteroid, setSelectedAsteroid] = useState(ASTEROIDS[1]);
  const [shipConfig, setShipConfig] = useState({
    fuel_kg: 800,
    ship_mass_kg: 2400,
    ore_capacity: 1000,
  });
  const [missionActive, setMissionActive] = useState(false);
  const [missionPhase, setMissionPhase] = useState("STANDBY");
  const [manualMode, setManualMode] = useState(false);
  const [manualStep, setManualStep] = useState(0); // index into MANUAL_STEPS
  const [manualPhase, setManualPhase] = useState("STANDBY");
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [commDelay, setCommDelay] = useState(0); // simulated signal delay in seconds
  const [systemStatus, setSystemStatus] = useState({
    power: 98,
    thermal: 72,
    attitude: "NOMINAL",
    signal: 100,
  });
  const [telemetry, setTelemetry] = useState({
    fuel_kg: 800,
    ore_kg: 0,
    delta_v: 0,
    transfer_dv: 0,
    mission_score: 0,
    time_to_capacity: 0,
    mission_time_s: 0,
    extraction_rate: 0.8,
  });
  const [log, setLog] = useState([
    { t: "00:00", msg: "System nominal. Awaiting launch." },
  ]);

  const addLog = useCallback((msg) => {
    setLog((prev) => {
      const mins = Math.floor((prev.length * 3) / 60)
        .toString()
        .padStart(2, "0");
      const secs = ((prev.length * 3) % 60).toString().padStart(2, "0");
      return [...prev.slice(-12), { t: `${mins}:${secs}`, msg }];
    });
  }, []);

  // ── Pre-select asteroid from AMD navigation ──
  useEffect(() => {
    if (location.state?.asteroid) {
      const a = location.state.asteroid;
      const match = ASTEROIDS.find(
        (ast) =>
          ast.name.toLowerCase().includes(a.name?.toLowerCase?.() ?? "") ||
          (a.name?.toLowerCase?.() ?? "").includes(ast.name.toLowerCase()),
      );
      if (match) setSelectedAsteroid(match);
    }
  }, [location.state]);

  // ── Update comm delay based on selected asteroid ──
  useEffect(() => {
    const delay = Math.round(selectedAsteroid.dist_km / 300000 / 60); // light-minutes
    setCommDelay(delay);
  }, [selectedAsteroid]);

  // ── Load WASM ──
  useEffect(() => {
    loadWasm().then((mod) => {
      if (mod) {
        wasmRef.current = mod;
        setWasmReady(true);
      }
    });
  }, []);

  // ── Init WASM state ──
  useEffect(() => {
    if (!wasmReady || !wasmRef.current) return;
    try {
      missionStateRef.current?.free?.();
      const state = new wasmRef.current.MissionState(
        shipConfig.fuel_kg,
        shipConfig.ship_mass_kg,
        selectedAsteroid.dist_km,
      );
      missionStateRef.current = state;
      setTelemetry((p) => ({
        ...p,
        fuel_kg: shipConfig.fuel_kg,
        ore_kg: 0,
        delta_v: state.delta_v(),
        transfer_dv: state.transfer_delta_v(),
        mission_score: 0,
        time_to_capacity: state.time_to_capacity(shipConfig.ore_capacity),
        mission_time_s: 0,
      }));
    } catch (e) {
      console.error("WASM init error:", e);
    }
  }, [wasmReady, shipConfig, selectedAsteroid]);

  // ── Simulate system status fluctuations ──
  useEffect(() => {
    if (!missionActive) return;
    const interval = setInterval(() => {
      setSystemStatus((prev) => ({
        power: Math.max(
          20,
          Math.min(100, prev.power + (Math.random() - 0.52) * 2),
        ),
        thermal: Math.max(
          40,
          Math.min(110, prev.thermal + (Math.random() - 0.48) * 3),
        ),
        attitude: prev.thermal > 95 ? "WARNING" : "NOMINAL",
        signal: Math.max(
          30,
          Math.min(100, prev.signal + (Math.random() - 0.5) * 4),
        ),
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, [missionActive]);

  // ── Three.js scene ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth,
      H = mount.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, W / H, 0.01, 500);
    camera.position.set(0, 5, 10);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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

    // Stars
    const starVerts = [];
    for (let i = 0; i < 3000; i++) {
      starVerts.push(
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
      );
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(starVerts, 3),
    );
    scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({
          color: 0xffffff,
          size: 0.05,
          transparent: true,
          opacity: 0.8,
        }),
      ),
    );

    const sunLight = new THREE.DirectionalLight(0xfff5e0, 2.5);
    sunLight.position.set(20, 10, 15);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0x0a0f1a, 0.8));

    // Asteroid presets
    const asteroidPresets = [
      {
        lumpScale: [2.1, 1.8, 2.5, 2.2, 1.9, 2.4],
        lumpAmp: [0.35, 0.28, 0.22],
        noise: 0.06,
        color: 0x999980,
      },
      {
        lumpScale: [3.2, 2.8, 3.5, 3.1, 2.9, 3.3],
        lumpAmp: [0.12, 0.1, 0.08],
        noise: 0.12,
        color: 0x888878,
      },
      {
        lumpScale: [1.4, 1.2, 1.8, 1.5, 1.3, 1.6],
        lumpAmp: [0.45, 0.38, 0.3],
        noise: 0.05,
        color: 0xaaa890,
      },
      {
        lumpScale: [1.0, 3.5, 1.2, 3.8, 1.1, 3.6],
        lumpAmp: [0.55, 0.15, 0.12],
        noise: 0.07,
        color: 0x777768,
      },
      {
        lumpScale: [2.8, 2.2, 2.5, 2.9, 2.3, 2.7],
        lumpAmp: [0.2, 0.18, 0.22],
        noise: 0.15,
        color: 0x666658,
      },
    ];

    const preset =
      asteroidPresets[Math.floor(Math.random() * asteroidPresets.length)];
    const astGeo = new THREE.SphereGeometry(1.4, 128, 128);
    const pos = astGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i);
      const lump1 =
        Math.sin(x * preset.lumpScale[0]) *
        Math.cos(y * preset.lumpScale[1]) *
        preset.lumpAmp[0];
      const lump2 =
        Math.sin(y * preset.lumpScale[2]) *
        Math.cos(z * preset.lumpScale[3]) *
        preset.lumpAmp[1];
      const lump3 =
        Math.sin(z * preset.lumpScale[4]) *
        Math.cos(x * preset.lumpScale[5]) *
        preset.lumpAmp[2];
      const noise = (Math.random() - 0.5) * preset.noise;
      const scale = 1 + lump1 + lump2 + lump3 + noise;
      pos.setXYZ(i, x * scale, y * scale, z * scale);
    }
    astGeo.computeVertexNormals();

    const astLoader = new THREE.TextureLoader();
    const astTexture = astLoader.load(
      "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/moon_1024.jpg",
    );
    const astBump = astLoader.load(
      "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/moon_1024.jpg",
    );

    const astMesh = new THREE.Mesh(
      astGeo,
      new THREE.MeshStandardMaterial({
        map: astTexture,
        bumpMap: astBump,
        bumpScale: 1.2,
        roughness: 1.0,
        metalness: 0.05,
        color: preset.color,
      }),
    );
    scene.add(astMesh);
    asteroidMeshRef.current = astMesh;

    // Spacecraft
    const shipGroup = new THREE.Group();
    shipGroup.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.1, 0.35),
        new THREE.MeshStandardMaterial({
          color: 0xd0d8e8,
          metalness: 0.8,
          roughness: 0.2,
        }),
      ),
    );
    [-1, 1].forEach((side) => {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.02, 0.22),
        new THREE.MeshStandardMaterial({
          color: 0x1a3a6a,
          metalness: 0.3,
          roughness: 0.4,
          emissive: 0x0a1a3a,
          emissiveIntensity: 0.3,
        }),
      );
      panel.position.set(side * 0.37, 0, 0);
      shipGroup.add(panel);
    });
    const thruster = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, 0.1, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff6600,
        emissive: 0xff3300,
        emissiveIntensity: 0.0,
      }),
    );
    thruster.position.set(0, 0, 0.2);
    thruster.rotation.x = Math.PI / 2;
    shipGroup.add(thruster);
    shipGroup.userData.thruster = thruster;
    shipGroup.position.set(0, 0.5, 4);
    scene.add(shipGroup);
    shipRef.current = shipGroup;

    // Mining particles
    const partVerts = new Float32Array(300);
    for (let i = 0; i < 300; i += 3) {
      partVerts[i] = (Math.random() - 0.5) * 0.5;
      partVerts[i + 1] = (Math.random() - 0.5) * 0.5;
      partVerts[i + 2] = (Math.random() - 0.5) * 0.5;
    }
    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(partVerts, 3),
    );
    const particles = new THREE.Points(
      partGeo,
      new THREE.PointsMaterial({
        color: 0xc8a96e,
        size: 0.04,
        transparent: true,
        opacity: 0.0,
      }),
    );
    scene.add(particles);
    particlesRef.current = particles;

    const clock = new THREE.Clock();
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      astMesh.rotation.y = t * 0.04;
      astMesh.rotation.x = t * 0.01;
      shipGroup.children[1].material.emissiveIntensity =
        0.2 + Math.sin(t * 2) * 0.1;
      shipGroup.children[2].material.emissiveIntensity =
        0.2 + Math.sin(t * 2) * 0.1;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth,
        h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      controls.dispose();
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement))
        mount.removeChild(renderer.domElement);
    };
  }, []);

  // ── Attach / detach helpers ──
  const attachShip = useCallback(() => {
    const ship = shipRef.current;
    if (!ship || !asteroidMeshRef.current) return;
    const worldPos = new THREE.Vector3();
    ship.getWorldPosition(worldPos);
    asteroidMeshRef.current.add(ship);
    asteroidMeshRef.current.worldToLocal(worldPos);
    ship.position.copy(worldPos);
    ship.rotation.set(0, 0, 0);
  }, []);

  const detachShip = useCallback(() => {
    const ship = shipRef.current;
    if (!ship || !sceneRef.current) return;
    const worldPos = new THREE.Vector3();
    ship.getWorldPosition(worldPos);
    sceneRef.current.add(ship);
    ship.position.copy(worldPos);
  }, []);

  // ── AUTO MODE mission ──
  const startMission = useCallback(() => {
    if (!wasmReady || !missionStateRef.current) return;
    setMissionActive(true);
    setMissionPhase("TRANSIT");
    addLog(`Launching toward ${selectedAsteroid.name}`);
    addLog(`Transfer ΔV required: ${telemetry.transfer_dv.toFixed(0)} m/s`);

    let phase = "TRANSIT";
    let transitProgress = 0;
    const ship = shipRef.current;
    const particles = particlesRef.current;
    if (ship?.userData?.thruster)
      ship.userData.thruster.material.emissiveIntensity = 2.0;

    tickRef.current = setInterval(() => {
      const state = missionStateRef.current;
      if (!state) return;

      if (phase === "TRANSIT") {
        transitProgress += 0.015;
        if (ship) {
          ship.position.z = 4 - transitProgress * 2.5;
          ship.position.y = 0.5 + Math.sin(transitProgress * Math.PI) * 0.3;
        }
        if (transitProgress >= 1) {
          phase = "MINING";
          setMissionPhase("MINING");
          addLog("Arrived at target. Beginning extraction.");
          if (ship?.userData?.thruster)
            ship.userData.thruster.material.emissiveIntensity = 0.3;
          if (particles) particles.material.opacity = 0.8;
          if (ship && asteroidMeshRef.current) {
            const worldPos = new THREE.Vector3();
            ship.getWorldPosition(worldPos);
            asteroidMeshRef.current.add(ship);
            asteroidMeshRef.current.worldToLocal(worldPos);
            ship.position.copy(worldPos);
            ship.rotation.set(0, 0, 0);
          }
        }
      } else if (phase === "MINING") {
        state.tick(6.0);
        if (particles) {
          const p = particles.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) {
            p.setX(i, p.getX(i) + (Math.random() - 0.5) * 0.02);
            p.setY(i, p.getY(i) + Math.random() * 0.03);
            p.setZ(i, p.getZ(i) + (Math.random() - 0.5) * 0.02);
            if (Math.abs(p.getY(i)) > 0.8) {
              p.setX(i, (Math.random() - 0.5) * 0.3);
              p.setY(i, -0.3);
              p.setZ(i, (Math.random() - 0.5) * 0.3);
            }
          }
          p.needsUpdate = true;
        }
        setTelemetry({
          fuel_kg: Math.round(state.fuel_kg * 10) / 10,
          ore_kg: Math.round(state.ore_kg * 10) / 10,
          delta_v: Math.round(state.delta_v()),
          transfer_dv: Math.round(state.transfer_delta_v()),
          mission_score: Math.round(state.mission_score()),
          time_to_capacity: Math.round(
            state.time_to_capacity(shipConfig.ore_capacity),
          ),
          mission_time_s: Math.round(state.mission_time_s),
          extraction_rate: state.extraction_rate,
        });
        if (state.ore_kg >= shipConfig.ore_capacity || state.fuel_kg <= 10) {
          phase = "RETURNING";
          setMissionPhase("RETURNING");
          addLog(
            state.ore_kg >= shipConfig.ore_capacity
              ? "Ore capacity reached. Returning to base."
              : "Low fuel warning. Aborting mining.",
          );
          detachShip();
          if (particles) particles.material.opacity = 0;
          if (ship?.userData?.thruster)
            ship.userData.thruster.material.emissiveIntensity = 2.0;
        }
      } else if (phase === "RETURNING") {
        transitProgress -= 0.015;
        if (ship) {
          ship.position.z = 4 - transitProgress * 2.5;
          ship.position.y = 0.5 + Math.sin(transitProgress * Math.PI) * 0.3;
        }
        if (transitProgress <= 0) {
          phase = "COMPLETE";
          setMissionPhase("COMPLETE");
          setMissionActive(false);
          clearInterval(tickRef.current);
          addLog(
            `Mission complete! Score: ${Math.round(missionStateRef.current?.mission_score() ?? 0)}/100`,
          );
          addLog(
            `Ore recovered: ${Math.round(missionStateRef.current?.ore_kg ?? 0)} kg`,
          );
          if (ship?.userData?.thruster)
            ship.userData.thruster.material.emissiveIntensity = 0;
        }
      }
    }, 200);
  }, [
    wasmReady,
    selectedAsteroid,
    shipConfig,
    telemetry.transfer_dv,
    addLog,
    detachShip,
  ]);

  // ── MANUAL MODE ──
  const startManualMission = useCallback(() => {
    if (!wasmReady || !missionStateRef.current) return;
    setMissionActive(true);
    setManualStep(0);
    setManualPhase("STANDBY");
    setAwaitingConfirm(true);
    addLog("Manual mode active. Awaiting operator commands.");
    addLog(`Signal delay: ${commDelay} min each way`);
  }, [wasmReady, addLog, commDelay]);

  const executeManualStep = useCallback(() => {
    const step = MANUAL_STEPS[manualStep];
    if (!step) return;

    setAwaitingConfirm(false);
    setManualPhase(step.key);
    setMissionPhase(step.key);
    addLog(`CMD SENT: ${step.label}`);
    addLog(`Signal delay: ~${commDelay}min. Awaiting confirmation...`);

    const ship = shipRef.current;
    const particles = particlesRef.current;
    const state = missionStateRef.current;

    // Simulate comm delay then execute
    setTimeout(
      () => {
        addLog(`ACK: ${step.label} confirmed.`);

        if (step.key === "TRANSIT") {
          let transitProgress = 0;
          if (ship?.userData?.thruster)
            ship.userData.thruster.material.emissiveIntensity = 2.0;
          tickRef.current = setInterval(() => {
            transitProgress += 0.015;
            if (ship) {
              ship.position.z = 4 - transitProgress * 2.5;
              ship.position.y = 0.5 + Math.sin(transitProgress * Math.PI) * 0.3;
            }
            if (transitProgress >= 1) {
              clearInterval(tickRef.current);
              if (ship?.userData?.thruster)
                ship.userData.thruster.material.emissiveIntensity = 0.2;
              addLog("Transit complete. In approach corridor.");
              setManualStep((s) => s + 1);
              setAwaitingConfirm(true);
            }
          }, 200);
        } else if (step.key === "APPROACH") {
          addLog("Matching rotation rate... approach nominal.");
          setTimeout(() => {
            addLog("Rendezvous achieved. Ready for anchor deployment.");
            setManualStep((s) => s + 1);
            setAwaitingConfirm(true);
          }, 3000);
        } else if (step.key === "ANCHORING") {
          addLog("Harpoon fired. Tether tensioning...");
          setTimeout(() => {
            attachShip();
            if (particles) particles.material.opacity = 0.3;
            addLog("Anchors locked. Surface contact confirmed.");
            setManualStep((s) => s + 1);
            setAwaitingConfirm(true);
          }, 2500);
        } else if (step.key === "DRILLING") {
          addLog("Drill head deploying... surface contact.");
          setTimeout(() => {
            if (particles) particles.material.opacity = 0.7;
            addLog("Drilling active. Core sample depth: 2.4m");
            setManualStep((s) => s + 1);
            setAwaitingConfirm(true);
          }, 2000);
        } else if (step.key === "EXTRACTING") {
          // Run extraction ticks
          if (particles) particles.material.opacity = 0.9;
          addLog("Extraction pipeline active.");
          tickRef.current = setInterval(() => {
            if (!state) return;
            state.tick(6.0);
            const p = particles?.geometry?.attributes?.position;
            if (p) {
              for (let i = 0; i < p.count; i++) {
                p.setX(i, p.getX(i) + (Math.random() - 0.5) * 0.02);
                p.setY(i, p.getY(i) + Math.random() * 0.03);
                p.setZ(i, p.getZ(i) + (Math.random() - 0.5) * 0.02);
                if (Math.abs(p.getY(i)) > 0.8) {
                  p.setX(i, (Math.random() - 0.5) * 0.3);
                  p.setY(i, -0.3);
                  p.setZ(i, (Math.random() - 0.5) * 0.3);
                }
              }
              p.needsUpdate = true;
            }
            setTelemetry({
              fuel_kg: Math.round(state.fuel_kg * 10) / 10,
              ore_kg: Math.round(state.ore_kg * 10) / 10,
              delta_v: Math.round(state.delta_v()),
              transfer_dv: Math.round(state.transfer_delta_v()),
              mission_score: Math.round(state.mission_score()),
              time_to_capacity: Math.round(
                state.time_to_capacity(shipConfig.ore_capacity),
              ),
              mission_time_s: Math.round(state.mission_time_s),
              extraction_rate: state.extraction_rate,
            });
            if (
              state.ore_kg >= shipConfig.ore_capacity ||
              state.fuel_kg <= 10
            ) {
              clearInterval(tickRef.current);
              if (particles) particles.material.opacity = 0;
              addLog(`Hold capacity reached: ${Math.round(state.ore_kg)} kg.`);
              addLog("Ready for return burn.");
              setManualStep((s) => s + 1);
              setAwaitingConfirm(true);
            }
          }, 200);
        } else if (step.key === "RETURNING") {
          detachShip();
          if (ship?.userData?.thruster)
            ship.userData.thruster.material.emissiveIntensity = 2.0;
          if (particles) particles.material.opacity = 0;
          addLog("Anchors released. Return burn initiated.");
          let retProgress = 1;
          tickRef.current = setInterval(() => {
            retProgress -= 0.015;
            if (ship) {
              ship.position.z = 4 - retProgress * 2.5;
              ship.position.y = 0.5 + Math.sin(retProgress * Math.PI) * 0.3;
            }
            if (retProgress <= 0) {
              clearInterval(tickRef.current);
              if (ship?.userData?.thruster)
                ship.userData.thruster.material.emissiveIntensity = 0;
              setMissionPhase("COMPLETE");
              setManualPhase("COMPLETE");
              setMissionActive(false);
              addLog(
                `Mission complete! Score: ${Math.round(state?.mission_score() ?? 0)}/100`,
              );
              addLog(`Ore recovered: ${Math.round(state?.ore_kg ?? 0)} kg`);
            }
          }, 200);
        }
      },
      commDelay > 0 ? 1500 : 800,
    );
  }, [manualStep, commDelay, attachShip, detachShip, shipConfig, addLog]);

  const resetMission = useCallback(() => {
    clearInterval(tickRef.current);
    setMissionActive(false);
    setMissionPhase("STANDBY");
    setManualStep(0);
    setManualPhase("STANDBY");
    setAwaitingConfirm(false);
    setLog([{ t: "00:00", msg: "System reset. Awaiting launch." }]);
    setSystemStatus({
      power: 98,
      thermal: 72,
      attitude: "NOMINAL",
      signal: 100,
    });

    if (shipRef.current && sceneRef.current) {
      sceneRef.current.add(shipRef.current);
      shipRef.current.position.set(0, 0.5, 4);
      shipRef.current.rotation.set(0, 0, 0);
    }
    if (shipRef.current?.userData?.thruster)
      shipRef.current.userData.thruster.material.emissiveIntensity = 0;
    if (particlesRef.current) particlesRef.current.material.opacity = 0;
    if (wasmRef.current) {
      try {
        missionStateRef.current?.free?.();
        const state = new wasmRef.current.MissionState(
          shipConfig.fuel_kg,
          shipConfig.ship_mass_kg,
          selectedAsteroid.dist_km,
        );
        missionStateRef.current = state;
        setTelemetry({
          fuel_kg: shipConfig.fuel_kg,
          ore_kg: 0,
          delta_v: state.delta_v(),
          transfer_dv: state.transfer_delta_v(),
          mission_score: 0,
          time_to_capacity: state.time_to_capacity(shipConfig.ore_capacity),
          mission_time_s: 0,
          extraction_rate: 0.8,
        });
      } catch (e) {
        console.error(e);
      }
    }
  }, [shipConfig, selectedAsteroid]);

  const phaseColor = PHASE_COLORS[missionPhase] ?? "#8892a4";
  const fuelPct = Math.round((telemetry.fuel_kg / shipConfig.fuel_kg) * 100);
  const orePct = Math.round((telemetry.ore_kg / shipConfig.ore_capacity) * 100);
  const dvSufficient = telemetry.delta_v >= telemetry.transfer_dv;

  const currentManualStep = MANUAL_STEPS[manualStep];
  const isComplete = missionPhase === "COMPLETE" || manualPhase === "COMPLETE";

  return (
    <div className="amds-root">
      {/* TOP BAR */}
      <div className="amds-topbar">
        <div className="amds-topbar-left">
          <button className="amds-btn-back" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <div className="amds-title-group">
            <div
              className="amds-status-dot"
              style={{
                background: phaseColor,
                boxShadow: `0 0 8px ${phaseColor}`,
              }}
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
            {missionPhase}
          </div>
          {wasmReady && <div className="amds-wasm-badge">⚙ RUST WASM</div>}
          {commDelay > 0 && (
            <div
              style={{
                fontSize: "0.6rem",
                color: "rgba(200,169,110,0.7)",
                letterSpacing: "0.1em",
              }}
            >
              📡 {commDelay}min signal delay
            </div>
          )}
        </div>
        <div className="amds-topbar-right">
          {[
            {
              label: "Delta-V Budget",
              val: `${telemetry.delta_v.toFixed(0)} m/s`,
              ok: dvSufficient,
            },
            {
              label: "Transfer ΔV",
              val: `${telemetry.transfer_dv.toFixed(0)} m/s`,
              ok: true,
            },
            {
              label: "Mission Score",
              val: `${telemetry.mission_score}/100`,
              ok: telemetry.mission_score > 50,
            },
          ].map(({ label, val, ok }) => (
            <div key={label} className="amds-stat">
              <div className="amds-stat-label">{label}</div>
              <div className={`amds-stat-val ${ok ? "ok" : "warn"}`}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN */}
      <div className="amds-main">
        {/* LEFT SIDEBAR */}
        <div className="amds-sidebar">
          {/* Target selection */}
          <div className="amds-section">
            <span className="amds-section-label">Target Asteroid</span>
            {ASTEROIDS.map((a) => (
              <div
                key={a.id}
                className="amds-target-item"
                onClick={() => !missionActive && setSelectedAsteroid(a)}
                style={{
                  cursor: missionActive ? "not-allowed" : "pointer",
                  background:
                    selectedAsteroid.id === a.id
                      ? "rgba(104,211,145,0.1)"
                      : "rgba(255,255,255,0.02)",
                  border: `1px solid ${selectedAsteroid.id === a.id ? "rgba(104,211,145,0.35)" : "rgba(104,211,145,0.06)"}`,
                  opacity:
                    missionActive && selectedAsteroid.id !== a.id ? 0.4 : 1,
                }}
              >
                <div className="amds-target-header">
                  <span className="amds-target-name">{a.name}</span>
                  <span
                    className="amds-target-type"
                    style={{ color: pgmColor(a.pgm) }}
                  >
                    {a.type}
                  </span>
                </div>
                <div className="amds-target-meta">
                  {(a.dist_km / 1e6).toFixed(0)}M km · PGM {a.pgm}%
                </div>
              </div>
            ))}
          </div>

          {/* Ship config */}
          <div className="amds-section">
            <span className="amds-section-label">Ship Configuration</span>
            {[
              {
                label: "Fuel (kg)",
                key: "fuel_kg",
                min: 200,
                max: 2000,
                step: 50,
              },
              {
                label: "Ship Mass (kg)",
                key: "ship_mass_kg",
                min: 500,
                max: 8000,
                step: 100,
              },
              {
                label: "Ore Capacity (kg)",
                key: "ore_capacity",
                min: 100,
                max: 5000,
                step: 100,
              },
            ].map(({ label, key, min, max, step }) => (
              <div key={key} className="amds-slider-row">
                <div className="amds-slider-header">
                  <span className="amds-slider-label">{label}</span>
                  <span className="amds-slider-val">
                    {shipConfig[key].toLocaleString()}
                  </span>
                </div>
                <input
                  type="range"
                  className="amds-slider"
                  min={min}
                  max={max}
                  step={step}
                  value={shipConfig[key]}
                  disabled={missionActive}
                  style={{
                    cursor: missionActive ? "not-allowed" : "pointer",
                    opacity: missionActive ? 0.5 : 1,
                  }}
                  onChange={(e) =>
                    setShipConfig((p) => ({
                      ...p,
                      [key]: parseFloat(e.target.value),
                    }))
                  }
                />
              </div>
            ))}
          </div>

          {/* DV analysis */}
          <div className="amds-section">
            <span className="amds-section-label">
              ΔV Analysis <span className="amds-rust-note">(Rust)</span>
            </span>
            {[
              {
                label: "Available ΔV",
                val: `${telemetry.delta_v.toFixed(0)} m/s`,
                color: dvSufficient ? "#68d391" : "#fc8181",
              },
              {
                label: "Required ΔV",
                val: `${telemetry.transfer_dv.toFixed(0)} m/s`,
                color: "#8892a4",
              },
              {
                label: "Margin",
                val: `${(telemetry.delta_v - telemetry.transfer_dv).toFixed(0)} m/s`,
                color: dvSufficient ? "#68d391" : "#fc8181",
              },
            ].map(({ label, val, color }) => (
              <div key={label} className="amds-dv-row">
                <span className="amds-dv-key">{label}</span>
                <span className="amds-dv-val" style={{ color }}>
                  {val}
                </span>
              </div>
            ))}
            {!dvSufficient && (
              <div className="amds-dv-warning">
                ⚠ Insufficient ΔV — increase fuel or reduce mass
              </div>
            )}
          </div>

          {/* Mode toggle + launch */}
          <div className="amds-launch-area">
            {/* Mode toggle */}
            {!missionActive && !isComplete && (
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                {["Auto", "Manual"].map((m) => (
                  <button
                    key={m}
                    onClick={() => setManualMode(m === "Manual")}
                    style={{
                      flex: 1,
                      padding: "0.35rem",
                      borderRadius: 3,
                      cursor: "pointer",
                      fontSize: "0.65rem",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 600,
                      background:
                        (m === "Manual") === manualMode
                          ? "rgba(104,211,145,0.15)"
                          : "rgba(255,255,255,0.03)",
                      border: `1px solid ${(m === "Manual") === manualMode ? "rgba(104,211,145,0.4)" : "rgba(104,211,145,0.1)"}`,
                      color:
                        (m === "Manual") === manualMode ? "#68d391" : "#8892a4",
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            {isComplete ? (
              <button
                className="amds-btn amds-btn-reset"
                onClick={resetMission}
              >
                ↺ New Mission
              </button>
            ) : manualMode ? (
              // MANUAL MODE UI
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {!missionActive ? (
                  <button
                    className="amds-btn amds-btn-launch"
                    disabled={!wasmReady || !dvSufficient}
                    onClick={startManualMission}
                  >
                    {!wasmReady ? "Loading WASM..." : "▶ Begin Manual Mission"}
                  </button>
                ) : awaitingConfirm && currentManualStep ? (
                  <div>
                    <div
                      style={{
                        fontSize: "0.6rem",
                        color: "rgba(104,211,145,0.5)",
                        letterSpacing: "0.12em",
                        marginBottom: 4,
                      }}
                    >
                      NEXT COMMAND
                    </div>
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "#e8edf5",
                        marginBottom: 4,
                      }}
                    >
                      {currentManualStep.desc}
                    </div>
                    <button
                      onClick={executeManualStep}
                      style={{
                        width: "100%",
                        padding: "0.6rem",
                        borderRadius: 4,
                        cursor: "pointer",
                        background: "rgba(104,211,145,0.15)",
                        border: "1px solid rgba(104,211,145,0.45)",
                        color: "#68d391",
                        fontSize: "0.68rem",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: 700,
                      }}
                    >
                      {currentManualStep.label}
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "#c8a96e",
                      textAlign: "center",
                      padding: "0.5rem",
                    }}
                  >
                    ◉ Executing command...
                  </div>
                )}

                {/* Step progress */}
                {missionActive && (
                  <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
                    {MANUAL_STEPS.map((s, i) => (
                      <div
                        key={s.key}
                        title={s.key}
                        style={{
                          flex: 1,
                          height: 3,
                          borderRadius: 2,
                          background:
                            i < manualStep
                              ? "#68d391"
                              : i === manualStep
                                ? "#c8a96e"
                                : "rgba(255,255,255,0.08)",
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // AUTO MODE
              <button
                className={`amds-btn amds-btn-launch${missionActive ? " active" : !dvSufficient ? " insufficient" : ""}`}
                disabled={!wasmReady || missionActive || !dvSufficient}
                onClick={missionActive ? null : startMission}
              >
                {!wasmReady
                  ? "Loading WASM..."
                  : missionActive
                    ? `◉ ${missionPhase}...`
                    : "▶ Launch Mission"}
              </button>
            )}
          </div>
        </div>

        {/* VIEWPORT */}
        <div className="amds-viewport">
          <div ref={mountRef} className="amds-canvas" />

          <div className="amds-telemetry-overlay">
            <div className="amds-telemetry-title">Live Telemetry</div>
            {[
              { label: "Target", val: selectedAsteroid.name },
              {
                label: "Distance",
                val: `${(selectedAsteroid.dist_km / 1e6).toFixed(1)}M km`,
              },
              {
                label: "Mission Time",
                val: `${Math.floor(telemetry.mission_time_s / 3600)}h ${Math.floor((telemetry.mission_time_s % 3600) / 60)}m`,
              },
              { label: "Signal", val: `${Math.round(systemStatus.signal)}%` },
            ].map(({ label, val }) => (
              <div key={label} className="amds-telemetry-row">
                <span className="amds-telemetry-key">{label}</span>
                <span className="amds-telemetry-val">{val}</span>
              </div>
            ))}
          </div>

          <div className="amds-bars-overlay">
            {[
              {
                label: "Fuel",
                pct: fuelPct,
                val: `${telemetry.fuel_kg.toFixed(0)} kg`,
                color: fuelPct > 30 ? "#68d391" : "#fc8181",
              },
              {
                label: "Ore",
                pct: orePct,
                val: `${telemetry.ore_kg.toFixed(0)} kg`,
                color: "#c8a96e",
              },
            ].map(({ label, pct, val, color }) => (
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
                    style={{
                      width: `${pct}%`,
                      background: color,
                      boxShadow: `0 0 6px ${color}`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="amds-hints">
            {["⟳ Drag to rotate", "⊕ Scroll to zoom"].map((t) => (
              <span key={t} className="amds-hint">
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="amds-right-panel">
          {/* System status */}
          <div className="amds-section">
            <span className="amds-section-label">Systems Status</span>
            <div className="amds-gauges-grid">
              {[
                {
                  label: "Fuel",
                  val: `${telemetry.fuel_kg.toFixed(0)} kg`,
                  pct: fuelPct,
                  color: fuelPct > 30 ? "#68d391" : "#fc8181",
                },
                {
                  label: "Ore Load",
                  val: `${telemetry.ore_kg.toFixed(0)} kg`,
                  pct: orePct,
                  color: "#c8a96e",
                },
                {
                  label: "Power",
                  val: `${Math.round(systemStatus.power)}%`,
                  pct: systemStatus.power,
                  color: systemStatus.power > 50 ? "#68d391" : "#fc8181",
                },
                {
                  label: "Thermal",
                  val: `${Math.round(systemStatus.thermal)}°C`,
                  pct: Math.min(100, systemStatus.thermal),
                  color: systemStatus.thermal > 90 ? "#fc8181" : "#63b3ed",
                },
                {
                  label: "Extraction",
                  val: `${telemetry.extraction_rate} kg/s`,
                  pct: ["MINING", "EXTRACTING"].includes(missionPhase)
                    ? 100
                    : 0,
                  color: "#63b3ed",
                },
                {
                  label: "Score",
                  val: `${telemetry.mission_score}/100`,
                  pct: telemetry.mission_score,
                  color: "#a78bfa",
                },
              ].map(({ label, val, pct, color }) => (
                <div key={label} className="amds-gauge">
                  <div className="amds-gauge-label">{label}</div>
                  <div className="amds-gauge-val" style={{ color }}>
                    {val}
                  </div>
                  <div className="amds-gauge-track">
                    <div
                      className="amds-gauge-fill"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Attitude indicator */}
            <div
              style={{
                marginTop: 8,
                display: "flex",
                justifyContent: "space-between",
                padding: "0.3rem 0.4rem",
                background: "rgba(255,255,255,0.02)",
                borderRadius: 3,
              }}
            >
              <span style={{ fontSize: "0.6rem", color: "#8892a4" }}>
                Attitude Control
              </span>
              <span
                style={{
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  color:
                    systemStatus.attitude === "NOMINAL" ? "#68d391" : "#fc8181",
                }}
              >
                {systemStatus.attitude}
              </span>
            </div>
          </div>

          {/* Target profile */}
          <div className="amds-section">
            <span className="amds-section-label">Target Profile</span>
            <div className="amds-profile-name">{selectedAsteroid.name}</div>
            {[
              { label: "Spectral Type", val: selectedAsteroid.type },
              {
                label: "PGM Potential",
                val: `${selectedAsteroid.pgm}%`,
                color: pgmColor(selectedAsteroid.pgm),
              },
              {
                label: "Distance",
                val: `${(selectedAsteroid.dist_km / 1e6).toFixed(0)}M km`,
              },
              { label: "Est. Mass", val: selectedAsteroid.mass_est },
              {
                label: "Comm Delay",
                val: `${commDelay} min`,
                color: commDelay > 10 ? "#fc8181" : "#8892a4",
              },
              {
                label: "Time to Fill",
                val:
                  telemetry.time_to_capacity > 0
                    ? `${Math.round(telemetry.time_to_capacity / 60)}m`
                    : "—",
              },
            ].map(({ label, val, color }) => (
              <div key={label} className="amds-profile-row">
                <span className="amds-profile-key">{label}</span>
                <span
                  className="amds-profile-val"
                  style={{ color: color || "#e8edf5" }}
                >
                  {val}
                </span>
              </div>
            ))}
          </div>

          {/* Mission log */}
          <div className="amds-log-section">
            <span className="amds-section-label">Mission Log</span>
            <div className="amds-log-entries">
              {log.map((entry, i) => (
                <div key={i} className="amds-log-entry">
                  <span className="amds-log-time">{entry.t}</span>
                  <span
                    className={`amds-log-msg${i === log.length - 1 ? " latest" : ""}`}
                  >
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
