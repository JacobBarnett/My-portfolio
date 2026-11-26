// Builds mining-physics/data/asteroids.json from live JPL data.
//
// Delta v comes from NHATS, which publishes real round trip mission delta v per
// object from actual trajectory solutions. Physical parameters come from SBDB.
// Nothing here is estimated except composition, and that carries a source field
// saying how it was derived. Run with: node scripts/fetch-asteroids.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const NHATS = "https://ssd-api.jpl.nasa.gov/nhats.api?dv=12&dur=450&stay=8";
const SBDB = (s) =>
  `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(s)}&phys-par=1`;
const TARGET_COUNT = 50;

// Objects worth keeping whatever the ranking says, because the simulator
// already names them or because people recognise them.
const ALWAYS = ["101955", "6178", "433", "2011 UW158", "162173", "25143", "65803"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === tries) throw e;
      await sleep(600 * i);
    }
  }
}

// Spectral taxonomy to bulk composition. Mass fractions, and platinum group
// metals in parts per million. Sources are in docs/physics-notes.md.
const BY_CLASS = {
  M: { water: 0.0, iron: 0.891, nickel: 0.08, cobalt: 0.005, pgm_ppm: 30 },
  X: { water: 0.0, iron: 0.6, nickel: 0.05, cobalt: 0.003, pgm_ppm: 20 },
  E: { water: 0.0, iron: 0.1, nickel: 0.005, cobalt: 0.0, pgm_ppm: 5 },
  S: { water: 0.0, iron: 0.15, nickel: 0.014, cobalt: 0.001, pgm_ppm: 5 },
  C: { water: 0.1, iron: 0.2, nickel: 0.013, cobalt: 0.001, pgm_ppm: 3 },
  B: { water: 0.12, iron: 0.2, nickel: 0.013, cobalt: 0.001, pgm_ppm: 3 },
  D: { water: 0.08, iron: 0.05, nickel: 0.002, cobalt: 0.0, pgm_ppm: 1 },
};

// Albedo splits carbonaceous from stony and metallic reliably enough to be a
// documented inference. It is never presented as a measurement.
function classFromAlbedo(albedo) {
  if (albedo == null) return null;
  if (albedo < 0.1) return "C";
  if (albedo < 0.3) return "S";
  return "M";
}

function pick(all) {
  const usable = all.filter((a) => a.delta_v_km_s != null && a.max_size_m != null);
  const forced = usable.filter((a) => ALWAYS.some((d) => a.des === d || a.des.includes(d)));
  const rest = usable.filter((a) => !forced.includes(a));
  // Spread across delta v so the agent has both easy and expensive targets,
  // preferring bigger objects inside each band.
  const bands = [[0, 4.5], [4.5, 5.5], [5.5, 6.5], [6.5, 8], [8, 99]];
  const perBand = Math.ceil((TARGET_COUNT - forced.length) / bands.length);
  const out = [...forced];
  for (const [lo, hi] of bands) {
    const inBand = rest
      .filter((a) => a.delta_v_km_s >= lo && a.delta_v_km_s < hi)
      .sort((a, b) => b.max_size_m - a.max_size_m);
    out.push(...inBand.slice(0, perBand));
  }
  return out.slice(0, TARGET_COUNT);
}

const nhats = await getJson(NHATS);
console.log(`NHATS returned ${nhats.count} objects`);

const candidates = (nhats.data ?? []).map((r) => ({
  id: String(r.des).replace(/\s+/g, "-").toLowerCase(),
  des: String(r.des),
  name: (r.fullname ?? r.des).trim(),
  delta_v_km_s: r.min_dv?.dv != null ? Number(r.min_dv.dv) : null,
  round_trip_days: r.min_dv?.dur != null ? Number(r.min_dv.dur) : null,
  min_size_m: r.min_size != null ? Number(r.min_size) : null,
  max_size_m: r.max_size != null ? Number(r.max_size) : null,
  h_mag: r.h != null ? Number(r.h) : null,
  orbit_condition_code: r.occ != null ? String(r.occ) : null,
}));

const chosen = pick(candidates);
console.log(`selected ${chosen.length}, enriching from SBDB`);

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

let enriched = 0;
for (const a of chosen) {
  try {
    const d = await getJson(SBDB(a.des));
    const phys = {};
    for (const p of d.phys_par ?? []) phys[p.name] = p.value;
    a.fullname = d.object?.fullname ?? a.name;
    a.diameter_km = num(phys.diameter);
    a.albedo = num(phys.albedo);
    a.density_g_cm3 = num(phys.density);
    a.rotation_period_h = num(phys.rot_per);
    a.spectral_class = phys.spec_T ?? phys.spec_B ?? null;
    enriched++;
  } catch (e) {
    console.warn(`  SBDB failed for ${a.des}: ${e.message}`);
    a.diameter_km = a.albedo = a.density_g_cm3 = a.rotation_period_h = null;
    a.spectral_class = null;
  }
  await sleep(120);
}
console.log(`enriched ${enriched}/${chosen.length}`);

for (const a of chosen) {
  const taxon = a.spectral_class ? a.spectral_class[0].toUpperCase() : null;
  if (taxon && BY_CLASS[taxon]) {
    a.composition = BY_CLASS[taxon];
    a.composition_class = taxon;
    a.composition_source = "spectral_taxonomy";
  } else {
    const inferred = classFromAlbedo(a.albedo);
    if (inferred) {
      a.composition = BY_CLASS[inferred];
      a.composition_class = inferred;
      a.composition_source = "albedo_inference";
    } else {
      a.composition = BY_CLASS.S;
      a.composition_class = "S";
      a.composition_source = "unknown_assumed_stony";
    }
  }
  // Diameter: measured where SBDB has it, otherwise the NHATS size range.
  if (a.diameter_km != null) {
    a.diameter_m = Math.round(a.diameter_km * 1000);
    a.diameter_source = "sbdb_measured";
  } else if (a.min_size_m != null && a.max_size_m != null) {
    a.diameter_m = Math.round((a.min_size_m + a.max_size_m) / 2);
    a.diameter_source = "nhats_size_range_midpoint";
  } else {
    a.diameter_m = null;
    a.diameter_source = "unknown";
  }
}

const doc = {
  generated_at: new Date().toISOString().slice(0, 10),
  source: {
    delta_v_and_duration: "JPL NHATS API, dv<=12 km/s, dur<=450 d, stay>=8 d",
    physical_parameters: "JPL SBDB API, phys-par=1",
    composition: "inferred, see composition_source on each object",
  },
  count: chosen.length,
  asteroids: chosen.sort((a, b) => a.delta_v_km_s - b.delta_v_km_s),
};

mkdirSync(new URL("../mining-physics/data/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../mining-physics/data/asteroids.json", import.meta.url),
  JSON.stringify(doc, null, 1) + "\n",
);

const bySource = {};
for (const a of chosen) bySource[a.composition_source] = (bySource[a.composition_source] ?? 0) + 1;
console.log("composition sources:", bySource);
console.log("delta v range:", chosen[0].delta_v_km_s, "to", chosen[chosen.length - 1].delta_v_km_s);
console.log(`wrote mining-physics/data/asteroids.json (${chosen.length} objects)`);
