import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export default function TeslaModel3D() {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const frameRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    const W = mount.clientWidth;
    const H = mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = null;

    // Camera
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
    camera.position.set(3, 2, 5);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Orbit controls (drag to rotate, pinch to zoom)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 2;
    controls.maxDistance = 12;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;

    // Stop auto-rotate on user interaction
    controls.addEventListener("start", () => {
      controls.autoRotate = false;
    });

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(5, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.width = 2048;
    key.shadow.mapSize.height = 2048;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xaaccff, 0.5);
    fill.position.set(-5, 3, -3);
    scene.add(fill);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
    rimLight.position.set(0, 3, -6);
    scene.add(rimLight);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 12),
      new THREE.MeshStandardMaterial({
        color: 0x080808,
        metalness: 0.9,
        roughness: 0.2,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    // Ground reflection glow
    const glowGeo = new THREE.PlaneGeometry(6, 3);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x223344,
      transparent: true,
      opacity: 0.15,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.005;
    scene.add(glow);

    // Load GLB
    const loader = new GLTFLoader();
    loader.load(
      "/low_poly_tesla_cybertruck.glb",
      (gltf) => {
        const model = gltf.scene;

        // Center and scale the model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 3.5 / maxDim;

        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
        model.position.y = 0; // sit on ground

        // Enable shadows on all meshes
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            // Enhance materials
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((m) => {
                  m.metalness = Math.max(m.metalness || 0, 0.3);
                  m.roughness = Math.min(m.roughness || 0.5, 0.6);
                });
              } else {
                child.material.metalness = Math.max(
                  child.material.metalness || 0,
                  0.3,
                );
                child.material.roughness = Math.min(
                  child.material.roughness || 0.5,
                  0.6,
                );
              }
            }
          }
        });

        scene.add(model);

        // Update controls target to model center
        controls.target.set(0, size.y * scale * 0.4, 0);
        controls.update();

        setLoading(false);
      },
      (progress) => {
        // loading progress
      },
      (err) => {
        console.error("GLB load error:", err);
        setError(true);
        setLoading(false);
      },
    );

    // Animate
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

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
      controls.dispose();
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement))
        mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              border: "3px solid #333",
              borderTopColor: "#cc1111",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <div
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: "0.7rem",
              letterSpacing: "0.1em",
              fontFamily: "Rajdhani, sans-serif",
            }}
          >
            LOADING MODEL
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
            color: "rgba(255,255,255,0.4)",
            fontSize: "0.75rem",
            fontFamily: "Rajdhani, sans-serif",
          }}
        >
          Could not load model
        </div>
      )}

      {!loading && !error && (
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: "0.62rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            pointerEvents: "none",
            fontFamily: "Rajdhani, sans-serif",
            display: "flex",
            gap: 16,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              color: "#c9a84c",
              textShadow: "0 0 8px rgba(201,168,76,0.6)",
            }}
          >
            ⟳ Drag to rotate
          </span>
          <span
            style={{
              color: "#c9a84c",
              textShadow: "0 0 8px rgba(201,168,76,0.6)",
            }}
          >
            ⊕ Scroll to zoom
          </span>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
