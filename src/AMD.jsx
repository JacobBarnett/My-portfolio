import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { useNavigate } from "react-router-dom";

// eslint-disable-next-line
const NASA_URL = "/api/nasa";

const SPECTRAL_PGM = {
  M: 92,
  X: 75,
  E: 68,
  S: 38,
  C: 22,
  B: 18,
  D: 12,
  default: 30,
};

const getSpectralClass = (name) => {
  const n = name.toUpperCase();
  if (n.includes("(M)") || n.includes(" M ")) return "M";
  if (n.includes("(X)") || n.includes(" X ")) return "X";
  if (n.includes("(S)") || n.includes(" S ")) return "S";
  if (n.includes("(C)") || n.includes(" C ")) return "C";
  if (n.includes("(E)")) return "E";
  if (n.includes("(B)")) return "B";
  return "S";
};

const pgmScore = (name) =>
  SPECTRAL_PGM[getSpectralClass(name)] ?? SPECTRAL_PGM.default;

const estimateDeltaV = (dist_au, h_mag) => {
  const base = 3.5 + dist_au * 18;
  const sizeAdj = h_mag ? (h_mag - 18) * 0.04 : 0;
  return Math.max(2.8, Math.min(12, base + sizeAdj)).toFixed(2);
};

const diameterFromH = (h) => {
  if (!h) return null;
  return (1329 / Math.sqrt(0.2)) * Math.pow(10, -h / 5) * 1000;
};

const pgmColor = (score) =>
  score >= 70 ? "#63b3ed" : score >= 40 ? "#c8a96e" : "#8892a4";
const pgmLabel = (score) =>
  score >= 70 ? "High" : score >= 40 ? "Medium" : "Low";

