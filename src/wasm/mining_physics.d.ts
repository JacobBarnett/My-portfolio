/* tslint:disable */
/* eslint-disable */

export class MissionState {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Tsiolkovsky rocket equation — delta-v budget
     */
    delta_v(): number;
    /**
     * Fuel burn for a given delta-v maneuver
     */
    fuel_for_delta_v(dv: number): number;
    /**
     * Mining yield score 0–100
     */
    mission_score(): number;
    constructor(fuel_kg: number, ship_mass_kg: number, distance_km: number);
    /**
     * Simulate one tick of mining (dt = seconds)
     */
    tick(dt: number): void;
    /**
     * Estimated time to fill ore capacity (seconds)
     */
    time_to_capacity(capacity_kg: number): number;
    /**
     * Hohmann transfer delta-v to reach asteroid (simplified)
     */
    transfer_delta_v(): number;
    distance_km: number;
    exhaust_velocity: number;
    extraction_rate: number;
    fuel_kg: number;
    mission_time_s: number;
    ore_kg: number;
    ship_mass_kg: number;
    thrust_n: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_get_missionstate_distance_km: (a: number) => number;
    readonly __wbg_get_missionstate_exhaust_velocity: (a: number) => number;
    readonly __wbg_get_missionstate_extraction_rate: (a: number) => number;
    readonly __wbg_get_missionstate_fuel_kg: (a: number) => number;
    readonly __wbg_get_missionstate_mission_time_s: (a: number) => number;
    readonly __wbg_get_missionstate_ore_kg: (a: number) => number;
    readonly __wbg_get_missionstate_ship_mass_kg: (a: number) => number;
    readonly __wbg_get_missionstate_thrust_n: (a: number) => number;
    readonly __wbg_missionstate_free: (a: number, b: number) => void;
    readonly __wbg_set_missionstate_distance_km: (a: number, b: number) => void;
    readonly __wbg_set_missionstate_exhaust_velocity: (a: number, b: number) => void;
    readonly __wbg_set_missionstate_extraction_rate: (a: number, b: number) => void;
    readonly __wbg_set_missionstate_fuel_kg: (a: number, b: number) => void;
    readonly __wbg_set_missionstate_mission_time_s: (a: number, b: number) => void;
    readonly __wbg_set_missionstate_ore_kg: (a: number, b: number) => void;
    readonly __wbg_set_missionstate_ship_mass_kg: (a: number, b: number) => void;
    readonly __wbg_set_missionstate_thrust_n: (a: number, b: number) => void;
    readonly missionstate_delta_v: (a: number) => number;
    readonly missionstate_fuel_for_delta_v: (a: number, b: number) => number;
    readonly missionstate_mission_score: (a: number) => number;
    readonly missionstate_new: (a: number, b: number, c: number) => number;
    readonly missionstate_tick: (a: number, b: number) => void;
    readonly missionstate_time_to_capacity: (a: number, b: number) => number;
    readonly missionstate_transfer_delta_v: (a: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
