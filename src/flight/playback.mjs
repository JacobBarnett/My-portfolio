// Playing a mission.
//
// The player picks a ship, a target and a tonnage; the Rust engine returns a
// timeline; this module turns that timeline into something the simulator can
// play. Given a day it answers where the ship is, how much propellant is left,
// how much ore is aboard, and which phase is running.
//
// It is deliberately free of React and of three.js so the arithmetic can be
// tested without a browser. The simulator only drives it.

import { PHASE_NAMES } from "./phases.mjs";

/** Phases during which the ship is on the rock rather than under way. */
export const ATTACHED_PHASES = new Set(["ANCHORING", "DRILLING", "EXTRACTING"]);

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A timeline the simulator can actually play. Never throws. */
export function isPlayable(frames) {
  return (
    Array.isArray(frames) &&
    frames.length > 0 &&
    frames.every(
      (f) =>
        typeof f?.phase === "string" &&
        PHASE_NAMES.includes(f.phase) &&
        num(f.start_day) != null &&
        num(f.end_day) != null,
    )
  );
}

/** The last day of the mission, which is where the scrubber ends. */
export function totalDays(frames) {
  return frames.reduce((max, f) => Math.max(max, num(f.end_day) ?? 0), 0);
}

/**
 * Where the mission is on a given day.
 *
 * Propellant and ore are read as the value each phase ends on, so within a
 * phase they move smoothly from the previous phase's value to this one's. That
 * is an interpolation for the sake of the gauges and nothing else: the figures
 * at the phase boundaries are the engine's.
 */
export function stateAt(frames, day) {
  const total = totalDays(frames);
  const clamped = Math.min(Math.max(day, 0), total);

  // The last phase that has started, preferring one with real duration so a
  // zero length marker like STANDBY does not swallow the playhead.
  let index = 0;
  // Before the clock starts the ship is on the pad, so day zero reads as the
  // first frame even though the next phase also begins at zero.
  for (let i = 0; i < frames.length && clamped > 0; i++) {
    const f = frames[i];
    const started = (num(f.start_day) ?? 0) <= clamped;
    const ended = (num(f.end_day) ?? 0) < clamped;
    if (!started) break;
    if (ended && i < frames.length - 1) continue;
    index = i;
    if ((num(f.end_day) ?? 0) > clamped) break;
  }
  if (clamped >= total) index = frames.length - 1;

  const frame = frames[index];
  const prev = frames[index - 1] ?? frame;
  const span = (num(frame.end_day) ?? 0) - (num(frame.start_day) ?? 0);
  const progress = span > 0 ? (clamped - (num(frame.start_day) ?? 0)) / span : 1;

  const lerp = (key) => {
    const from = index === 0 ? num(frame[key]) : num(prev[key]);
    const to = num(frame[key]);
    if (from == null || to == null) return to;
    return from + (to - from) * progress;
  };

  return {
    day: clamped,
    total_days: total,
    index,
    phase: frame.phase,
    note: frame.note ?? "",
    phase_progress: Math.min(Math.max(progress, 0), 1),
    propellant_tons: lerp("propellant_tons_remaining"),
    cargo_tons: lerp("cargo_tons"),
    attached: ATTACHED_PHASES.has(frame.phase),
    done: clamped >= total,
  };
}

/**
 * Planned against simulated.
 *
 * These should agree, because both come from the same engine function. The
 * point of showing it is that when they ever disagree, the mismatch is on the
 * screen instead of hidden behind a confident number.
 */
export function comparePlanToTimeline(plan, sim) {
  const frames = Array.isArray(sim?.timeline) ? sim.timeline : [];
  const t = sim?.totals ?? {};
  const last = frames[frames.length - 1] ?? {};
  const summed = frames.reduce((acc, f) => acc + (num(f.duration_days) ?? 0), 0);
  const m = plan?.mission ?? {};
  const e = plan?.economics ?? {};

  const rows = [
    row("Mission length", m.mission_days, round(summed, 2), "days"),
    row("Delta v", m.delta_v_km_s, num(t.delta_v_km_s), "km/s"),
    row("Propellant", m.propellant_tons, num(t.propellant_tons), "tons"),
    row("Ore delivered", m.tonnage_tons, num(last.cargo_tons), "tons"),
    row("Revenue", e.revenue_usd, num(t.revenue_usd), "usd"),
    row("Cost", e.cost_usd, num(t.cost_usd), "usd"),
    row("Profit", e.profit_usd, num(t.profit_usd), "usd"),
  ].filter((r) => r.planned != null || r.simulated != null);

  return {
    rows,
    allMatch: rows.every((r) => r.match),
    mismatches: rows.filter((r) => !r.match).length,
  };
}

function row(label, planned, simulated, unit) {
  const p = num(planned);
  const s = num(simulated);
  return { label, planned: p, simulated: s, unit, match: close(p, s, unit) };
}

/**
 * Deliberately tight. Both sides come from the same engine call, so the only
 * honest difference is rounding: the dollar figures are whole dollars on both
 * sides, and the mission length is a sum of eight durations each rounded to two
 * places, which can drift by four hundredths of a day and no more. Anything
 * larger is a real disagreement and should be shown as one.
 */
function close(a, b, unit) {
  if (a == null || b == null) return false;
  // A dollar on a figure in the tens of millions is rounding, not disagreement,
  // and calling it one would make this card cry wolf.
  return Math.abs(a - b) <= (unit === "usd" ? 1 : 0.05);
}

const round = (v, places) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

/** One log line per phase, carrying the engine's own numbers for that phase. */
export function phaseLogLine(frame) {
  const bits = [frame.note || frame.phase];
  const fuel = num(frame.propellant_tons_remaining);
  const cargo = num(frame.cargo_tons);
  if (cargo != null && cargo > 0) bits.push(`hold ${fmt(cargo)} t`);
  if (fuel != null) bits.push(`propellant ${fmt(fuel)} t`);
  return bits.join(". ");
}

const fmt = (v) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : round(v, 1));
