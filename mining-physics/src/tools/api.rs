//! The JSON tool surface the agent calls. One function per tool, JSON string in
//! and JSON string out, dispatched by name from `super::call_tool`.
//!
//! Errors are returned as data, never raised, and every error says what would
//! make the mission work. The agent reads that and replans, which is the whole
//! point of the error shape.

use serde_json::{json, Value};

use super::data::{self, Asteroid, Assumptions, Ship, ShipSpecs};
use super::physics;

fn err(code: &str, extra: Value) -> Value {
    let mut out = json!({ "error": code });
    if let (Some(o), Some(e)) = (out.as_object_mut(), extra.as_object()) {
        for (k, v) in e {
            o.insert(k.clone(), v.clone());
        }
    }
    out
}

fn parse_input(input: &str) -> Result<Value, Value> {
    if input.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(input).map_err(|e| {
        err(
            "invalid_json",
            json!({ "detail": e.to_string(), "hint": "Send a JSON object, for example {\"asteroid_id\":\"101955\"}." }),
        )
    })
}

fn want_str(v: &Value, key: &str) -> Result<String, Value> {
    v.get(key)
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| {
            err(
                "missing_field",
                json!({ "field": key, "hint": format!("{key} is required and must be a string.") }),
            )
        })
}

fn want_pos_f64(v: &Value, key: &str) -> Result<f64, Value> {
    let n = v
        .get(key)
        .and_then(|x| x.as_f64())
        .ok_or_else(|| err("missing_field", json!({ "field": key, "hint": format!("{key} is required and must be a number.") })))?;
    if !(n.is_finite() && n > 0.0) {
        return Err(err(
            "invalid_value",
            json!({ "field": key, "value": n, "hint": format!("{key} must be a positive number.") }),
        ));
    }
    Ok(n)
}

fn lookup(asteroid_id: &str, ship_id: &str) -> Result<(Asteroid, Ship), Value> {
    let all = data::asteroids();
    let fleet = data::ships();
    let a = data::find_asteroid(&all, asteroid_id).ok_or_else(|| {
        err(
            "unknown_asteroid",
            json!({
                "requested": asteroid_id,
                "available_count": all.len(),
                "hint": "Call search_asteroids to get valid ids. The dataset holds only objects with real JPL trajectory data."
            }),
        )
    })?;
    let s = data::find_ship(&fleet, ship_id).ok_or_else(|| {
        err(
            "unknown_ship",
            json!({
                "requested": ship_id,
                "available": fleet.iter().map(|s| s.id.clone()).collect::<Vec<_>>(),
                "hint": "Call list_ships to see the fleet."
            }),
        )
    })?;
    Ok((a, s))
}

/// One mission costed end to end. Every tool that reports numbers builds this,
/// so the transfer, the profit and the simulated timeline can never disagree.
struct Plan {
    delta_v_km_s: f64,
    delta_v_per_leg_km_s: f64,
    prop: physics::RoundTrip,
    mining_days: f64,
    mission_days: f64,
    transit_days_each_way: f64,
    ore_value_usd_per_ton: f64,
    revenue_usd: f64,
    propellant_usd: f64,
    operations_usd: f64,
    amortization_usd: f64,
    cost_usd: f64,
    profit_usd: f64,
    cargo_ok: bool,
    propellant_ok: bool,
    capital_cost_known: bool,
}

