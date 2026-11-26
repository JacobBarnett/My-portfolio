//! Pure mission physics. No IO, no clocks, no randomness, no JSON.
//!
//! Every function here is deterministic and unit tested. The agent never calls
//! these directly, it calls the JSON tools in `super::api`, which are thin
//! wrappers over this module.

/// Propellant for one burn, from the Tsiolkovsky rocket equation.
///
/// `final_mass_tons` is everything still flying when the burn ends, which must
/// include any propellant reserved for later burns. The original
/// `MissionState::fuel_for_delta_v` used the ship's dry mass and so ignored the
/// cargo, which is exactly backwards for a mining mission: the return leg is
/// the expensive one because the ore is aboard.
pub fn propellant_for_burn(final_mass_tons: f64, delta_v_m_s: f64, exhaust_velocity_m_s: f64) -> f64 {
    if exhaust_velocity_m_s <= 0.0 {
        return f64::INFINITY;
    }
    let ratio = (delta_v_m_s / exhaust_velocity_m_s).exp();
    final_mass_tons * (ratio - 1.0)
}

/// Propellant for a round trip that leaves empty and comes home loaded.
///
/// Worked backwards from the end of the mission, because the propellant for the
/// return burn has to be carried through the outbound burn and therefore costs
/// propellant of its own.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RoundTrip {
    pub outbound_tons: f64,
    pub return_tons: f64,
    pub total_tons: f64,
    pub wet_mass_at_launch_tons: f64,
}

pub fn round_trip_propellant(
    dry_mass_tons: f64,
    cargo_tons: f64,
    delta_v_per_leg_m_s: f64,
    exhaust_velocity_m_s: f64,
) -> RoundTrip {
    let mass_home = dry_mass_tons + cargo_tons;
    let return_tons = propellant_for_burn(mass_home, delta_v_per_leg_m_s, exhaust_velocity_m_s);
    // Outbound flies with no cargo but must carry the return propellant.
    let mass_after_outbound = dry_mass_tons + return_tons;
    let outbound_tons =
        propellant_for_burn(mass_after_outbound, delta_v_per_leg_m_s, exhaust_velocity_m_s);
    let total_tons = outbound_tons + return_tons;
    RoundTrip {
        outbound_tons,
        return_tons,
        total_tons,
        wet_mass_at_launch_tons: dry_mass_tons + total_tons,
    }
}

/// Days of continuous extraction to reach a tonnage target.
pub fn mining_days(target_tons: f64, extraction_rate_kg_s: f64) -> f64 {
    if extraction_rate_kg_s <= 0.0 {
        return f64::INFINITY;
    }
    let tons_per_day = extraction_rate_kg_s * 86_400.0 / 1000.0;
    target_tons / tons_per_day
}

/// Total mission length in days.
///
/// `round_trip_days` already contains `included_stay_days` of surface time from
/// the NHATS query that built the dataset, so only mining beyond that extends
/// the mission. The transit part is stretched by the ship's time multiplier,
/// which is how a low thrust electric stage pays for its efficiency.
pub fn mission_days(
    round_trip_days: f64,
    included_stay_days: f64,
    mining_days: f64,
    transfer_time_multiplier: f64,
) -> f64 {
    let transit = (round_trip_days - included_stay_days).max(0.0) * transfer_time_multiplier;
    let stay = mining_days.max(included_stay_days);
    transit + stay
}

/// Value of one ton of ore, given mass fractions and prices per ton.
pub fn ore_value_usd_per_ton(
    water_fraction: f64,
    iron_fraction: f64,
    nickel_fraction: f64,
    cobalt_fraction: f64,
    pgm_ppm: f64,
    water_usd: f64,
    iron_usd: f64,
    nickel_usd: f64,
    cobalt_usd: f64,
    pgm_usd: f64,
) -> f64 {
    water_fraction * water_usd
        + iron_fraction * iron_usd
        + nickel_fraction * nickel_usd
        + cobalt_fraction * cobalt_usd
        + (pgm_ppm / 1_000_000.0) * pgm_usd
}

/// Mass of a sphere of the given diameter and bulk density, in tons.
pub fn object_mass_tons(diameter_m: f64, density_t_per_m3: f64) -> f64 {
    let r = diameter_m / 2.0;
    (4.0 / 3.0) * std::f64::consts::PI * r * r * r * density_t_per_m3
}

#[cfg(test)]
mod tests {
    use super::*;

    const VE_CHEM: f64 = 3400.0;
    const VE_ION: f64 = 30000.0;

