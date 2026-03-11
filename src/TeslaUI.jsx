import { useState, useEffect, useCallback, useRef } from "react";
import "./TeslaUI.css";
import SpotifyPanel from "./SpotifyPanel";

// ── SPOTIFY CONFIG ──
const CLIENT_ID = "235a98443cd04cc88e4cbe64c9badd7f";
const REDIRECT_URI = "https://jacobbarnett.dev/callback";
const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "user-read-email",
  "user-read-private",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "streaming",
].join(" ");

// ── PKCE HELPERS ──
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function loginWithSpotify() {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state: verifier,
    show_dialog: "true",
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function exchangeToken(code, verifier) {
  if (!verifier) return null;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  const data = await res.json();
  if (data.access_token) {
    localStorage.setItem("spotify_token", data.access_token);
    localStorage.setItem("spotify_refresh", data.refresh_token || "");
    localStorage.setItem(
      "spotify_expires",
      Date.now() + data.expires_in * 1000,
    );
    return data.access_token;
  }
  return null;
}

async function doRefreshToken() {
  const refresh = localStorage.getItem("spotify_refresh");
  if (!refresh) return null;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refresh,
    }),
  });
  const data = await res.json();
  if (data.access_token) {
    localStorage.setItem("spotify_token", data.access_token);
    localStorage.setItem(
      "spotify_expires",
      Date.now() + data.expires_in * 1000,
    );
    return data.access_token;
  }
  // Refresh failed - clear everything to prevent infinite loop
  localStorage.removeItem("spotify_token");
  localStorage.removeItem("spotify_refresh");
  localStorage.removeItem("spotify_expires");
  return null;
}

async function getValidToken() {
  const expires = parseInt(localStorage.getItem("spotify_expires") || "0");
  if (Date.now() < expires - 60000)
    return localStorage.getItem("spotify_token");
  return await doRefreshToken();
}

async function spotifyFetch(endpoint, options = {}) {
  const token = await getValidToken();
  if (!token) return null;
  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (res.status === 204 || res.status === 202) return {};
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// ── CLOCK ──
function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return time;
}