export default function AMD() {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const frameRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const asteroidMeshes = useRef([]);
  const hoveredMesh = useRef(null);
  const selectedMeshRef = useRef(null);
  const zoomAnimRef = useRef(null);

  const navigate = useNavigate();

  const [asteroids, setAsteroids] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    maxDeltaV: 10,
    minPGM: 0,
    maxDiam: 5000,
  });

  // ── Fetch NASA data ──
  useEffect(() => {
    const url =
      window.location.hostname === "localhost"
        ? "https://ssd-api.jpl.nasa.gov/cad.api?dist-max=0.2&date-min=2025-01-01&date-max=2026-12-31&diameter=true&fullname=true&limit=60&sort=dist"
        : "/api/nasa";

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!data.data) {
          setError("No data returned");
          setLoading(false);
          return;
        }
        const fields = data.fields;
        const rows = data.data.map((row) => {
          const obj = {};
          fields.forEach((f, i) => {
            obj[f] = row[i];
          });
          return obj;
        });
        const parsed = rows.map((r, i) => {
          const h = parseFloat(r.h);
          const dist = parseFloat(r.dist);
          const diam_m = r.diameter
            ? parseFloat(r.diameter) * 1000
            : diameterFromH(h);
          const dv = estimateDeltaV(dist, h);
          const pgm = pgmScore(r.fullname || r.des);
          return {
            id: i,
            name: (r.fullname || r.des).replace(/^\(?\d+\)?\s*/, "").trim(),
            des: r.des,
            dist_au: dist,
            close_date: r.cd,
            h_mag: h,
            diam_m: diam_m ? Math.round(diam_m) : null,
            delta_v: parseFloat(dv),
            pgm_score: pgm,
            spectral: getSpectralClass(r.fullname || r.des),
            orbit_r: 2.2 + dist * 8 + Math.random() * 0.6,
            orbit_speed: 0.0002 + Math.random() * 0.0003,
            orbit_incl: (Math.random() - 0.5) * 0.6,
            orbit_phase: Math.random() * Math.PI * 2,
            v_inf: r.v_inf ? parseFloat(r.v_inf).toFixed(2) : null,
          };
        });
        setAsteroids(parsed);
        setFiltered(parsed);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to fetch NASA data");
        setLoading(false);
      });
  }, []);

  // ── Apply filters ──
  useEffect(() => {
    const f = asteroids.filter(
      (a) =>
        a.delta_v <= filters.maxDeltaV &&
        a.pgm_score >= filters.minPGM &&
        (a.diam_m === null || a.diam_m <= filters.maxDiam),
    );
    setFiltered(f);
  }, [filters, asteroids]);

  // ── Three.js scene ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth,
      H = mount.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 200);
    camera.position.set(0, 6, 12);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 3;
    controls.maxDistance = 30;
    controlsRef.current = controls;

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const starVerts = [];
    for (let i = 0; i < 4000; i++) {
      starVerts.push(
        (Math.random() - 0.5) * 160,
        (Math.random() - 0.5) * 160,
        (Math.random() - 0.5) * 160,
      );
    }
    starGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(starVerts, 3),
    );
    scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({
          color: 0xffffff,
          size: 0.06,
          transparent: true,
          opacity: 0.7,
        }),
      ),
    );

    // ── EARTH ──
    const tl = new THREE.TextureLoader();
    const earthTex = tl.load(
      "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg",
    );
    const earthNightTex = tl.load(
      "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg",
    );
    const cloudTex = tl.load("/earth-clouds.png");

    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 64, 64),
      new THREE.MeshStandardMaterial({
        map: earthTex,
        emissiveMap: earthNightTex,
        emissive: new THREE.Color(0x112244),
        emissiveIntensity: 0.5,
        roughness: 0.7,
        metalness: 0.0,
      }),
    );
    scene.add(earthMesh);

    const cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.63, 64, 64),
      new THREE.MeshStandardMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
    );
    scene.add(cloudMesh);

    scene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1.78, 32, 32),
        new THREE.MeshBasicMaterial({
          color: 0x4488ff,
          transparent: true,
          opacity: 0.07,
          side: THREE.BackSide,
        }),
      ),
    );

    // ── MOON ──
    const moonTex = tl.load(
      "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/moon_1024.jpg",
    );
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 32, 32),
      new THREE.MeshStandardMaterial({
        map: moonTex,
        color: 0x999999,
        roughness: 0.95,
        metalness: 0.0,
      }),
    );
    moon.position.set(3.2, 0, 0);
    scene.add(moon);

    scene.add(
      new THREE.Mesh(
        new THREE.RingGeometry(3.18, 3.22, 128),
        new THREE.MeshBasicMaterial({
          color: 0x445566,
          transparent: true,
          opacity: 0.2,
          side: THREE.DoubleSide,
        }),
      ),
    );

    // Lighting
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
    sunLight.position.set(10, 4, 6);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0x112244, 0.5));

    // Animate
    const clock = new THREE.Clock();
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      earthMesh.rotation.y = t * 0.05;
      cloudMesh.rotation.y = t * 0.06;
      const moonAngle = t * 0.1;
      moon.position.set(
        Math.cos(moonAngle) * 3.2,
        Math.sin(moonAngle * 0.25) * 0.15,
        Math.sin(moonAngle) * 3.2,
      );
      moon.rotation.y = t * 0.04;
      asteroidMeshes.current.forEach(({ mesh, data }) => {
        const angle = data.orbit_phase + t * data.orbit_speed * 60;
        mesh.position.set(
          Math.cos(angle) * data.orbit_r,
          Math.sin(data.orbit_incl) * data.orbit_r * 0.3,
          Math.sin(angle) * data.orbit_r,
        );
      });
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
      if (zoomAnimRef.current) clearInterval(zoomAnimRef.current);
      controls.dispose();
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement))
        mount.removeChild(renderer.domElement);
    };
  }, []);

  // ── Sync asteroid meshes ──
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || filtered.length === 0) return;
    asteroidMeshes.current.forEach(({ mesh, orbit }) => {
      scene.remove(mesh);
      scene.remove(orbit);
    });
    asteroidMeshes.current = [];

    filtered.forEach((ast) => {
      const isHighValue = ast.pgm_score >= 70;
      const color = isHighValue
        ? 0x63b3ed
        : ast.pgm_score >= 40
          ? 0xc8a96e
          : 0x556677;
      const size = Math.max(0.04, Math.min(0.14, (ast.diam_m || 100) / 2000));

      const orbitRing = new THREE.Mesh(
        new THREE.RingGeometry(ast.orbit_r - 0.005, ast.orbit_r + 0.005, 128),
        new THREE.MeshBasicMaterial({
          color: isHighValue ? 0x1a4a6a : 0x2a3a2a,
          transparent: true,
          opacity: isHighValue ? 0.35 : 0.15,
          side: THREE.DoubleSide,
        }),
      );
      orbitRing.rotation.x = Math.PI / 2 + ast.orbit_incl;
      scene.add(orbitRing);

      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(size, 8, 8),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.6,
          roughness: 0.5,
        }),
      );
      mesh.userData.asteroidId = ast.id;
      mesh.userData.baseColor = color;
      scene.add(mesh);
      asteroidMeshes.current.push({ mesh, orbit: orbitRing, data: ast });
    });
  }, [filtered]);

  // ── Smooth camera animation helper ──
  const animateCamera = useCallback((toPos, toTarget) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    if (zoomAnimRef.current) clearInterval(zoomAnimRef.current);

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    let t = 0;
    zoomAnimRef.current = setInterval(() => {
      t += 0.035;
      if (t >= 1) {
        t = 1;
        clearInterval(zoomAnimRef.current);
        zoomAnimRef.current = null;
      }
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      camera.position.lerpVectors(startPos, toPos, ease);
      controls.target.lerpVectors(startTarget, toTarget, ease);
      controls.update();
    }, 16);
  }, []);

  // ── Reset a mesh back to its original look ──
  const resetMesh = useCallback((mesh) => {
    if (!mesh) return;
    mesh.scale.setScalar(1);
    mesh.material.emissiveIntensity = 0.6;
    mesh.material.color.setHex(mesh.userData.baseColor);
  }, []);

  // ── Hover handler ──
  const handleMouseMove = useCallback(
    (e) => {
      const mount = mountRef.current;
      const camera = cameraRef.current;
      if (!mount || !camera) return;
      const rect = mount.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(
        asteroidMeshes.current.map((a) => a.mesh),
      );

      // Reset previous hover (unless it's the selected one)
      if (
        hoveredMesh.current &&
        hoveredMesh.current !== selectedMeshRef.current
      ) {
        resetMesh(hoveredMesh.current);
        hoveredMesh.current = null;
        mount.style.cursor = "crosshair";
      }

      if (hits.length > 0) {
        const mesh = hits[0].object;
        hoveredMesh.current = mesh;
        mount.style.cursor = "pointer";
        if (mesh !== selectedMeshRef.current) {
          mesh.scale.setScalar(1.8);
          mesh.material.emissiveIntensity = 1.8;
          mesh.material.color.setHex(0xffffff);
        }
      }
    },
    [resetMesh],
  );

  // ── Click handler ──
  const handleCanvasClick = useCallback(
    (e) => {
      const mount = mountRef.current;
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!mount || !camera || !controls) return;
      const rect = mount.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(
        asteroidMeshes.current.map((a) => a.mesh),
      );

      // Reset previously selected
      if (selectedMeshRef.current) {
        resetMesh(selectedMeshRef.current);
        selectedMeshRef.current = null;
      }

      if (hits.length > 0) {
        const mesh = hits[0].object;
        // Highlight selected
        mesh.scale.setScalar(2.8);
        mesh.material.emissiveIntensity = 2.5;
        mesh.material.color.setHex(0xffffff);
        selectedMeshRef.current = mesh;

        // Zoom toward it
        const pos = mesh.position.clone();
        const dir = pos.clone().normalize();
        const zoomPos = pos.clone().add(dir.multiplyScalar(2.0));
        animateCamera(zoomPos, pos);

        const id = mesh.userData.asteroidId;
        const ast = filtered.find((a) => a.id === id);
        if (ast) setSelected(ast);
      } else {
        setSelected(null);
      }
    },
    [filtered, resetMesh, animateCamera],
  );

  // ── Zoom out handler ──
  const handleZoomOut = useCallback(() => {
    if (selectedMeshRef.current) {
      resetMesh(selectedMeshRef.current);
      selectedMeshRef.current = null;
    }
    animateCamera(new THREE.Vector3(0, 6, 12), new THREE.Vector3(0, 0, 0));
    setSelected(null);
  }, [resetMesh, animateCamera]);

  const topTargets = [...filtered]
    .sort((a, b) => b.pgm_score - a.pgm_score)
    .slice(0, 5);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#050810",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'DM Sans', sans-serif",
        color: "#e8edf5",
        overflow: "hidden",
      }}
    >
      {/* TOP BAR */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.7rem 1.5rem",
          background: "rgba(5,8,16,0.95)",
          borderBottom: "1px solid rgba(99,179,237,0.15)",
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#63b3ed",
              boxShadow: "0 0 8px #63b3ed",
            }}
          />
          <span
            style={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: "1rem",
              color: "#90cdf4",
              letterSpacing: "0.05em",
            }}
          >
            Asteroid Mining Dashboard
          </span>
        </div>
        <div style={{ display: "flex", gap: "2rem" }}>
          {[
            { label: "Targets", val: loading ? "—" : filtered.length },
            {
              label: "High Value",
              val: loading
                ? "—"
                : filtered.filter((a) => a.pgm_score >= 70).length,
            },
            {
              label: "Next Flyby",
              val: loading
                ? "—"
                : (filtered[0]?.close_date?.split(" ")[0] ?? "—"),
            },
          ].map(({ label, val }) => (
            <div key={label} style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: "0.62rem",
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "rgba(99,179,237,0.55)",
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: "1rem",
                  fontFamily: "'DM Serif Display', serif",
                  color: "#90cdf4",
                }}
              >
                {val}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* LEFT SIDEBAR */}
        <div
          style={{
            width: 240,
            background: "rgba(5,8,16,0.97)",
            borderRight: "1px solid rgba(99,179,237,0.12)",
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              padding: "1rem",
              borderBottom: "1px solid rgba(99,179,237,0.1)",
            }}
          >
            <div
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "rgba(99,179,237,0.6)",
                marginBottom: "1rem",
              }}
            >
              Filters
            </div>
            {[
              {
                label: "Max Delta-V (km/s)",
                key: "maxDeltaV",
                min: 3,
                max: 12,
                step: 0.5,
                unit: "km/s",
              },
              {
                label: "Min PGM Score",
                key: "minPGM",
                min: 0,
                max: 90,
                step: 5,
                unit: "%",
              },
              {
                label: "Max Diameter (m)",
                key: "maxDiam",
                min: 50,
                max: 5000,
                step: 50,
                unit: "m",
              },
            ].map(({ label, key, min, max, step, unit }) => (
              <div key={key} style={{ marginBottom: "1.2rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.4rem",
                  }}
                >
                  <span style={{ fontSize: "0.72rem", color: "#8892a4" }}>
                    {label}
                  </span>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: "#63b3ed",
                      fontWeight: 600,
                    }}
                  >
                    {filters[key]}
                    {unit}
                  </span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={filters[key]}
                  onChange={(e) =>
                    setFilters((p) => ({
                      ...p,
                      [key]: parseFloat(e.target.value),
                    }))
                  }
                  style={{
                    width: "100%",
                    accentColor: "#63b3ed",
                    cursor: "pointer",
                  }}
                />
              </div>
            ))}
          </div>

          <div style={{ padding: "1rem", flex: 1 }}>
            <div
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "rgba(99,179,237,0.6)",
                marginBottom: "0.75rem",
              }}
            >
              Top Targets
            </div>
            {loading ? (
              <div style={{ color: "#8892a4", fontSize: "0.78rem" }}>
                Loading NASA data…
              </div>
            ) : (
              topTargets.map((ast, i) => (
                <div
                  key={ast.id}
                  onClick={() => setSelected(ast)}
                  style={{
                    padding: "0.65rem 0.75rem",
                    marginBottom: "0.4rem",
                    borderRadius: 3,
                    cursor: "pointer",
                    background:
                      selected?.id === ast.id
                        ? "rgba(99,179,237,0.12)"
                        : "rgba(255,255,255,0.03)",
                    border: `1px solid ${selected?.id === ast.id ? "rgba(99,179,237,0.4)" : "rgba(99,179,237,0.08)"}`,
                    transition: "all 0.2s",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.2rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.6rem",
                        color: "#63b3ed",
                        fontWeight: 700,
                        minWidth: 14,
                      }}
                    >
                      #{i + 1}
                    </span>
                    <span
                      style={{
                        fontSize: "0.78rem",
                        color: "#e8edf5",
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ast.name}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      paddingLeft: "1.25rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.65rem",
                        color: pgmColor(ast.pgm_score),
                      }}
                    >
                      PGM {ast.pgm_score}%
                    </span>
                    <span style={{ fontSize: "0.65rem", color: "#8892a4" }}>
                      ΔV {ast.delta_v}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div
            style={{
              padding: "1rem",
              borderTop: "1px solid rgba(99,179,237,0.1)",
            }}
          >
            <div
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "rgba(99,179,237,0.6)",
                marginBottom: "0.6rem",
              }}
            >
              PGM Legend
            </div>
            {[
              ["#63b3ed", "High (≥70%)"],
              ["#c8a96e", "Medium (40–69%)"],
              ["#556677", "Low (<40%)"],
            ].map(([color, label]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.35rem",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: color,
                    boxShadow: `0 0 6px ${color}`,
                  }}
                />
                <span style={{ fontSize: "0.7rem", color: "#8892a4" }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 3D VIEWPORT */}
        <div style={{ flex: 1, position: "relative" }}>
          <div
            ref={mountRef}
            style={{ width: "100%", height: "100%", cursor: "crosshair" }}
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
          />

          {loading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                background: "rgba(5,8,16,0.85)",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  border: "2px solid rgba(99,179,237,0.2)",
                  borderTopColor: "#63b3ed",
                  borderRadius: "50%",
                  animation: "spin 0.9s linear infinite",
                }}
              />
              <div
                style={{
                  fontSize: "0.72rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "rgba(99,179,237,0.6)",
                }}
              >
                Fetching NASA Data
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#f56565",
                fontSize: "0.85rem",
              }}
            >
              {error}
            </div>
          )}

          {/* Zoom out button */}
          {selected && (
            <button
              onClick={handleZoomOut}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                background: "rgba(99,179,237,0.12)",
                border: "1px solid rgba(99,179,237,0.4)",
                color: "#90cdf4",
                borderRadius: 4,
                padding: "0.4rem 0.85rem",
                fontSize: "0.68rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                transition: "all 0.2s",
              }}
            >
              ← Zoom Out
            </button>
          )}

          {!loading && (
            <div
              style={{
                position: "absolute",
                bottom: 12,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                gap: 20,
                pointerEvents: "none",
              }}
            >
              {[
                "⟳ Drag to rotate",
                "⊕ Scroll to zoom",
                "● Click asteroid to inspect",
              ].map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: "0.6rem",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(99,179,237,0.45)",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div
          style={{
            width: 280,
            background: "rgba(5,8,16,0.97)",
            borderLeft: "1px solid rgba(99,179,237,0.12)",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          {selected ? (
            <div style={{ padding: "1.25rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "0.62rem",
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "rgba(99,179,237,0.55)",
                      marginBottom: "0.3rem",
                    }}
                  >
                    Selected Target
                  </div>
                  <div
                    style={{
                      fontFamily: "'DM Serif Display', serif",
                      fontSize: "1.1rem",
                      color: "#90cdf4",
                      lineHeight: 1.2,
                    }}
                  >
                    {selected.name}
                  </div>
                  <div
                    style={{
                      fontSize: "0.72rem",
                      color: "#8892a4",
                      marginTop: "0.2rem",
                    }}
                  >
                    {selected.des}
                  </div>
                </div>
                <button
                  onClick={handleZoomOut}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#8892a4",
                    cursor: "pointer",
                    fontSize: "1rem",
                    padding: "0.2rem",
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.4rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.65rem",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "#8892a4",
                    }}
                  >
                    PGM Potential
                  </span>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      color: pgmColor(selected.pgm_score),
                    }}
                  >
                    {pgmLabel(selected.pgm_score)}
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${selected.pgm_score}%`,
                      background: `linear-gradient(90deg, ${pgmColor(selected.pgm_score)}, ${pgmColor(selected.pgm_score)}aa)`,
                      borderRadius: 3,
                      transition: "width 0.5s ease",
                      boxShadow: `0 0 8px ${pgmColor(selected.pgm_score)}`,
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: "0.65rem",
                    color: "#8892a4",
                    marginTop: "0.3rem",
                  }}
                >
                  Spectral Class:{" "}
                  <span style={{ color: pgmColor(selected.pgm_score) }}>
                    {selected.spectral}-type
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.75rem",
                  marginBottom: "1.25rem",
                }}
              >
                {[
                  {
                    label: "Delta-V",
                    val: `${selected.delta_v} km/s`,
                    highlight: selected.delta_v < 5,
                  },
                  {
                    label: "Close Approach",
                    val: selected.close_date?.split(" ")[0] ?? "—",
                    highlight: false,
                  },
                  {
                    label: "Diameter",
                    val: selected.diam_m
                      ? `~${selected.diam_m.toLocaleString()} m`
                      : "Unknown",
                    highlight: false,
                  },
                  {
                    label: "Distance",
                    val: `${selected.dist_au?.toFixed(4)} AU`,
                    highlight: false,
                  },
                  {
                    label: "H Magnitude",
                    val: selected.h_mag?.toFixed(1) ?? "—",
                    highlight: false,
                  },
                  {
                    label: "V∞",
                    val: selected.v_inf ? `${selected.v_inf} km/s` : "—",
                    highlight: false,
                  },
                ].map(({ label, val, highlight }) => (
                  <div
                    key={label}
                    style={{
                      background: "rgba(99,179,237,0.05)",
                      border: "1px solid rgba(99,179,237,0.1)",
                      borderRadius: 3,
                      padding: "0.6rem 0.75rem",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.6rem",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "rgba(99,179,237,0.5)",
                        marginBottom: "0.2rem",
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        color: highlight ? "#68d391" : "#e8edf5",
                      }}
                    >
                      {val}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  background: "rgba(99,179,237,0.05)",
                  border: "1px solid rgba(99,179,237,0.12)",
                  borderRadius: 4,
                  padding: "0.85rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.62rem",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: "rgba(99,179,237,0.55)",
                    marginBottom: "0.5rem",
                  }}
                >
                  Mining Assessment
                </div>
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "#8892a4",
                    lineHeight: 1.65,
                  }}
                >
                  {selected.pgm_score >= 70
                    ? `High-priority M-type target. Estimated platinum-group metal content makes this a prime candidate for AstroForge mission planning. Delta-V of ${selected.delta_v} km/s is ${selected.delta_v < 6 ? "highly accessible" : "within range"}.`
                    : selected.pgm_score >= 40
                      ? `Moderate PGM potential. S-type composition suggests silicate-metal mix. Worth monitoring for favorable launch windows. Delta-V: ${selected.delta_v} km/s.`
                      : `Lower-priority carbonaceous target. Limited platinum-group potential. May have scientific value or water/volatiles. Delta-V: ${selected.delta_v} km/s.`}
                </div>
              </div>

              <div
                style={{
                  marginTop: "1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem",
                  background:
                    selected.pgm_score >= 70
                      ? "rgba(99,179,237,0.08)"
                      : "rgba(200,169,110,0.06)",
                  border: `1px solid ${pgmColor(selected.pgm_score)}33`,
                  borderRadius: 4,
                }}
              >
                <span
                  style={{
                    fontSize: "0.65rem",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#8892a4",
                  }}
                >
                  Overall Score
                </span>
                <span
                  style={{
                    fontFamily: "'DM Serif Display', serif",
                    fontSize: "1.5rem",
                    color: pgmColor(selected.pgm_score),
                  }}
                >
                  {Math.round(
                    selected.pgm_score * 0.5 +
                      ((12 - selected.delta_v) / 12) * 50,
                  )}
                  /100
                </span>
              </div>
              <button
                onClick={() =>
                  navigate("/mining", { state: { asteroid: selected } })
                }
                style={{
                  marginTop: "0.75rem",
                  width: "100%",
                  padding: "0.7rem",
                  background: "rgba(104,211,145,0.12)",
                  border: "1px solid rgba(104,211,145,0.4)",
                  color: "#68d391",
                  borderRadius: 4,
                  fontSize: "0.72rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                }}
              >
                ▶ Plan Mission →
              </button>
            </div>
          ) : (
            <div
              style={{
                padding: "1.25rem",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.75rem",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "2rem", opacity: 0.3 }}>⬡</div>
              <div
                style={{
                  fontSize: "0.72rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(99,179,237,0.4)",
                }}
              >
                Select a target
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "#8892a4",
                  lineHeight: 1.6,
                  maxWidth: 180,
                }}
              >
                Click any asteroid in the viewport or select from the top
                targets list.
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(99,179,237,0.2); border-radius: 2px; }
      `}</style>
    </div>
  );
}
