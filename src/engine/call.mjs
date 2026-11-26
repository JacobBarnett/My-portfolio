// One call path from React into the Rust engine.
//
// Every number the simulator shows about a ship, an asteroid or a mission comes
// through here. The engine answers in JSON and reports its refusals as data, so
// this never throws: a caller always gets an object, and an unhappy one carries
// an `error` and a `hint` written for the person looking at the screen.

import { loadEngine } from "./engine.mjs";

/**
 * @param {string} name a tool the engine knows
 * @param {object} [input]
 * @returns {Promise<{name: string, input: object, output: object, ms: number, error: string|null}>}
 */
export async function callEngine(name, input = {}) {
  const started = Date.now();
  const done = (output) => ({
    name,
    input,
    output,
    ms: Date.now() - started,
    error: output && typeof output === "object" ? (output.error ?? null) : null,
  });

  // There is deliberately no list of tool names here. There used to be, and it
  // drifted the moment a tool was added to the Rust and not to the copy, which
  // made a working tool look unavailable in the browser. The engine knows what
  // it can answer and already returns a typed unknown_tool with the real list.
  let engine;
  try {
    engine = await loadEngine();
  } catch (e) {
    return done({
      error: "engine_unavailable",
      detail: e.message,
      hint: "The physics engine could not be loaded, so none of these numbers can be shown. Reload the page.",
    });
  }

  try {
    return done(JSON.parse(engine.call_tool(name, JSON.stringify(input ?? {}))));
  } catch (e) {
    return done({
      error: "engine_call_failed",
      detail: String(e?.message ?? e),
      hint: "The engine could not complete that calculation.",
    });
  }
}

/** The same call when only the answer matters. */
export async function ask(name, input = {}) {
  return (await callEngine(name, input)).output;
}
