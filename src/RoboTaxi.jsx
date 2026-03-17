import { useState, useEffect, useRef, useCallback } from "react";
import "./RoboTaxi.css";

// ── LA waypoints (real intersections) ──
const LA_WAYPOINTS = [
  [34.0522, -118.2437], // Downtown LA
  [34.0736, -118.4004], // West Hollywood
  [34.0195, -118.4912], // Santa Monica
  [34.0928, -118.3287], // Los Feliz
  [34.043, -118.2673], // East LA
  [34.0259, -118.2948], // Boyle Heights
  [34.0674, -118.3003], // Koreatown
  [34.1425, -118.2551], // Glendale
  [34.1478, -118.1445], // Pasadena
  [34.0817, -118.372], // Hollywood
  [34.0058, -118.4965], // Culver City
  [33.9425, -118.4081], // Inglewood
  [34.1161, -118.3003], // Burbank
  [34.0522, -118.3287], // Mid-Wilshire
  [34.0831, -118.3666], // Silver Lake
  [34.0368, -118.2673], // Lincoln Heights
  [34.001, -118.286], // South LA
  [34.026, -118.3965], // Palms
  [34.1583, -118.3085], // North Hollywood
  [34.0272, -118.4695], // Venice (inland on Lincoln Blvd)
];

const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max));

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
function randomWaypoint() {
  return LA_WAYPOINTS[randInt(0, LA_WAYPOINTS.length)];
}
function randomDestName() {
  return NEIGHBORHOODS[randInt(0, NEIGHBORHOODS.length)];
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

// Fetch a real route from OSRM
async function fetchRoute(from, to) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === "Ok" && data.routes?.[0]) {
      const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [
        lat,
        lng,
      ]);
      const distance = data.routes[0].distance; // meters
      return { coords, distance };
    }
  } catch {
    /* ignore */
  }
  return null;
}