    #[test]
    fn heavier_payload_needs_more_propellant() {
        let light = round_trip_propellant(18.0, 100.0, 3497.5, VE_ION);
        let heavy = round_trip_propellant(18.0, 500.0, 3497.5, VE_ION);
        assert!(
            heavy.total_tons > light.total_tons,
            "500 t haul used {} t, 100 t haul used {} t",
            heavy.total_tons,
            light.total_tons
        );
    }

    #[test]
    fn return_leg_costs_more_than_outbound() {
        // The ore is aboard on the way home, so that burn is the expensive one.
        let rt = round_trip_propellant(18.0, 500.0, 3497.5, VE_ION);
        assert!(rt.return_tons > rt.outbound_tons);
    }

    #[test]
    fn higher_exhaust_velocity_needs_less_propellant() {
        let chem = round_trip_propellant(28.0, 500.0, 3497.5, VE_CHEM);
        let ion = round_trip_propellant(18.0, 500.0, 3497.5, VE_ION);
        assert!(chem.total_tons > 10.0 * ion.total_tons);
    }

    #[test]
    fn propellant_mass_balance_closes() {
        let rt = round_trip_propellant(18.0, 500.0, 3497.5, VE_ION);
        assert!((rt.wet_mass_at_launch_tons - (18.0 + rt.total_tons)).abs() < 1e-9);
        assert!((rt.total_tons - (rt.outbound_tons + rt.return_tons)).abs() < 1e-9);
    }

    #[test]
    fn zero_delta_v_needs_no_propellant() {
        let rt = round_trip_propellant(18.0, 500.0, 0.0, VE_ION);
        assert_eq!(rt.total_tons, 0.0);
    }

    #[test]
    fn zero_exhaust_velocity_is_infinite_not_a_panic() {
        assert!(propellant_for_burn(100.0, 3000.0, 0.0).is_infinite());
    }

    #[test]
    fn rocket_equation_matches_hand_calculation() {
        // dv equal to the exhaust velocity means a mass ratio of e.
        let p = propellant_for_burn(100.0, 3400.0, 3400.0);
        assert!((p - 100.0 * (std::f64::consts::E - 1.0)).abs() < 1e-6);
    }

    #[test]
    fn mining_days_scales_with_tonnage() {
        // 0.8 kg/s is 69.12 t per day.
        let d = mining_days(500.0, 0.8);
        assert!((d - 500.0 / 69.12).abs() < 1e-9, "got {d}");
        assert!((mining_days(1000.0, 0.8) - 2.0 * d).abs() < 1e-9);
    }

    #[test]
    fn zero_extraction_rate_is_infinite_not_a_panic() {
        assert!(mining_days(500.0, 0.0).is_infinite());
    }

    #[test]
    fn short_mining_does_not_extend_the_mission() {
        // 7.2 days of mining fits inside the 8 day stay already in the data.
        let d = mission_days(362.0, 8.0, 7.2, 1.0);
        assert!((d - 362.0).abs() < 1e-9, "got {d}");
    }

    #[test]
    fn long_mining_extends_the_mission() {
        let d = mission_days(362.0, 8.0, 40.0, 1.0);
        assert!((d - (354.0 + 40.0)).abs() < 1e-9, "got {d}");
    }

    #[test]
    fn time_multiplier_stretches_transit_but_not_the_stay() {
        let d = mission_days(362.0, 8.0, 7.2, 1.5);
        assert!((d - (354.0 * 1.5 + 8.0)).abs() < 1e-9, "got {d}");
    }

    #[test]
    fn water_dominates_carbonaceous_ore_value() {
        let carbonaceous = ore_value_usd_per_ton(
            0.10, 0.20, 0.013, 0.001, 3.0, 2_700_000.0, 120.0, 16_000.0, 33_000.0, 32_000_000.0,
        );
        let stony = ore_value_usd_per_ton(
            0.0, 0.15, 0.014, 0.001, 5.0, 2_700_000.0, 120.0, 16_000.0, 33_000.0, 32_000_000.0,
        );
        assert!(carbonaceous > 100.0 * stony, "{carbonaceous} vs {stony}");
    }

    #[test]
    fn ore_value_is_zero_for_worthless_rock() {
        let v = ore_value_usd_per_ton(
            0.0, 0.0, 0.0, 0.0, 0.0, 2_700_000.0, 120.0, 16_000.0, 33_000.0, 32_000_000.0,
        );
        assert_eq!(v, 0.0);
    }

    #[test]
    fn object_mass_is_cubic_in_diameter() {
        let small = object_mass_tons(100.0, 2.0);
        let big = object_mass_tons(200.0, 2.0);
        assert!((big / small - 8.0).abs() < 1e-9);
    }
}
