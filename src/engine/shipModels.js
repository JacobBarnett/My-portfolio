// The ships, as three.js geometry.
//
// One builder per `model` key in mining-physics/data/ships.json. Each is built
// from primitives so there are no model files to download and nothing to
// licence, and each is shaped so you can tell which ship you picked from the
// silhouette alone: OSIRIS-REx has its hexagonal bus and sampler arm,
// Hayabusa2 is flat with a horn underneath, Psyche carries the five panel
// arrays, Vestri is a box on legs.
//
// Conventions inherited from the simulator, which animates these:
//   * +z points home. The ship flies toward negative z and returns.
//   * `userData.thruster` is the mesh whose emissiveIntensity the mission code
//     drives, so every ship must have one.
//   * Roughly 0.5 units across keeps a ship readable beside the asteroid.
//
// Thruster colour follows the physics rather than taste: a chemical engine
// glows orange, an electric one blue, because that is what distinguishes these
// ships in the numbers too.

import * as THREE from "three";

const HULL = { color: 0xd0d8e8, metalness: 0.8, roughness: 0.25 };
const HULL_WARM = { color: 0xc9b89a, metalness: 0.6, roughness: 0.4 };
const PANEL = {
  color: 0x1a3a6a,
  metalness: 0.3,
  roughness: 0.4,
  emissive: 0x0a1a3a,
  emissiveIntensity: 0.3,
};
const GOLD = { color: 0xc8a96e, metalness: 0.9, roughness: 0.2 };
const DARK = { color: 0x2a3340, metalness: 0.5, roughness: 0.6 };

const hull = (extra) => new THREE.MeshStandardMaterial({ ...HULL, ...extra });
const panelMat = () => new THREE.MeshStandardMaterial({ ...PANEL });
const goldMat = () => new THREE.MeshStandardMaterial({ ...GOLD });
const darkMat = () => new THREE.MeshStandardMaterial({ ...DARK });
const warmMat = () => new THREE.MeshStandardMaterial({ ...HULL_WARM });

/** Chemical burns orange, electric burns blue. */
export const PLUME = {
  chemical: { color: 0xff6600, emissive: 0xff3300 },
  electric: { color: 0x7fd3ff, emissive: 0x3aa0ff },
};

function thrusterMesh(kind = "chemical", radius = 0.05, length = 0.1) {
  const { color, emissive } = PLUME[kind] ?? PLUME.chemical;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.7, radius, length, 10),
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0 }),
  );
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

/** A flat solar wing. */
function wing(width, depth, { tilt = 0 } = {}) {
  const w = new THREE.Mesh(new THREE.BoxGeometry(width, 0.012, depth), panelMat());
  w.rotation.z = tilt;
  // Tagged so the render loop can shimmer the arrays without knowing which
  // child index they landed at on which ship.
  w.userData.isPanel = true;
  return w;
}

/** A dish antenna, which most of these carry and which reads instantly. */
function dish(radius = 0.09) {
  const d = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4),
    new THREE.MeshStandardMaterial({ color: 0xe8edf5, metalness: 0.4, roughness: 0.5 }),
  );
  d.rotation.x = Math.PI / 2.2;
  return d;
}

// ─────────────────────────────────────────────── the four real spacecraft

/** NASA OSIRIS-REx: hexagonal bus, two wings, the TAGSAM arm out front. */
function osirisRex() {
  const g = new THREE.Group();

  const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 6), goldMat());
  bus.rotation.x = Math.PI / 2;
  g.add(bus);

  [-1, 1].forEach((side) => {
    const w = wing(0.34, 0.16, { tilt: side * 0.25 });
    w.position.set(side * 0.27, 0, 0);
    g.add(w);
  });

  // The sampler arm, which is the thing everyone recognises.
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), hull());
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, -0.04, -0.2);
  g.add(arm);

  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 14), warmMat());
  head.position.set(0, -0.04, -0.35);
  head.rotation.x = Math.PI / 2;
  g.add(head);

  const ant = dish(0.08);
  ant.position.set(0, 0.11, 0.04);
  g.add(ant);

  const t = thrusterMesh("chemical", 0.045, 0.09);
  t.position.set(0, 0, 0.16);
  g.add(t);
  g.userData.thruster = t;
  return g;
}

