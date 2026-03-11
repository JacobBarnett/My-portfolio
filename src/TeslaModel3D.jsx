import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function TeslaModel3D() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const frameRef = useRef(null);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const rotationRef = useRef({ x: 0.15, y: 0.5 });
  const carGroupRef = useRef(null);

  const [doorStates, setDoorStates] = useState({
    frontLeft: false,
    frontRight: false,
    rearLeft: false,
    rearRight: false,
    trunk: false,
    frunk: false,
  });
  const doorMeshes = useRef({});
  const doorAngles = useRef({
    frontLeft: 0,
    frontRight: 0,
    rearLeft: 0,
    rearRight: 0,
    trunk: 0,
    frunk: 0,
  });
  const targetAngles = useRef({
    frontLeft: 0,
    frontRight: 0,
    rearLeft: 0,
    rearRight: 0,
    trunk: 0,
    frunk: 0,
  });

  const toggleDoor = (door) => {
    setDoorStates((prev) => {
      const next = !prev[door];
      targetAngles.current[door] = next ? 1 : 0;
      return { ...prev, [door]: next };
    });
  };

  useEffect(() => {
    const mount = mountRef.current;
    const W = mount.clientWidth;
    const H = mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = null;
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 1.2, 5);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(5, 8, 5);
    sun.castShadow = true;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8888ff, 0.3);
    fill.position.set(-5, 2, -3);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.5);
    rim.position.set(0, 3, -5);
    scene.add(rim);

    // Ground reflection plane
    const groundGeo = new THREE.PlaneGeometry(12, 6);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.8,
      roughness: 0.3,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.76;
    ground.receiveShadow = true;
    scene.add(ground);

    // ── MATERIALS ──
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xe8e8e8,
      metalness: 0.6,
      roughness: 0.2,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.3,
      roughness: 0.6,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1a2a3a,
      metalness: 0.1,
      roughness: 0.0,
      transparent: true,
      opacity: 0.6,
    });
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.1,
      roughness: 0.8,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.9,
      roughness: 0.1,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xaaaaaa,
      metalness: 1.0,
      roughness: 0.05,
    });
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffcc,
      emissiveIntensity: 0.8,
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff1111,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.85,
    });
    const interiorMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.1,
      roughness: 0.9,
    });

    // ── CAR GROUP ──
    const car = new THREE.Group();
    carGroupRef.current = car;
    scene.add(car);

    const addMesh = (
      geo,
      mat,
      x,
      y,
      z,
      rx = 0,
      ry = 0,
      rz = 0,
      shadow = true,
    ) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      if (shadow) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
      return m;
    };

    // ── BODY ──
    // Lower body
    const lowerBody = addMesh(
      new THREE.BoxGeometry(4.2, 0.5, 1.9),
      bodyMat,
      0,
      -0.05,
      0,
    );
    car.add(lowerBody);

    // Sill strips
    [-0.97, 0.97].forEach((z) => {
      const sill = addMesh(
        new THREE.BoxGeometry(3.8, 0.06, 0.08),
        darkMat,
        0,
        -0.29,
        z,
      );
      car.add(sill);
    });

    // Upper cabin (curved using scaled sphere approach)
    const cabinGeo = new THREE.BoxGeometry(2.4, 0.7, 1.75);
    const cabin = addMesh(cabinGeo, bodyMat, -0.1, 0.53, 0);
    cabin.scale.set(1, 1, 1);
    car.add(cabin);

    // Roof
    const roofGeo = new THREE.BoxGeometry(2.1, 0.08, 1.7);
    const roof = addMesh(roofGeo, glassMat, -0.05, 0.88, 0);
    car.add(roof);

    // Hood slope (front)
    const hoodGeo = new THREE.BoxGeometry(1.0, 0.35, 1.88);
    const hood = addMesh(hoodGeo, bodyMat, 1.55, 0.22, 0);
    hood.rotation.z = -0.18;
    car.add(hood);

    // Trunk slope (rear)
    const trunkSlopeGeo = new THREE.BoxGeometry(0.7, 0.3, 1.88);
    const trunkSlope = addMesh(trunkSlopeGeo, bodyMat, -1.55, 0.25, 0);
    trunkSlope.rotation.z = 0.22;
    car.add(trunkSlope);

    // Front fascia
    const frontFascia = addMesh(
      new THREE.BoxGeometry(0.12, 0.5, 1.88),
      bodyMat,
      2.1,
      -0.05,
      0,
    );
    car.add(frontFascia);

    // Rear fascia
    const rearFascia = addMesh(
      new THREE.BoxGeometry(0.12, 0.5, 1.88),
      bodyMat,
      -2.1,
      -0.05,
      0,
    );
    car.add(rearFascia);

    // ── FRUNK (front trunk lid) ──
    const frunkGroup = new THREE.Group();
    frunkGroup.position.set(1.9, 0.18, 0);
    car.add(frunkGroup);
    doorMeshes.current.frunk = frunkGroup;
    const frunkLid = addMesh(
      new THREE.BoxGeometry(0.7, 0.06, 1.85),
      bodyMat,
      -0.35,
      0,
      0,
    );
    frunkGroup.add(frunkLid);

    // ── TRUNK LID ──
    const trunkGroup = new THREE.Group();
    trunkGroup.position.set(-1.7, 0.3, 0);
    car.add(trunkGroup);
    doorMeshes.current.trunk = trunkGroup;
    const trunkLid = addMesh(
      new THREE.BoxGeometry(0.8, 0.06, 1.85),
      bodyMat,
      0.4,
      0,
      0,
    );
    trunkGroup.add(trunkLid);

    // ── DOORS ──
    const makeDoor = (x, z, isRight) => {
      const g = new THREE.Group();
      g.position.set(x, 0.08, z);
      const panel = addMesh(
        new THREE.BoxGeometry(0.06, 0.58, 0.88),
        bodyMat,
        0,
        0,
        isRight ? -0.44 : 0.44,
      );
      g.add(panel);
      // Window frame
      const winFrame = addMesh(
        new THREE.BoxGeometry(0.04, 0.28, 0.82),
        darkMat,
        0,
        0.44,
        isRight ? -0.44 : 0.44,
      );
      g.add(winFrame);
      // Glass
      const win = addMesh(
        new THREE.BoxGeometry(0.03, 0.22, 0.74),
        glassMat,
        0,
        0.44,
        isRight ? -0.44 : 0.44,
      );
      g.add(win);
      // Handle
      const handle = addMesh(
        new THREE.BoxGeometry(0.12, 0.04, 0.18),
        chromeMat,
        isRight ? -0.06 : 0.06,
        0.1,
        isRight ? -0.44 : 0.44,
      );
      g.add(handle);
      return g;
    };

    // Front doors
    const flDoor = makeDoor(0.95, -0.97, false);
    car.add(flDoor);
    doorMeshes.current.frontLeft = flDoor;

    const frDoor = makeDoor(0.95, 0.97, true);
    car.add(frDoor);
    doorMeshes.current.frontRight = frDoor;

    // Rear doors
    const rlDoor = makeDoor(-0.45, -0.97, false);
    car.add(rlDoor);
    doorMeshes.current.rearLeft = rlDoor;

    const rrDoor = makeDoor(-0.45, 0.97, true);
    car.add(rrDoor);
    doorMeshes.current.rearRight = rrDoor;

    // ── WINDSHIELDS ──
    const windshield = addMesh(
      new THREE.BoxGeometry(0.06, 0.62, 1.72),
      glassMat,
      0.88,
      0.42,
      0,
    );
    windshield.rotation.z = -0.55;
    car.add(windshield);

    const rearScreen = addMesh(
      new THREE.BoxGeometry(0.06, 0.55, 1.72),
      glassMat,
      -0.88,
      0.42,
      0,
    );
    rearScreen.rotation.z = 0.6;
    car.add(rearScreen);

    // ── LIGHTS ──
    // Headlights (thin bar style like Model 3)
    [-0.5, 0.5].forEach((z) => {
      const hl = addMesh(
        new THREE.BoxGeometry(0.05, 0.06, 0.35),
        lightMat,
        2.1,
        0.12,
        z,
      );
      car.add(hl);
    });
    // DRL bar
    const drl = addMesh(
      new THREE.BoxGeometry(0.04, 0.04, 1.5),
      lightMat,
      2.12,
      0.18,
      0,
    );
    car.add(drl);

    // Taillights (red bar)
    const tailBar = addMesh(
      new THREE.BoxGeometry(0.04, 0.06, 1.7),
      tailMat,
      -2.12,
      0.15,
      0,
    );
    car.add(tailBar);

    // ── WHEELS ──
    const makeWheel = (x, z) => {
      const wg = new THREE.Group();
      wg.position.set(x, -0.42, z);

      // Tire
      const tire = addMesh(
        new THREE.CylinderGeometry(0.34, 0.34, 0.22, 32),
        wheelMat,
        0,
        0,
        0,
        0,
        0,
        Math.PI / 2,
      );
      wg.add(tire);

      // Rim (aero wheel style)
      const rim = addMesh(
        new THREE.CylinderGeometry(0.26, 0.26, 0.24, 5),
        rimMat,
        0,
        0,
        0,
        0,
        0,
        Math.PI / 2,
      );
      wg.add(rim);

      // Center cap
      const cap = addMesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.25, 16),
        chromeMat,
        0,
        0,
        0,
        0,
        0,
        Math.PI / 2,
      );
      wg.add(cap);

      // Spokes
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const spoke = addMesh(
          new THREE.BoxGeometry(0.04, 0.16, 0.25),
          rimMat,
          Math.sin(angle) * 0.17,
          Math.cos(angle) * 0.17,
          0,
          0,
          0,
          angle,
        );
        wg.add(spoke);
      }

      return wg;
    };

    const wheels = [
      makeWheel(1.3, -1.0),
      makeWheel(1.3, 1.0),
      makeWheel(-1.3, -1.0),
      makeWheel(-1.3, 1.0),
    ];
    wheels.forEach((w) => car.add(w));

    // Wheel arches
    [
      [1.3, -0.97],
      [1.3, 0.97],
      [-1.3, -0.97],
      [-1.3, 0.97],
    ].forEach(([x, z]) => {
      const arch = addMesh(
        new THREE.BoxGeometry(0.9, 0.12, 0.08),
        darkMat,
        x,
        -0.22,
        z,
      );
      car.add(arch);
    });

    // ── INTERIOR (visible through glass) ──
    const dash = addMesh(
      new THREE.BoxGeometry(1.6, 0.12, 1.65),
      interiorMat,
      0.55,
      0.08,
      0,
    );
    car.add(dash);

    // Center screen (15" portrait display)
    const screen = addMesh(
      new THREE.BoxGeometry(0.03, 0.38, 0.22),
      new THREE.MeshStandardMaterial({
        color: 0x000811,
        emissive: 0x003366,
        emissiveIntensity: 0.4,
      }),
      0.54,
      0.22,
      0,
    );
    car.add(screen);

    // Seats
    [
      [0.3, 0],
      [-0.3, 0],
    ].forEach(([x]) => {
      [[-0.55], [0.55]].forEach(([z]) => {
        const seat = addMesh(
          new THREE.BoxGeometry(0.42, 0.1, 0.44),
          new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.9,
          }),
          x,
          0.0,
          z,
        );
        car.add(seat);
        const back = addMesh(
          new THREE.BoxGeometry(0.06, 0.42, 0.44),
          new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.9,
          }),
          x - 0.2,
          0.22,
          z,
        );
        car.add(back);
      });
    });

    // Set initial rotation
    car.rotation.x = rotationRef.current.x;
    car.rotation.y = rotationRef.current.y;

    // ── ANIMATE ──
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);

      // Animate door angles
      const keys = Object.keys(doorAngles.current);
      keys.forEach((key) => {
        const current = doorAngles.current[key];
        const target = targetAngles.current[key];
        const delta = target - current;
        if (Math.abs(delta) > 0.001) {
          doorAngles.current[key] += delta * 0.08;
          const mesh = doorMeshes.current[key];
          if (mesh) {
            if (key === "frontLeft" || key === "rearLeft") {
              mesh.rotation.y = -doorAngles.current[key] * 1.1;
            } else if (key === "frontRight" || key === "rearRight") {
              mesh.rotation.y = doorAngles.current[key] * 1.1;
            } else if (key === "trunk") {
              mesh.rotation.z = doorAngles.current[key] * 1.2;
            } else if (key === "frunk") {
              mesh.rotation.z = -doorAngles.current[key] * 1.1;
            }
          }
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    // ── MOUSE DRAG ──
    const onDown = (e) => {
      isDragging.current = true;
      const pos = e.touches ? e.touches[0] : e;
      lastMouse.current = { x: pos.clientX, y: pos.clientY };
    };
    const onMove = (e) => {
      if (!isDragging.current) return;
      const pos = e.touches ? e.touches[0] : e;
      const dx = pos.clientX - lastMouse.current.x;
      const dy = pos.clientY - lastMouse.current.y;
      rotationRef.current.y += dx * 0.008;
      rotationRef.current.x += dy * 0.006;
      rotationRef.current.x = Math.max(
        -0.4,
        Math.min(0.6, rotationRef.current.x),
      );
      car.rotation.y = rotationRef.current.y;
      car.rotation.x = rotationRef.current.x;
      lastMouse.current = { x: pos.clientX, y: pos.clientY };
    };
    const onUp = () => {
      isDragging.current = false;
    };

    mount.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    mount.addEventListener("touchstart", onDown);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);

    // Resize
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      mount.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      mount.removeEventListener("touchstart", onDown);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement))
        mount.removeChild(renderer.domElement);
    };
  }, []);

  const doorLabels = [
    { key: "frontLeft", label: "FL Door" },
    { key: "frontRight", label: "FR Door" },
    { key: "rearLeft", label: "RL Door" },
    { key: "rearRight", label: "RR Door" },
    { key: "trunk", label: "Trunk" },
    { key: "frunk", label: "Frunk" },
  ];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: "transparent",
      }}
    >
      {/* 3D canvas */}
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: "100%",
          cursor: "grab",
          userSelect: "none",
        }}
      />

      {/* Drag hint */}
      <div
        style={{
          position: "absolute",
          bottom: 48,
          left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(255,255,255,0.35)",
          fontSize: "0.65rem",
          letterSpacing: "0.1em",
          pointerEvents: "none",
          textTransform: "uppercase",
        }}
      >
        Drag to rotate
      </div>

      {/* Door controls */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {doorLabels.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggleDoor(key)}
            style={{
              background: doorStates[key]
                ? "rgba(29,185,84,0.25)"
                : "rgba(255,255,255,0.08)",
              border: `1px solid ${doorStates[key] ? "#1db954" : "rgba(255,255,255,0.2)"}`,
              color: doorStates[key] ? "#1db954" : "rgba(255,255,255,0.7)",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: "0.65rem",
              cursor: "pointer",
              fontFamily: "Rajdhani, sans-serif",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              transition: "all 0.2s",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