/// Everything a mission needs, computed once so that transfer, profit and the
/// simulated timeline can never disagree.
///
/// It takes resolved `ShipSpecs` rather than the `Ship`, so a figure its
/// operator never published cannot slip through as a zero. Callers resolve the
/// specs first and report `specs_not_published` when they cannot.
fn plan(a: &Asteroid, s: &Ship, sp: &ShipSpecs, tons: f64, k: &Assumptions) -> Plan {
    let dv_leg_m_s = a.delta_v_km_s * 1000.0 * k.delta_v_split;
    let prop = physics::round_trip_propellant(
        s.dry_mass_tons,
        tons,
        dv_leg_m_s,
        sp.exhaust_velocity_m_s,
    );
    let mining_days = physics::mining_days(tons, sp.extraction_rate_kg_s);
    let mission_days = physics::mission_days(
        a.round_trip_days,
        k.included_stay_days,
        mining_days,
        s.transfer_time_multiplier,
    );
    let transit_days_each_way =
        (a.round_trip_days - k.included_stay_days).max(0.0) * s.transfer_time_multiplier / 2.0;

    let c = &a.composition;
    let ore_value_usd_per_ton = physics::ore_value_usd_per_ton(
        c.water,
        c.iron,
        c.nickel,
        c.cobalt,
        c.pgm_ppm,
        k.water_usd_per_ton,
        k.iron_usd_per_ton,
        k.nickel_usd_per_ton,
        k.cobalt_usd_per_ton,
        k.pgm_usd_per_ton,
    );
    let revenue_usd = ore_value_usd_per_ton * tons;
    let propellant_usd = prop.total_tons * k.propellant_usd_per_ton;
    let operations_usd = mission_days * k.operations_usd_per_day;
    // A ship whose cost was never published contributes nothing here, and the
    // tools that report money say so rather than implying the ship was free.
    let capital = s.capital_cost_usd.unwrap_or(0.0);
    let amortization_usd = if s.design_life_missions > 0.0 {
        capital / s.design_life_missions
    } else {
        capital
    };
    let cost_usd = propellant_usd + operations_usd + amortization_usd;

    Plan {
        delta_v_km_s: a.delta_v_km_s,
        delta_v_per_leg_km_s: a.delta_v_km_s * k.delta_v_split,
        prop,
        mining_days,
        mission_days,
        transit_days_each_way,
        ore_value_usd_per_ton,
        revenue_usd,
        propellant_usd,
        operations_usd,
        amortization_usd,
        cost_usd,
        profit_usd: revenue_usd - cost_usd,
        cargo_ok: tons <= sp.cargo_capacity_tons,
        propellant_ok: prop.total_tons.is_finite()
            && prop.total_tons <= sp.propellant_capacity_tons,
        capital_cost_known: s.capital_cost_usd.is_some(),
    }
}

fn r2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}
fn r0(x: f64) -> f64 {
    x.round()
}

