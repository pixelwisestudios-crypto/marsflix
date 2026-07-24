import React, { useState, useRef, useEffect, useCallback } from "react";
import { Play, Plus, Search, Bell, Users, X, Send, Volume2, VolumeX, Pause, Link2, Check, ChevronLeft } from "lucide-react";

// ============================================================================
// MarsFlix — talks to the FastAPI backend, which signs B2 URLs on demand.
// Set VITE_API_URL in .env.local, e.g. VITE_API_URL=http://localhost:8000
// ============================================================================

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const BOT_NAMES = ["Kaz", "Nova", "Rhea"];
const BOT_LINES = [
  "this opening shot is unreal 🔴",
  "wait go back did you see that",
  "ok the soundtrack goes hard",
  "brb grabbing snacks, pause?",
  "this is better than i expected ngl",
  "callback to episode 1!!",
];

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1614728263952-84ea256f9679?w=800&q=80";

export default function MarsFlix() {
  const [catalogue, setCatalogue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [openSeries, setOpenSeries] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null); // { title, url, next? }
  const [watchParty, setWatchParty] = useState(false);

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
        .mf-card:hover { transform: scale(1.08); z-index: 5; box-shadow: 0 12px 40px rgba(0,0,0,.7); }
        .mf-btn { transition: opacity .15s, transform .15s; cursor: pointer; }
        .mf-btn:hover { opacity: .85; }
        .mf-btn:active { transform: scale(.96); }
        .mf-btn:focus-visible, .mf-card:focus-visible { outline: 2px solid #e0532f; outline-offset: 3px; }
        .mf-ep:hover { background: rgba(120,110,102,.22) !important; }
        @keyframes mf-pulse { 0%,100% { opacity:.35 } 50% { opacity:.7 } }
        .mf-skel { background: rgba(120,110,102,.25); animation: mf-pulse 1.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){ .mf-card, .mf-btn, .mf-skel { transition: none; animation: none; } }
      `}</style>

      <Nav />

      {loading && <SkeletonHome />}

      {!loading && error && !catalogue.length && (
        <Notice
          title="Can't reach the library"
          body={`${error}. Check the backend is running at ${API}.`}
        />
      )}

      {!loading && !error && !catalogue.length && (
        <Notice
          title="Nothing here yet"
          body="Upload some videos to your bucket, then refresh the catalogue."
        />
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
        <SeriesView
          show={openSeries}
          onPick={playEpisode}
          onClose={() => setOpenSeries(null)}
        />
      )}

      {nowPlaying && (
        <Player
          item={nowPlaying}
          watchParty={watchParty}
          setWatchParty={setWatchParty}
          onNext={nowPlaying.next ? playNext : null}
          onClose={() => setNowPlaying(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    const onResize = () => setIsMobile(window.innerWidth < 700);
    onResize();
    window.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
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
        fontSize: isMobile ? 20 : 26, letterSpacing: 1.5, color: "#e0532f",
        whiteSpace: "nowrap",
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
    <div style={{ padding: "18vh 4vw", maxWidth: 520 }}>
      <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, margin: "0 0 10px" }}>{title}</h2>
      <p style={{ color: "#9a8d84", lineHeight: 1.5, margin: 0 }}>{body}</p>
    </div>
  );
}

function SkeletonHome() {
  return (
    <div>
      <div className="mf-skel" style={{ height: "60vh", minHeight: 380 }} />
      <div style={{ padding: "24px 4vw", display: "flex", gap: 10 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="mf-skel" style={{ width: 220, height: 130, borderRadius: 8, flexShrink: 0 }} />
        ))}
      </div>
    </div>
  );
}

function Hero({ item, onPlay, onInfo }) {
  const bg = item.hero || item.poster || FALLBACK_IMG;
  const meta = item.type === "series"
    ? `${Object.keys(item.seasons || {}).length} season${Object.keys(item.seasons || {}).length === 1 ? "" : "s"} · ${item.episode_count} episodes`
    : "Film";

  return (
    <div style={{ position: "relative", height: "82vh", minHeight: 520 }}>
      <img src={bg} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0a0605 8%, transparent 55%), linear-gradient(to right, rgba(10,6,5,.9) 0%, transparent 60%)" }} />
      <div style={{ position: "absolute", bottom: 130, left: "4vw", maxWidth: 560 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, letterSpacing: 3, color: "#e0532f", fontWeight: 600, marginBottom: 14 }}>
          <span style={{ width: 22, height: 2, background: "#e0532f" }} /> MARSFLIX ORIGINAL
        </div>
        <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(40px,6vw,72px)", fontWeight: 700, margin: "0 0 16px", lineHeight: 1 }}>{item.title}</h1>
        {item.desc && <p style={{ fontSize: 17, lineHeight: 1.5, color: "#d8ccc2", marginBottom: 12 }}>{item.desc}</p>}
        <p style={{ fontSize: 13, color: "#9a8d84", marginBottom: 24 }}>{meta}</p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <button className="mf-btn" onClick={onPlay} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f5efe9", color: "#0a0605", border: "none", padding: "13px 30px", borderRadius: 6, fontSize: 16, fontWeight: 700 }}>
            <Play size={20} fill="#0a0605" /> {item.type === "series" ? "Episodes" : "Play"}
          </button>
          <button className="mf-btn" onClick={onInfo} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(120,110,102,.35)", color: "#f5efe9", border: "none", padding: "13px 26px", borderRadius: 6, fontSize: 16, fontWeight: 600 }}>
            <Plus size={20} /> My List
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ title, items, onPick }) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 14px", fontFamily: "'Space Grotesk',sans-serif" }}>{title}</h2>
      <div className="mf-row" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 10 }}>
        {items.map((it) => (
          <div
            key={it.id}
            className="mf-card mf-btn"
            role="button"
            tabIndex={0}
            onClick={() => onPick(it)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(it))}
            style={{ position: "relative", flex: "0 0 auto", width: 220, height: 130, borderRadius: 8, overflow: "hidden", cursor: "pointer", background: "rgba(120,110,102,.2)" }}
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

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(5,3,2,.97)", overflowY: "auto" }}>
      {(show.hero || show.poster) && (
        <div style={{ position: "relative", height: "38vh", minHeight: 220 }}>
          <img src={show.hero || show.poster} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(5,3,2,1) 5%, transparent 80%)" }} />
        </div>
      )}

      <button className="mf-btn" onClick={onClose} aria-label="Close"
        style={{ position: "fixed", top: 20, right: 24, zIndex: 2, background: "rgba(10,6,5,.7)", border: "none", borderRadius: 8, padding: 6, color: "#cbbfb6" }}>
        <X size={26} />
      </button>

      <div style={{ padding: "0 4vw 60px", marginTop: show.hero || show.poster ? -60 : 60, position: "relative" }}>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(28px,4vw,44px)", margin: "0 0 10px" }}>{show.title}</h2>
        {show.desc && <p style={{ color: "#d8ccc2", maxWidth: 640, lineHeight: 1.5, marginBottom: 24 }}>{show.desc}</p>}

        {seasons.length > 1 && (
          <div style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
            {seasons.map((s) => (
              <button key={s} className="mf-btn" onClick={() => setSeason(s)}
                style={{ background: s === season ? "#e0532f" : "rgba(120,110,102,.25)", color: "#fff", border: "none", padding: "8px 18px", borderRadius: 6, fontWeight: 600, fontSize: 14 }}>
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
              style={{ display: "flex", gap: 16, alignItems: "center", padding: 12, borderRadius: 8, background: "rgba(120,110,102,.12)", transition: "background .15s" }}
            >
              <span style={{ width: 30, textAlign: "center", color: "#9a8d84", fontSize: 18, fontFamily: "'Space Grotesk',sans-serif", flexShrink: 0 }}>{e.ep}</span>
              {e.still && (
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

function Player({ item, onClose, onNext, watchParty, setWatchParty }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === " " && videoRef.current) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  };

  const seek = (e) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - r.left) / r.width) * v.duration;
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(5,3,2,.97)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 24px", gap: 16 }}>
        <button className="mf-btn" onClick={onClose} aria-label="Back" style={{ background: "none", border: "none", color: "#cbbfb6", display: "flex" }}>
          <ChevronLeft size={24} />
        </button>
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 17 }}>{item.title}</span>
        <button className="mf-btn" onClick={() => setWatchParty((w) => !w)}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, background: watchParty ? "#e0532f" : "rgba(120,110,102,.3)", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 6, fontSize: 14, fontWeight: 600 }}>
          <Users size={17} /> {watchParty ? "Party live" : "Watch together"}
        </button>
        <button className="mf-btn" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#cbbfb6", display: "flex" }}>
          <X size={26} />
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          {failed ? (
            <div style={{ textAlign: "center", color: "#9a8d84", maxWidth: 380 }}>
              <p style={{ fontWeight: 600, color: "#f5efe9", marginBottom: 6 }}>This won't play</p>
              <p style={{ fontSize: 14, lineHeight: 1.5 }}>
                The file needs to be H.264 video with AAC audio in an MP4 container.
              </p>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={item.url}
              autoPlay
              playsInline
              muted={muted}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onError={() => setFailed(true)}
              onEnded={() => onNext && onNext()}
              onTimeUpdate={(e) => setProgress((e.target.currentTime / (e.target.duration || 1)) * 100)}
              style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 10, background: "#000" }}
            />
          )}

          {!failed && (
            <div style={{ position: "absolute", bottom: 34, left: 40, right: 40 }}>
              <div onClick={seek} style={{ padding: "8px 0", cursor: "pointer" }}>
                <div style={{ height: 4, background: "rgba(255,255,255,.25)", borderRadius: 3 }}>
                  <div style={{ width: `${progress}%`, height: "100%", background: "#e0532f", borderRadius: 3 }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 6 }}>
                <button className="mf-btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"} style={{ background: "none", border: "none", color: "#fff", display: "flex" }}>
                  {playing ? <Pause size={26} fill="#fff" /> : <Play size={26} fill="#fff" />}
                </button>
                <button className="mf-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"} style={{ background: "none", border: "none", color: "#fff", display: "flex" }}>
                  {muted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                </button>
                {onNext && (
                  <button className="mf-btn" onClick={onNext}
                    style={{ marginLeft: "auto", background: "rgba(120,110,102,.3)", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 6, fontSize: 14, fontWeight: 600 }}>
                    Next episode
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {watchParty && <WatchParty title={item.title} />}
      </div>
    </div>
  );
}

function WatchParty({ title }) {
  const [msgs, setMsgs] = useState([
    { who: "Nova", me: false, text: "starting it now, everyone ready?" },
    { who: "You", me: true, text: "yep hit play 🚀" },
  ]);
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [msgs]);

  // Simulated. Replace with a websocket when the sync server exists.
  useEffect(() => {
    const t = setInterval(() => {
      setMsgs((m) => [...m, {
        who: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
        me: false,
        text: BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)],
      }]);
    }, 6500);
    return () => clearInterval(t);
  }, []);

  const send = () => {
    if (!input.trim()) return;
    setMsgs((m) => [...m, { who: "You", me: true, text: input.trim() }]);
    setInput("");
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div style={{ width: 340, borderLeft: "1px solid rgba(120,110,102,.25)", display: "flex", flexDirection: "column", background: "rgba(10,6,5,.6)" }}>
      <div style={{ padding: "18px 20px", borderBottom: "1px solid rgba(120,110,102,.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Users size={17} color="#e0532f" />
          <span style={{ fontWeight: 600, fontFamily: "'Space Grotesk',sans-serif" }}>Watch Party</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#9a8d84" }}>simulated</span>
        </div>
        <div style={{ fontSize: 12, color: "#9a8d84" }}>{title}</div>
        <button className="mf-btn" onClick={copyLink}
          style={{ marginTop: 12, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "rgba(224,83,47,.15)", color: "#e0532f", border: "1px solid rgba(224,83,47,.4)", padding: "9px", borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
          {copied ? <><Check size={15} /> Link copied</> : <><Link2 size={15} /> Invite friends</>}
        </button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.me ? "flex-end" : "flex-start", maxWidth: "80%" }}>
            {!m.me && <div style={{ fontSize: 11, color: "#e0532f", marginBottom: 3, fontWeight: 600 }}>{m.who}</div>}
            <div style={{ background: m.me ? "#e0532f" : "rgba(120,110,102,.25)", color: m.me ? "#fff" : "#f5efe9", padding: "8px 12px", borderRadius: 12, fontSize: 14, lineHeight: 1.35 }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: 14, borderTop: "1px solid rgba(120,110,102,.2)", display: "flex", gap: 8 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Say something…"
          style={{ flex: 1, background: "rgba(120,110,102,.2)", border: "none", borderRadius: 8, padding: "10px 14px", color: "#f5efe9", fontSize: 14, outline: "none" }} />
        <button className="mf-btn" onClick={send} aria-label="Send" style={{ background: "#e0532f", border: "none", borderRadius: 8, padding: "0 14px", color: "#fff", display: "flex", alignItems: "center" }}>
          <Send size={17} />
        </button>
      </div>
    </div>
  );
}
