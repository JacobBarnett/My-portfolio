import { useState, useEffect, useRef } from "react";
import "./RoboTaxi.css";

// ── LA bounding box ──
const LA_BOUNDS = {
  minLat: 33.85,
  maxLat: 34.15,
  minLng: -118.55,
  maxLng: -118.15,
};

const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max));
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

const FIRST_NAMES = [
  "Ava",
  "Liam",
  "Sofia",
  "Noah",
  "Isabella",
  "Ethan",
  "Mia",
  "Lucas",
  "Emma",
  "Aiden",
  "Zoe",
  "Mason",
  "Chloe",
  "Oliver",
  "Lily",
  "Elijah",
  "Grace",
  "James",
  "Aria",
  "Logan",
];
const LAST_NAMES = [
  "Chen",
  "Patel",
  "Williams",
  "Garcia",
  "Kim",
  "Johnson",
  "Rodriguez",
  "Lee",
  "Martinez",
  "Brown",
  "Davis",
  "Wilson",
  "Taylor",
  "Anderson",
  "Thomas",
  "Jackson",
  "White",
  "Harris",
  "Martin",
  "Thompson",
];
const NEIGHBORHOODS = [
  "Santa Monica",
  "Venice",
  "Culver City",
  "Inglewood",
  "Koreatown",
  "Silver Lake",
  "Los Feliz",
  "Echo Park",
  "Downtown LA",
  "Westwood",
  "Brentwood",
  "Playa Vista",
  "El Segundo",
  "Hawthorne",
  "Torrance",
  "Pasadena",
  "Burbank",
  "Glendale",
  "North Hollywood",
  "Studio City",
];

function randomPassenger() {
  return `${FIRST_NAMES[randInt(0, FIRST_NAMES.length)]} ${LAST_NAMES[randInt(0, LAST_NAMES.length)]}`;
}

function randomDestination() {
  return NEIGHBORHOODS[randInt(0, NEIGHBORHOODS.length)];
}

function initVehicles() {
  return Array.from({ length: 20 }, (_, i) => {
    const status = ["en_route", "available", "charging"][randInt(0, 3)];
    return {
      id: `CX-${String(i + 1).padStart(3, "0")}`,
      lat: rand(LA_BOUNDS.minLat, LA_BOUNDS.maxLat),
      lng: rand(LA_BOUNDS.minLng, LA_BOUNDS.maxLng),
      battery: randInt(15, 100),
      speed: status === "en_route" ? randInt(18, 65) : 0,
      status,
      passenger: status === "en_route" ? randomPassenger() : null,
      destination: status === "en_route" ? randomDestination() : null,
      eta: status === "en_route" ? randInt(3, 28) : null,
      heading: rand(0, 360),
      tripCount: randInt(0, 12),
      mileage: randInt(0, 280),
    };
  });
}

function statusColor(status) {
  if (status === "en_route") return "#0ea5e9";
  if (status === "available") return "#22c55e";
  return "#f59e0b";
}

function statusLabel(status) {
  if (status === "en_route") return "En Route";
  if (status === "available") return "Available";
  return "Charging";
}

function batteryColor(pct) {
  if (pct > 50) return "#22c55e";
  if (pct > 20) return "#f59e0b";
  return "#ef4444";
}

