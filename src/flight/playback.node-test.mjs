// Playback arithmetic, checked against a real timeline from the engine rather
// than against a fixture, so a change in the Rust cannot quietly pass here.
//
// The ship is the invented ion freighter because it is the only one in the
// catalogue that can complete a loaded round trip at all. That is itself
// asserted in the Rust tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import {
  totalDays,
  stateAt,
  comparePlanToTimeline,
  phaseLogLine,
  ATTACHED_PHASES,
} from "./playback.mjs";

const require = createRequire(import.meta.url);
const engine = require("../../mining-physics/pkg-node/mining_physics.js");

const call = (name, input) => JSON.parse(engine.call_tool(name, JSON.stringify(input)));

const SIM = call("simulate_mission", { asteroid_id: "101955", ship_id: "ion-freighter", tons: 500 });
const PROFIT = call("estimate_profit", { asteroid_id: "101955", ship_id: "ion-freighter", tons: 500 });
const TRANSFER = call("calculate_transfer", {
  asteroid_id: "101955",
  ship_id: "ion-freighter",
  payload_tons: 500,
});

const PLAN = {
  target: { asteroid_id: "101955", name: SIM.name },
  ship_id: "ion-freighter",
  mission: {
    delta_v_km_s: TRANSFER.delta_v_km_s,
    propellant_tons: TRANSFER.propellant_tons,
    tonnage_tons: 500,
    mission_days: PROFIT.mission_days,
  },
  economics: {
    revenue_usd: PROFIT.revenue_usd,
    cost_usd: PROFIT.cost_usd,
    profit_usd: PROFIT.profit_usd,
  },
};

// ------------------------------------------------------------------ playback

test("the scrubber runs from standby to the planned mission length", () => {
  const total = totalDays(SIM.timeline);
  assert.ok(Math.abs(total - SIM.totals.mission_days) <= 0.05, `total was ${total}`);
  assert.equal(stateAt(SIM.timeline, 0).phase, "STANDBY");
  assert.equal(stateAt(SIM.timeline, total).phase, "COMPLETE");
  assert.equal(stateAt(SIM.timeline, total).done, true);
});

test("a day outside the mission is clamped rather than read off the end", () => {
  const total = totalDays(SIM.timeline);
  assert.equal(stateAt(SIM.timeline, -50).day, 0);
  assert.equal(stateAt(SIM.timeline, total + 500).day, total);
  assert.equal(stateAt(SIM.timeline, total + 500).phase, "COMPLETE");
});

test("every phase in the timeline is reachable by scrubbing", () => {
  const seen = new Set();
  const total = totalDays(SIM.timeline);
  for (let d = 0; d <= total; d += total / 4000) {
    seen.add(stateAt(SIM.timeline, d).phase);
  }
  for (const f of SIM.timeline) {
    if (f.duration_days > 0) {
      assert.ok(seen.has(f.phase), `scrubbing never landed in ${f.phase}`);
    }
  }
});

test("the phase at a day matches the frame that covers that day", () => {
  for (const f of SIM.timeline) {
    if (f.duration_days <= 0) continue;
    const mid = f.start_day + f.duration_days / 2;
    assert.equal(stateAt(SIM.timeline, mid).phase, f.phase, `midpoint of ${f.phase}`);
  }
});

test("the hold fills and never empties, and propellant never climbs", () => {
  const total = totalDays(SIM.timeline);
  let lastCargo = -1;
  let lastFuel = Infinity;
  for (let d = 0; d <= total; d += total / 500) {
    const s = stateAt(SIM.timeline, d);
    assert.ok(s.cargo_tons >= lastCargo - 1e-9, `ore fell at day ${d}`);
    assert.ok(s.propellant_tons <= lastFuel + 1e-9, `propellant rose at day ${d}`);
    lastCargo = s.cargo_tons;
    lastFuel = s.propellant_tons;
  }
  assert.ok(Math.abs(lastCargo - 500) < 1, `delivered ${lastCargo} tons`);
});

test("the ship is only attached while it is working the rock", () => {
  for (const f of SIM.timeline) {
    if (f.duration_days <= 0) continue;
    const s = stateAt(SIM.timeline, f.start_day + f.duration_days / 2);
    assert.equal(s.attached, ATTACHED_PHASES.has(f.phase), `${f.phase} attachment`);
  }
  const transit = SIM.timeline.find((f) => f.phase === "TRANSIT");
  assert.equal(stateAt(SIM.timeline, transit.start_day + 1).attached, false);
});

test("phase progress runs from zero to one inside a phase", () => {
  const extract = SIM.timeline.find((f) => f.phase === "EXTRACTING");
  assert.ok(stateAt(SIM.timeline, extract.start_day).phase_progress < 0.05);
  // A boundary day belongs to the phase that is starting, so this reads just
  // short of the handover.
  assert.ok(stateAt(SIM.timeline, extract.end_day - 0.01).phase_progress > 0.95);
  assert.equal(stateAt(SIM.timeline, extract.end_day).phase, "RETURNING");
});

// --------------------------------------------------------------- comparison

test("a plan built from the tools matches its own simulation on every line", () => {
  const c = comparePlanToTimeline(PLAN, SIM);
  assert.equal(c.rows.length, 7);
  assert.equal(c.mismatches, 0, JSON.stringify(c.rows.filter((r) => !r.match)));
  assert.equal(c.allMatch, true);
});

test("a plan that promises a profit the engine did not produce is caught", () => {
  const lying = { ...PLAN, economics: { ...PLAN.economics, profit_usd: 999_000_000 } };
  const c = comparePlanToTimeline(lying, SIM);
  assert.equal(c.allMatch, false);
  assert.equal(c.rows.find((r) => r.label === "Profit").match, false);
});

test("a missing figure is a mismatch, not a quiet pass", () => {
  const thin = { ...PLAN, mission: { ...PLAN.mission, mission_days: null } };
  const c = comparePlanToTimeline(thin, SIM);
  assert.equal(c.rows.find((r) => r.label === "Mission length").match, false);
});

test("rounding at the dollar and the hundredth of a day still matches", () => {
  const rounded = {
    ...PLAN,
    mission: { ...PLAN.mission, mission_days: PLAN.mission.mission_days + 0.04 },
    economics: { ...PLAN.economics, profit_usd: PLAN.economics.profit_usd + 1 },
  };
  assert.equal(comparePlanToTimeline(rounded, SIM).allMatch, true);
});

test("a log line carries the engine's numbers for that phase", () => {
  const extract = SIM.timeline.find((f) => f.phase === "EXTRACTING");
  const line = phaseLogLine(extract);
  assert.match(line, /hold/);
  assert.match(line, /propellant/);
  assert.ok(line.includes(extract.note));
});

