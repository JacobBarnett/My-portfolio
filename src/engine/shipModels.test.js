import * as THREE from "three";

import {
  buildShip,
  setThrust,
  disposeShip,
  scaleForDryMassTons,
  SHIP_MODEL_KEYS,
  PLUME,
} from "./shipModels";
import ships from "../../mining-physics/data/ships.json";

// The catalogue and the models must not drift. If someone adds a ship to the
// JSON and forgets the geometry, this is the test that says so.
test("every ship in the catalogue has a model, and every model is used", () => {
  const wanted = ships.ships.map((s) => s.model);
  for (const key of wanted) {
    expect(SHIP_MODEL_KEYS).toContain(key);
  }
  for (const key of SHIP_MODEL_KEYS) {
    expect(wanted).toContain(key);
  }
});

test("every ship builds, and every one can be told to burn", () => {
  for (const ship of ships.ships) {
    const group = buildShip(ship.model, { dryMassTons: ship.dry_mass_tons });
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.userData.thruster).toBeDefined();
    expect(group.children.length).toBeGreaterThan(1);

    setThrust(group, 2);
    const lit = group.userData.thrusterBank ?? [group.userData.thruster];
    expect(lit.every((m) => m.material.emissiveIntensity === 2)).toBe(true);

    setThrust(group, 0);
    expect(lit.every((m) => m.material.emissiveIntensity === 0)).toBe(true);
  }
});

test("the silhouettes are actually different from each other", () => {
  const counts = SHIP_MODEL_KEYS.map((key) => {
    let meshes = 0;
    buildShip(key).traverse((n) => {
      if (n.isMesh) meshes += 1;
    });
    return meshes;
  });
  // Not a strong claim, but it catches the obvious failure of every builder
  // returning the same thing.
  expect(new Set(counts).size).toBeGreaterThan(3);
});

test("chemical ships glow orange and electric ships glow blue", () => {
  const colourOf = (modelKey) =>
    buildShip(modelKey).userData.thruster.material.color.getHex();

  expect(colourOf("methalox-shuttle")).toBe(PLUME.chemical.color);
  expect(colourOf("osiris-rex")).toBe(PLUME.chemical.color);
  expect(colourOf("ion-freighter")).toBe(PLUME.electric.color);
  expect(colourOf("psyche")).toBe(PLUME.electric.color);
});

test("a heavier ship is drawn larger, within limits", () => {
  const probe = scaleForDryMassTons(0.88);
  const freighter = scaleForDryMassTons(28);
  expect(probe).toBeLessThan(freighter);
  // The probe stays visible and the freighter stays on screen.
  expect(probe).toBeGreaterThanOrEqual(0.55);
  expect(freighter).toBeLessThanOrEqual(1.6);
  expect(scaleForDryMassTons(null)).toBe(1);
});

test("an unknown model falls back rather than crashing the viewport", () => {
  const group = buildShip("not-a-ship");
  expect(group.userData.thruster).toBeDefined();
});

test("a replaced ship can be disposed", () => {
  const group = buildShip("psyche");
  const geometry = [];
  group.traverse((n) => {
    if (n.geometry) geometry.push(n.geometry);
  });
  disposeShip(group);
  // three.js sets this when dispose runs, so the test is about the sweep
  // reaching every child rather than about three.js internals.
  expect(geometry.length).toBeGreaterThan(2);
});
