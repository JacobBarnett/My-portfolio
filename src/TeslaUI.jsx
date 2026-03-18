import { useState, useEffect, useCallback, useRef } from "react";
import "./TeslaUI.css";
import SpotifyPanel from "./SpotifyPanel";
import TeslaModel3D from "./TeslaModel3D";

const CLIENT_ID = "235a98443cd04cc88e4cbe64c9badd7f";
const REDIRECT_URI = "https://jacobbarnett.dev/callback";
const SCOPES = [
  "streaming",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "user-read-email",
  "user-read-private",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

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
  localStorage.setItem("spotify_verifier", verifier);
  localStorage.setItem("spotify_post_login_panel", "music");
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}
async function exchangeToken(code) {
  const verifier = localStorage.getItem("spotify_verifier");
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
    localStorage.setItem(
      "spotify_expires",
      Date.now() + data.expires_in * 1000,
    );
    localStorage.removeItem("spotify_verifier");
    return data.access_token;
  }
  return null;
}
async function spotifyFetch(endpoint, options = {}) {
  const token = localStorage.getItem("spotify_token");
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

function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return time;
}

function waitForSize(el, maxMs = 3000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (el && el.clientWidth > 0 && el.clientHeight > 0) resolve();
      else if (Date.now() - start > maxMs) reject(new Error("no size"));
      else requestAnimationFrame(check);
    };
    check();
  });
}

// ── THE MAP — always visible on the right ──
function MainMap({ destination, dayMode }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const routeRef = useRef(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
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
    load().then(async (L) => {
      if (initialized.current || !mapRef.current) return;
      try {
        await waitForSize(mapRef.current);
      } catch {
        return;
      }
      initialized.current = true;
      const map = L.map(mapRef.current, {
        center: [33.8868, -117.8878],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
        zoomAnimation: false,
        fadeAnimation: false,
      });
      const tileUrl = dayMode
        ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
      L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      // Location arrow marker
      const arrow = L.divIcon({
        className: "",
        html: `<div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:18px solid #e82127;transform:rotate(0deg);filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));"></div>`,
        iconSize: [14, 18],
        iconAnchor: [7, 9],
      });
      L.marker([33.8868, -117.8878], { icon: arrow }).addTo(map);
      mapInstanceRef.current = map;
    });
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        initialized.current = false;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!destination || !mapInstanceRef.current) return;
    const draw = async () => {
      let attempts = 0;
      while (
        !mapInstanceRef.current ||
        !mapRef.current ||
        mapRef.current.clientWidth === 0
      ) {
        if (attempts++ > 60) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      const L = window.L;
      if (!L || !mapInstanceRef.current) return;
      let results;
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}&limit=1`,
        );
        results = await r.json();
      } catch {
        return;
      }
      if (!results.length || !mapInstanceRef.current) return;
      const { lat, lon } = results[0];
      const destLatLng = [parseFloat(lat), parseFloat(lon)];
      if (markerRef.current)
        mapInstanceRef.current.removeLayer(markerRef.current);
      if (routeRef.current)
        mapInstanceRef.current.removeLayer(routeRef.current);
      const destIcon = L.divIcon({
        className: "",
        html: `<div style="width:10px;height:10px;background:#fff;border-radius:50%;border:2px solid #ccc;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });
      markerRef.current = L.marker(destLatLng, { icon: destIcon }).addTo(
        mapInstanceRef.current,
      );
      // Draw route line
      routeRef.current = L.polyline([[33.8868, -117.8878], destLatLng], {
        color: "#3b82f6",
        weight: 3,
        opacity: 0.85,
      }).addTo(mapInstanceRef.current);
      mapInstanceRef.current.invalidateSize();
      const midLat = (33.8868 + destLatLng[0]) / 2;
      const midLng = (-117.8878 + destLatLng[1]) / 2;
      mapInstanceRef.current.setView([midLat, midLng], 10, { animate: false });
    };
    draw();
  }, [destination]);

  return <div ref={mapRef} className="tesla-map-full" />;
}