// Reverse geocode a position to a street name
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`,
      { headers: { "Accept-Language": "en" } },
    );
    const data = await res.json();
    if (data.error) return "Locating...";
    const addr = data.address;
    const street =
      addr?.road ||
      addr?.pedestrian ||
      addr?.path ||
      addr?.neighbourhood ||
      addr?.suburb ||
      "Unknown Street";
    const area =
      addr?.suburb ||
      addr?.neighbourhood ||
      addr?.city_district ||
      addr?.city ||
      "";
    return area ? `${street}, ${area}` : street;
  } catch {
    return "Locating...";
  }
}

function initVehicles() {
  return Array.from({ length: 20 }, (_, i) => {
    const wp = LA_WAYPOINTS[i % LA_WAYPOINTS.length];
    const status = ["en_route", "available", "charging"][randInt(0, 3)];
    return {
      id: `CX-${String(i + 1).padStart(3, "0")}`,
      lat: wp[0],
      lng: wp[1],
      battery: randInt(15, 100),
      speed: status === "en_route" ? randInt(18, 55) : 0,
      status,
      passenger: status === "en_route" ? randomPassenger() : null,
      destination: status === "en_route" ? randomDestName() : null,
      eta: status === "en_route" ? randInt(3, 28) : null,
      tripCount: randInt(0, 12),
      mileage: randInt(0, 280),
      // Route following
      routeCoords: null, // array of [lat,lng]
      routeIndex: 0, // current position index
      currentStreet: null, // reverse geocoded street name
    };
  });
}

// ── MAP ──
function FleetMap({ vehicles, selectedId, onSelect, dayMode }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const initialized = useRef(false);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

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
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      mapInstanceRef.current = map;
    });
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        initialized.current = false;
      }
    };
  }, []);

  useEffect(() => {
    const L = window.L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;
    vehicles.forEach((v) => {
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
      const existing = markersRef.current[v.id];
      if (existing) {
        existing.setLatLng([v.lat, v.lng]);
        existing.setIcon(icon);
      } else {
        const marker = L.marker([v.lat, v.lng], { icon })
          .addTo(map)
          .on("click", () => onSelectRef.current(v.id));
        markersRef.current[v.id] = marker;
      }
    });
  }, [vehicles, selectedId]);

  useEffect(() => {
    if (!selectedId || !mapInstanceRef.current) return;
    const v = vehicles.find((x) => x.id === selectedId);
    if (v)
      mapInstanceRef.current.panTo([v.lat, v.lng], {
        animate: true,
        duration: 0.6,
      });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={mapRef} className="rt-map" />;
}

// ── MAIN ──
export default function RoboTaxi() {
  const [vehicles, setVehicles] = useState(initVehicles);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [alerts, setAlerts] = useState([]);
  const routeFetchQueue = useRef(new Set());

  const selected = vehicles.find((v) => v.id === selectedId);

  // Fetch real routes for en_route vehicles that don't have one yet
  const fetchRoutesForVehicles = useCallback((vList) => {
    vList.forEach(async (v) => {
      if (
        v.status !== "en_route" ||
        v.routeCoords ||
        routeFetchQueue.current.has(v.id)
      )
        return;
      routeFetchQueue.current.add(v.id);
      const dest = randomWaypoint();
      const route = await fetchRoute([v.lat, v.lng], dest);
      if (route && route.coords.length > 1) {
        setVehicles((prev) =>
          prev.map((pv) =>
            pv.id === v.id
              ? { ...pv, routeCoords: route.coords, routeIndex: 0 }
              : pv,
          ),
        );
      }
      routeFetchQueue.current.delete(v.id);
    });
  }, []);

  // Initial route fetch
  useEffect(() => {
    fetchRoutesForVehicles(vehicles);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const id = selected.id;
    const lat = selected.lat;
    const lng = selected.lng;
    const timer = setTimeout(() => {
      reverseGeocode(lat, lng).then((street) => {
        if (!cancelled) {
          setVehicles((prev) =>
            prev.map((v) =>
              v.id === id ? { ...v, currentStreet: street } : v,
            ),
          );
        }
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Simulate live updates — move along real route coords
  useEffect(() => {
    const interval = setInterval(() => {
      setVehicles((prev) => {
        const updated = prev.map((v) => {
          let {
            lat,
            lng,
            battery,
            speed,
            status,
            passenger,
            destination,
            eta,
            tripCount,
            mileage,
            routeCoords,
            routeIndex,
          } = v;

          if (status === "en_route") {
            battery = Math.max(0, battery - 0.06);
            eta = Math.max(0, (eta || 0) - 0.05);

            if (routeCoords && routeCoords.length > 0) {
              // Move to next point on route
              const nextIndex = Math.min(
                routeIndex + 1,
                routeCoords.length - 1,
              );
              lat = routeCoords[nextIndex][0];
              lng = routeCoords[nextIndex][1];
              routeIndex = nextIndex;
              mileage += speed * 0.0003;
              speed = Math.min(
                55,
                Math.max(18, speed + (Math.random() - 0.5) * 6),
              );

              // Reached end of route or battery low
              if (
                nextIndex >= routeCoords.length - 1 ||
                eta <= 0 ||
                battery < 8
              ) {
                status = battery < 8 ? "charging" : "available";
                passenger = null;
                destination = null;
                eta = null;
                speed = 0;
                routeCoords = null;
                routeIndex = 0;
                tripCount += 1;
              }
            } else {
              // No route yet — stay put and wait for route fetch
              speed = 0;
            }
          } else if (status === "available") {
            if (Math.random() < 0.04) {
              status = "en_route";
              passenger = randomPassenger();
              destination = randomDestName();
              eta = randInt(4, 22);
              speed = randInt(20, 45);
              routeCoords = null;
              routeIndex = 0;
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
            tripCount,
            mileage,
            routeCoords,
            routeIndex,
          };
        });

        // Fetch routes for newly en_route vehicles
        const needRoutes = updated.filter(
          (v) =>
            v.status === "en_route" &&
            !v.routeCoords &&
            !routeFetchQueue.current.has(v.id),
        );
        if (needRoutes.length > 0) {
          setTimeout(() => fetchRoutesForVehicles(needRoutes), 0);
        }

        return updated;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchRoutesForVehicles]);

  // Low battery alerts
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
  }, [vehicles]);

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

      <div className="rt-body">
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

        <main className="rt-map-container">
          <FleetMap
            vehicles={vehicles}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </main>

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

              {/* CURRENT STREET */}
              {selected.currentStreet && (
                <div className="rt-detail-street">
                  <div className="rt-street-icon">📍</div>
                  <div>
                    <div className="rt-street-label">Current Location</div>
                    <div className="rt-street-name">
                      {selected.currentStreet}
                    </div>
                  </div>
                </div>
              )}

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
                      {Math.ceil(selected.eta || 0)} min
                    </span>
                  </div>
                  {selected.routeCoords && (
                    <div className="rt-trip-progress">
                      <div className="rt-trip-prog-label">Route Progress</div>
                      <div className="rt-trip-prog-bar">
                        <div
                          className="rt-trip-prog-fill"
                          style={{
                            width: `${Math.min(100, (selected.routeIndex / Math.max(1, (selected.routeCoords?.length || 1) - 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="rt-trip-prog-pct">
                        {Math.floor(
                          Math.min(
                            100,
                            (selected.routeIndex /
                              Math.max(
                                1,
                                (selected.routeCoords?.length || 1) - 1,
                              )) *
                              100,
                          ),
                        )}
                        % complete
                      </div>
                    </div>
                  )}
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