/** JAXA Hayabusa2: flat box, flush panels, sampler horn below, ion thrusters. */
function hayabusa2() {
  const g = new THREE.Group();

  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.24), hull());
  g.add(bus);

  [-1, 1].forEach((side) => {
    const w = wing(0.3, 0.2);
    w.position.set(side * 0.24, 0.01, 0);
    g.add(w);
  });

  // The sampler horn it lowered onto Ryugu.
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 12, 1, true), darkMat());
  horn.position.set(0, -0.11, -0.02);
  g.add(horn);

  // The impactor it fired into the surface.
  const impactor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), warmMat());
  impactor.position.set(0.0, -0.02, -0.14);
  g.add(impactor);

  const ant = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.14), goldMat());
  ant.position.set(0, 0.07, 0.02);
  g.add(ant);

  // Four mu10 thrusters, the real arrangement.
  const bank = new THREE.Group();
  [-1, 1].forEach((x) =>
    [-1, 1].forEach((y) => {
      const t = thrusterMesh("electric", 0.022, 0.05);
      t.position.set(x * 0.045, y * 0.025, 0.14);
      bank.add(t);
    }),
  );
  g.add(bank);
  g.userData.thruster = bank.children[0];
  g.userData.thrusterBank = bank.children;
  return g;
}

/** NASA Psyche: the five panel arrays are the whole silhouette. */
function psyche() {
  const g = new THREE.Group();

  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.2), hull());
  g.add(bus);

  // Two arrays of five panels each, in the cross shape Psyche actually flies.
  [-1, 1].forEach((side) => {
    const arm = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const p = wing(0.13, 0.19);
      p.position.set(side * (0.12 + i * 0.13), 0, 0);
      arm.add(p);
    }
    arm.rotation.z = side * 0.12;
    g.add(arm);
  });

  const ant = dish(0.1);
  ant.position.set(0, 0.13, 0.03);
  g.add(ant);

  // Four SPT-140 Hall thrusters.
  const bank = new THREE.Group();
  [-1, 1].forEach((x) =>
    [-1, 1].forEach((y) => {
      const t = thrusterMesh("electric", 0.028, 0.06);
      t.position.set(x * 0.05, y * 0.05, 0.12);
      bank.add(t);
    }),
  );
  g.add(bank);
  g.userData.thruster = bank.children[0];
  g.userData.thrusterBank = bank.children;
  return g;
}

/**
 * AstroForge Vestri: a box on landing legs.
 *
 * Deliberately sparse. Almost nothing about this spacecraft is public, and a
 * detailed model would be inventing detail the company has not released.
 */
function vestri() {
  const g = new THREE.Group();

  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 0.15), warmMat());
  g.add(bus);

  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.13, 6), hull());
    leg.position.set(Math.cos(angle) * 0.08, -0.11, Math.sin(angle) * 0.08);
    leg.rotation.z = Math.cos(angle) * 0.5;
    leg.rotation.x = -Math.sin(angle) * 0.5;
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.01, 10), darkMat());
    foot.position.set(Math.cos(angle) * 0.12, -0.17, Math.sin(angle) * 0.12);
    g.add(foot);
  }

  [-1, 1].forEach((side) => {
    const w = wing(0.16, 0.12);
    w.position.set(side * 0.15, 0.03, 0);
    g.add(w);
  });

  const t = thrusterMesh("electric", 0.025, 0.05);
  t.position.set(0, 0, 0.1);
  g.add(t);
  g.userData.thruster = t;
  return g;
}

// ──────────────────────────────────────────── the three invented haulers

/** Chemical hauler: mostly tank, with a bell nozzle and an ore hopper. */
function methaloxShuttle() {
  const g = new THREE.Group();

  const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.26, 8, 16), hull());
  tank.rotation.x = Math.PI / 2;
  g.add(tank);

  const hopper = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.13, 0.15), warmMat());
  hopper.position.set(0, 0, -0.22);
  g.add(hopper);

  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.14, 16, 1, true), darkMat());
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0, 0.28);
  g.add(nozzle);

  const t = thrusterMesh("chemical", 0.07, 0.1);
  t.position.set(0, 0, 0.3);
  g.add(t);
  g.userData.thruster = t;
  return g;
}