export default function TeslaUI() {
  const time = useClock();
  const [token, setToken] = useState(localStorage.getItem("spotify_token"));
  const [authLoading, setAuthLoading] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("off");
  const [temp, setTemp] = useState(72);
  const [acOn, setAcOn] = useState(true);
  const [gear, setGear] = useState("P");
  const [speed, setSpeed] = useState(0);
  const [brightness, setBrightness] = useState(80);
  const [dayMode, setDayMode] = useState(false);
  const [batteryPct] = useState(87);
  const [range] = useState(247);
  const [navInput, setNavInput] = useState("");
  const [destination, setDestination] = useState("");
  const [navHistory, setNavHistory] = useState([]);
  const [showSpotify, setShowSpotify] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const progressInterval = useRef(null);

  // OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");
    if (error) {
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    if (code) {
      setAuthLoading(true);
      exchangeToken(code)
        .then((t) => {
          setAuthLoading(false);
          if (t) {
            setToken(t);
            setShowSpotify(true);
          }
          window.history.replaceState({}, "", window.location.pathname);
        })
        .catch(() => {
          setAuthLoading(false);
          window.history.replaceState({}, "", window.location.pathname);
        });
    }
  }, []);

  // Token expiry
  useEffect(() => {
    const interval = setInterval(() => {
      const expiry = localStorage.getItem("spotify_expires");
      if (expiry && Date.now() > parseInt(expiry) - 120000) {
        localStorage.removeItem("spotify_token");
        localStorage.removeItem("spotify_expires");
        setToken(null);
        setNowPlaying(null);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchNowPlaying = useCallback(async () => {
    if (!token) return;
    const data = await spotifyFetch("/me/player/currently-playing");
    if (data && data.item) {
      setNowPlaying(data.item);
      setIsPlaying(data.is_playing);
      setProgress(data.progress_ms || 0);
      setDuration(data.item.duration_ms || 0);
      setShuffle(data.shuffle_state || false);
      setRepeat(data.repeat_state || "off");
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

  useEffect(() => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    if (isPlaying) {
      progressInterval.current = setInterval(
        () => setProgress((p) => Math.min(p + 1000, duration)),
        1000,
      );
    }
    return () => clearInterval(progressInterval.current);
  }, [isPlaying, duration]);

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
  const handleShuffle = async () => {
    const n = !shuffle;
    setShuffle(n);
    await spotifyFetch(`/me/player/shuffle?state=${n}`, { method: "PUT" });
  };
  const handleRepeat = async () => {
    const modes = ["off", "context", "track"];
    const n = modes[(modes.indexOf(repeat) + 1) % 3];
    setRepeat(n);
    await spotifyFetch(`/me/player/repeat?state=${n}`, { method: "PUT" });
  };
  const logout = () => {
    localStorage.removeItem("spotify_token");
    localStorage.removeItem("spotify_expires");
    setToken(null);
    setNowPlaying(null);
    setShowSpotify(false);
  };

  const handleNavGo = () => {
    if (!navInput.trim()) return;
    setDestination(navInput.trim());
    setNavHistory((h) =>
      [navInput.trim(), ...h.filter((x) => x !== navInput.trim())].slice(0, 3),
    );
  };

  const pct = duration > 0 ? (progress / duration) * 100 : 0;
  const fmt = (ms) => {
    if (!ms) return "0:00";
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const formatTime = (d) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (authLoading) {
    return (
      <div className="tesla-loading">
        <div className="loading-spinner" />
        <div className="loading-text">Connecting...</div>
      </div>
    );
  }

  return (
    <div
      className={`tesla-wrapper${dayMode ? " day-mode" : ""}`}
      style={{ "--brightness-overlay": `${((100 - brightness) / 100) * 0.85}` }}
    >
      {/* STATUS BAR */}
      <div className="tesla-statusbar">
        <div className="tsb-prnd">
          {["P", "R", "N", "D"].map((g) => (
            <span
              key={g}
              className={`prnd-letter ${gear === g ? "active" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={() => setGear(g)}
            >
              {g}
            </span>
          ))}
        </div>
        <div className="tsb-battery-wrap">
          <span className="tsb-bat-pct">{batteryPct}%</span>
          <div className="tsb-bat-bar">
            <div className="tsb-bat-fill" style={{ width: `${batteryPct}%` }} />
          </div>
        </div>
        <div className="tsb-center-info">
          <span className="tsb-time">{formatTime(time)}</span>
          <span className="tsb-temp">{temp}°F</span>
          <span className="tsb-profile">👤 Profile</span>
        </div>
        <div className="tsb-right">
          <button
            className="tsb-daynight"
            onClick={() => setDayMode((d) => !d)}
          >
            {dayMode ? "🌙" : "☀️"}
          </button>
        </div>
      </div>

      {/* MAIN BODY */}
      <div className="tesla-body">
        {/* LEFT — car + music strip */}
        <div className="tesla-left">
          <div className="car-viz">
            {/* Status labels */}
            <div className="car-label car-label-frunk">
              <span>Open</span>
              <strong>Frunk</strong>
            </div>
            <div className="car-label car-label-trunk">
              <span>Open</span>
              <strong>Trunk</strong>
            </div>
            <div className="car-status-icon">🔒</div>
            <div className="car-charging-line">⚡</div>
            <TeslaModel3D dayMode={dayMode} />
          </div>

          {/* MUSIC STRIP */}
          <div className="music-strip">
            <div
              className="music-now-playing"
              onClick={() => {
                if (token) setShowSpotify(true);
                else loginWithSpotify();
              }}
            >
              {nowPlaying ? (
                <>
                  <img
                    src={nowPlaying.album?.images?.[2]?.url}
                    alt=""
                    className="music-art"
                  />
                  <div className="music-info">
                    <div className="music-title">{nowPlaying.name}</div>
                    <div className="music-artist">
                      {nowPlaying.artists?.[0]?.name}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="music-art-placeholder">♪</div>
                  <div className="music-info">
                    <div className="music-title">
                      {token ? "Not playing" : "Connect Spotify"}
                    </div>
                    <div className="music-artist">
                      {token ? "Open Spotify" : "Tap to connect"}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "0.3rem",
              }}
            >
              <div className="music-controls">
                <button className="music-ctrl-btn" onClick={handlePrev}>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M3.3 1a.7.7 0 0 1 .7.7v8.15l9.95-8.744a.75.75 0 0 1 1.25.562v19.064a.75.75 0 0 1-1.25.562L4 12.646V20.3a.7.7 0 0 1-1.4 0V1.7a.7.7 0 0 1 .7-.7z" />
                  </svg>
                </button>
                <button
                  className="music-ctrl-btn play"
                  onClick={handlePlayPause}
                >
                  {isPlaying ? "⏸" : "▶"}
                </button>
                <button className="music-ctrl-btn" onClick={handleNext}>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M20.7 1a.7.7 0 0 1 .7.7v18.6a.7.7 0 0 1-1.4 0V12.646l-9.95 8.658A.75.75 0 0 1 8.8 20.74V1.562A.75.75 0 0 1 10.05 1l9.95 8.15V1.7a.7.7 0 0 1 .7-.7z" />
                  </svg>
                </button>
                <button
                  className={`music-extra-btn ${shuffle ? "active" : ""}`}
                  onClick={handleShuffle}
                  title="Shuffle"
                >
                  ⇄
                </button>
                <button
                  className={`music-extra-btn ${repeat !== "off" ? "active" : ""}`}
                  onClick={handleRepeat}
                  title="Repeat"
                >
                  ↺
                </button>
                <button
                  className="music-extra-btn"
                  onClick={() => nowPlaying && setShowSpotify(true)}
                >
                  ☰
                </button>
              </div>
              <div
                className="music-title"
                style={{
                  fontSize: "0.58rem",
                  color: "rgba(255,255,255,0.25)",
                  textAlign: "right",
                }}
              >
                {nowPlaying ? `${fmt(progress)} / ${fmt(duration)}` : ""}
              </div>
            </div>
            <div className="music-progress-bar">
              <div
                className="music-progress-fill"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        {/* RIGHT — full map with overlays */}
        <div className="tesla-right">
          <MainMap destination={destination} dayMode={dayMode} />
          <div className="map-overlay">
            {/* Nav search */}
            <div className="map-nav-bar">
              <span className="map-nav-search-icon">🔍</span>
              <input
                className="map-nav-input"
                placeholder="Navigate"
                value={navInput}
                onChange={(e) => setNavInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleNavGo()}
              />
              {navInput && (
                <button className="map-nav-go" onClick={handleNavGo}>
                  Go
                </button>
              )}
            </div>

            {/* Quick nav buttons */}
            <div className="map-quicknav">
              <button
                className="map-quick-btn"
                onClick={() => {
                  setNavInput("Home");
                  setDestination("Home");
                }}
              >
                🏠 Home
              </button>
              <button
                className="map-quick-btn"
                onClick={() => {
                  setNavInput("Work");
                  setDestination("Work");
                }}
              >
                💼 Work
              </button>
              {navHistory.map((h) => (
                <button
                  key={h}
                  className="map-quick-btn"
                  onClick={() => {
                    setNavInput(h);
                    setDestination(h);
                  }}
                >
                  📍 {h}
                </button>
              ))}
            </div>

            <div style={{ flex: 1 }} />

            {/* Trip bar when navigating */}
            {destination && (
              <div className="map-trip-bar">
                <div className="trip-eta">
                  <strong>15 min</strong> · 7 mi
                </div>
                <div className="trip-dest">{destination}</div>
                <button
                  className="trip-end-btn"
                  onClick={() => {
                    setDestination("");
                    setNavInput("");
                  }}
                >
                  End Trip
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM TASKBAR */}
      <div className="tesla-taskbar">
        <div className="taskbar-left">
          {/* Car icon */}
          <button className="tb-btn active">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
            </svg>
          </button>
          <div className="tb-divider" />
          {/* Speed */}
          <div className="tb-speed">
            <div className="tb-speed-arr">
              <button onClick={() => setSpeed((s) => Math.min(120, s + 5))}>
                ▲
              </button>
              <button onClick={() => setSpeed((s) => Math.max(0, s - 5))}>
                ▼
              </button>
            </div>
            <span className="tb-speed-val">{speed}</span>
          </div>
          <div className="tb-divider" />
        </div>

        <div className="taskbar-center">
          {/* Phone */}
          <button className="tb-icon-btn tb-icon-green">📞</button>
          {/* Tesla T */}
          <button
            className="tb-icon-btn tb-icon-red"
            style={{ fontSize: "0.9rem", fontWeight: "700" }}
          >
            T
          </button>
          {/* Camera */}
          <button className="tb-icon-btn tb-icon-white">📷</button>
          {/* Bluetooth */}
          <button
            className="tb-icon-btn tb-icon-blue"
            style={{ fontSize: "0.85rem" }}
          >
            ⬡
          </button>
          {/* Spotify */}
          <button
            className="tb-icon-btn tb-icon-green"
            onClick={() => (token ? setShowSpotify(true) : loginWithSpotify())}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
          </button>
          {/* More */}
          <button
            className="tb-icon-btn tb-icon-white"
            onClick={() => setShowSettings(true)}
          >
            ···
          </button>
          {/* Climate */}
          <button
            className="tb-icon-btn tb-icon-white"
            onClick={() => setAcOn((a) => !a)}
            style={{
              color: acOn ? "#3b82f6" : undefined,
              background: acOn ? "rgba(59,130,246,0.15)" : undefined,
            }}
          >
            ❄
          </button>
          {/* Temp down */}
          <button
            className="tb-btn"
            onClick={() => setTemp((t) => Math.max(60, t - 1))}
          >
            −{temp}°
          </button>
          {/* Temp up */}
          <button
            className="tb-btn"
            onClick={() => setTemp((t) => Math.min(85, t + 1))}
          >
            +
          </button>
        </div>

        <div className="taskbar-right">
          <div className="tb-divider" />
          <button className="tb-vol-btn">🔊</button>
          <button className="tb-btn">›</button>
          <a href="/" style={{ textDecoration: "none" }}>
            <button
              className="tb-btn"
              style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.3)" }}
            >
              ← Portfolio
            </button>
          </a>
        </div>
      </div>

      {/* SPOTIFY FULLSCREEN OVERLAY */}
      {showSpotify && (
        <div className="spotify-overlay">
          <div className="spotify-overlay-header">
            <button
              className="spotify-back-btn"
              onClick={() => setShowSpotify(false)}
            >
              ←
            </button>
            <span className="spotify-overlay-title">Music</span>
          </div>
          <div className="spotify-overlay-body">
            {token ? (
              <SpotifyPanel onDisconnect={logout} dayMode={dayMode} />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  gap: "1rem",
                }}
              >
                <p
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: "0.85rem",
                  }}
                >
                  Connect your Spotify account
                </p>
                <button
                  onClick={loginWithSpotify}
                  style={{
                    background: "#1db954",
                    border: "none",
                    borderRadius: "24px",
                    color: "#fff",
                    padding: "0.7rem 2rem",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Connect Spotify
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SETTINGS OVERLAY */}
      {showSettings && (
        <div
          className="settings-overlay"
          onClick={() => setShowSettings(false)}
        >
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-title">Settings</div>
            {[
              { label: "Brightness", value: `${brightness}%` },
              { label: "Interior Temp", value: `${temp}°F` },
              { label: "Climate", value: acOn ? "On" : "Off" },
              {
                label: "Spotify",
                value: token ? "Connected" : "Not connected",
              },
              { label: "Software", value: "2024.44.25" },
              { label: "VIN", value: "5YJ3E1EA•••••••••" },
            ].map((s) => (
              <div className="setting-row" key={s.label}>
                <span className="setting-label">{s.label}</span>
                <span className="setting-value">{s.value}</span>
              </div>
            ))}
            <div className="setting-row">
              <span className="setting-label">Display</span>
              <button
                className="setting-btn"
                onClick={() => setDayMode((d) => !d)}
              >
                {dayMode ? "Night mode" : "Day mode"}
              </button>
            </div>
            <div className="setting-row">
              <span className="setting-label">Brightness</span>
              <input
                type="range"
                min="10"
                max="100"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                style={{ width: "120px", accentColor: "#fff" }}
              />
            </div>
            <button
              className="settings-close"
              onClick={() => setShowSettings(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
