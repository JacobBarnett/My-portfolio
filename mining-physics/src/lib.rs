use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct MissionState {
    pub fuel_kg: f64,
    pub ore_kg: f64,
    pub distance_km: f64,
    pub ship_mass_kg: f64,
    pub exhaust_velocity: f64,
    pub extraction_rate: f64,
    pub mission_time_s: f64,
    pub thrust_n: f64,
}

#[wasm_bindgen]
impl MissionState {
    #[wasm_bindgen(constructor)]
    pub fn new(fuel_kg: f64, ship_mass_kg: f64, distance_km: f64) -> MissionState {
        MissionState {
            fuel_kg,
            ore_kg: 0.0,
            distance_km,
            ship_mass_kg,
            exhaust_velocity: 3200.0, // m/s, typical ion thruster
            extraction_rate: 0.8,     // kg/s
            mission_time_s: 0.0,
            thrust_n: 450.0,          // Newtons
        }
    }

    /// Tsiolkovsky rocket equation — delta-v budget
    #[wasm_bindgen]
    pub fn delta_v(&self) -> f64 {
        let mass_ratio = (self.ship_mass_kg + self.fuel_kg) / self.ship_mass_kg;
        self.exhaust_velocity * mass_ratio.ln()
    }

    /// Fuel burn for a given delta-v maneuver
    #[wasm_bindgen]
    pub fn fuel_for_delta_v(&self, dv: f64) -> f64 {
        let exp = (dv / self.exhaust_velocity).exp();
        self.ship_mass_kg * (exp - 1.0)
    }

    /// Hohmann transfer delta-v to reach asteroid (simplified)
    #[wasm_bindgen]
    pub fn transfer_delta_v(&self) -> f64 {
        let mu = 3.986e14_f64; // Earth gravitational parameter
        let r1 = 6.731e6_f64;  // LEO radius (m)
        let r2 = self.distance_km * 1000.0 + 6.371e6;
        let dv1 = (mu / r1).sqrt() * ((2.0 * r2 / (r1 + r2)).sqrt() - 1.0);
        let dv2 = (mu / r2).sqrt() * (1.0 - (2.0 * r1 / (r1 + r2)).sqrt());
        dv1.abs() + dv2.abs()
    }

    /// Simulate one tick of mining (dt = seconds)
    #[wasm_bindgen]
    pub fn tick(&mut self, dt: f64) {
        if self.fuel_kg > 0.0 {
            let burn = (self.thrust_n / (self.ship_mass_kg * 1000.0)) * dt;
            self.fuel_kg = (self.fuel_kg - burn).max(0.0);
        }
        self.ore_kg += self.extraction_rate * dt;
        self.mission_time_s += dt;
    }

    /// Mining yield score 0–100
    #[wasm_bindgen]
    pub fn mission_score(&self) -> f64 {
        let ore_score = (self.ore_kg / 1000.0 * 40.0).min(40.0);
        let fuel_score = (self.fuel_kg / 500.0 * 30.0).min(30.0);
        let dv_score = if self.delta_v() > self.transfer_delta_v() { 30.0 } else { 0.0 };
        ore_score + fuel_score + dv_score
    }

    /// Estimated time to fill ore capacity (seconds)
    #[wasm_bindgen]
    pub fn time_to_capacity(&self, capacity_kg: f64) -> f64 {
        let remaining = capacity_kg - self.ore_kg;
        if remaining <= 0.0 { 0.0 } else { remaining / self.extraction_rate }
    }
}