// ── MAP ──
function FleetMap({ vehicles, selectedId, onSelect }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const initialized = useRef(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!document.getElementById("leaflet-css-rt")) {
      const link = document.createElement("link");
      link.id = "leaflet-css-rt";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    const load = () =>
      new Promise((resolve) => {
        if (window.L) {
          resolve(window.L);
          return;
        }
        const s = document.createElement("script");
        s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        s.onload = () => resolve(window.L);
        document.body.appendChild(s);
      });

    load().then((L) => {
      if (initialized.current || !mapRef.current) return;
      initialized.current = true;

      const map = L.map(mapRef.current, {
        center: [34.02, -118.35],
        zoom: 11,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          maxZoom: 19,
        },
      ).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      mapInstanceRef.current = map;

      // Initial markers
      vehicles.forEach((v) => createMarker(L, map, v));
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        initialized.current = false;
      }
    };
  }, []);

  const createMarker = (L, map, v) => {
    const color = statusColor(v.status);
    const isSelected = v.id === selectedId;
    const html = `
      <div class="rt-marker ${isSelected ? "rt-marker--selected" : ""}" style="--mc:${color}">
        <div class="rt-marker-dot"></div>
        ${v.status === "en_route" ? '<div class="rt-marker-pulse"></div>' : ""}
        <div class="rt-marker-label">${v.id}</div>
      </div>`;
    const icon = L.divIcon({
      className: "",
      html,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
    const marker = L.marker([v.lat, v.lng], { icon })
      .addTo(map)
      .on("click", () => onSelect(v.id));
    markersRef.current[v.id] = marker;
  };

  // Update marker positions & styles
  useEffect(() => {
    const L = window.L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    vehicles.forEach((v) => {
      const marker = markersRef.current[v.id];
      const color = statusColor(v.status);
      const isSelected = v.id === selectedId;
      const html = `
        <div class="rt-marker ${isSelected ? "rt-marker--selected" : ""}" style="--mc:${color}">
          <div class="rt-marker-dot"></div>
          ${v.status === "en_route" ? '<div class="rt-marker-pulse"></div>' : ""}
          <div class="rt-marker-label">${v.id}</div>
        </div>`;
      const icon = L.divIcon({
        className: "",
        html,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      if (marker) {
        marker.setLatLng([v.lat, v.lng]);
        marker.setIcon(icon);
      } else {
        createMarker(L, map, v);
      }
    });
  }, [vehicles, selectedId]);
  // Pan to selected
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedId || !mapInstanceRef.current) return;
    const v = vehicles.find((x) => x.id === selectedId);
    if (v)
      mapInstanceRef.current.panTo([v.lat, v.lng], {
        animate: true,
        duration: 0.5,
      });
  }, [selectedId]);

  return <div ref={mapRef} className="rt-map" />;
}

