import { useEffect, useMemo, useState } from "react";

import { ask } from "../engine/call.mjs";

/**
 * The fleet, in two tiers.
 *
 * Four real spacecraft with published numbers and a citation behind every one,
 * and three haulers that do not exist. The badge and the sources are not
 * decoration: a visitor should never have to guess which of these is a fact.
 */
export default function ShipPicker({ shipId, onPick, disabled }) {
  const [fleet, setFleet] = useState(null);
  const [envelopes, setEnvelopes] = useState({});
  const [failed, setFailed] = useState(null);
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const list = await ask("list_ships");
      if (!live) return;
      if (list.error) {
        setFailed(list.hint ?? list.error);
        return;
      }
      setFleet(list);

      // What each ship can do, which is the interesting part and needs no
      // target selected.
      const pairs = await Promise.all(
        list.ships.map(async (s) => [s.id, await ask("ship_envelope", { ship_id: s.id })]),
      );
      if (live) setEnvelopes(Object.fromEntries(pairs));
    })();
    return () => {
      live = false;
    };
  }, []);

  const selected = useMemo(
    () => fleet?.ships?.find((s) => s.id === shipId) ?? null,
    [fleet, shipId],
  );
  const envelope = envelopes[shipId];

  if (failed) {
    return <div className="amds-ship-error">{failed}</div>;
  }
  if (!fleet) {
    return <div className="amds-ship-loading">Loading the fleet</div>;
  }

  const groups = [
    { tier: "flown", label: "Flown" },
    { tier: "in_development", label: "Being built" },
    { tier: "speculative", label: "Does not exist" },
  ];

  return (
    <div className="amds-ships">
      {groups.map(({ tier, label }) => {
        const ships = fleet.ships.filter((s) => s.tier === tier);
        if (ships.length === 0) return null;
        return (
          <div key={tier} className="amds-ship-group">
            <div className="amds-ship-group-label">
              {label}
              <span className={"amds-tier amds-tier-" + tier}>
                {tier === "speculative" ? "invented" : "real"}
              </span>
            </div>
            {ships.map((s) => {
              const env = envelopes[s.id];
              return (
                <button
                  key={s.id}
                  className={"amds-ship" + (s.id === shipId ? " amds-ship-on" : "")}
                  onClick={() => onPick(s.id)}
                  disabled={disabled}
                  title={s.status}
                >
                  <span className="amds-ship-name">{s.name}</span>
                  <span className="amds-ship-meta">
                    {s.operator === "not real" ? s.class : s.operator}
                    {env?.delta_v_capacity_km_s != null && (
                      <span className="amds-ship-dv">{env.delta_v_capacity_km_s} km/s</span>
                    )}
                    {env?.specs_published === false && (
                      <span className="amds-ship-dv amds-ship-unknown">specs secret</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}

      {selected && (
        <div className="amds-ship-detail">
          <div className="amds-ship-detail-head">
            <span className="amds-ship-detail-name">{selected.name}</span>
            <span className={"amds-tier amds-tier-" + selected.tier}>
              {selected.tier.replace(/_/g, " ")}
            </span>
          </div>

          <p className="amds-ship-status">{selected.status}</p>

          <Specs ship={selected} envelope={envelope} />

          {envelope?.cannot_reach_anything && (
            <p className="amds-ship-warn">{envelope.cannot_reach_anything.note}</p>
          )}
          {envelope?.no_hold_note && <p className="amds-ship-warn">{envelope.no_hold_note}</p>}
          {selected.basis && <p className="amds-ship-basis">{selected.basis}</p>}
          {selected.notes && <p className="amds-ship-notes">{selected.notes}</p>}

          <button className="amds-ship-sources-toggle" onClick={() => setShowSources((v) => !v)}>
            {showSources ? "hide sources" : "where these numbers come from"}
          </button>

          {showSources && (
            <div className="amds-ship-sources">
              {Object.entries(selected.sources ?? {}).map(([field, cite]) => (
                <div key={field} className="amds-ship-source-row">
                  <span>{field.replace(/_/g, " ")}</span>
                  <span className={cite === "Invented" ? "amds-ship-invented" : ""}>{cite}</span>
                </div>
              ))}
              {selected.uncertainty && (
                <p className="amds-ship-uncertainty">
                  <strong>Where sources disagree.</strong> {selected.uncertainty}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <p className="amds-ship-footnote">{fleet.scale_warning}</p>
    </div>
  );
}

/** The specs table. An unpublished figure reads as unpublished, never as zero. */
function Specs({ ship, envelope }) {
  const rows = [
    ["Dry mass", mass(ship.dry_mass_tons)],
    ["Propellant", mass(ship.propellant_capacity_tons)],
    ["Hold", hold(ship.cargo_capacity_tons)],
    ["Exhaust velocity", ship.isp_s ? ship.isp_s + " s Isp" : null],
    ["Delta v in the tank", envelope?.delta_v_capacity_km_s ? envelope.delta_v_capacity_km_s + " km/s" : null],
    [
      "Round trips it can fly",
      envelope
        ? envelope.objects_reachable_with_a_full_hold +
          " of " +
          envelope.objects_in_catalogue +
          " loaded"
        : null,
    ],
  ];

  // An invented hauler never brought anything home, so the row would be a lie
  // either way it was filled in. It only belongs on a ship that flew.
  if (ship.tier !== "speculative") {
    rows.push([
      "Brought home for real",
      ship.sample_returned_kg != null
        ? ship.sample_returned_kg > 0
          ? grams(ship.sample_returned_kg)
          : "nothing, it is an orbiter"
        : null,
    ]);
  }

  return (
    <div className="amds-spec-table">
      {rows.map(([label, value]) => (
        <div key={label} className="amds-spec-row">
          <span className="amds-spec-key">{label}</span>
          <span className={"amds-spec-val" + (value == null ? " amds-spec-unknown" : "")}>
            {value ?? "not published"}
          </span>
        </div>
      ))}
    </div>
  );
}

const mass = (tons) =>
  tons == null ? null : tons < 1 ? Math.round(tons * 1000) + " kg" : tons.toLocaleString("en-US") + " t";

const hold = (tons) => {
  if (tons == null) return null;
  if (tons === 0) return "none";
  if (tons < 0.001) return (tons * 1_000_000).toFixed(1) + " g";
  if (tons < 1) return (tons * 1000).toFixed(1) + " kg";
  return tons.toLocaleString("en-US") + " t";
};

const grams = (kg) => (kg < 1 ? (kg * 1000).toFixed(1) + " g" : kg + " kg");