/// Why a ship cannot publish enough to be planned with.
///
/// This is the honest answer for a spacecraft that is still being built: the
/// operator has not said how much propellant it carries, so there is no way to
/// work out where it can go, and inventing a figure would be worse than
/// refusing.
fn specs_error(s: &Ship, missing: &[&'static str]) -> Value {
    err(
        "specs_not_published",
        json!({
            "ship_id": s.id,
            "ship": s.name,
            "operator": s.operator,
            "tier": s.tier,
            "missing": missing,
            "status": s.status,
            "hint": format!(
                "{} has not published {}. A mission cannot be planned without them, and this engine does not fill gaps with guesses. Pick another ship to see the numbers.",
                if s.operator.is_empty() { "The operator".to_string() } else { s.operator.clone() },
                missing.join(", ")
            )
        }),
    )
}

fn feasibility_error(a: &Asteroid, s: &Ship, sp: &ShipSpecs, tons: f64, p: &Plan) -> Option<Value> {
    if !p.cargo_ok {
        // A sample return probe asked to haul ore is not a near miss, it is a
        // category error, and saying so teaches more than a ratio does.
        let scale_note = if s.is_real() && sp.cargo_capacity_tons < 1.0 {
            Some(format!(
                "{} is a sample return spacecraft, not a freighter. Its hold is {} kg. Every asteroid mission ever flown has come home with grams: the record is 121.6 g, held by OSIRIS-REx. For tonnage, pick one of the speculative haulers, which do not exist.",
                s.name,
                r2(sp.cargo_capacity_tons * 1000.0)
            ))
        } else {
            None
        };
        return Some(err(
            "cargo_capacity_exceeded",
            json!({
                "requested_tons": tons,
                "capacity_tons": sp.cargo_capacity_tons,
                "capacity_kg": r2(sp.cargo_capacity_tons * 1000.0),
                "ship_id": s.id,
                "tier": s.tier,
                "scale_note": scale_note,
                "hint": "Pick a ship with a bigger hold, call list_ships, or lower the tonnage target."
            }),
        ));
    }
    if !p.propellant_ok {
        return Some(err(
            "insufficient_propellant",
            json!({
                "needed_tons": r2(p.prop.total_tons),
                "available_tons": sp.propellant_capacity_tons,
                "ship_id": s.id,
                "asteroid_id": a.id,
                "delta_v_km_s": a.delta_v_km_s,
                "exhaust_velocity_m_s": sp.exhaust_velocity_m_s,
                "hint": "The return leg carries the ore, so propellant grows fast with tonnage and delta v. Try a lower tonnage, a closer target with a smaller delta v, or a ship with a higher exhaust velocity."
            }),
        ));
    }
    None
}

// ---------------------------------------------------------------- the tools

pub fn get_assumptions(_input: &str) -> Value {
    serde_json::from_str(data::ASSUMPTIONS_JSON).unwrap_or_else(|_| json!({}))
}

pub fn list_ships(_input: &str) -> Value {
    serde_json::from_str(data::SHIPS_JSON).unwrap_or_else(|_| json!({}))
}

fn summary(a: &Asteroid) -> Value {
    json!({
        "id": a.id,
        "des": a.des,
        "name": a.fullname,
        "delta_v_km_s": a.delta_v_km_s,
        "round_trip_days": a.round_trip_days,
        "diameter_m": a.diameter_m,
        "composition_class": a.composition_class,
        "composition_source": a.composition_source,
        "water_fraction": a.composition.water,
    })
}

pub fn search_asteroids(input: &str) -> Value {
    let v = match parse_input(input) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let max_dv = v.get("max_delta_v_km_s").and_then(|x| x.as_f64());
    let min_diam = v.get("min_diameter_m").and_then(|x| x.as_f64());
    let comp = v
        .get("composition")
        .and_then(|x| x.as_str())
        .map(|s| s.to_lowercase());
    let limit = v
        .get("limit")
        .and_then(|x| x.as_u64())
        .unwrap_or(10)
        .clamp(1, 50) as usize;

    let all = data::asteroids();
    let mut hits: Vec<&Asteroid> = all
        .iter()
        .filter(|a| max_dv.is_none_or(|m| a.delta_v_km_s <= m))
        .filter(|a| min_diam.is_none_or(|m| a.diameter_m.is_some_and(|d| d >= m)))
        .filter(|a| match comp.as_deref() {
            None => true,
            Some("water") | Some("water_bearing") | Some("carbonaceous") => {
                a.composition.water > 0.05
            }
            Some("metal") | Some("metallic") => a.composition.iron > 0.5,
            Some("stony") => a.composition_class == "S",
            Some(other) => a.composition_class.to_lowercase() == other,
        })
        .collect();
    hits.sort_by(|x, y| x.delta_v_km_s.partial_cmp(&y.delta_v_km_s).unwrap());
    let total = hits.len();
    let rows: Vec<Value> = hits.into_iter().take(limit).map(summary).collect();

    json!({
        "matched": total,
        "returned": rows.len(),
        "sorted_by": "delta_v_km_s ascending",
        "dataset_note": "Only objects with real JPL NHATS trajectory data are in here, so a famous asteroid may be absent because no published mission delta v exists for it.",
        "asteroids": rows,
    })
}

pub fn get_asteroid_details(input: &str) -> Value {
    let v = match parse_input(input) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let id = match want_str(&v, "asteroid_id").or_else(|_| want_str(&v, "id")) {
        Ok(s) => s,
        Err(e) => return e,
    };
    let all = data::asteroids();
    let Some(a) = data::find_asteroid(&all, &id) else {
        return err(
            "unknown_asteroid",
            json!({ "requested": id, "available_count": all.len(), "hint": "Call search_asteroids for valid ids." }),
        );
    };
    let k = data::assumptions();
    let mass = a
        .diameter_m
        .map(|d| physics::object_mass_tons(d, a.density_g_cm3.unwrap_or(k.ore_density_t_per_m3)));
    let c = &a.composition;
    json!({
        "id": a.id,
        "des": a.des,
        "name": a.fullname,
        "delta_v_km_s": a.delta_v_km_s,
        "delta_v_source": "JPL NHATS, total round trip mission delta v",
        "round_trip_days": a.round_trip_days,
        "diameter_m": a.diameter_m,
        "diameter_source": a.diameter_source,
        "estimated_mass_tons": mass.map(r0),
        "albedo": a.albedo,
        "density_g_cm3": a.density_g_cm3,
        "rotation_period_h": a.rotation_period_h,
        "spectral_class": a.spectral_class,
        "orbit_condition_code": a.orbit_condition_code,
        "h_mag": a.h_mag,
        "composition_class": a.composition_class,
        "composition_source": a.composition_source,
        "composition": {
            "water_fraction": c.water,
            "iron_fraction": c.iron,
            "nickel_fraction": c.nickel,
            "cobalt_fraction": c.cobalt,
            "pgm_ppm": c.pgm_ppm,
        },
        "composition_caveat": "Composition is an inference, not a measurement. Check composition_source before relying on it.",
    })
}

pub fn calculate_transfer(input: &str) -> Value {
    let v = match parse_input(input) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let aid = match want_str(&v, "asteroid_id") {
        Ok(s) => s,
        Err(e) => return e,
    };
    let sid = match want_str(&v, "ship_id") {
        Ok(s) => s,
        Err(e) => return e,
    };
    let tons = v
        .get("payload_tons")
        .and_then(|x| x.as_f64())
        .unwrap_or(0.0);
    if tons < 0.0 || !tons.is_finite() {
        return err("invalid_value", json!({ "field": "payload_tons", "value": tons, "hint": "payload_tons must be zero or more." }));
    }
    let (a, s) = match lookup(&aid, &sid) {
        Ok(x) => x,
        Err(e) => return e,
    };
    let k = data::assumptions();
    let sp = match s.specs() {
        Ok(x) => x,
        Err(missing) => return specs_error(&s, &missing),
    };
    let p = plan(&a, &s, &sp, tons, &k);
    if let Some(e) = feasibility_error(&a, &s, &sp, tons, &p) {
        return e;
    }
    json!({
        "asteroid_id": a.id,
        "ship_id": s.id,
        "payload_tons": tons,
        "delta_v_km_s": p.delta_v_km_s,
        "delta_v_per_leg_km_s": r2(p.delta_v_per_leg_km_s),
        "delta_v_source": "JPL NHATS",
        "travel_days": r2(p.transit_days_each_way),
        "mission_days": r2(p.mission_days),
        "propellant_tons": r2(p.prop.total_tons),
        "propellant_outbound_tons": r2(p.prop.outbound_tons),
        "propellant_return_tons": r2(p.prop.return_tons),
        "wet_mass_at_launch_tons": r2(p.prop.wet_mass_at_launch_tons),
        "propellant_margin_tons": r2(sp.propellant_capacity_tons - p.prop.total_tons),
        "launch_window": {
            "note": "The dataset is a trajectory catalogue, not an ephemeris, so this is the duration class of the published solution rather than a dated window.",
            "round_trip_days_published": a.round_trip_days,
        },
        "feasible": true,
    })
}

pub fn estimate_mining(input: &str) -> Value {
    let v = match parse_input(input) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let aid = match want_str(&v, "asteroid_id") {
        Ok(s) => s,
        Err(e) => return e,
    };
    let sid = match want_str(&v, "ship_id") {
        Ok(s) => s,
        Err(e) => return e,
    };
    let tons = match want_pos_f64(&v, "target_tons") {
        Ok(t) => t,
        Err(e) => return e,
    };
    let (a, s) = match lookup(&aid, &sid) {
        Ok(x) => x,
        Err(e) => return e,
    };
    let k = data::assumptions();
    let sp = match s.specs() {
        Ok(x) => x,
        Err(missing) => return specs_error(&s, &missing),
    };
    if tons > sp.cargo_capacity_tons {
        return err(
            "cargo_capacity_exceeded",
            json!({
                "requested_tons": tons,
                "capacity_tons": sp.cargo_capacity_tons,
                "capacity_kg": r2(sp.cargo_capacity_tons * 1000.0),
                "ship_id": s.id,
                "tier": s.tier,
                "hint": "Pick a ship with a bigger hold or lower the tonnage target."
            }),
        );
    }
    let days = physics::mining_days(tons, sp.extraction_rate_kg_s);
    let object_mass = a
        .diameter_m
        .map(|d| physics::object_mass_tons(d, a.density_g_cm3.unwrap_or(k.ore_density_t_per_m3)));
    json!({
        "asteroid_id": a.id,
        "ship_id": s.id,
        "yield_tons": tons,
        "mining_days": r2(days),
        "extraction_rate_tons_per_day": r2(sp.extraction_rate_kg_s * 86_400.0 / 1000.0),
        "included_stay_days": k.included_stay_days,
        "extends_mission": days > k.included_stay_days,
        "object_mass_tons": object_mass.map(r0),
        "fraction_of_object": object_mass.map(|m| tons / m),
    })
}

pub fn estimate_profit(input: &str) -> Value {
    let v = match parse_input(input) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let aid = match want_str(&v, "asteroid_id") {
        Ok(s) => s,
        Err(e) => return e,
    };
    let sid = match want_str(&v, "ship_id") {
        Ok(s) => s,
        Err(e) => return e,
    };
    let tons = match want_pos_f64(&v, "tons") {
        Ok(t) => t,
        Err(e) => return e,
    };
    let (a, s) = match lookup(&aid, &sid) {
        Ok(x) => x,
        Err(e) => return e,
    };
    let k = data::assumptions();
    let sp = match s.specs() {
        Ok(x) => x,
        Err(missing) => return specs_error(&s, &missing),
    };
    let p = plan(&a, &s, &sp, tons, &k);
    if let Some(e) = feasibility_error(&a, &s, &sp, tons, &p) {
        return e;
    }
    let c = &a.composition;
    json!({
        "asteroid_id": a.id,
        "ship_id": s.id,
        "tons": tons,
        "revenue_usd": r0(p.revenue_usd),
        "cost_usd": r0(p.cost_usd),
        "profit_usd": r0(p.profit_usd),
        "ore_value_usd_per_ton": r2(p.ore_value_usd_per_ton),
        "revenue_breakdown_usd": {
            "water": r0(c.water * k.water_usd_per_ton * tons),
            "iron": r0(c.iron * k.iron_usd_per_ton * tons),
            "nickel": r0(c.nickel * k.nickel_usd_per_ton * tons),
            "cobalt": r0(c.cobalt * k.cobalt_usd_per_ton * tons),
            "platinum_group_metals": r0((c.pgm_ppm / 1e6) * k.pgm_usd_per_ton * tons),
        },
        "cost_breakdown_usd": {
            "propellant": r0(p.propellant_usd),
            "operations": r0(p.operations_usd),
            "ship_amortization": if p.capital_cost_known { json!(r0(p.amortization_usd)) } else { Value::Null },
        },
        // Without a published cost the ship contributes nothing to the total,
        // which flatters the profit. Say so rather than let it pass.
        "capital_cost_known": p.capital_cost_known,
        "cost_is_incomplete_note": if p.capital_cost_known {
            Value::Null
        } else {
            json!(format!(
                "No lifecycle cost has been published for {}, so the ship itself is missing from this total. Treat the profit as an upper bound.",
                s.name
            ))
        },
        "mission_days": r2(p.mission_days),
        "profitable": p.profit_usd > 0.0,
        "value_caveat": "Revenue depends on the composition inference and on the water price, which is an avoided launch cost rather than a market price. Call get_assumptions for both.",
    })
}

pub fn check_ship(input: &str) -> Value {
    let v = match parse_input(input) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let aid = match want_str(&v, "asteroid_id") {
        Ok(s) => s,
        Err(e) => return e,
    };
    let sid = match want_str(&v, "ship_id") {
        Ok(s) => s,
        Err(e) => return e,
    };
    let tons = match want_pos_f64(&v, "target_tons") {
        Ok(t) => t,
        Err(e) => return e,
    };
    let (a, s) = match lookup(&aid, &sid) {
        Ok(x) => x,
        Err(e) => return e,
    };
    let k = data::assumptions();
    let sp = match s.specs() {
        Ok(x) => x,
        Err(missing) => return specs_error(&s, &missing),
    };
    let p = plan(&a, &s, &sp, tons, &k);
    let binding = if !p.cargo_ok {
        "cargo_capacity_tons"
    } else if !p.propellant_ok {
        "propellant_capacity_tons"
    } else {
        "none"
    };
    json!({
        "asteroid_id": a.id,
        "ship_id": s.id,
        "target_tons": tons,
        "feasible": p.cargo_ok && p.propellant_ok,
        "binding_constraint": binding,
        "checks": {
            "cargo": { "ok": p.cargo_ok, "needed_tons": tons, "capacity_tons": sp.cargo_capacity_tons },
            "propellant": {
                "ok": p.propellant_ok,
                "needed_tons": if p.prop.total_tons.is_finite() { json!(r2(p.prop.total_tons)) } else { json!("infinite") },
                "capacity_tons": sp.propellant_capacity_tons
            },
        },
        "profit_usd_if_flown": if p.cargo_ok && p.propellant_ok { json!(r0(p.profit_usd)) } else { Value::Null },
    })
}

/// What a ship can actually do, whether or not any mission is possible with it.
///
/// This exists because every real spacecraft in the catalogue fails every
/// round trip in the dataset, and "insufficient propellant" is a useless thing
/// to tell someone who just picked OSIRIS-REx. The honest and more interesting
/// answer is how much delta v it has, how far short that falls, and what it
/// did bring home in real life.
pub fn ship_envelope(input: &str) -> Value {
    let v = match parse_input(input) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let sid = match want_str(&v, "ship_id") {
        Ok(s) => s,
        Err(e) => return e,
    };
    let fleet = data::ships();
    let Some(s) = data::find_ship(&fleet, &sid) else {
        return err("unknown_ship", json!({
            "requested": sid,
            "available": fleet.iter().map(|x| x.id.clone()).collect::<Vec<_>>()
        }));
    };

    let k = data::assumptions();
    let all = data::asteroids();

    // Delta v in the tank, by the rocket equation, with nothing in the hold and
    // then with the hold full. These are the ship's own numbers and need no
    // target.
    let (dv_empty, dv_loaded, specs_known) = match s.specs() {
        Ok(sp) => {
            let dry = s.dry_mass_tons;
            let wet = dry + sp.propellant_capacity_tons;
            let empty = sp.exhaust_velocity_m_s * (wet / dry).ln();
            let loaded_dry = dry + sp.cargo_capacity_tons;
            let loaded = if loaded_dry > 0.0 {
                sp.exhaust_velocity_m_s
                    * ((loaded_dry + sp.propellant_capacity_tons) / loaded_dry).ln()
            } else {
                0.0
            };
            (Some(empty), Some(loaded), true)
        }
        Err(_) => (None, None, false),
    };

    // The easiest round trip in the dataset, as a yardstick.
    let easiest = all
        .iter()
        .min_by(|x, y| x.delta_v_km_s.partial_cmp(&y.delta_v_km_s).unwrap());

    // Two different questions, and conflating them is how Psyche ends up
    // looking like a freighter: it has the delta v to go and come back, and no
    // hold to put anything in.
    let mut reachable_empty = 0usize;
    let mut reachable_loaded = 0usize;
    let mut best: Option<(String, String, f64)> = None;
    let mut max_tons_easiest = 0.0;

    if let Ok(sp) = s.specs() {
        for a in &all {
            if plan(a, &s, &sp, 0.0, &k).propellant_ok {
                reachable_empty += 1;
            }
            if sp.cargo_capacity_tons > 0.0 {
                let p = plan(a, &s, &sp, sp.cargo_capacity_tons, &k);
                if p.cargo_ok && p.propellant_ok {
                    reachable_loaded += 1;
                    if best.as_ref().map(|b| p.profit_usd > b.2).unwrap_or(true) {
                        best = Some((a.id.clone(), a.fullname.clone(), p.profit_usd));
                    }
                }
            }
        }
        if let Some(a) = easiest {
            // The largest haul the tank can bring home from the easiest target.
            let mut lo = 0.0;
            let mut hi = sp.cargo_capacity_tons;
            if plan(a, &s, &sp, hi, &k).propellant_ok {
                lo = hi;
            } else {
                for _ in 0..40 {
                    let mid = (lo + hi) / 2.0;
                    if plan(a, &s, &sp, mid, &k).propellant_ok {
                        lo = mid;
                    } else {
                        hi = mid;
                    }
                }
            }
            max_tons_easiest = lo;
        }
    }

    let needed = easiest.map(|a| a.delta_v_km_s * 1000.0);
    let shortfall = match (dv_empty, needed) {
        (Some(have), Some(need)) if have < need => Some(json!({
            "delta_v_available_km_s": r2(have / 1000.0),
            "delta_v_needed_km_s": r2(need / 1000.0),
            "fraction_of_the_easiest_round_trip": r2(have / need),
            "note": format!(
                "{} carries {} km/s of delta v with an empty hold. The easiest round trip in this catalogue needs {} km/s, so it cannot make any of them.",
                s.name, r2(have / 1000.0), r2(need / 1000.0)
            )
        })),
        _ => None,
    };

    json!({
        "ship_id": s.id,
        "name": s.name,
        "tier": s.tier,
        "operator": s.operator,
        "specs_published": specs_known,
        "delta_v_capacity_km_s": dv_empty.map(|x| r2(x / 1000.0)),
        "delta_v_capacity_full_hold_km_s": dv_loaded.map(|x| r2(x / 1000.0)),
        "hold_tons": s.cargo_capacity_tons,
        "hold_kg": s.cargo_capacity_tons.map(|t| r2(t * 1000.0)),
        "sample_actually_returned_kg": s.sample_returned_kg,
        "objects_reachable_empty": reachable_empty,
        "objects_reachable_with_a_full_hold": reachable_loaded,
        "objects_in_catalogue": all.len(),
        "max_tons_from_easiest_target": r2(max_tons_easiest),
        "easiest_target": easiest.map(|a| json!({
            "asteroid_id": a.id,
            "name": a.fullname,
            "delta_v_km_s": a.delta_v_km_s
        })),
        "most_profitable_reachable": best.map(|(id, name, profit)| json!({
            "asteroid_id": id, "name": name, "profit_usd": r0(profit)
        })),
        "cannot_reach_anything": shortfall,
        // An orbiter can fly the trip and still bring nothing back.
        "no_hold_note": match s.cargo_capacity_tons {
            Some(h) if h <= 0.0 => json!(format!(
                "{} can fly a round trip in this catalogue, {} of the {} objects, but it has no sample mechanism at all, so it would come home empty.",
                s.name, reachable_empty, all.len()
            )),
            _ => Value::Null,
        },
        "scale_note": if s.is_real() {
            json!("Every asteroid spacecraft ever flown returned a sample measured in grams. The record is 121.6 g, held by OSIRIS-REx. Mining tonnage lives on the speculative haulers, which do not exist.")
        } else {
            Value::Null
        },
    })
}

pub fn compare_candidates(input: &str) -> Value {
    let v = match parse_input(input) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let sid = match want_str(&v, "ship_id") {
        Ok(s) => s,
        Err(e) => return e,
    };
    let tons = match want_pos_f64(&v, "target_tons") {
        Ok(t) => t,
        Err(e) => return e,
    };
    let Some(ids) = v.get("asteroid_ids").and_then(|x| x.as_array()) else {
        return err("missing_field", json!({ "field": "asteroid_ids", "hint": "Send an array of ids, for example [\"101955\",\"162173\"]." }));
    };
    if ids.is_empty() || ids.len() > 12 {
        return err("invalid_value", json!({ "field": "asteroid_ids", "count": ids.len(), "hint": "Send between 1 and 12 ids." }));
    }
    let fleet = data::ships();
    let Some(s) = data::find_ship(&fleet, &sid) else {
        return err("unknown_ship", json!({ "requested": sid, "available": fleet.iter().map(|x| x.id.clone()).collect::<Vec<_>>() }));
    };
    let all = data::asteroids();
    let k = data::assumptions();

    let sp = match s.specs() {
        Ok(x) => x,
        Err(missing) => return specs_error(&s, &missing),
    };

    let mut rows = Vec::new();
    for id in ids {
        let Some(id) = id.as_str() else {
            rows.push(json!({ "requested": id, "error": "invalid_value", "hint": "Each id must be a string." }));
            continue;
        };
        let Some(a) = data::find_asteroid(&all, id) else {
            rows.push(json!({ "requested": id, "error": "unknown_asteroid" }));
            continue;
        };
        let p = plan(&a, &s, &sp, tons, &k);
        let feasible = p.cargo_ok && p.propellant_ok;
        rows.push(json!({
            "asteroid_id": a.id,
            "name": a.fullname,
            "delta_v_km_s": p.delta_v_km_s,
            "mission_days": r2(p.mission_days),
            "propellant_tons": if p.prop.total_tons.is_finite() { json!(r2(p.prop.total_tons)) } else { json!("infinite") },
            "composition_class": a.composition_class,
            "composition_source": a.composition_source,
            "ore_value_usd_per_ton": r2(p.ore_value_usd_per_ton),
            "revenue_usd": r0(p.revenue_usd),
            "cost_usd": r0(p.cost_usd),
            "profit_usd": r0(p.profit_usd),
            "feasible": feasible,
            "binding_constraint": if p.cargo_ok { if p.propellant_ok { "none" } else { "propellant_capacity_tons" } } else { "cargo_capacity_tons" },
        }));
    }
    let best = rows
        .iter()
        .filter(|r| r["feasible"].as_bool().unwrap_or(false))
        .max_by(|x, y| {
            x["profit_usd"]
                .as_f64()
                .unwrap_or(f64::MIN)
                .partial_cmp(&y["profit_usd"].as_f64().unwrap_or(f64::MIN))
                .unwrap()
        })
        .and_then(|r| r["asteroid_id"].as_str())
        .map(|s| s.to_string());

    json!({
        "ship_id": s.id,
        "target_tons": tons,
        "candidates": rows,
        "best_by_profit": best,
        "note": "One call per comparison instead of one per asteroid per metric. All rows use the same engine as the single asteroid tools, so the numbers match.",
    })
}

pub fn simulate_mission(input: &str) -> Value {
    let v = match parse_input(input) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let aid = match want_str(&v, "asteroid_id") {
        Ok(s) => s,
        Err(e) => return e,
    };
    let sid = match want_str(&v, "ship_id") {
        Ok(s) => s,
        Err(e) => return e,
    };
    let tons = match want_pos_f64(&v, "tons") {
        Ok(t) => t,
        Err(e) => return e,
    };
    let (a, s) = match lookup(&aid, &sid) {
        Ok(x) => x,
        Err(e) => return e,
    };
    let k = data::assumptions();
    let sp = match s.specs() {
        Ok(x) => x,
        Err(missing) => return specs_error(&s, &missing),
    };
    let p = plan(&a, &s, &sp, tons, &k);
    if let Some(e) = feasibility_error(&a, &s, &sp, tons, &p) {
        return e;
    }

    // Phase names match the ones the simulator already uses, so the visualizer
    // can play this timeline without inventing a vocabulary of its own.
    let stay_total = (p.mission_days - 2.0 * p.transit_days_each_way).max(0.0);
    let approach = if stay_total > 2.0 { 1.0 } else { stay_total * 0.2 };
    let anchoring = if stay_total > 2.0 { 0.5 } else { stay_total * 0.1 };
    let working = (stay_total - approach - anchoring).max(0.0);
    let drilling = working * 0.2;
    let extracting = working * 0.8;

    let mut t = 0.0;
    let mut frames: Vec<Value> = Vec::new();
    let mut push = |phase: &str, dur: f64, fuel: f64, cargo: f64, note: &str, t: &mut f64| {
        frames.push(json!({
            "phase": phase,
            "start_day": r2(*t),
            "end_day": r2(*t + dur),
            "duration_days": r2(dur),
            "propellant_tons_remaining": r2(fuel),
            "cargo_tons": r2(cargo),
            "note": note,
        }));
        *t += dur;
    };

    let p_total = p.prop.total_tons;
    let p_after_out = p_total - p.prop.outbound_tons;
    push("STANDBY", 0.0, p_total, 0.0, "Departure stack fueled and holding", &mut t);
    push(
        "TRANSIT",
        p.transit_days_each_way,
        p_after_out,
        0.0,
        "Outbound leg, hold empty",
        &mut t,
    );
    push("APPROACH", approach, p_after_out, 0.0, "Matching rotation and closing", &mut t);
    push("ANCHORING", anchoring, p_after_out, 0.0, "Anchors into the surface", &mut t);
    push("DRILLING", drilling, p_after_out, tons * 0.2, "Drill head cutting", &mut t);
    push("EXTRACTING", extracting, p_after_out, tons, "Ore to the hold", &mut t);
    push("RETURNING", p.transit_days_each_way, 0.0, tons, "Return leg, loaded", &mut t);
    push("COMPLETE", 0.0, 0.0, tons, "Delivered", &mut t);

    json!({
        "asteroid_id": a.id,
        "name": a.fullname,
        "ship_id": s.id,
        "tons": tons,
        "totals": {
            "mission_days": r2(p.mission_days),
            "delta_v_km_s": p.delta_v_km_s,
            "propellant_tons": r2(p_total),
            "revenue_usd": r0(p.revenue_usd),
            "cost_usd": r0(p.cost_usd),
            "profit_usd": r0(p.profit_usd),
        },
        "timeline": frames,
        "timeline_note": "Durations sum to mission_days. Mining time can be shorter than the stay, because the published trajectory already includes a minimum stay.",
    })
}