// ── MAIN ──
export default function RoboTaxi() {
  const [vehicles, setVehicles] = useState(initVehicles);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [tick, setTick] = useState(0);
  const [alerts, setAlerts] = useState([]);

  const selected = vehicles.find((v) => v.id === selectedId);

  // Simulate live updates
  useEffect(() => {
    const interval = setInterval(() => {
      setVehicles((prev) =>
        prev.map((v) => {
          let {
            lat,
            lng,
            battery,
            speed,
            status,
            passenger,
            destination,
            eta,
            heading,
            tripCount,
            mileage,
          } = v;

          if (status === "en_route") {
            // Move vehicle
            const rad = (heading * Math.PI) / 180;
            const dist = speed * 0.000005;
            lat = clamp(
              lat + Math.cos(rad) * dist,
              LA_BOUNDS.minLat,
              LA_BOUNDS.maxLat,
            );
            lng = clamp(
              lng + Math.sin(rad) * dist,
              LA_BOUNDS.minLng,
              LA_BOUNDS.maxLng,
            );
            // Slight heading drift
            heading = (heading + rand(-8, 8) + 360) % 360;
            // Drain battery slowly
            battery = Math.max(0, battery - 0.08);
            mileage += speed * 0.0003;
            eta = Math.max(0, eta - 0.05);
            speed = clamp(speed + rand(-3, 3), 18, 65);

            // Trip ends
            if (eta <= 0 || battery < 8) {
              status = battery < 8 ? "charging" : "available";
              passenger = null;
              destination = null;
              eta = null;
              speed = 0;
              tripCount += 1;
            }
          } else if (status === "available") {
            // Occasionally pick up passenger
            if (Math.random() < 0.04) {
              status = "en_route";
              passenger = randomPassenger();
              destination = randomDestination();
              eta = randInt(4, 22);
              speed = randInt(20, 55);
              heading = rand(0, 360);
            }
          } else if (status === "charging") {
            battery = Math.min(100, battery + 0.6);
            if (battery >= 90) status = "available";
          }

          return {
            ...v,
            lat,
            lng,
            battery,
            speed,
            status,
            passenger,
            destination,
            eta,
            heading,
            tripCount,
            mileage,
          };
        }),
      );

      setTick((t) => t + 1);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Low battery alerts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    vehicles.forEach((v) => {
      if (v.battery < 15 && v.status === "en_route") {
        setAlerts((prev) => {
          if (prev.find((a) => a.id === v.id)) return prev;
          return [
            {
              id: v.id,
              msg: `${v.id} battery critical: ${Math.floor(v.battery)}%`,
              time: new Date(),
            },
            ...prev,
          ].slice(0, 5);
        });
      }
    });
  }, [tick]);

  const filtered = vehicles.filter(
    (v) => filter === "all" || v.status === filter,
  );

  const stats = {
    enRoute: vehicles.filter((v) => v.status === "en_route").length,
    available: vehicles.filter((v) => v.status === "available").length,
    charging: vehicles.filter((v) => v.status === "charging").length,
    avgBattery: Math.floor(
      vehicles.reduce((s, v) => s + v.battery, 0) / vehicles.length,
    ),
  };

  const dismissAlert = (id) =>
    setAlerts((prev) => prev.filter((a) => a.id !== id));

  return (
    <div className="rt-root">
      {/* TOP BAR */}
      <header className="rt-header">
        <div className="rt-header-left">
          <div className="rt-logo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="rt-logo-text">
              FLEET<strong>OPS</strong>
            </span>
          </div>
          <div className="rt-live-badge">
            <span className="rt-live-dot" />
            LIVE
          </div>
        </div>

        <div className="rt-stats-row">
          <div className="rt-stat-pill rt-stat-pill--blue">
            <span className="rt-stat-val">{stats.enRoute}</span>
            <span className="rt-stat-lbl">En Route</span>
          </div>
          <div className="rt-stat-pill rt-stat-pill--green">
            <span className="rt-stat-val">{stats.available}</span>
            <span className="rt-stat-lbl">Available</span>
          </div>
          <div className="rt-stat-pill rt-stat-pill--amber">
            <span className="rt-stat-val">{stats.charging}</span>
            <span className="rt-stat-lbl">Charging</span>
          </div>
          <div className="rt-stat-pill rt-stat-pill--gray">
            <span className="rt-stat-val">{stats.avgBattery}%</span>
            <span className="rt-stat-lbl">Avg Battery</span>
          </div>
        </div>

        <a href="/" className="rt-back-btn">
          ← Portfolio
        </a>
      </header>

      {/* ALERTS */}
      {alerts.length > 0 && (
        <div className="rt-alerts">
          {alerts.map((a) => (
            <div key={a.id} className="rt-alert">
              <span className="rt-alert-icon">⚠</span>
              <span className="rt-alert-msg">{a.msg}</span>
              <button
                className="rt-alert-dismiss"
                onClick={() => dismissAlert(a.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* BODY */}
      <div className="rt-body">
        {/* SIDEBAR */}
        <aside className="rt-sidebar">
          <div className="rt-sidebar-top">
            <span className="rt-sidebar-title">
              Fleet · {vehicles.length} vehicles
            </span>
            <div className="rt-filters">
              {["all", "en_route", "available", "charging"].map((f) => (
                <button
                  key={f}
                  className={`rt-filter-btn ${filter === f ? "active" : ""}`}
                  onClick={() => setFilter(f)}
                >
                  {f === "all"
                    ? "All"
                    : f === "en_route"
                      ? "Active"
                      : f === "available"
                        ? "Open"
                        : "Charging"}
                </button>
              ))}
            </div>
          </div>
          <div className="rt-vehicle-list">
            {filtered.map((v) => (
              <button
                key={v.id}
                className={`rt-vehicle-row ${selectedId === v.id ? "selected" : ""}`}
                onClick={() => setSelectedId(selectedId === v.id ? null : v.id)}
              >
                <div className="rt-vr-left">
                  <div
                    className="rt-vr-status-dot"
                    style={{ background: statusColor(v.status) }}
                  />
                  <div className="rt-vr-info">
                    <div className="rt-vr-id">{v.id}</div>
                    <div className="rt-vr-sub">
                      {v.status === "en_route"
                        ? v.passenger
                        : statusLabel(v.status)}
                    </div>
                  </div>
                </div>
                <div className="rt-vr-right">
                  <div className="rt-vr-battery">
                    <div className="rt-vr-bat-bar">
                      <div
                        className="rt-vr-bat-fill"
                        style={{
                          width: `${v.battery}%`,
                          background: batteryColor(v.battery),
                        }}
                      />
                    </div>
                    <span
                      className="rt-vr-bat-pct"
                      style={{ color: batteryColor(v.battery) }}
                    >
                      {Math.floor(v.battery)}%
                    </span>
                  </div>
                  {v.status === "en_route" && (
                    <div className="rt-vr-speed">{Math.floor(v.speed)} mph</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* MAP */}
        <main className="rt-map-container">
          <FleetMap
            vehicles={vehicles}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </main>

        {/* DETAIL PANEL */}
        <aside className={`rt-detail ${selected ? "rt-detail--open" : ""}`}>
          {selected ? (
            <>
              <div className="rt-detail-header">
                <div>
                  <div className="rt-detail-id">{selected.id}</div>
                  <div
                    className="rt-detail-status"
                    style={{ color: statusColor(selected.status) }}
                  >
                    ● {statusLabel(selected.status)}
                  </div>
                </div>
                <button
                  className="rt-detail-close"
                  onClick={() => setSelectedId(null)}
                >
                  ✕
                </button>
              </div>

              <div className="rt-detail-battery">
                <div className="rt-db-label">
                  <span>Battery</span>
                  <span
                    style={{
                      color: batteryColor(selected.battery),
                      fontWeight: 600,
                    }}
                  >
                    {Math.floor(selected.battery)}%
                  </span>
                </div>
                <div className="rt-db-bar">
                  <div
                    className="rt-db-fill"
                    style={{
                      width: `${selected.battery}%`,
                      background: batteryColor(selected.battery),
                    }}
                  />
                </div>
                {selected.status === "charging" && (
                  <div className="rt-db-charging">⚡ Charging in progress</div>
                )}
              </div>

              <div className="rt-detail-grid">
                <div className="rt-dg-cell">
                  <div className="rt-dg-label">Speed</div>
                  <div className="rt-dg-val">
                    {Math.floor(selected.speed)} <span>mph</span>
                  </div>
                </div>
                <div className="rt-dg-cell">
                  <div className="rt-dg-label">Trips Today</div>
                  <div className="rt-dg-val">{selected.tripCount}</div>
                </div>
                <div className="rt-dg-cell">
                  <div className="rt-dg-label">Mileage</div>
                  <div className="rt-dg-val">
                    {Math.floor(selected.mileage)} <span>mi</span>
                  </div>
                </div>
                <div className="rt-dg-cell">
                  <div className="rt-dg-label">Coordinates</div>
                  <div className="rt-dg-val" style={{ fontSize: "0.72rem" }}>
                    {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                  </div>
                </div>
              </div>

              {selected.status === "en_route" && (
                <div className="rt-detail-trip">
                  <div className="rt-trip-label">Current Trip</div>
                  <div className="rt-trip-passenger">
                    <div className="rt-trip-avatar">
                      {selected.passenger?.[0]}
                    </div>
                    <div>
                      <div className="rt-trip-name">{selected.passenger}</div>
                      <div className="rt-trip-dest">
                        → {selected.destination}
                      </div>
                    </div>
                  </div>
                  <div className="rt-trip-eta">
                    <span className="rt-trip-eta-label">ETA</span>
                    <span className="rt-trip-eta-val">
                      {Math.ceil(selected.eta)} min
                    </span>
                  </div>
                </div>
              )}

              {selected.status === "available" && (
                <div className="rt-detail-idle">
                  <div className="rt-idle-icon">🟢</div>
                  <div className="rt-idle-text">Ready for dispatch</div>
                  <div className="rt-idle-sub">Awaiting ride request</div>
                </div>
              )}
            </>
          ) : (
            <div className="rt-detail-empty">
              <div className="rt-detail-empty-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                    stroke="#cbd5e1"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="rt-detail-empty-text">Select a vehicle</div>
              <div className="rt-detail-empty-sub">
                Click any vehicle on the map or in the fleet list
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