// ── MAP COMPONENT ──
function NavMap({ destination }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const routeLayerRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    const loadLeaflet = () =>
      new Promise((resolve) => {
        if (window.L) {
          resolve(window.L);
          return;
        }
        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = () => resolve(window.L);
        document.body.appendChild(script);
      });
    loadLeaflet().then((L) => {
      if (mapInstanceRef.current || !mapRef.current) return;
      const map = L.map(mapRef.current, {
        center: [33.8868, -117.8878],
        zoom: 13,
        zoomControl: true,
        attributionControl: false,
      });
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { maxZoom: 19 },
      ).addTo(map);
      const icon = L.divIcon({
        className: "",
        html: '<div style="width:14px;height:14px;background:#e82127;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px rgba(232,33,39,0.8);"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([33.8868, -117.8878], { icon }).addTo(map);
      mapInstanceRef.current = map;
    });
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!destination || !mapInstanceRef.current) return;
    const L = window.L;
    if (!L) return;
    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}&limit=1`,
    )
      .then((r) => r.json())
      .then((results) => {
        if (!results.length) return;
        const { lat, lon, display_name } = results[0];
        const destLatLng = [parseFloat(lat), parseFloat(lon)];
        if (markerRef.current)
          mapInstanceRef.current.removeLayer(markerRef.current);
        if (routeLayerRef.current)
          mapInstanceRef.current.removeLayer(routeLayerRef.current);
        const destIcon = L.divIcon({
          className: "",
          html: '<div style="width:14px;height:14px;background:#3a7bd5;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px rgba(58,123,213,0.8);"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        markerRef.current = L.marker(destLatLng, { icon: destIcon })
          .addTo(mapInstanceRef.current)
          .bindPopup(display_name.split(",").slice(0, 2).join(","))
          .openPopup();
        routeLayerRef.current = L.polyline([[33.8868, -117.8878], destLatLng], {
          color: "#3a7bd5",
          weight: 3,
          opacity: 0.8,
          dashArray: "6,8",
        }).addTo(mapInstanceRef.current);
        mapInstanceRef.current.fitBounds([[33.8868, -117.8878], destLatLng], {
          padding: [40, 40],
        });
      });
  }, [destination]);

  return <div ref={mapRef} className="leaflet-map" />;
}

// ── MAIN COMPONENT ──
export default function TeslaUI() {
  const time = useClock();
  const [token, setToken] = useState(localStorage.getItem("spotify_token"));
  const [authLoading, setAuthLoading] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [temp, setTemp] = useState(72);
  const [acOn, setAcOn] = useState(true);
  const [gear, setGear] = useState("P");
  const [brightness, setBrightness] = useState(80);
  const [activePanel, setActivePanel] = useState("home");
  const [batteryPct] = useState(87);
  const [range] = useState(247);
  const [navInput, setNavInput] = useState("");
  const [destination, setDestination] = useState("");
  const [navHistory, setNavHistory] = useState([]);

  // ── Handle Spotify OAuth callback ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const verifier = params.get("state");
    const error = params.get("error");
    if (error) {
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    if (code && verifier) {
      setAuthLoading(true);
      exchangeToken(code, verifier)
        .then((t) => {
          setAuthLoading(false);
          if (t) {
            setToken(t);
            setActivePanel("music");
          }
          window.history.replaceState({}, "", window.location.pathname);
        })
        .catch(() => {
          setAuthLoading(false);
          window.history.replaceState({}, "", window.location.pathname);
        });
    }
  }, []);

  // ── Poll now playing ──
  const fetchNowPlaying = useCallback(async () => {
    if (!token) return;
    const data = await spotifyFetch("/me/player/currently-playing");
    if (data && data.item) {
      setNowPlaying(data.item);
      setIsPlaying(data.is_playing);
    } else {
      setNowPlaying(null);
      setIsPlaying(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 5000);
    return () => clearInterval(interval);
  }, [token, fetchNowPlaying]);

  const handlePlayPause = async () => {
    await spotifyFetch(isPlaying ? "/me/player/pause" : "/me/player/play", {
      method: "PUT",
    });
    setTimeout(fetchNowPlaying, 600);
  };
  const handleNext = async () => {
    await spotifyFetch("/me/player/next", { method: "POST" });
    setTimeout(fetchNowPlaying, 900);
  };
  const handlePrev = async () => {
    await spotifyFetch("/me/player/previous", { method: "POST" });
    setTimeout(fetchNowPlaying, 900);
  };

  const logout = () => {
    localStorage.removeItem("spotify_token");
    localStorage.removeItem("spotify_refresh");
    localStorage.removeItem("spotify_expires");
    setToken(null);
    setNowPlaying(null);
  };
  const handleNavGo = () => {
    if (!navInput.trim()) return;
    setDestination(navInput.trim());
    setNavHistory((h) =>
      [navInput.trim(), ...h.filter((x) => x !== navInput.trim())].slice(0, 5),
    );
  };

  const formatTime = (d) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const formatDate = (d) =>
    d.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

  if (authLoading) {
    return (
      <div className="tesla-wrapper tesla-loading">
        <div className="loading-spinner" />
        <div className="loading-text">Connecting to Spotify...</div>
      </div>
    );
  }

  return (
    <div className="tesla-wrapper">
      {/* STATUS BAR */}
      <div className="tesla-statusbar">
        <div className="tsb-left">
          <span className="tsb-time">{formatTime(time)}</span>
          <span className="tsb-date">{formatDate(time)}</span>
        </div>
        <div className="tsb-center">
          <div className="tsb-battery">
            <span className="tsb-bat-pct">{batteryPct}%</span>
            <div className="tsb-bat-bar">
              <div
                className="tsb-bat-fill"
                style={{ width: `${batteryPct}%` }}
              />
            </div>
            <span className="tsb-range">{range} mi</span>
          </div>
        </div>
        <div className="tsb-right">
          <span className="tsb-speed">
            0 <small>mph</small>
          </span>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="tesla-main">
        {/* LEFT PANEL */}
        <div className="tesla-left">
          <div className="car-viz">
            <svg viewBox="0 0 300 160" className="car-svg">
              <defs>
                <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#e8e8e8" />
                  <stop offset="100%" stopColor="#a0a0a0" />
                </linearGradient>
                <linearGradient
                  id="windowGrad"
                  x1="0%"
                  y1="0%"
                  x2="0%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#1a3a5c" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#0a1a2c" stopOpacity="0.95" />
                </linearGradient>
              </defs>
              <ellipse
                cx="150"
                cy="148"
                rx="110"
                ry="8"
                fill="rgba(0,0,0,0.3)"
              />
              <path
                d="M 40 110 Q 40 90 60 85 L 90 65 Q 120 45 150 43 Q 180 43 210 55 L 245 75 Q 265 82 268 95 L 270 110 Q 270 120 260 122 L 40 122 Q 30 120 40 110 Z"
                fill="url(#bodyGrad)"
              />
              <path
                d="M 95 68 Q 130 44 168 43 Q 200 43 220 57 L 245 75 Q 220 70 195 68 L 105 68 Z"
                fill="#c8c8c8"
              />
              <path
                d="M 100 68 L 148 48 L 175 48 L 195 68 Z"
                fill="url(#windowGrad)"
                opacity="0.9"
              />
              <path
                d="M 198 68 L 222 58 L 242 72 L 242 68 Z"
                fill="url(#windowGrad)"
                opacity="0.9"
              />
              <line
                x1="155"
                y1="68"
                x2="158"
                y2="122"
                stroke="#999"
                strokeWidth="1"
                opacity="0.5"
              />
              <circle cx="90" cy="122" r="20" fill="#1a1a1a" />
              <circle cx="90" cy="122" r="14" fill="#2a2a2a" />
              <circle cx="90" cy="122" r="7" fill="#3a3a3a" />
              <circle cx="90" cy="122" r="3" fill="#888" />
              <circle cx="210" cy="122" r="20" fill="#1a1a1a" />
              <circle cx="210" cy="122" r="14" fill="#2a2a2a" />
              <circle cx="210" cy="122" r="7" fill="#3a3a3a" />
              <circle cx="210" cy="122" r="3" fill="#888" />
              <path
                d="M 265 88 L 272 90 L 272 96 L 265 95 Z"
                fill="#fffbe6"
                opacity="0.9"
              />
              <text
                x="150"
                y="108"
                textAnchor="middle"
                fontSize="14"
                fontWeight="bold"
                fill="#cc0000"
                fontFamily="serif"
              >
                T
              </text>
            </svg>
          </div>
          <div className="gear-selector">
            {["R", "N", "D", "P"].map((g) => (
              <button
                key={g}
                className={`gear-btn ${gear === g ? "active" : ""}`}
                onClick={() => setGear(g)}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="climate-panel">
            <div className="climate-header">
              <span className="climate-icon">❄️</span>
              <span className="climate-label">Climate</span>
              <button
                className={`climate-toggle ${acOn ? "on" : ""}`}
                onClick={() => setAcOn(!acOn)}
              >
                {acOn ? "ON" : "OFF"}
              </button>
            </div>
            <div className="temp-control">
              <button
                className="temp-btn"
                onClick={() => setTemp((t) => Math.max(60, t - 1))}
              >
                −
              </button>
              <span className="temp-display">{temp}°F</span>
              <button
                className="temp-btn"
                onClick={() => setTemp((t) => Math.min(85, t + 1))}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* CENTER PANEL */}
        <div className="tesla-center">
          <div className="center-tabs">
            {[
              { id: "home", icon: "⊞", label: "Home" },
              { id: "music", icon: "♫", label: "Music" },
              { id: "nav", icon: "◎", label: "Navigate" },
              { id: "settings", icon: "⚙", label: "Settings" },
            ].map((tab) => (
              <button
                key={tab.id}
                className={`center-tab ${activePanel === tab.id ? "active" : ""}`}
                onClick={() => setActivePanel(tab.id)}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* HOME */}
          {activePanel === "home" && (
            <div className="panel home-panel">
              <div className="home-grid">
                <div className="home-card">
                  <div className="hc-label">Battery</div>
                  <div className="hc-value">
                    {batteryPct}
                    <span>%</span>
                  </div>
                  <div className="battery-bar-full">
                    <div
                      className="battery-bar-fill"
                      style={{ width: `${batteryPct}%` }}
                    />
                  </div>
                  <div className="hc-sub">{range} mi remaining</div>
                </div>
                <div className="home-card">
                  <div className="hc-label">Doors</div>
                  <div className="lock-icon">🔒</div>
                  <div className="hc-sub">Locked</div>
                </div>
                <div className="home-card">
                  <div className="hc-label">Interior</div>
                  <div className="hc-value">
                    {temp}
                    <span>°F</span>
                  </div>
                  <div className="hc-sub">
                    {acOn ? "Climate On" : "Climate Off"}
                  </div>
                </div>
                <div className="home-card">
                  <div className="hc-label">Brightness</div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="bright-slider"
                  />
                  <div className="hc-sub">{brightness}%</div>
                </div>
              </div>
              {token && nowPlaying && (
                <div className="mini-player">
                  <img
                    src={nowPlaying.album?.images?.[2]?.url}
                    alt="album"
                    className="mini-art"
                  />
                  <div className="mini-info">
                    <div className="mini-title">{nowPlaying.name}</div>
                    <div className="mini-artist">
                      {nowPlaying.artists?.[0]?.name}
                    </div>
                  </div>
                  <div className="mini-controls">
                    <button onClick={handlePrev} className="mini-btn">
                      ⏮
                    </button>
                    <button onClick={handlePlayPause} className="mini-btn play">
                      {isPlaying ? "⏸" : "▶"}
                    </button>
                    <button onClick={handleNext} className="mini-btn">
                      ⏭
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MUSIC */}
          {activePanel === "music" && (
            <div className="panel music-panel">
              {!token ? (
                <div className="spotify-login">
                  <div className="spotify-logo">
                    <svg
                      viewBox="0 0 24 24"
                      width="56"
                      height="56"
                      fill="#1DB954"
                    >
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                    </svg>
                  </div>
                  <h3 className="spotify-title">Connect Spotify</h3>
                  <p className="spotify-desc">
                    Stream your music directly through the dashboard
                  </p>
                  <button className="spotify-btn" onClick={loginWithSpotify}>
                    Connect Spotify
                  </button>
                </div>
              ) : (
                <SpotifyPanel onDisconnect={logout} />
              )}
            </div>
          )}

          {/* NAVIGATION */}
          {activePanel === "nav" && (
            <div className="panel nav-panel">
              <div className="nav-search-row">
                <input
                  className="nav-input"
                  placeholder="Search destination..."
                  value={navInput}
                  onChange={(e) => setNavInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleNavGo()}
                />
                <button className="nav-go" onClick={handleNavGo}>
                  Go
                </button>
              </div>
              {navHistory.length > 0 && !destination && (
                <div className="nav-history">
                  {navHistory.map((h) => (
                    <button
                      key={h}
                      className="nav-history-item"
                      onClick={() => {
                        setNavInput(h);
                        setDestination(h);
                      }}
                    >
                      <span>📍</span> {h}
                    </button>
                  ))}
                </div>
              )}
              {destination && (
                <div className="nav-active-dest">
                  <span className="nav-dest-label">Navigating to:</span>
                  <span className="nav-dest-name">{destination}</span>
                  <button
                    className="nav-clear"
                    onClick={() => {
                      setDestination("");
                      setNavInput("");
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
              <NavMap destination={destination} />
            </div>
          )}

          {/* SETTINGS */}
          {activePanel === "settings" && (
            <div className="panel settings-panel">
              {[
                { label: "Display Brightness", value: `${brightness}%` },
                { label: "Interior Temperature", value: `${temp}°F` },
                {
                  label: "Climate Control",
                  value: acOn ? "Enabled" : "Disabled",
                },
                {
                  label: "Spotify",
                  value: token ? "Connected ✓" : "Not Connected",
                },
                { label: "Software Version", value: "2024.44.25" },
                { label: "Vehicle Name", value: "Model S" },
                { label: "VIN", value: "5YJ3E1EA•••••••••" },
              ].map((s) => (
                <div className="setting-row" key={s.label}>
                  <span className="setting-label">{s.label}</span>
                  <span className="setting-value">{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="tesla-right">
          <div className="right-time">
            <div className="rt-time">{formatTime(time)}</div>
            <div className="rt-date">
              {time.toLocaleDateString([], {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </div>
          </div>
          <div className="right-stats">
            <div className="rstat">
              <div className="rstat-icon">⚡</div>
              <div className="rstat-val">{batteryPct}%</div>
              <div className="rstat-label">Battery</div>
            </div>
            <div className="rstat">
              <div className="rstat-icon">📍</div>
              <div className="rstat-val">{range}</div>
              <div className="rstat-label">Range (mi)</div>
            </div>
            <div className="rstat">
              <div className="rstat-icon">🌡</div>
              <div className="rstat-val">{temp}°</div>
              <div className="rstat-label">Cabin</div>
            </div>
          </div>
          <div className="right-gear">
            <div className="gear-display">
              <span className="gear-label">Gear</span>
              <span className="gear-value">{gear}</span>
            </div>
          </div>
          <a href="/" className="tesla-back">
            ← Portfolio
          </a>
        </div>
      </div>
    </div>
  );
}
