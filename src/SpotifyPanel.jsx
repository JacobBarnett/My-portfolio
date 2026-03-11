import { useState, useEffect, useRef, useCallback } from "react";
import "./SpotifyPanel.css";

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

export default function SpotifyPanel({ onDisconnect }) {
  const [view, setView] = useState("home");
  const [playlists, setPlaylists] = useState([]);
  const [likedSongs, setLikedSongs] = useState([]);
  const [activePlaylist, setActivePlaylist] = useState(null);
  const [playlistTracks, setPlaylistTracks] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(70);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("off");
  const [hoveredTrack, setHoveredTrack] = useState(null);
  const searchTimeout = useRef(null);
  const progressInterval = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("spotify_token");
    if (!token) return;
    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: "Tesla UI",
        getOAuthToken: (cb) => cb(token),
        volume: 0.7,
      });
      player.addListener("ready", ({ device_id }) => {
        setDeviceId(device_id);
        spotifyFetch("/me/player", {
          method: "PUT",
          body: JSON.stringify({ device_ids: [device_id], play: false }),
        });
      });
      player.addListener("not_ready", () => setDeviceId(null));
      player.addListener("player_state_changed", (state) => {
        if (!state) return;
        const track = state.track_window.current_track;
        setNowPlaying({
          id: track.id,
          name: track.name,
          artists: track.artists,
          album: { name: track.album.name, images: track.album.images },
          duration_ms: state.duration,
          uri: track.uri,
        });
        setIsPlaying(!state.paused);
        setProgress(state.position);
        setDuration(state.duration);
        setShuffle(state.shuffle);
        setRepeat(
          state.repeat_mode === 0
            ? "off"
            : state.repeat_mode === 1
              ? "context"
              : "track",
        );
      });
      player.addListener("initialization_error", () => {});
      player.addListener("authentication_error", () => {});
      player.addListener("account_error", () => {});
      player.connect();
    };
    if (!window.Spotify) {
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      document.body.appendChild(script);
    } else {
      window.onSpotifyWebPlaybackSDKReady();
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const [profile, pls] = await Promise.all([
        spotifyFetch("/me"),
        spotifyFetch("/me/playlists?limit=50"),
      ]);
      if (profile) setUserProfile(profile);
      if (pls?.items) setPlaylists(pls.items);

      // Paginate all liked songs
      let allLiked = [];
      let offset = 0;
      while (true) {
        const liked = await spotifyFetch(
          `/me/tracks?limit=50&offset=${offset}`,
        );
        if (!liked?.items?.length) break;
        allLiked = [...allLiked, ...liked.items];
        offset += 50;
        if (offset >= liked.total) break;
      }
      setLikedSongs(allLiked);
    };
    init();
  }, []);

  const fetchPlayer = useCallback(async () => {
    const data = await spotifyFetch("/me/player");
    if (data && data.item) {
      setNowPlaying(data.item);
      setIsPlaying(data.is_playing);
      setProgress(data.progress_ms || 0);
      setDuration(data.item.duration_ms || 0);
      setVolume(data.device?.volume_percent ?? volume);
      setShuffle(data.shuffle_state);
      setRepeat(data.repeat_state || "off");
    }
  }, [volume]);

  useEffect(() => {
    const interval = setInterval(fetchPlayer, 5000);
    return () => clearInterval(interval);
  }, [fetchPlayer]);

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

  const playTrack = async (uri, contextUri = null) => {
    const body = contextUri
      ? { context_uri: contextUri, offset: { uri } }
      : { uris: [uri] };
    const endpoint = deviceId
      ? `/me/player/play?device_id=${deviceId}`
      : "/me/player/play";
    await spotifyFetch(endpoint, { method: "PUT", body: JSON.stringify(body) });
    setTimeout(fetchPlayer, 800);
  };

  const handlePlayPause = async () => {
    await spotifyFetch(isPlaying ? "/me/player/pause" : "/me/player/play", {
      method: "PUT",
    });
    setIsPlaying(!isPlaying);
  };
  const handleNext = async () => {
    await spotifyFetch("/me/player/next", { method: "POST" });
    setTimeout(fetchPlayer, 900);
  };
  const handlePrev = async () => {
    await spotifyFetch("/me/player/previous", { method: "POST" });
    setTimeout(fetchPlayer, 900);
  };
  const handleVolume = async (v) => {
    setVolume(v);
    await spotifyFetch(`/me/player/volume?volume_percent=${v}`, {
      method: "PUT",
    });
  };
  const handleShuffle = async () => {
    const next = !shuffle;
    setShuffle(next);
    await spotifyFetch(`/me/player/shuffle?state=${next}`, { method: "PUT" });
  };
  const handleRepeat = async () => {
    const modes = ["off", "context", "track"];
    const next = modes[(modes.indexOf(repeat) + 1) % 3];
    setRepeat(next);
    await spotifyFetch(`/me/player/repeat?state=${next}`, { method: "PUT" });
  };
  const handleSeek = async (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ms = Math.floor(((e.clientX - rect.left) / rect.width) * duration);
    setProgress(ms);
    await spotifyFetch(`/me/player/seek?position_ms=${ms}`, { method: "PUT" });
  };

  const openPlaylist = async (pl) => {
    setActivePlaylist(pl);
    setView("playlist");
    setLoading(true);

    let allTracks = [];
    let offset = 0;

    const first = await spotifyFetch(
      `/playlists/${pl.id}/tracks?limit=50&offset=0`,
    );

    if (first?.items) {
      // Normal path (works in production)
      allTracks = first.items
        .filter((i) => i.track)
        .map((i) => ({ track: i.track }));
      const total = first.total || 0;
      offset = 50;
      while (offset < total) {
        const page = await spotifyFetch(
          `/playlists/${pl.id}/tracks?limit=50&offset=${offset}`,
        );
        if (!page?.items?.length) break;
        allTracks = [
          ...allTracks,
          ...page.items.filter((i) => i.track).map((i) => ({ track: i.track })),
        ];
        offset += 50;
      }
    } else {
      // Dev mode fallback - paginate via /playlists/{id}?fields=...
      while (true) {
        const data = await spotifyFetch(
          `/playlists/${pl.id}?offset=${offset}&limit=50`,
        );
        if (!data) break;
        const items = data.items?.items || data.tracks?.items || [];
        const mapped = items
          .filter((i) => i.item || i.track)
          .map((i) => ({ track: i.item || i.track }));
        if (!mapped.length) break;
        allTracks = [...allTracks, ...mapped];
        const total = data.items?.total || data.tracks?.total || 0;
        offset += 50;
        if (offset >= total) break;
      }
    }

    setPlaylistTracks(allTracks);
    setLoading(false);
  };

  const openLiked = () => setView("liked");

  const handleSearch = (q) => {
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      const data = await spotifyFetch(
        `/search?q=${encodeURIComponent(q)}&type=track,artist,album&limit=20&market=US`,
      );
      if (data) setSearchResults(data);
    }, 400);
  };

  const fmtMs = (ms) => {
    if (!ms) return "0:00";
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const pct = duration > 0 ? (progress / duration) * 100 : 0;
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const PlayIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7.05 3.606l13.49 7.577a.7.7 0 0 1 0 1.214L7.05 19.974A.7.7 0 0 1 6 19.367V4.633a.7.7 0 0 1 1.05-.607z" />
    </svg>
  );
  const MusicIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#b3b3b3">
      <path d="M6 3h15v15.167a3.5 3.5 0 1 1-3.5-3.5H19V5H8v13.167a3.5 3.5 0 1 1-3.5-3.5H6V3z" />
    </svg>
  );
  const ClockIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#b3b3b3">
      <path d="M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21zM3.5 12a8.5 8.5 0 1 1 17 0 8.5 8.5 0 0 1-17 0zm9.5-4v4.535l3.232 2.98-1.364 1.48L11 13.465V8h2z" />
    </svg>
  );

  const TrackRow = ({ track, index, offset = 0, contextUri }) => {
    const isActive = nowPlaying?.id === track.id;
    const isHovered = hoveredTrack === index + offset;
    return (
      <button
        className={`sp-track ${isActive ? "playing" : ""}`}
        onClick={() => playTrack(track.uri, contextUri)}
        onMouseEnter={() => setHoveredTrack(index + offset)}
        onMouseLeave={() => setHoveredTrack(null)}
      >
        <span className="sp-track-num">
          {isActive && isPlaying ? (
            <span className="sp-eq-icon">♫</span>
          ) : isHovered ? (
            <PlayIcon />
          ) : (
            <span style={{ color: isActive ? "#1db954" : "#b3b3b3" }}>
              {index + 1}
            </span>
          )}
        </span>
        {track.album?.images?.[2]?.url && (
          <img
            src={track.album.images[2].url}
            alt=""
            className="sp-track-img"
          />
        )}
        <div className="sp-track-info">
          <div
            className="sp-track-name"
            style={{ color: isActive ? "#1db954" : "white" }}
          >
            {track.name}
          </div>
          <div className="sp-track-artist">
            {track.artists?.map((a) => a.name).join(", ")}
          </div>
        </div>
        <div className="sp-track-album">{track.album?.name}</div>
        <div className="sp-track-duration">{fmtMs(track.duration_ms)}</div>
      </button>
    );
  };

  return (
    <div className="sp-root">
      {/* SIDEBAR */}
      <div className="sp-sidebar">
        <div className="sp-lib-top">
          <div className="sp-lib-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 22a1 1 0 0 1-1-1V3a1 1 0 0 1 2 0v18a1 1 0 0 1-1 1zM15.5 2.134A1 1 0 0 0 14 3v18a1 1 0 0 0 1.5.866l11-9a1 1 0 0 0 0-1.732l-11-9zM6 1.154A1 1 0 0 0 4.5 2v20a1 1 0 0 0 1.5.866l8-6.5A1 1 0 0 0 14 15.5v-7a1 1 0 0 0-.5-.866l-8-6.5z" />
            </svg>
            Your Library
          </div>
        </div>

        <div className="sp-lib-filters">
          <button
            className={`sp-filter-chip ${view === "home" || view === "playlist" ? "active" : ""}`}
            onClick={() => setView("home")}
          >
            Playlists
          </button>
          <button
            className={`sp-filter-chip ${view === "liked" ? "active" : ""}`}
            onClick={openLiked}
          >
            Liked Songs
          </button>
        </div>

        <div className="sp-playlist-list">
          <button
            className={`sp-lib-item ${view === "liked" ? "active" : ""}`}
            onClick={openLiked}
          >
            <div className="sp-liked-thumb">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z" />
              </svg>
            </div>
            <div className="sp-lib-item-info">
              <div className="sp-lib-item-name">Liked Songs</div>
              <div className="sp-lib-item-sub">
                Playlist • {likedSongs.length} songs
              </div>
            </div>
          </button>
          {playlists.map((pl) => (
            <button
              key={pl.id}
              className={`sp-lib-item ${activePlaylist?.id === pl.id && view === "playlist" ? "active" : ""}`}
              onClick={() => openPlaylist(pl)}
            >
              {pl.images?.[0]?.url ? (
                <img src={pl.images[0].url} alt="" className="sp-lib-thumb" />
              ) : (
                <div className="sp-lib-thumb sp-lib-thumb--empty">
                  <MusicIcon />
                </div>
              )}
              <div className="sp-lib-item-info">
                <div className="sp-lib-item-name">{pl.name}</div>
                <div className="sp-lib-item-sub">
                  Playlist • {pl.owner?.display_name || "You"}
                </div>
              </div>
            </button>
          ))}
        </div>

        <button className="sp-logout" onClick={onDisconnect}>
          Log out
        </button>
      </div>

      {/* MAIN */}
      <div className="sp-main">
        {/* Topbar */}
        <div className="sp-topbar">
          <div className="sp-nav-btns">
            <button className="sp-nav-btn" onClick={() => setView("home")}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M15.957 2.793a1 1 0 0 1 0 1.414L8.164 12l7.793 7.793a1 1 0 1 1-1.414 1.414L5.336 12l9.207-9.207a1 1 0 0 1 1.414 0z" />
              </svg>
            </button>
            <button className="sp-nav-btn sp-nav-btn--disabled">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8.043 2.793a1 1 0 0 0 0 1.414L15.836 12l-7.793 7.793a1 1 0 1 0 1.414 1.414L18.664 12 9.457 2.793a1 1 0 0 0-1.414 0z" />
              </svg>
            </button>
          </div>
          <div className="sp-topbar-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#b3b3b3">
              <path d="M10.533 1.279c-5.18 0-9.407 4.14-9.407 9.279s4.226 9.279 9.407 9.279c2.234 0 4.29-.77 5.907-2.058l4.353 4.353a1 1 0 1 0 1.414-1.414l-4.344-4.344a9.157 9.157 0 0 0 2.077-5.816c0-5.14-4.226-9.28-9.407-9.28zm-7.407 9.279c0-4.006 3.302-7.28 7.407-7.28s7.407 3.274 7.407 7.28-3.302 7.279-7.407 7.279-7.407-3.273-7.407-7.28z" />
            </svg>
            <input
              className="sp-topbar-input"
              placeholder="What do you want to play?"
              value={searchQuery}
              onChange={(e) => {
                handleSearch(e.target.value);
                if (e.target.value) setView("search");
              }}
            />
            {searchQuery && (
              <button
                className="sp-search-x"
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults(null);
                  setView("home");
                }}
              >
                ✕
              </button>
            )}
          </div>
          {userProfile && (
            <div className="sp-user-badge">
              {userProfile.images?.[0]?.url ? (
                <img
                  src={userProfile.images[0].url}
                  alt=""
                  className="sp-avatar"
                />
              ) : (
                <div className="sp-avatar sp-avatar--letter">
                  {userProfile.display_name?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sp-content">
          {/* HOME */}
          {view === "home" && (
            <div className="sp-view">
              <h1 className="sp-greeting">{greeting}</h1>
              {playlists.length > 0 && (
                <div className="sp-recent-grid">
                  {[
                    { name: "Liked Songs", img: null, liked: true },
                    ...playlists.slice(0, 5),
                  ].map((pl, i) => (
                    <button
                      key={i}
                      className="sp-recent-item"
                      onClick={() =>
                        pl.liked ? openLiked() : openPlaylist(pl)
                      }
                    >
                      {pl.liked ? (
                        <div className="sp-recent-img sp-recent-img--liked">
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="white"
                          >
                            <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z" />
                          </svg>
                        </div>
                      ) : pl.images?.[0]?.url ? (
                        <img
                          src={pl.images[0].url}
                          alt=""
                          className="sp-recent-img"
                        />
                      ) : (
                        <div className="sp-recent-img sp-recent-img--empty">
                          <MusicIcon />
                        </div>
                      )}
                      <span className="sp-recent-name">{pl.name}</span>
                      <button
                        className="sp-recent-play-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          pl.liked ? openLiked() : openPlaylist(pl);
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="black"
                        >
                          <path d="M7.05 3.606l13.49 7.577a.7.7 0 0 1 0 1.214L7.05 19.974A.7.7 0 0 1 6 19.367V4.633a.7.7 0 0 1 1.05-.607z" />
                        </svg>
                      </button>
                    </button>
                  ))}
                </div>
              )}

              <h2 className="sp-section-title">Your playlists</h2>
              <div className="sp-cards-grid">
                <button className="sp-card" onClick={openLiked}>
                  <div className="sp-card-img sp-card-img--liked">
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 24 24"
                      fill="white"
                    >
                      <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z" />
                    </svg>
                  </div>
                  <div className="sp-card-name">Liked Songs</div>
                  <div className="sp-card-meta">
                    {likedSongs.length} liked songs
                  </div>
                </button>
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    className="sp-card"
                    onClick={() => openPlaylist(pl)}
                  >
                    {pl.images?.[0]?.url ? (
                      <img
                        src={pl.images[0].url}
                        alt=""
                        className="sp-card-img"
                      />
                    ) : (
                      <div className="sp-card-img sp-card-img--empty">
                        <MusicIcon />
                      </div>
                    )}
                    <div className="sp-card-name">{pl.name}</div>
                    <div className="sp-card-meta">
                      By {pl.owner?.display_name || "You"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PLAYLIST */}
          {view === "playlist" && activePlaylist && (
            <div className="sp-view">
              <div className="sp-hero">
                {activePlaylist.images?.[0]?.url ? (
                  <img
                    src={activePlaylist.images[0].url}
                    alt=""
                    className="sp-hero-img"
                  />
                ) : (
                  <div className="sp-hero-img sp-hero-img--empty">
                    <MusicIcon />
                  </div>
                )}
                <div className="sp-hero-info">
                  <div className="sp-hero-label">Playlist</div>
                  <div className="sp-hero-title">{activePlaylist.name}</div>
                  {activePlaylist.description && (
                    <div className="sp-hero-desc">
                      {activePlaylist.description}
                    </div>
                  )}
                  <div className="sp-hero-meta">
                    {activePlaylist.owner?.display_name || "You"} •{" "}
                    {activePlaylist.tracks?.total ??
                      activePlaylist.items?.total ??
                      0}{" "}
                    songs
                  </div>
                </div>
              </div>
              <div className="sp-actions">
                <button
                  className="sp-play-btn"
                  onClick={() =>
                    playlistTracks[0] &&
                    playTrack(playlistTracks[0].track.uri, activePlaylist.uri)
                  }
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="black">
                    <path d="M7.05 3.606l13.49 7.577a.7.7 0 0 1 0 1.214L7.05 19.974A.7.7 0 0 1 6 19.367V4.633a.7.7 0 0 1 1.05-.607z" />
                  </svg>
                </button>
                <button
                  className={`sp-action-btn ${shuffle ? "sp-action-btn--active" : ""}`}
                  onClick={handleShuffle}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M16.069 15.5H14.14a5.75 5.75 0 0 1-4.363-2.013l-5.051-5.94A3.75 3.75 0 0 0 1.875 6H0v2h1.875a1.75 1.75 0 0 1 1.336.619l5.051 5.94A7.75 7.75 0 0 0 14.14 17.5h1.929l-1.065 1.065 1.414 1.414L19.847 16.5l-3.429-3.479-1.414 1.414L16.069 15.5zM0 16h1.875a1.75 1.75 0 0 0 1.336-.619l1.085-1.277 1.514 1.782-1.048 1.233A3.75 3.75 0 0 1 1.875 18H0v2zM16.069 8.5l-1.065-1.065 1.414-1.414L19.847 9.5l-3.429 3.479-1.414-1.414L16.069 10.5H14.14a1.75 1.75 0 0 0-1.336.619l-.547.644-1.514-1.782.547-.644A3.75 3.75 0 0 1 14.14 8.5h1.929z" />
                  </svg>
                </button>
              </div>
              <div className="sp-track-header">
                <span className="sp-th-num">#</span>
                <span className="sp-th-title">Title</span>
                <span className="sp-th-album">Album</span>
                <span className="sp-th-dur">
                  <ClockIcon />
                </span>
              </div>
              {loading ? (
                <div className="sp-loading">
                  <div className="sp-spinner" />
                </div>
              ) : (
                <div className="sp-track-list">
                  {playlistTracks.map((item, i) => (
                    <TrackRow
                      key={i}
                      track={item.track}
                      index={i}
                      contextUri={activePlaylist.uri}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LIKED */}
          {view === "liked" && (
            <div className="sp-view">
              <div className="sp-hero sp-hero--liked">
                <div className="sp-hero-img sp-hero-img--liked">
                  <svg width="60" height="60" viewBox="0 0 24 24" fill="white">
                    <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z" />
                  </svg>
                </div>
                <div className="sp-hero-info">
                  <div className="sp-hero-label">Playlist</div>
                  <div className="sp-hero-title">Liked Songs</div>
                  <div className="sp-hero-meta">{likedSongs.length} songs</div>
                </div>
              </div>
              <div className="sp-actions">
                <button
                  className="sp-play-btn"
                  onClick={() =>
                    likedSongs[0] && playTrack(likedSongs[0].track.uri)
                  }
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="black">
                    <path d="M7.05 3.606l13.49 7.577a.7.7 0 0 1 0 1.214L7.05 19.974A.7.7 0 0 1 6 19.367V4.633a.7.7 0 0 1 1.05-.607z" />
                  </svg>
                </button>
              </div>
              <div className="sp-track-header">
                <span className="sp-th-num">#</span>
                <span className="sp-th-title">Title</span>
                <span className="sp-th-album">Album</span>
                <span className="sp-th-dur">
                  <ClockIcon />
                </span>
              </div>
              <div className="sp-track-list">
                {likedSongs.map((item, i) => (
                  <TrackRow
                    key={i}
                    track={item.track}
                    index={i}
                    offset={10000}
                  />
                ))}
              </div>
            </div>
          )}

          {/* SEARCH */}
          {view === "search" && (
            <div className="sp-view">
              {searchResults?.tracks?.items?.length > 0 ? (
                <>
                  <h2 className="sp-section-title">Songs</h2>
                  <div className="sp-track-list">
                    {searchResults.tracks.items.map((track, i) => (
                      <TrackRow
                        key={i}
                        track={track}
                        index={i}
                        offset={20000}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="sp-empty">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="#535353"
                  >
                    <path d="M10.533 1.279c-5.18 0-9.407 4.14-9.407 9.279s4.226 9.279 9.407 9.279c2.234 0 4.29-.77 5.907-2.058l4.353 4.353a1 1 0 1 0 1.414-1.414l-4.344-4.344a9.157 9.157 0 0 0 2.077-5.816c0-5.14-4.226-9.28-9.407-9.28zm-7.407 9.279c0-4.006 3.302-7.28 7.407-7.28s7.407 3.274 7.407 7.28-3.302 7.279-7.407 7.279-7.407-3.273-7.407-7.28z" />
                  </svg>
                  <p>Search for songs, artists, or albums</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* NOW PLAYING BAR */}
      <div className="sp-bar">
        <div className="sp-bar-left">
          {nowPlaying ? (
            <>
              <img
                src={
                  nowPlaying.album?.images?.[nowPlaying.album.images.length - 1]
                    ?.url
                }
                alt=""
                className="sp-bar-img"
              />
              <div className="sp-bar-info">
                <div className="sp-bar-title">{nowPlaying.name}</div>
                <div className="sp-bar-artist">
                  {nowPlaying.artists?.map((a) => a.name).join(", ")}
                </div>
              </div>
              <button className="sp-bar-heart">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#1db954">
                  <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z" />
                </svg>
              </button>
            </>
          ) : (
            <div />
          )}
        </div>

        <div className="sp-bar-center">
          <div className="sp-bar-controls">
            <button
              className={`sp-bc ${shuffle ? "sp-bc--active" : ""}`}
              onClick={handleShuffle}
              title="Shuffle"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M16.069 15.5H14.14a5.75 5.75 0 0 1-4.363-2.013l-5.051-5.94A3.75 3.75 0 0 0 1.875 6H0v2h1.875a1.75 1.75 0 0 1 1.336.619l5.051 5.94A7.75 7.75 0 0 0 14.14 17.5h1.929l-1.065 1.065 1.414 1.414L19.847 16.5l-3.429-3.479-1.414 1.414L16.069 15.5zM0 16h1.875a1.75 1.75 0 0 0 1.336-.619l1.085-1.277 1.514 1.782-1.048 1.233A3.75 3.75 0 0 1 1.875 18H0v2zM16.069 8.5l-1.065-1.065 1.414-1.414L19.847 9.5l-3.429 3.479-1.414-1.414L16.069 10.5H14.14a1.75 1.75 0 0 0-1.336.619l-.547.644-1.514-1.782.547-.644A3.75 3.75 0 0 1 14.14 8.5h1.929z" />
              </svg>
            </button>
            <button className="sp-bc" onClick={handlePrev} title="Previous">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M3.3 1a.7.7 0 0 1 .7.7v8.15l9.95-8.744a.75.75 0 0 1 1.25.562v19.064a.75.75 0 0 1-1.25.562L4 12.646V20.3a.7.7 0 0 1-1.4 0V1.7a.7.7 0 0 1 .7-.7z" />
              </svg>
            </button>
            <button className="sp-bc sp-bc--play" onClick={handlePlayPause}>
              {isPlaying ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="black">
                  <path d="M5.7 3a.7.7 0 0 0-.7.7v16.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V3.7a.7.7 0 0 0-.7-.7H5.7zm10 0a.7.7 0 0 0-.7.7v16.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V3.7a.7.7 0 0 0-.7-.7h-2.6z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="black">
                  <path d="M7.05 3.606l13.49 7.577a.7.7 0 0 1 0 1.214L7.05 19.974A.7.7 0 0 1 6 19.367V4.633a.7.7 0 0 1 1.05-.607z" />
                </svg>
              )}
            </button>
            <button className="sp-bc" onClick={handleNext} title="Next">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M20.7 1a.7.7 0 0 1 .7.7v18.6a.7.7 0 0 1-1.4 0V12.646l-9.95 8.658A.75.75 0 0 1 8.8 20.74V1.562A.75.75 0 0 1 10.05 1l9.95 8.15V1.7a.7.7 0 0 1 .7-.7z" />
              </svg>
            </button>
            <button
              className={`sp-bc ${repeat !== "off" ? "sp-bc--active" : ""}`}
              onClick={handleRepeat}
              title="Repeat"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M0 13.151a2.554 2.554 0 0 0 2.546 2.554h9.458v2l3.484-2.827-3.484-2.828v2H2.546A.554.554 0 0 1 2 13.15V6h6V4H2.546A2.554 2.554 0 0 0 0 6.554v6.597zm21.454-8.697H12v-2l-3.484 2.827L12 8.108v-2h9.454c.306 0 .546.24.546.546v7.096h-6v2h6A2.554 2.554 0 0 0 24 13.15V6.554a2.554 2.554 0 0 0-2.546-2.554v.454z" />
              </svg>
              {repeat === "track" && <span className="sp-repeat-dot" />}
            </button>
          </div>
          <div className="sp-bar-progress">
            <span className="sp-bar-time">{fmtMs(progress)}</span>
            <div className="sp-bar-track" onClick={handleSeek}>
              <div className="sp-bar-fill" style={{ width: `${pct}%` }} />
              <div className="sp-bar-thumb" style={{ left: `${pct}%` }} />
            </div>
            <span className="sp-bar-time">{fmtMs(duration)}</span>
          </div>
        </div>

        <div className="sp-bar-right">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#b3b3b3">
            <path d="M12 3.75a.75.75 0 0 0-1.2-.6L5.55 7.5H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h3.55l5.25 4.35a.75.75 0 0 0 1.2-.6V3.75zm2.76 2.36a.75.75 0 0 1 1.06.04 8.5 8.5 0 0 1 0 11.7.75.75 0 1 1-1.1-1.02 7 7 0 0 0 0-9.66.75.75 0 0 1 .04-1.06z" />
          </svg>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => handleVolume(Number(e.target.value))}
            className="sp-vol"
          />
        </div>
      </div>
    </div>
  );
}
