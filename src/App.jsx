import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Play, Plus, Search, Bell, X, Pause, ChevronLeft,
  Volume2, VolumeX, Volume1, Maximize, Minimize,
  RotateCcw, RotateCw, Loader2,
} from "lucide-react";

// ============================================================================
// MarsFlix — talks to the FastAPI backend, which signs B2 URLs on demand.
// Set VITE_API_URL in .env.local (no trailing slash).
// ============================================================================

const API = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1614728263952-84ea256f9679?w=800&q=80";

const SKIP = 10; // seconds

const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
};

export default function MarsFlix() {
  const [catalogue, setCatalogue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [openSeries, setOpenSeries] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/api/catalogue`)
      .then((r) => {
        if (!r.ok) throw new Error(`API returned ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setCatalogue(data);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const playFilm = useCallback(async (item) => {
    try {
      const r = await fetch(`${API}/api/stream/${item.id}`);
      if (!r.ok) throw new Error(`Couldn't load ${item.title}`);
      const { url, title } = await r.json();
      setNowPlaying({ url, title });
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const playEpisode = useCallback(async (show, season, ep) => {
    try {
      const r = await fetch(`${API}/api/stream/${show.id}/${season}/${ep}`);
      if (!r.ok) throw new Error(`Couldn't load episode ${ep}`);
      const { url, title } = await r.json();

      const eps = show.seasons[season];
      const idx = eps.findIndex((e) => e.ep === ep);
      const next = idx >= 0 && idx < eps.length - 1
        ? { show, season, ep: eps[idx + 1].ep }
        : null;

      setNowPlaying({ url, title, next });
      setOpenSeries(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const openTile = (item) =>
    item.type === "series" ? setOpenSeries(item) : playFilm(item);

  const playNext = () => {
    if (nowPlaying?.next) {
      const { show, season, ep } = nowPlaying.next;
      playEpisode(show, season, ep);
    }
  };

  const featured = catalogue[0];

  return (
    <div style={{ background: "#0a0605", minHeight: "100vh", color: "#f5efe9", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        .mf-row::-webkit-scrollbar { height: 0; }
        .mf-card { transition: transform .25s ease, box-shadow .25s ease; }
        @media (hover: hover) {
          .mf-card:hover { transform: scale(1.08); z-index: 5; box-shadow: 0 12px 40px rgba(0,0,0,.7); }
          .mf-btn:hover { opacity: .85; }
          .mf-ep:hover { background: rgba(120,110,102,.22) !important; }
        }
        .mf-btn { transition: opacity .15s, transform .15s; cursor: pointer; -webkit-tap-highlight-color: transparent; }
        .mf-btn:active { transform: scale(.94); }
        .mf-btn:focus-visible, .mf-card:focus-visible { outline: 2px solid #e0532f; outline-offset: 3px; }
        @keyframes mf-pulse { 0%,100% { opacity:.35 } 50% { opacity:.7 } }
        @keyframes mf-spin { to { transform: rotate(360deg) } }
        .mf-skel { background: rgba(120,110,102,.25); animation: mf-pulse 1.4s ease-in-out infinite; }
        .mf-spin { animation: mf-spin 1s linear infinite; }
        input[type=range].mf-vol { -webkit-appearance: none; appearance: none; background: transparent; height: 20px; }
        input[type=range].mf-vol::-webkit-slider-runnable-track { height: 4px; border-radius: 3px; background: rgba(255,255,255,.3); }
        input[type=range].mf-vol::-webkit-slider-thumb { -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%; background: #f5efe9; margin-top: -4.5px; }
        input[type=range].mf-vol::-moz-range-track { height: 4px; border-radius: 3px; background: rgba(255,255,255,.3); }
        input[type=range].mf-vol::-moz-range-thumb { width: 13px; height: 13px; border: none; border-radius: 50%; background: #f5efe9; }
        @media (prefers-reduced-motion: reduce){ .mf-card, .mf-btn, .mf-skel, .mf-spin { transition: none; animation: none; } }
      `}</style>

      <Nav />

      {loading && <SkeletonHome />}

      {!loading && error && !catalogue.length && (
        <Notice title="Can't reach the library" body={`${error}. Check the backend is running at ${API}.`} />
      )}

      {!loading && !error && !catalogue.length && (
        <Notice title="Nothing here yet" body="Upload some videos to your bucket, then refresh the catalogue." />
      )}

      {!loading && featured && (
        <>
          <Hero
            item={featured}
            onPlay={() => openTile(featured)}
            onInfo={() => featured.type === "series" && setOpenSeries(featured)}
          />
          <div style={{ padding: "0 4vw", marginTop: -60, position: "relative", zIndex: 2 }}>
            <Row title="Everything" items={catalogue} onPick={openTile} />
            {catalogue.some((c) => c.type === "series") && (
              <Row title="Series" items={catalogue.filter((c) => c.type === "series")} onPick={openTile} />
            )}
            {catalogue.some((c) => c.type === "film") && (
              <Row title="Films" items={catalogue.filter((c) => c.type === "film")} onPick={openTile} />
            )}
          </div>
        </>
      )}

      <footer style={{ padding: "60px 4vw 40px", color: "#8a7d74", fontSize: 13 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: 1, color: "#e0532f", marginBottom: 8 }}>
          MARSFLIX
        </div>
        {catalogue.length} title{catalogue.length === 1 ? "" : "s"} in the library.
      </footer>

      {openSeries && (
        <SeriesView show={openSeries} onPick={playEpisode} onClose={() => setOpenSeries(null)} />
      )}

      {nowPlaying && (
        <Player
          item={nowPlaying}
          onNext={nowPlaying.next ? playNext : null}
          onClose={() => setNowPlaying(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function useIsMobile(bp = 700) {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < bp : false);
  useEffect(() => {
    const on = () => setM(window.innerWidth < bp);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [bp]);
  return m;
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center",
      gap: isMobile ? 14 : 28, padding: isMobile ? "14px 5vw" : "16px 4vw",
      background: scrolled ? "rgba(10,6,5,.92)" : "linear-gradient(to bottom, rgba(10,6,5,.9), transparent)",
      backdropFilter: scrolled ? "blur(8px)" : "none", transition: "background .3s",
    }}>
      <span style={{
        fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
        fontSize: isMobile ? 20 : 26, letterSpacing: 1.5, color: "#e0532f", whiteSpace: "nowrap",
      }}>
        MARSFLIX
      </span>

      {!isMobile && (
        <div style={{ display: "flex", gap: 20, fontSize: 14, color: "#cbbfb6" }}>
          {["Home", "Series", "Films", "My List"].map((t, i) => (
            <span key={t} className="mf-btn" style={{ color: i === 0 ? "#f5efe9" : "#cbbfb6", fontWeight: i === 0 ? 600 : 400, whiteSpace: "nowrap" }}>{t}</span>
          ))}
        </div>
      )}

      <div style={{ marginLeft: "auto", display: "flex", gap: isMobile ? 16 : 18, alignItems: "center", flexShrink: 0 }}>
        <Search size={20} color="#cbbfb6" />
        {!isMobile && <Bell size={20} color="#cbbfb6" />}
        <div style={{ width: 30, height: 30, borderRadius: 6, background: "linear-gradient(135deg,#e0532f,#7a2418)", flexShrink: 0 }} />
      </div>
    </nav>
  );
}

function Notice({ title, body }) {
  return (
    <div style={{ padding: "18vh 5vw", maxWidth: 520 }}>
      <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, margin: "0 0 10px" }}>{title}</h2>
      <p style={{ color: "#9a8d84", lineHeight: 1.5, margin: 0 }}>{body}</p>
    </div>
  );
}

function SkeletonHome() {
  return (
    <div>
      <div className="mf-skel" style={{ height: "60vh", minHeight: 380 }} />
      <div style={{ padding: "24px 4vw", display: "flex", gap: 10, overflow: "hidden" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="mf-skel" style={{ width: 220, height: 130, borderRadius: 8, flexShrink: 0 }} />
        ))}
      </div>
    </div>
  );
}

function Hero({ item, onPlay, onInfo }) {
  const bg = item.hero || item.poster || FALLBACK_IMG;
  const seasonCount = Object.keys(item.seasons || {}).length;
  const meta = item.type === "series"
    ? `${seasonCount} season${seasonCount === 1 ? "" : "s"} · ${item.episode_count} episodes`
    : "Film";

  return (
    <div style={{ position: "relative", height: "82vh", minHeight: 460 }}>
      <img src={bg} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0a0605 8%, transparent 55%), linear-gradient(to right, rgba(10,6,5,.9) 0%, transparent 60%)" }} />
      <div style={{ position: "absolute", bottom: 120, left: "5vw", right: "5vw", maxWidth: 560 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, letterSpacing: 3, color: "#e0532f", fontWeight: 600, marginBottom: 14 }}>
          <span style={{ width: 22, height: 2, background: "#e0532f" }} /> MARSFLIX ORIGINAL
        </div>
        <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(34px,7vw,72px)", fontWeight: 700, margin: "0 0 16px", lineHeight: 1 }}>{item.title}</h1>
        {item.desc && <p style={{ fontSize: "clamp(14px,2.2vw,17px)", lineHeight: 1.5, color: "#d8ccc2", marginBottom: 12 }}>{item.desc}</p>}
        <p style={{ fontSize: 13, color: "#9a8d84", marginBottom: 24 }}>{meta}</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="mf-btn" onClick={onPlay} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f5efe9", color: "#0a0605", border: "none", padding: "13px 28px", borderRadius: 6, fontSize: 16, fontWeight: 700 }}>
            <Play size={20} fill="#0a0605" /> {item.type === "series" ? "Episodes" : "Play"}
          </button>
          <button className="mf-btn" onClick={onInfo} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(120,110,102,.35)", color: "#f5efe9", border: "none", padding: "13px 24px", borderRadius: 6, fontSize: 16, fontWeight: 600 }}>
            <Plus size={20} /> My List
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ title, items, onPick }) {
  const isMobile = useIsMobile();
  if (!items.length) return null;
  const w = isMobile ? 168 : 220;
  const h = isMobile ? 99 : 130;

  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: isMobile ? 17 : 20, fontWeight: 600, margin: "0 0 14px", fontFamily: "'Space Grotesk',sans-serif" }}>{title}</h2>
      <div className="mf-row" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 10, scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch" }}>
        {items.map((it) => (
          <div
            key={it.id}
            className="mf-card mf-btn"
            role="button"
            tabIndex={0}
            onClick={() => onPick(it)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(it))}
            style={{ position: "relative", flex: "0 0 auto", width: w, height: h, borderRadius: 8, overflow: "hidden", cursor: "pointer", background: "rgba(120,110,102,.2)", scrollSnapAlign: "start" }}
          >
            <img src={it.poster || FALLBACK_IMG} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(10,6,5,.85), transparent 55%)" }} />
            <span style={{ position: "absolute", bottom: 10, left: 12, fontSize: 14, fontWeight: 600 }}>{it.title}</span>
            {it.type === "series" && (
              <span style={{ position: "absolute", top: 8, right: 10, fontSize: 11, fontWeight: 600, color: "#e0532f", background: "rgba(10,6,5,.75)", padding: "3px 7px", borderRadius: 4 }}>
                {it.episode_count} EP
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SeriesView({ show, onPick, onClose }) {
  const seasons = Object.keys(show.seasons).sort((a, b) => +a - +b);
  const [season, setSeason] = useState(seasons[0]);
  const isMobile = useIsMobile();

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const banner = show.hero || show.poster;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(5,3,2,.97)", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      {banner && (
        <div style={{ position: "relative", height: isMobile ? "28vh" : "38vh", minHeight: 180 }}>
          <img src={banner} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(5,3,2,1) 5%, transparent 80%)" }} />
        </div>
      )}

      <button className="mf-btn" onClick={onClose} aria-label="Close"
        style={{ position: "fixed", top: 16, right: 16, zIndex: 2, background: "rgba(10,6,5,.75)", border: "none", borderRadius: 8, padding: 8, color: "#cbbfb6", display: "flex" }}>
        <X size={24} />
      </button>

      <div style={{ padding: "0 5vw 60px", marginTop: banner ? -50 : 60, position: "relative" }}>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(26px,5vw,44px)", margin: "0 0 10px" }}>{show.title}</h2>
        {show.desc && <p style={{ color: "#d8ccc2", maxWidth: 640, lineHeight: 1.5, marginBottom: 24, fontSize: "clamp(14px,2vw,16px)" }}>{show.desc}</p>}

        {seasons.length > 1 && (
          <div style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
            {seasons.map((s) => (
              <button key={s} className="mf-btn" onClick={() => setSeason(s)}
                style={{ background: s === season ? "#e0532f" : "rgba(120,110,102,.25)", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 6, fontWeight: 600, fontSize: 14 }}>
                Season {s}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 900 }}>
          {show.seasons[season].map((e) => (
            <div
              key={e.ep}
              className="mf-btn mf-ep"
              role="button"
              tabIndex={0}
              onClick={() => onPick(show, season, e.ep)}
              onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), onPick(show, season, e.ep))}
              style={{ display: "flex", gap: 14, alignItems: "center", padding: 12, borderRadius: 8, background: "rgba(120,110,102,.12)", transition: "background .15s", minHeight: 56 }}
            >
              <span style={{ width: 26, textAlign: "center", color: "#9a8d84", fontSize: 17, fontFamily: "'Space Grotesk',sans-serif", flexShrink: 0 }}>{e.ep}</span>
              {e.still && !isMobile && (
                <img src={e.still} alt="" style={{ width: 140, height: 79, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
              )}
              <span style={{ fontWeight: 600, fontSize: 15 }}>{e.title}</span>
              <Play size={18} style={{ marginLeft: "auto", flexShrink: 0 }} color="#e0532f" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Player({ item, onClose, onNext }) {
  const videoRef = useRef(null);
  const shellRef = useRef(null);
  const hideTimer = useRef(null);
  const isMobile = useIsMobile();

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [flash, setFlash] = useState(null); // 'back' | 'forward'

  /* --- control visibility --- */
  const showUi = useCallback(() => {
    setUiVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) setUiVisible(false);
    }, 3000);
  }, []);

  useEffect(() => {
    showUi();
    return () => clearTimeout(hideTimer.current);
  }, [showUi]);

  /* --- actions --- */
  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
    showUi();
  }, [showUi]);

  const skip = useCallback((delta) => {
    const v = videoRef.current;
    if (!v || !isFinite(v.duration)) return;
    v.currentTime = Math.min(Math.max(v.currentTime + delta, 0), v.duration);
    setFlash(delta < 0 ? "back" : "forward");
    setTimeout(() => setFlash(null), 450);
    showUi();
  }, [showUi]);

  const setVol = useCallback((val) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setMuted(val === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setMuted(next);
    if (!next && v.volume === 0) { v.volume = 0.6; setVolume(0.6); }
    showUi();
  }, [showUi]);

  const toggleFullscreen = useCallback(async () => {
    const shell = shellRef.current;
    const v = videoRef.current;
    if (!shell) return;
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (shell.requestFullscreen) await shell.requestFullscreen();
        else if (shell.webkitRequestFullscreen) shell.webkitRequestFullscreen();
        else if (v?.webkitEnterFullscreen) v.webkitEnterFullscreen(); // iOS Safari
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    } catch { /* gesture rejected */ }
    showUi();
  }, [showUi]);

  useEffect(() => {
    const on = () => setFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", on);
    document.addEventListener("webkitfullscreenchange", on);
    return () => {
      document.removeEventListener("fullscreenchange", on);
      document.removeEventListener("webkitfullscreenchange", on);
    };
  }, []);

  /* --- keyboard --- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT") return;
      switch (e.key) {
        case "Escape":
          if (!document.fullscreenElement) onClose();
          break;
        case " ":
        case "k":
          e.preventDefault(); toggle(); break;
        case "ArrowLeft": e.preventDefault(); skip(-SKIP); break;
        case "ArrowRight": e.preventDefault(); skip(SKIP); break;
        case "j": skip(-SKIP); break;
        case "l": skip(SKIP); break;
        case "m": toggleMute(); break;
        case "f": toggleFullscreen(); break;
        case "ArrowUp": e.preventDefault(); setVol(Math.min(volume + 0.1, 1)); break;
        case "ArrowDown": e.preventDefault(); setVol(Math.max(volume - 0.1, 0)); break;
        default: break;
      }
      showUi();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, toggle, skip, toggleMute, toggleFullscreen, setVol, volume, showUi]);

  /* --- progress + buffer --- */
  const onTime = (e) => {
    const v = e.target;
    if (!scrubbing) setCurrent(v.currentTime);
    if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
  };

  const seekFromEvent = (e) => {
    const v = videoRef.current;
    if (!v || !isFinite(v.duration)) return;
    const bar = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const p = Math.min(Math.max((clientX - bar.left) / bar.width, 0), 1);
    const t = p * v.duration;
    setCurrent(t);
    v.currentTime = t;
  };

  const pct = duration ? (current / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  const iconBtn = {
    background: "none", border: "none", color: "#f5efe9",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 8, minWidth: 44, minHeight: 44,
  };

  return (
    <div
      ref={shellRef}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "#000", display: "flex", flexDirection: "column" }}
      onMouseMove={showUi}
      onTouchStart={showUi}
    >
      {/* top bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 3,
        display: "flex", alignItems: "center", gap: 12,
        padding: isMobile ? "10px 12px" : "16px 24px",
        background: "linear-gradient(to bottom, rgba(0,0,0,.75), transparent)",
        opacity: uiVisible ? 1 : 0, transition: "opacity .25s",
        pointerEvents: uiVisible ? "auto" : "none",
      }}>
        <button className="mf-btn" onClick={onClose} aria-label="Back" style={iconBtn}>
          <ChevronLeft size={26} />
        </button>
        <span style={{
          fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600,
          fontSize: isMobile ? 14 : 17, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item.title}
        </span>
      </div>

      {/* video */}
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
        {failed ? (
          <div style={{ textAlign: "center", color: "#9a8d84", maxWidth: 380, padding: "0 24px" }}>
            <p style={{ fontWeight: 600, color: "#f5efe9", marginBottom: 6 }}>This won't play</p>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>
              The file needs to be H.264 video with AAC audio in an MP4 container.
            </p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              src={item.url}
              autoPlay
              playsInline
              muted={muted}
              onClick={() => (isMobile ? (uiVisible ? toggle() : showUi()) : toggle())}
              onDoubleClick={!isMobile ? toggleFullscreen : undefined}
              onPlay={() => { setPlaying(true); showUi(); }}
              onPause={() => { setPlaying(false); setUiVisible(true); }}
              onWaiting={() => setWaiting(true)}
              onPlaying={() => setWaiting(false)}
              onCanPlay={() => setWaiting(false)}
              onLoadedMetadata={(e) => setDuration(e.target.duration || 0)}
              onDurationChange={(e) => setDuration(e.target.duration || 0)}
              onError={() => { setFailed(true); setWaiting(false); }}
              onEnded={() => onNext && onNext()}
              onTimeUpdate={onTime}
              onProgress={onTime}
              style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
            />

            {/* double-tap skip zones (mobile) */}
            {isMobile && (
              <>
                <div onDoubleClick={() => skip(-SKIP)}
                  style={{ position: "absolute", left: 0, top: 0, bottom: 90, width: "30%" }} />
                <div onDoubleClick={() => skip(SKIP)}
                  style={{ position: "absolute", right: 0, top: 0, bottom: 90, width: "30%" }} />
              </>
            )}

            {flash && (
              <div style={{
                position: "absolute", top: "50%", transform: "translateY(-50%)",
                [flash === "back" ? "left" : "right"]: "12%",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                color: "#f5efe9", pointerEvents: "none",
                background: "rgba(0,0,0,.5)", borderRadius: "50%", padding: 18,
              }}>
                {flash === "back" ? <RotateCcw size={28} /> : <RotateCw size={28} />}
                <span style={{ fontSize: 12, fontWeight: 600 }}>{SKIP}s</span>
              </div>
            )}

            {waiting && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <Loader2 className="mf-spin" size={44} color="#e0532f" />
              </div>
            )}
          </>
        )}
      </div>

      {/* controls */}
      {!failed && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 3,
          padding: isMobile ? "0 10px 12px" : "0 24px 18px",
          background: "linear-gradient(to top, rgba(0,0,0,.85), transparent)",
          opacity: uiVisible ? 1 : 0, transition: "opacity .25s",
          pointerEvents: uiVisible ? "auto" : "none",
        }}>
          {/* scrub bar */}
          <div
            onMouseDown={(e) => { setScrubbing(true); seekFromEvent(e); }}
            onMouseMove={(e) => scrubbing && seekFromEvent(e)}
            onMouseUp={() => setScrubbing(false)}
            onMouseLeave={() => setScrubbing(false)}
            onTouchStart={(e) => { setScrubbing(true); seekFromEvent(e); }}
            onTouchMove={(e) => seekFromEvent(e)}
            onTouchEnd={() => setScrubbing(false)}
            style={{ padding: "12px 0 8px", cursor: "pointer", touchAction: "none" }}
          >
            <div style={{ position: "relative", height: 4, background: "rgba(255,255,255,.22)", borderRadius: 3 }}>
              <div style={{ position: "absolute", inset: 0, width: `${bufPct}%`, background: "rgba(255,255,255,.35)", borderRadius: 3 }} />
              <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "#e0532f", borderRadius: 3 }} />
              <div style={{
                position: "absolute", left: `${pct}%`, top: "50%",
                width: 13, height: 13, marginLeft: -6.5, marginTop: -6.5,
                borderRadius: "50%", background: "#f5efe9",
                opacity: uiVisible ? 1 : 0, transition: "opacity .2s",
              }} />
            </div>
          </div>

          {/* buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 2 : 6 }}>
            <button className="mf-btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"} style={iconBtn}>
              {playing ? <Pause size={24} fill="#f5efe9" /> : <Play size={24} fill="#f5efe9" />}
            </button>
            <button className="mf-btn" onClick={() => skip(-SKIP)} aria-label={`Back ${SKIP} seconds`} style={iconBtn}>
              <RotateCcw size={21} />
            </button>
            <button className="mf-btn" onClick={() => skip(SKIP)} aria-label={`Forward ${SKIP} seconds`} style={iconBtn}>
              <RotateCw size={21} />
            </button>

            <button className="mf-btn" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} style={iconBtn}>
              <VolIcon size={21} />
            </button>
            {!isMobile && (
              <input
                className="mf-vol"
                type="range" min="0" max="1" step="0.01"
                value={muted ? 0 : volume}
                onChange={(e) => setVol(parseFloat(e.target.value))}
                aria-label="Volume"
                style={{ width: 90, cursor: "pointer" }}
              />
            )}

            <span style={{
              marginLeft: isMobile ? 6 : 12, fontSize: isMobile ? 12 : 13,
              color: "#cbbfb6", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
            }}>
              {fmt(current)} <span style={{ opacity: .5 }}>/ {fmt(duration)}</span>
            </span>

            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: isMobile ? 2 : 6 }}>
              {onNext && (
                <button className="mf-btn" onClick={onNext}
                  style={{ background: "rgba(255,255,255,.15)", color: "#f5efe9", border: "none", padding: isMobile ? "8px 12px" : "9px 16px", borderRadius: 6, fontSize: isMobile ? 12 : 14, fontWeight: 600, whiteSpace: "nowrap" }}>
                  Next
                </button>
              )}
              <button className="mf-btn" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"} style={iconBtn}>
                {fullscreen ? <Minimize size={21} /> : <Maximize size={21} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
