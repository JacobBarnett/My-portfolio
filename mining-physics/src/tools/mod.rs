//! The tool layer.
//!
//! One entry point, `call_tool(name, input_json)`, so the browser needs a single
//! generic dispatcher rather than a binding per tool. Everything returns a JSON
//! string, including failures, because a caller is supposed to read an error and
//! show it rather than catch an exception.

pub mod api;
pub mod data;
pub mod physics;

use serde_json::json;

/// Every tool the agent can call, in the order they are usually needed.
pub const TOOL_NAMES: [&str; 11] = [
    "get_assumptions",
    "list_ships",
    "ship_envelope",
    "search_asteroids",
    "get_asteroid_details",
    "calculate_transfer",
    "estimate_mining",
    "estimate_profit",
    "check_ship",
    "compare_candidates",
    "simulate_mission",
];

/// Dispatch by name. An unknown name is an error value, not a panic.
pub fn call(name: &str, input_json: &str) -> String {
    let out = match name {
        "get_assumptions" => api::get_assumptions(input_json),
        "list_ships" => api::list_ships(input_json),
        "ship_envelope" => api::ship_envelope(input_json),
        "search_asteroids" => api::search_asteroids(input_json),
        "get_asteroid_details" => api::get_asteroid_details(input_json),
        "calculate_transfer" => api::calculate_transfer(input_json),
        "estimate_mining" => api::estimate_mining(input_json),
        "estimate_profit" => api::estimate_profit(input_json),
        "check_ship" => api::check_ship(input_json),
        "compare_candidates" => api::compare_candidates(input_json),
        "simulate_mission" => api::simulate_mission(input_json),
        other => json!({
            "error": "unknown_tool",
            "requested": other,
            "available": TOOL_NAMES,
            "hint": "Call one of the listed tools."
        }),
    };
    out.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn call_json(name: &str, input: &str) -> Value {
        serde_json::from_str(&call(name, input)).expect("every tool returns valid JSON")
    }

    #[test]
    fn every_tool_returns_valid_json_for_empty_input() {
        for name in TOOL_NAMES {
            let v = call_json(name, "");
            assert!(v.is_object(), "{name} did not return an object");
        }
    }

    #[test]
    fn every_tool_returns_an_error_object_for_junk_input() {
        for name in TOOL_NAMES {
            let v = call_json(name, "{not json");
            if name == "get_assumptions" || name == "list_ships" {
                continue; // these take no input
            }
            assert_eq!(v["error"], "invalid_json", "{name} accepted junk");
        }
    }

    #[test]
    fn unknown_tool_is_an_error_value() {
        let v = call_json("launch_the_missiles", "{}");
        assert_eq!(v["error"], "unknown_tool");
        assert!(v["available"].is_array());
    }

    #[test]
    fn search_filters_by_delta_v() {
        let v = call_json("search_asteroids", r#"{"max_delta_v_km_s":5.0,"limit":50}"#);
        let rows = v["asteroids"].as_array().unwrap();
        assert!(!rows.is_empty());
        for r in rows {
            assert!(r["delta_v_km_s"].as_f64().unwrap() <= 5.0);
        }
    }

    #[test]
    fn search_for_water_returns_only_water_bearing_objects() {
        let v = call_json("search_asteroids", r#"{"composition":"water","limit":50}"#);
        let rows = v["asteroids"].as_array().unwrap();
        assert!(!rows.is_empty(), "no water bearing objects in the dataset");
        for r in rows {
            assert!(r["water_fraction"].as_f64().unwrap() > 0.05);
        }
    }

    #[test]
    fn search_results_are_sorted_by_delta_v() {
        let v = call_json("search_asteroids", r#"{"limit":50}"#);
        let rows = v["asteroids"].as_array().unwrap();
        let dvs: Vec<f64> = rows.iter().map(|r| r["delta_v_km_s"].as_f64().unwrap()).collect();
        let mut sorted = dvs.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        assert_eq!(dvs, sorted);
    }

    #[test]
    fn details_for_bennu_report_published_values() {
        let v = call_json("get_asteroid_details", r#"{"asteroid_id":"101955"}"#);
        assert_eq!(v["composition_source"], "spectral_taxonomy");
        assert!(v["delta_v_km_s"].as_f64().unwrap() > 0.0);
        assert!(v["estimated_mass_tons"].as_f64().unwrap() > 0.0);
    }

    #[test]
    fn unknown_ids_are_typed_errors_with_a_hint() {
        let v = call_json("get_asteroid_details", r#"{"asteroid_id":"deep-space-nine"}"#);
        assert_eq!(v["error"], "unknown_asteroid");
        assert!(v["hint"].is_string());

        let v = call_json(
            "calculate_transfer",
            r#"{"asteroid_id":"101955","ship_id":"millennium-falcon","payload_tons":10}"#,
        );
        assert_eq!(v["error"], "unknown_ship");
        assert!(v["available"].is_array());
    }

    #[test]
    fn the_hall_tug_cannot_bring_home_five_hundred_tons() {
        // The whole point of having three haulers. The hold is big enough and
        // the tank is not, because the return leg carries the ore.
        let v = call_json(
            "calculate_transfer",
            r#"{"asteroid_id":"101955","ship_id":"hall-tug","payload_tons":500}"#,
        );
        assert_eq!(v["error"], "insufficient_propellant");
        assert!(v["needed_tons"].as_f64().unwrap() > v["available_tons"].as_f64().unwrap());
        assert!(v["hint"].as_str().unwrap().contains("exhaust velocity"));
    }

    #[test]
    fn the_ion_stage_can() {
        let v = call_json(
            "calculate_transfer",
            r#"{"asteroid_id":"101955","ship_id":"ion-freighter","payload_tons":500}"#,
        );
        assert_eq!(v["feasible"], true);
        assert!(v["propellant_tons"].as_f64().unwrap() < 120.0);
        assert!(v["propellant_return_tons"].as_f64().unwrap() > v["propellant_outbound_tons"].as_f64().unwrap());
    }

    #[test]
    fn an_absurd_tonnage_is_a_cargo_error_not_a_panic() {
        let v = call_json(
            "estimate_mining",
            r#"{"asteroid_id":"101955","ship_id":"ion-freighter","target_tons":10000}"#,
        );
        assert_eq!(v["error"], "cargo_capacity_exceeded");
        assert_eq!(v["capacity_tons"], 1200.0);
    }

    #[test]
    fn negative_and_zero_tonnage_are_rejected() {
        for bad in ["-5", "0"] {
            let input = format!(
                r#"{{"asteroid_id":"101955","ship_id":"ion-freighter","target_tons":{bad}}}"#
            );
            let v = call_json("estimate_mining", &input);
            assert_eq!(v["error"], "invalid_value", "accepted target_tons {bad}");
        }
    }

    #[test]
    fn profit_goes_negative_when_the_ore_is_worthless() {
        // A stony object has no water, and water is what pays for the mission.
        let stony = data::asteroids()
            .into_iter()
            .find(|a| a.composition_class == "S")
            .expect("a stony object");
        let input = format!(
            r#"{{"asteroid_id":"{}","ship_id":"ion-freighter","tons":500}}"#,
            stony.id
        );
        let v = call_json("estimate_profit", &input);
        assert_eq!(v["profitable"], false);
        assert!(v["profit_usd"].as_f64().unwrap() < 0.0);
    }

    #[test]
    fn profit_is_positive_for_a_water_bearing_target() {
        let v = call_json(
            "estimate_profit",
            r#"{"asteroid_id":"101955","ship_id":"ion-freighter","tons":500}"#,
        );
        assert_eq!(v["profitable"], true);
        assert!(v["revenue_usd"].as_f64().unwrap() > v["cost_usd"].as_f64().unwrap());
    }

    #[test]
    fn revenue_and_cost_breakdowns_sum_to_their_totals() {
        let v = call_json(
            "estimate_profit",
            r#"{"asteroid_id":"101955","ship_id":"ion-freighter","tons":500}"#,
        );
        let rev: f64 = v["revenue_breakdown_usd"]
            .as_object()
            .unwrap()
            .values()
            .map(|x| x.as_f64().unwrap())
            .sum();
        let cost: f64 = v["cost_breakdown_usd"]
            .as_object()
            .unwrap()
            .values()
            .map(|x| x.as_f64().unwrap())
            .sum();
        assert!((rev - v["revenue_usd"].as_f64().unwrap()).abs() < 2.0, "revenue {rev}");
        assert!((cost - v["cost_usd"].as_f64().unwrap()).abs() < 2.0, "cost {cost}");
    }

    #[test]
    fn check_ship_names_the_binding_constraint() {
        let v = call_json(
            "check_ship",
            r#"{"asteroid_id":"101955","ship_id":"methalox-shuttle","target_tons":500}"#,
        );
        assert_eq!(v["feasible"], false);
        assert_eq!(v["binding_constraint"], "cargo_capacity_tons");

        let v = call_json(
            "check_ship",
            r#"{"asteroid_id":"101955","ship_id":"hall-tug","target_tons":500}"#,
        );
        assert_eq!(v["feasible"], false);
        assert_eq!(v["binding_constraint"], "propellant_capacity_tons");

        let v = call_json(
            "check_ship",
            r#"{"asteroid_id":"101955","ship_id":"ion-freighter","target_tons":500}"#,
        );
        assert_eq!(v["feasible"], true);
        assert_eq!(v["binding_constraint"], "none");
    }

    #[test]
    fn compare_candidates_agrees_with_the_single_asteroid_tools() {
        let cmp = call_json(
            "compare_candidates",
            r#"{"asteroid_ids":["101955","162173"],"ship_id":"ion-freighter","target_tons":500}"#,
        );
        let rows = cmp["candidates"].as_array().unwrap();
        assert_eq!(rows.len(), 2);
        for row in rows {
            let id = row["asteroid_id"].as_str().unwrap();
            let single = call_json(
                "estimate_profit",
                &format!(r#"{{"asteroid_id":"{id}","ship_id":"ion-freighter","tons":500}}"#),
            );
            assert_eq!(row["profit_usd"], single["profit_usd"], "{id} disagreed");
            assert_eq!(row["revenue_usd"], single["revenue_usd"], "{id} disagreed");
        }
        assert!(cmp["best_by_profit"].is_string());
    }

    #[test]
    fn compare_candidates_reports_bad_ids_per_row_without_failing_the_call() {
        let v = call_json(
            "compare_candidates",
            r#"{"asteroid_ids":["101955","not-a-rock"],"ship_id":"ion-freighter","target_tons":500}"#,
        );
        let rows = v["candidates"].as_array().unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[1]["error"], "unknown_asteroid");
        assert!(v["best_by_profit"].is_string());
    }

    #[test]
    fn simulated_timeline_durations_sum_to_the_mission_length() {
        let v = call_json(
            "simulate_mission",
            r#"{"asteroid_id":"101955","ship_id":"ion-freighter","tons":500}"#,
        );
        let frames = v["timeline"].as_array().unwrap();
        let total: f64 = frames
            .iter()
            .map(|f| f["duration_days"].as_f64().unwrap())
            .sum();
        let mission = v["totals"]["mission_days"].as_f64().unwrap();
        assert!((total - mission).abs() < 0.05, "{total} vs {mission}");
    }

    #[test]
    fn simulated_totals_match_the_planned_totals() {
        // Step 4 shows planned against simulated and claims they agree. They
        // agree because both come from the same function.
        let sim = call_json(
            "simulate_mission",
            r#"{"asteroid_id":"101955","ship_id":"ion-freighter","tons":500}"#,
        );
        let profit = call_json(
            "estimate_profit",
            r#"{"asteroid_id":"101955","ship_id":"ion-freighter","tons":500}"#,
        );
        assert_eq!(sim["totals"]["profit_usd"], profit["profit_usd"]);
        assert_eq!(sim["totals"]["revenue_usd"], profit["revenue_usd"]);
        assert_eq!(sim["totals"]["mission_days"], profit["mission_days"]);
    }

    #[test]
    fn the_timeline_phases_are_the_ones_the_simulator_already_knows() {
        let v = call_json(
            "simulate_mission",
            r#"{"asteroid_id":"101955","ship_id":"ion-freighter","tons":500}"#,
        );
        let phases: Vec<&str> = v["timeline"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| f["phase"].as_str().unwrap())
            .collect();
        assert_eq!(
            phases,
            vec![
                "STANDBY",
                "TRANSIT",
                "APPROACH",
                "ANCHORING",
                "DRILLING",
                "EXTRACTING",
                "RETURNING",
                "COMPLETE"
            ]
        );
    }

    #[test]
    fn cargo_fills_up_and_propellant_drains_over_the_timeline() {
        let v = call_json(
            "simulate_mission",
            r#"{"asteroid_id":"101955","ship_id":"ion-freighter","tons":500}"#,
        );
        let frames = v["timeline"].as_array().unwrap();
        let cargo: Vec<f64> = frames.iter().map(|f| f["cargo_tons"].as_f64().unwrap()).collect();
        let fuel: Vec<f64> = frames
            .iter()
            .map(|f| f["propellant_tons_remaining"].as_f64().unwrap())
            .collect();
        assert!(cargo.windows(2).all(|w| w[1] >= w[0]), "cargo went down: {cargo:?}");
        assert!(fuel.windows(2).all(|w| w[1] <= w[0]), "propellant went up: {fuel:?}");
        assert_eq!(*cargo.last().unwrap(), 500.0);
        assert_eq!(*fuel.last().unwrap(), 0.0);
    }

    #[test]
    fn assumptions_expose_every_price_the_profit_model_uses() {
        let v = call_json("get_assumptions", "");
        let prices = &v["commodity_prices_usd_per_ton"];
        for key in ["water_in_orbit", "iron", "nickel", "cobalt", "platinum_group_metals"] {
            assert!(prices[key]["value"].is_number(), "{key} missing");
            assert!(prices[key]["source"].is_string(), "{key} has no source");
        }
    }

    #[test]
    fn the_catalogue_separates_real_spacecraft_from_invented_ones() {
        let v = call_json("list_ships", "");
        let ships = v["ships"].as_array().unwrap();
        assert_eq!(ships.len(), 7);

        for s in ships {
            let tier = s["tier"].as_str().expect("every ship states its tier");
            assert!(
                ["flown", "in_development", "speculative"].contains(&tier),
                "unknown tier {tier}"
            );
            assert!(s["model"].is_string(), "every ship names a 3D model");
            assert!(s["sources"].is_object(), "every ship cites its figures");
            if tier == "speculative" {
                assert!(
                    s["basis"].as_str().unwrap().contains("invented"),
                    "a speculative ship must say what is invented"
                );
            }
        }

        let real: Vec<_> = ships.iter().filter(|s| s["tier"] != "speculative").collect();
        assert_eq!(real.len(), 4, "OSIRIS-REx, Hayabusa2, Psyche and Vestri");
        // No flown spacecraft has ever had a hold measured in tons.
        for s in &real {
            if let Some(hold) = s["cargo_capacity_tons"].as_f64() {
                assert!(hold < 0.01, "{} claims a {hold} ton hold", s["id"]);
            }
        }
    }

    #[test]
    fn the_three_haulers_give_three_different_answers() {
        // One hold too small, one tank too small, one that works. If this ever
        // collapses into one answer the fleet has stopped being a choice.
        let hold = call_json(
            "check_ship",
            r#"{"asteroid_id":"101955","ship_id":"methalox-shuttle","target_tons":500}"#,
        );
        assert_eq!(hold["binding_constraint"], "cargo_capacity_tons");

        let tank = call_json(
            "check_ship",
            r#"{"asteroid_id":"101955","ship_id":"hall-tug","target_tons":500}"#,
        );
        assert_eq!(tank["binding_constraint"], "propellant_capacity_tons");

        let works = call_json(
            "check_ship",
            r#"{"asteroid_id":"101955","ship_id":"ion-freighter","target_tons":500}"#,
        );
        assert_eq!(works["feasible"], true);
        assert!(works["profit_usd_if_flown"].as_f64().unwrap() > 0.0);

        // The tug is not useless, it is just smaller. Lower the haul and it flies.
        let smaller = call_json(
            "check_ship",
            r#"{"asteroid_id":"101955","ship_id":"hall-tug","target_tons":300}"#,
        );
        assert_eq!(smaller["feasible"], true);
    }

    #[test]
    fn a_ship_whose_specs_are_secret_is_refused_rather_than_guessed() {
        // AstroForge has not published Vestri's propellant load, so there is no
        // honest way to plan with it. Every tool that needs specs says the same.
        for tool in ["calculate_transfer", "estimate_profit", "check_ship", "simulate_mission"] {
            let v = call_json(
                tool,
                r#"{"asteroid_id":"101955","ship_id":"vestri","payload_tons":1,"tons":1,"target_tons":1}"#,
            );
            assert_eq!(v["error"], "specs_not_published", "{tool} should refuse");
            assert_eq!(v["operator"], "AstroForge");
            let missing = v["missing"].as_array().unwrap();
            assert!(
                missing.iter().any(|m| m == "propellant_capacity_tons"),
                "{tool} should name the missing field"
            );
        }
    }

    #[test]
    fn asking_a_sample_return_probe_for_tonnage_explains_the_scale() {
        let v = call_json(
            "calculate_transfer",
            r#"{"asteroid_id":"101955","ship_id":"osiris-rex","payload_tons":500}"#,
        );
        assert_eq!(v["error"], "cargo_capacity_exceeded");
        let note = v["scale_note"].as_str().expect("a real probe needs the scale explained");
        assert!(note.contains("121.6 g"), "the record should be quoted: {note}");
        assert!(note.contains("sample return"));
    }

    #[test]
    fn a_plan_says_whether_the_ship_cost_is_in_the_total() {
        // The flag exists because Hayabusa2 has no published lifecycle cost, so
        // costing it at zero would flatter the profit. No real spacecraft can
        // complete a round trip here, so the only reachable case is a hauler,
        // where the cost is known and the flag is true.
        let known = call_json(
            "estimate_profit",
            r#"{"asteroid_id":"101955","ship_id":"ion-freighter","tons":500}"#,
        );
        assert_eq!(known["capital_cost_known"], true);
        assert!(known["cost_breakdown_usd"]["ship_amortization"].as_f64().unwrap() > 0.0);
        assert!(known["cost_is_incomplete_note"].is_null());
    }

    #[test]
    fn no_flown_spacecraft_can_bring_anything_home_in_this_catalogue() {
        // A real result, not a bug, and the reasons differ per ship, which is
        // why the envelope reports two separate counts.
        //
        // OSIRIS-REx and Hayabusa2 do not have the delta v for a dedicated
        // round trip at all: the real missions used gravity assists and years
        // of cruise that this model does not have. Psyche has the delta v and
        // no hold.
        for ship in ["osiris-rex", "hayabusa2"] {
            let env = call_json("ship_envelope", &format!(r#"{{"ship_id":"{ship}"}}"#));
            assert_eq!(env["objects_reachable_empty"], 0, "{ship}");
            assert!(env["cannot_reach_anything"].is_object(), "{ship} should explain itself");
            assert!(env["cannot_reach_anything"]["note"].as_str().unwrap().contains("km/s"));
        }

        let psyche = call_json("ship_envelope", r#"{"ship_id":"psyche"}"#);
        assert!(
            psyche["objects_reachable_empty"].as_u64().unwrap() > 0,
            "Psyche carries enough xenon for a round trip"
        );
        assert_eq!(psyche["objects_reachable_with_a_full_hold"], 0);
        assert!(psyche["no_hold_note"].as_str().unwrap().contains("no sample mechanism"));

        for ship in ["osiris-rex", "hayabusa2", "psyche"] {
            let env = call_json("ship_envelope", &format!(r#"{{"ship_id":"{ship}"}}"#));
            assert_eq!(env["objects_reachable_with_a_full_hold"], 0, "{ship}");
        }
    }

    #[test]
    fn the_envelope_reports_what_a_ship_can_do_without_needing_a_target() {
        let env = call_json("ship_envelope", r#"{"ship_id":"ion-freighter"}"#);
        assert_eq!(env["specs_published"], true);
        assert!(env["delta_v_capacity_km_s"].as_f64().unwrap() > 0.0);
        // A full hold leaves less delta v than an empty one, always.
        assert!(
            env["delta_v_capacity_full_hold_km_s"].as_f64().unwrap()
                < env["delta_v_capacity_km_s"].as_f64().unwrap()
        );
        assert!(env["objects_reachable_with_a_full_hold"].as_u64().unwrap() > 0);
        assert!(env["max_tons_from_easiest_target"].as_f64().unwrap() > 0.0);
        assert!(env["most_profitable_reachable"]["asteroid_id"].is_string());

        let osiris = call_json("ship_envelope", r#"{"ship_id":"osiris-rex"}"#);
        assert_eq!(osiris["sample_actually_returned_kg"], 0.1216);
        assert!(osiris["scale_note"].as_str().unwrap().contains("121.6 g"));
    }

    #[test]
    fn the_envelope_of_a_secret_ship_reports_what_is_known_and_no_more() {
        let env = call_json("ship_envelope", r#"{"ship_id":"vestri"}"#);
        assert_eq!(env["specs_published"], false);
        assert!(env["delta_v_capacity_km_s"].is_null());
        assert_eq!(env["objects_reachable_empty"], 0);
        assert_eq!(env["objects_reachable_with_a_full_hold"], 0);
        assert_eq!(env["operator"], "AstroForge");
    }
}
