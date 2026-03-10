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
  const [view, setView] = useState("home"); // home | playlist | search | liked
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
  const searchTimeout = useRef(null);
  const progressInterval = useRef(null);

  // Fetch initial data
  useEffect(() => {
    const init = async () => {
      const [profile, pls, liked, player] = await Promise.all([
        spotifyFetch("/me"),
        spotifyFetch("/me/playlists?limit=50"),
        spotifyFetch("/me/tracks?limit=50"),
        spotifyFetch("/me/player"),
      ]);
      if (profile) setUserProfile(profile);
      if (pls?.items) setPlaylists(pls.items);
      if (liked?.items) setLikedSongs(liked.items);
      if (player) {
        if (player.item) setNowPlaying(player.item);
        if (player.is_playing !== undefined) setIsPlaying(player.is_playing);
        if (player.progress_ms !== undefined) setProgress(player.progress_ms);
        if (player.item?.duration_ms) setDuration(player.item.duration_ms);
        if (player.device?.volume_percent !== undefined)
          setVolume(player.device.volume_percent);
      }
    };
    init();
  }, []);

  // Poll now playing
  const fetchPlayer = useCallback(async () => {
    const data = await spotifyFetch("/me/player");
    if (data && data.item) {
      setNowPlaying(data.item);
      setIsPlaying(data.is_playing);
      setProgress(data.progress_ms || 0);
      setDuration(data.item.duration_ms || 0);
      setVolume(data.device?.volume_percent ?? volume);
    }
  }, [volume]);

  useEffect(() => {
    const interval = setInterval(fetchPlayer, 5000);
    return () => clearInterval(interval);
  }, [fetchPlayer]);

  // Progress bar tick
  useEffect(() => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    if (isPlaying) {
      progressInterval.current = setInterval(() => {
        setProgress((p) => Math.min(p + 1000, duration));
      }, 1000);
    }
    return () => clearInterval(progressInterval.current);
  }, [isPlaying, duration]);

  const playTrack = async (uri, contextUri = null) => {
    const body = contextUri
      ? { context_uri: contextUri, offset: { uri } }
      : { uris: [uri] };
    await spotifyFetch("/me/player/play", {
      method: "PUT",
      body: JSON.stringify(body),
    });
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

  const handleSeek = async (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const ms = Math.floor(pct * duration);
    setProgress(ms);
    await spotifyFetch(`/me/player/seek?position_ms=${ms}`, { method: "PUT" });
  };

  const openPlaylist = async (pl) => {
    setActivePlaylist(pl);
    setView("playlist");
    setLoading(true);
    const data = await spotifyFetch(`/playlists/${pl.id}/tracks?limit=100`);
    if (data?.items) setPlaylistTracks(data.items.filter((i) => i.track));
    setLoading(false);
  };

  const openLiked = async () => {
    setView("liked");
  };

  const handleSearch = (q) => {
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      const data = await spotifyFetch(
        `/search?q=${encodeURIComponent(q)}&type=track,artist,album&limit=10`,
      );
      if (data) setSearchResults(data);
    }, 400);
  };

  const formatMs = (ms) => {
    if (!ms) return "0:00";
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="sp-root">
      {/* SIDEBAR */}
      <div className="sp-sidebar">
        <div className="sp-sidebar-top">
          <div className="sp-logo">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="#1DB954">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            <span>Spotify</span>
          </div>

          {/* Search */}
          <div className="sp-search-wrap">
            <input
              className="sp-search"
              placeholder="Search songs, artists..."
              value={searchQuery}
              onChange={(e) => {
                handleSearch(e.target.value);
                if (e.target.value) setView("search");
              }}
              onFocus={() => searchQuery && setView("search")}
            />
            <span className="sp-search-icon">🔍</span>
          </div>

          {/* Nav */}
          <div className="sp-nav">
            <button
              className={`sp-nav-btn ${view === "home" ? "active" : ""}`}
              onClick={() => setView("home")}
            >
              <span>⊞</span> Home
            </button>
            <button
              className={`sp-nav-btn ${view === "liked" ? "active" : ""}`}
              onClick={openLiked}
            >
              <span>♥</span> Liked Songs
            </button>
          </div>
        </div>

        {/* Playlists */}
        <div className="sp-library">
          <div className="sp-library-header">Your Library</div>
          <div className="sp-playlist-list">
            {playlists.map((pl) => (
              <button
                key={pl.id}
                className={`sp-playlist-item ${activePlaylist?.id === pl.id ? "active" : ""}`}
                onClick={() => openPlaylist(pl)}
              >
                {pl.images?.[0]?.url ? (
                  <img src={pl.images[0].url} alt="" className="sp-pl-img" />
                ) : (
                  <div className="sp-pl-img sp-pl-img--empty">♫</div>
                )}
                <div className="sp-pl-info">
                  <div className="sp-pl-name">{pl.name}</div>
                  <div className="sp-pl-meta">{pl.tracks.total} songs</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <button className="sp-disconnect" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>

      {/* MAIN CONTENT */}
      <div className="sp-main">
        {/* HOME VIEW */}
        {view === "home" && (
          <div className="sp-view">
            <div className="sp-view-header">
              Good{" "}
              {new Date().getHours() < 12
                ? "morning"
                : new Date().getHours() < 18
                  ? "afternoon"
                  : "evening"}
              {userProfile?.display_name ? `, ${userProfile.display_name}` : ""}
              !
            </div>
            <div className="sp-section-title">Your Playlists</div>
            <div className="sp-cards-grid">
              {playlists.slice(0, 8).map((pl) => (
                <button
                  key={pl.id}
                  className="sp-card"
                  onClick={() => openPlaylist(pl)}
                >
                  {pl.images?.[0]?.url ? (
                    <img
                      src={pl.images[0].url}
                      alt={pl.name}
                      className="sp-card-img"
                    />
                  ) : (
                    <div className="sp-card-img sp-card-img--empty">♫</div>
                  )}
                  <div className="sp-card-name">{pl.name}</div>
                </button>
              ))}
              <button className="sp-card" onClick={openLiked}>
                <div className="sp-card-img sp-card-img--liked">♥</div>
                <div className="sp-card-name">Liked Songs</div>
              </button>
            </div>
          </div>
        )}

        {/* PLAYLIST VIEW */}
        {view === "playlist" && activePlaylist && (
          <div className="sp-view">
            <div className="sp-playlist-header">
              <button className="sp-back" onClick={() => setView("home")}>
                ← Back
              </button>
              {activePlaylist.images?.[0]?.url && (
                <img
                  src={activePlaylist.images[0].url}
                  alt=""
                  className="sp-playlist-hero-img"
                />
              )}
              <div className="sp-playlist-hero-info">
                <div className="sp-playlist-hero-name">
                  {activePlaylist.name}
                </div>
                <div className="sp-playlist-hero-meta">
                  {activePlaylist.tracks.total} songs
                </div>
                <button
                  className="sp-play-all"
                  onClick={() =>
                    playTrack(playlistTracks[0]?.track?.uri, activePlaylist.uri)
                  }
                >
                  ▶ Play All
                </button>
              </div>
            </div>
            {loading ? (
              <div className="sp-loading">Loading...</div>
            ) : (
              <div className="sp-track-list">
                {playlistTracks.map((item, i) => (
                  <button
                    key={i}
                    className={`sp-track ${nowPlaying?.id === item.track.id ? "playing" : ""}`}
                    onClick={() =>
                      playTrack(item.track.uri, activePlaylist.uri)
                    }
                  >
                    <span className="sp-track-num">
                      {nowPlaying?.id === item.track.id && isPlaying
                        ? "▶"
                        : i + 1}
                    </span>
                    {item.track.album?.images?.[2]?.url && (
                      <img
                        src={item.track.album.images[2].url}
                        alt=""
                        className="sp-track-img"
                      />
                    )}
                    <div className="sp-track-info">
                      <div className="sp-track-name">{item.track.name}</div>
                      <div className="sp-track-artist">
                        {item.track.artists.map((a) => a.name).join(", ")}
                      </div>
                    </div>
                    <div className="sp-track-duration">
                      {formatMs(item.track.duration_ms)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LIKED SONGS VIEW */}
        {view === "liked" && (
          <div className="sp-view">
            <div className="sp-playlist-header">
              <button className="sp-back" onClick={() => setView("home")}>
                ← Back
              </button>
              <div className="sp-liked-hero">
                <div className="sp-liked-hero-icon">♥</div>
              </div>
              <div className="sp-playlist-hero-info">
                <div className="sp-playlist-hero-name">Liked Songs</div>
                <div className="sp-playlist-hero-meta">
                  {likedSongs.length} songs
                </div>
                {likedSongs[0] && (
                  <button
                    className="sp-play-all"
                    onClick={() => playTrack(likedSongs[0].track.uri)}
                  >
                    ▶ Play All
                  </button>
                )}
              </div>
            </div>
            <div className="sp-track-list">
              {likedSongs.map((item, i) => (
                <button
                  key={i}
                  className={`sp-track ${nowPlaying?.id === item.track.id ? "playing" : ""}`}
                  onClick={() => playTrack(item.track.uri)}
                >
                  <span className="sp-track-num">
                    {nowPlaying?.id === item.track.id && isPlaying
                      ? "▶"
                      : i + 1}
                  </span>
                  {item.track.album?.images?.[2]?.url && (
                    <img
                      src={item.track.album.images[2].url}
                      alt=""
                      className="sp-track-img"
                    />
                  )}
                  <div className="sp-track-info">
                    <div className="sp-track-name">{item.track.name}</div>
                    <div className="sp-track-artist">
                      {item.track.artists.map((a) => a.name).join(", ")}
                    </div>
                  </div>
                  <div className="sp-track-duration">
                    {formatMs(item.track.duration_ms)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SEARCH VIEW */}
        {view === "search" && (
          <div className="sp-view">
            <div className="sp-view-header">Search Results</div>
            {searchResults ? (
              <>
                {searchResults.tracks?.items?.length > 0 && (
                  <>
                    <div className="sp-section-title">Songs</div>
                    <div className="sp-track-list">
                      {searchResults.tracks.items.map((track, i) => (
                        <button
                          key={i}
                          className={`sp-track ${nowPlaying?.id === track.id ? "playing" : ""}`}
                          onClick={() => playTrack(track.uri)}
                        >
                          <span className="sp-track-num">
                            {nowPlaying?.id === track.id && isPlaying
                              ? "▶"
                              : i + 1}
                          </span>
                          {track.album?.images?.[2]?.url && (
                            <img
                              src={track.album.images[2].url}
                              alt=""
                              className="sp-track-img"
                            />
                          )}
                          <div className="sp-track-info">
                            <div className="sp-track-name">{track.name}</div>
                            <div className="sp-track-artist">
                              {track.artists.map((a) => a.name).join(", ")}
                            </div>
                          </div>
                          <div className="sp-track-duration">
                            {formatMs(track.duration_ms)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="sp-loading">Type to search...</div>
            )}
          </div>
        )}
      </div>

      {/* NOW PLAYING BAR */}
      {nowPlaying && (
        <div className="sp-now-playing">
          <div className="sp-np-left">
            <img
              src={nowPlaying.album?.images?.[2]?.url}
              alt=""
              className="sp-np-img"
            />
            <div className="sp-np-info">
              <div className="sp-np-title">{nowPlaying.name}</div>
              <div className="sp-np-artist">
                {nowPlaying.artists?.map((a) => a.name).join(", ")}
              </div>
            </div>
            <button className="sp-np-heart">♥</button>
          </div>

          <div className="sp-np-center">
            <div className="sp-np-controls">
              <button className="sp-ctrl-btn" onClick={handlePrev}>
                ⏮
              </button>
              <button
                className="sp-ctrl-btn sp-ctrl-play"
                onClick={handlePlayPause}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
              <button className="sp-ctrl-btn" onClick={handleNext}>
                ⏭
              </button>
            </div>
            <div className="sp-progress-row">
              <span className="sp-time">{formatMs(progress)}</span>
              <div className="sp-progress-bar" onClick={handleSeek}>
                <div
                  className="sp-progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
                <div
                  className="sp-progress-thumb"
                  style={{ left: `${progressPct}%` }}
                />
              </div>
              <span className="sp-time">{formatMs(duration)}</span>
            </div>
          </div>

          <div className="sp-np-right">
            <span className="sp-vol-icon">🔈</span>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => handleVolume(Number(e.target.value))}
              className="sp-vol-slider"
            />
            <span className="sp-vol-icon">🔊</span>
          </div>
        </div>
      )}
    </div>
  );
}
