// The call path between React and Rust.
//
// This suite exists because of a real bug: `call.mjs` kept its own list of tool
// names, the list did not get `ship_envelope` when the tool was added, and the
// browser refused a call the engine could have answered. The ship panel showed
// "not published" and "undefined of undefined" for figures the engine had. The
// list is gone, and these tests keep it gone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { setEngine } from "./engine.mjs";
import { callEngine, ask } from "./call.mjs";

const require = createRequire(import.meta.url);
const engine = require("../../mining-physics/pkg-node/mining_physics.js");
setEngine(engine);

const NAMES = JSON.parse(engine.tool_names());

test("every tool the engine advertises can be called through the UI path", async () => {
  assert.ok(NAMES.length >= 11, `only ${NAMES.length} tools`);
  for (const name of NAMES) {
    const r = await callEngine(name, {});
    assert.equal(r.name, name);
    assert.notEqual(
      r.error,
      "unknown_tool",
      `${name} exists in Rust but the call path refused it`,
    );
    assert.equal(typeof r.output, "object");
    assert.equal(typeof r.ms, "number");
  }
});

test("the tools the simulator and the ship panel actually call all work", async () => {
  // Named rather than looped, so deleting one from the Rust fails here with
  // the name of the screen that would break.
  const used = [
    "list_ships",
    "ship_envelope",
    "search_asteroids",
    "check_ship",
    "simulate_mission",
  ];
  for (const name of used) {
    assert.ok(NAMES.includes(name), `${name} is called by the UI and the engine does not have it`);
  }

  const fleet = await ask("list_ships");
  assert.ok(fleet.ships.length >= 7);

  const envelope = await ask("ship_envelope", { ship_id: "ion-freighter" });
  assert.equal(envelope.error ?? null, null);
  assert.ok(envelope.delta_v_capacity_km_s > 0, "the panel reads this one");
  assert.ok(envelope.objects_in_catalogue > 0, "and this one");
  assert.equal(typeof envelope.objects_reachable_with_a_full_hold, "number");
});

test("a name the engine does not know comes back as data, not as a throw", async () => {
  const r = await callEngine("warp_drive", {});
  assert.equal(r.error, "unknown_tool");
  assert.ok(Array.isArray(r.output.available), "the engine lists what it does have");
  assert.ok(r.output.available.includes("ship_envelope"));
});

test("a tool called with nonsense input answers with an error object", async () => {
  const r = await callEngine("check_ship", { asteroid_id: "nope", ship_id: "nope" });
  assert.ok(r.error, "a bad lookup should be reported");
  assert.equal(typeof r.output.error, "string");
});

test("ask returns the output on its own", async () => {
  const out = await ask("get_assumptions");
  assert.ok(out.commodity_prices_usd_per_ton);
});
