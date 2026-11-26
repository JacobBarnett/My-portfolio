// Loads the Rust physics engine and exposes one call path for every tool.
//
// The browser fetches the same wasm the simulator uses, from /static-wasm/, with
// the dynamic import marked webpackIgnore so Create React App leaves it alone.
// Tests inject the nodejs build instead through setEngine.

let engine = null;
let loading = null;

/** @typedef {{ call_tool: (name: string, inputJson: string) => string, tool_names: () => string }} Engine */

/** Replace the engine, used by tests and by the dev console. @param {Engine} e */
export function setEngine(e) {
  engine = e;
}

/** @returns {Promise<Engine>} */
export async function loadEngine() {
  if (engine) return engine;
  if (loading) return loading;
  loading = (async () => {
    const mod = await import(
      /* webpackIgnore: true */ "/static-wasm/mining_physics.js"
    );
    await mod.default("/static-wasm/mining_physics_bg.wasm");
    engine = mod;
    return mod;
  })();
  try {
    return await loading;
  } catch (e) {
    loading = null;
    throw new Error(`The physics engine failed to load: ${e.message}`);
  }
}

/** The tool names the loaded engine actually supports. @returns {Promise<string[]>} */
export async function engineToolNames() {
  const e = await loadEngine();
  return JSON.parse(e.tool_names());
}
