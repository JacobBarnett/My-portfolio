/* @ts-self-types="./mining_physics.d.ts" */

export class MissionState {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MissionStateFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_missionstate_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get distance_km() {
        const ret = wasm.__wbg_get_missionstate_distance_km(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get exhaust_velocity() {
        const ret = wasm.__wbg_get_missionstate_exhaust_velocity(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get extraction_rate() {
        const ret = wasm.__wbg_get_missionstate_extraction_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get fuel_kg() {
        const ret = wasm.__wbg_get_missionstate_fuel_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get mission_time_s() {
        const ret = wasm.__wbg_get_missionstate_mission_time_s(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get ore_kg() {
        const ret = wasm.__wbg_get_missionstate_ore_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get ship_mass_kg() {
        const ret = wasm.__wbg_get_missionstate_ship_mass_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get thrust_n() {
        const ret = wasm.__wbg_get_missionstate_thrust_n(this.__wbg_ptr);
        return ret;
    }
    /**
     * Tsiolkovsky rocket equation — delta-v budget
     * @returns {number}
     */
    delta_v() {
        const ret = wasm.missionstate_delta_v(this.__wbg_ptr);
        return ret;
    }
    /**
     * Fuel burn for a given delta-v maneuver
     * @param {number} dv
     * @returns {number}
     */
    fuel_for_delta_v(dv) {
        const ret = wasm.missionstate_fuel_for_delta_v(this.__wbg_ptr, dv);
        return ret;
    }
    /**
     * Mining yield score 0–100
     * @returns {number}
     */
    mission_score() {
        const ret = wasm.missionstate_mission_score(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} fuel_kg
     * @param {number} ship_mass_kg
     * @param {number} distance_km
     */
    constructor(fuel_kg, ship_mass_kg, distance_km) {
        const ret = wasm.missionstate_new(fuel_kg, ship_mass_kg, distance_km);
        this.__wbg_ptr = ret >>> 0;
        MissionStateFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Simulate one tick of mining (dt = seconds)
     * @param {number} dt
     */
    tick(dt) {
        wasm.missionstate_tick(this.__wbg_ptr, dt);
    }
    /**
     * Estimated time to fill ore capacity (seconds)
     * @param {number} capacity_kg
     * @returns {number}
     */
    time_to_capacity(capacity_kg) {
        const ret = wasm.missionstate_time_to_capacity(this.__wbg_ptr, capacity_kg);
        return ret;
    }
    /**
     * Hohmann transfer delta-v to reach asteroid (simplified)
     * @returns {number}
     */
    transfer_delta_v() {
        const ret = wasm.missionstate_transfer_delta_v(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set distance_km(arg0) {
        wasm.__wbg_set_missionstate_distance_km(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set exhaust_velocity(arg0) {
        wasm.__wbg_set_missionstate_exhaust_velocity(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set extraction_rate(arg0) {
        wasm.__wbg_set_missionstate_extraction_rate(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set fuel_kg(arg0) {
        wasm.__wbg_set_missionstate_fuel_kg(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set mission_time_s(arg0) {
        wasm.__wbg_set_missionstate_mission_time_s(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set ore_kg(arg0) {
        wasm.__wbg_set_missionstate_ore_kg(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set ship_mass_kg(arg0) {
        wasm.__wbg_set_missionstate_ship_mass_kg(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set thrust_n(arg0) {
        wasm.__wbg_set_missionstate_thrust_n(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) MissionState.prototype[Symbol.dispose] = MissionState.prototype.free;

/**
 * Call any tool by name. Input and output are JSON strings, so adding a tool
 * never changes this binding.
 * @param {string} name
 * @param {string} input_json
 * @returns {string}
 */
export function call_tool(name, input_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(input_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.call_tool(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * The tool names this build supports, as a JSON array.
 * @returns {string}
 */
export function tool_names() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.tool_names();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_6ddd609b62940d55: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./mining_physics_bg.js": import0,
    };
}

const MissionStateFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_missionstate_free(ptr >>> 0, 1));

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('mining_physics_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