/** Hall tug: a bus between two cargo pods, with a bank of four thrusters. */
function hallTug() {
  const g = new THREE.Group();

  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.4), hull());
  g.add(spine);

  [-1, 1].forEach((side) => {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.26, 12), warmMat());
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 0.13, -0.02, -0.04);
    g.add(pod);

    const w = wing(0.26, 0.18, { tilt: side * 0.1 });
    w.position.set(side * 0.3, 0.07, 0.04);
    g.add(w);
  });

  const bank = new THREE.Group();
  [-1, 1].forEach((x) =>
    [-1, 1].forEach((y) => {
      const t = thrusterMesh("electric", 0.03, 0.07);
      t.position.set(x * 0.04, y * 0.035, 0.23);
      bank.add(t);
    }),
  );
  g.add(bank);
  g.userData.thruster = bank.children[0];
  g.userData.thrusterBank = bank.children;
  return g;
}

/** Ion freighter: a long spine, a cargo drum and the biggest arrays here. */
function ionFreighter() {
  const g = new THREE.Group();

  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 10), hull());
  spine.rotation.x = Math.PI / 2;
  g.add(spine);

  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.22, 16), warmMat());
  drum.rotation.x = Math.PI / 2;
  drum.position.set(0, 0, -0.18);
  g.add(drum);

  // Hoops on the drum, so a full hold reads as cargo rather than as a tank.
  [-0.09, 0, 0.09].forEach((z) => {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.008, 6, 20), darkMat());
    hoop.position.set(0, 0, -0.18 + z);
    g.add(hoop);
  });

  [-1, 1].forEach((side) => {
    for (let i = 0; i < 2; i++) {
      const w = wing(0.34, 0.26, { tilt: side * 0.06 });
      w.position.set(side * (0.22 + i * 0.35), 0.02, 0.08);
      g.add(w);
    }
  });

  const bank = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const t = thrusterMesh("electric", 0.024, 0.06);
    const angle = (i / 6) * Math.PI * 2;
    t.position.set(Math.cos(angle) * 0.055, Math.sin(angle) * 0.055, 0.3);
    bank.add(t);
  }
  g.add(bank);
  g.userData.thruster = bank.children[0];
  g.userData.thrusterBank = bank.children;
  return g;
}

const BUILDERS = {
  "osiris-rex": osirisRex,
  hayabusa2,
  psyche,
  vestri,
  "methalox-shuttle": methaloxShuttle,
  "hall-tug": hallTug,
  "ion-freighter": ionFreighter,
};

export const SHIP_MODEL_KEYS = Object.keys(BUILDERS);

/**
 * A size difference you can see without the probe vanishing.
 *
 * OSIRIS-REx is 880 kg and the freighter is 28 tons, a factor of 32, and at
 * true relative scale the probe would be a speck. The cube root keeps the
 * ordering honest while staying visible, and the panel beside the viewport
 * prints the real masses.
 */
export function scaleForDryMassTons(tons) {
  if (!tons || tons <= 0) return 1;
  const s = Math.cbrt(tons / 2) * 0.9;
  return Math.min(Math.max(s, 0.55), 1.6);
}

/**
 * Build one ship.
 *
 * @param {string} modelKey the `model` field from the ship catalogue
 * @param {{ dryMassTons?: number }} [opts]
 * @returns {THREE.Group} with userData.thruster set
 */
export function buildShip(modelKey, opts = {}) {
  const builder = BUILDERS[modelKey] ?? BUILDERS["hall-tug"];
  const group = builder();
  group.scale.setScalar(scaleForDryMassTons(opts.dryMassTons));
  group.userData.modelKey = modelKey;
  const panels = [];
  group.traverse((n) => {
    if (n.userData?.isPanel) panels.push(n);
  });
  group.userData.panels = panels;
  // Everything the simulator animates goes through here, so fail loudly in
  // development if a new ship forgets it.
  if (!group.userData.thruster) {
    throw new Error(`ship model ${modelKey} has no thruster mesh`);
  }
  return group;
}

/** Light every thruster on a ship, including the banked ones. */
export function setThrust(ship, intensity) {
  const meshes = ship?.userData?.thrusterBank ?? [ship?.userData?.thruster];
  for (const m of meshes) {
    if (m?.material) m.material.emissiveIntensity = intensity;
  }
}

/** Free the geometry and materials of a ship we are replacing. */
export function disposeShip(ship) {
  ship?.traverse?.((node) => {
    node.geometry?.dispose?.();
    if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose?.());
    else node.material?.dispose?.();
  });
}
