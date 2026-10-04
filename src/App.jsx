import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Play, Plus, Search, Bell, X, Pause, ChevronLeft,
  Volume2, VolumeX, Volume1, Maximize, Minimize,
  RotateCcw, RotateCw, Loader2, Users, Link, LogOut,
  MessageCircle, Send,
} from "lucide-react";

// ============================================================================
// MarsFlix — talks to the FastAPI backend, which signs B2 URLs on demand.
// Set VITE_API_URL in .env.local (no trailing slash).
// Watch parties use the relay in server/sync-server.js — set VITE_SYNC_URL.
// ============================================================================

const API = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");
const SYNC = (import.meta.env.VITE_SYNC_URL || "ws://localhost:8787").replace(/\/+$/, "");

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

/* --- watch party ---------------------------------------------------
   Everyone in a room sends {t:"sync", ref, time, playing, hard} when
   they play, pause, seek or change title. `ref` names the title (each
   client fetches its own signed URL). Whoever acted last is the leader
   and sends a soft sync every few seconds to correct drift.
   ------------------------------------------------------------------ */

const CLIENT_ID = Math.random().toString(36).slice(2, 10);
const HEARTBEAT_MS = 4000;
const CHAT_MAX = 100; // messages kept on screen; nothing is stored anywhere

const loadName = () => {
  try { return localStorage.getItem("mf-name") || ""; } catch { return ""; }
};
const saveName = (n) => {
  try { localStorage.setItem("mf-name", n); } catch { /* private mode */ }
};
const HARD_DRIFT = 0.5; // seconds
const SOFT_DRIFT = 2;

const sameRef = (a, b) =>
  !!a && !!b && a.type === b.type && a.id === b.id &&
  String(a.season) === String(b.season) && a.ep === b.ep;

const refKey = (r) => `${r.type}:${r.id}:${r.season ?? ""}:${r.ep ?? ""}`;

const inviteLink = (room) => {
  const u = new URL(window.location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set("room", room);
  return u.toString();
};

function useWatchParty(handlerRef) {
  const [room, setRoom] = useState(() => new URLSearchParams(window.location.search).get("room"));
  const [peers, setPeers] = useState(0);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!room) return;
    let ws, retry, closed = false;
    const connect = () => {
      ws = new WebSocket(`${SYNC}/room/${encodeURIComponent(room)}`);
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({ t: "hello", from: CLIENT_ID }));
      };
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === "peers") setPeers(m.count);
        else if (m.from !== CLIENT_ID) handlerRef.current?.(m);
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws.close();
      wsRef.current = null;
    };
  }, [room, handlerRef]);

  const send = useCallback((m) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ...m, from: CLIENT_ID }));
  }, []);

  const setUrlRoom = (id) => {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("room", id); else u.searchParams.delete("room");
    window.history.replaceState(null, "", u);
  };

  const create = useCallback(() => {
    const id = Math.random().toString(36).slice(2, 8);
    setUrlRoom(id);
    setRoom(id);
    return id;
  }, []);

  const leave = useCallback(() => {
    setUrlRoom(null);
    setRoom(null);
    setPeers(0);
  }, []);

  return { room, peers, connected, send, create, leave };
}

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

  const playerApi = useRef(null);   // { getState, apply } from the mounted Player
  const pendingSync = useRef(null); // remote sync waiting for its title to load
  const leader = useRef(null);
  const loadingKey = useRef(null);

  const partyHandler = useRef(null);
  const party = useWatchParty(partyHandler);
  const { send: partySend } = party;

  const [chat, setChat] = useState([]); // {id, from, name, text, mine} — not persisted
  const [name, setName] = useState(loadName);

  const setMyName = useCallback((n) => {
    setName(n);
    saveName(n);
  }, []);

  const pushChat = useCallback((msg) => {
    setChat((c) => [...c, msg].slice(-CHAT_MAX));
  }, []);

  const sendChat = useCallback((text) => {
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) return;
    const id = `${CLIENT_ID}-${Date.now()}`;
    pushChat({ id, from: CLIENT_ID, name: name || "You", text: trimmed, mine: true });
    partySend({ t: "chat", id, name: name || "Guest", text: trimmed });
  }, [name, partySend, pushChat]);

  const broadcast = useCallback((state) => {
    leader.current = CLIENT_ID;
    partySend({ t: "sync", ...state, hard: true });
  }, [partySend]);

  // ref: { type: "film", id } | { type: "episode", id, season, ep }
  const play = useCallback(async (ref, { label, share = false } = {}) => {
    const key = refKey(ref);
    loadingKey.current = key;
    try {
      const path = ref.type === "episode" ? `${ref.id}/${ref.season}/${ref.ep}` : ref.id;
      const r = await fetch(`${API}/api/stream/${path}`);
      if (!r.ok) throw new Error(`Couldn't load ${label || (ref.type === "episode" ? `episode ${ref.ep}` : "that title")}`);
      const { url, title } = await r.json();

      let next = null;
      if (ref.type === "episode") {
        const eps = catalogue.find((c) => c.id === ref.id)?.seasons?.[ref.season] || [];
        const idx = eps.findIndex((e) => e.ep === ref.ep);
        if (idx >= 0 && idx < eps.length - 1) next = { ...ref, ep: eps[idx + 1].ep };
      }

      setNowPlaying({ url, title, ref, next });
      setOpenSeries(null);
      if (share) broadcast({ ref, time: 0, playing: true });
    } catch (e) {
      setError(e.message);
    } finally {
      if (loadingKey.current === key) loadingKey.current = null;
    }
  }, [catalogue, broadcast]);

  const playFilm = (item) => play({ type: "film", id: item.id }, { label: item.title, share: true });

  const playEpisode = (show, season, ep) =>
    play({ type: "episode", id: show.id, season, ep }, { share: true });

  const openTile = (item) =>
    item.type === "series" ? setOpenSeries(item) : playFilm(item);

  // auto = reached the end on its own; everyone gets there, so don't broadcast
  const playNext = ({ auto = false } = {}) => {
    if (nowPlaying?.next) play(nowPlaying.next, { share: !auto });
  };

  useEffect(() => {
    partyHandler.current = (m) => {
      if (m.t === "hello") {
        const s = playerApi.current?.getState();
        if (s) partySend({ t: "sync", ...s, hard: true, reply: true });
        return;
      }
      if (m.t === "chat") {
        pushChat({ id: m.id || `${m.from}-${Date.now()}`, from: m.from, name: m.name || "Guest", text: String(m.text || "").slice(0, 500), mine: false });
        return;
      }
      if (m.t !== "sync" || !m.ref) return;
      m.at = performance.now();
      if (m.hard && !m.reply) leader.current = m.from;
      if (sameRef(m.ref, nowPlaying?.ref) && playerApi.current) {
        playerApi.current.apply(m);
      } else if (m.hard) {
        // Only deliberate actions switch titles; heartbeats just correct drift,
        // so closing the player to browse doesn't get it reopened.
        pendingSync.current = m;
        if (loadingKey.current !== refKey(m.ref)) play(m.ref);
      }
    };
  });

  // A fresh room starts with a clean, empty chat.
  const startParty = () => {
    setChat([]);
    party.create();
    leader.current = CLIENT_ID;
  };

  const leaveParty = () => {
    party.leave();
    setChat([]);
  };

  // Leader heartbeat keeps everyone within SOFT_DRIFT of each other.
  useEffect(() => {
    if (!party.room) return;
    const id = setInterval(() => {
      if (leader.current !== CLIENT_ID) return;
      const s = playerApi.current?.getState();
      if (s) partySend({ t: "sync", ...s, hard: false });
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [party.room, partySend]);

  const partyUi = { ...party, start: startParty, leave: leaveParty, chat, sendChat, name, setName: setMyName };

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

      <Nav party={partyUi} />

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
          party={partyUi}
          apiRef={playerApi}
          pendingSyncRef={pendingSync}
          onSync={broadcast}
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

function Nav({ party }) {
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
        {party.room && <PartyControl party={party} compact={isMobile} />}
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

function PartyControl({ party, compact }) {
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const say = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const copy = async (room) => {
    const link = inviteLink(room);
    try {
      await navigator.clipboard.writeText(link);
      say("Invite link copied — send it to your friend");
    } catch {
      window.prompt("Copy this invite link:", link);
    }
  };

  const pill = {
    display: "flex", alignItems: "center", gap: 6, height: 36,
    background: "rgba(120,110,102,.35)", color: "#f5efe9", border: "none",
    borderRadius: 18, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
  };
  const mini = { background: "none", border: "none", color: "#f5efe9", display: "flex", padding: 6 };

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {!party.room ? (
        <button className="mf-btn" onClick={() => copy(party.start())} style={{ ...pill, padding: "0 14px" }}
          aria-label="Watch together">
          <Users size={17} /> {!compact && "Watch together"}
        </button>
      ) : (
        <div style={{ ...pill, padding: "0 4px 0 12px" }}>
          <span title={party.connected ? "Connected" : "Reconnecting…"}
            style={{ width: 8, height: 8, borderRadius: "50%", background: party.connected ? "#4ade80" : "#f5a524" }} />
          <Users size={15} />
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {party.connected ? party.peers : "…"}{!compact && (party.peers === 1 ? " watching" : " watching")}
          </span>
          <button className="mf-btn" onClick={() => copy(party.room)} aria-label="Copy invite link" title="Copy invite link" style={mini}>
            <Link size={16} />
          </button>
          <button className="mf-btn" onClick={party.leave} aria-label="Leave watch party" title="Leave watch party" style={mini}>
            <LogOut size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div role="status" style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 10,
          background: "rgba(10,6,5,.92)", color: "#f5efe9", fontSize: 13,
          padding: "8px 12px", borderRadius: 6, whiteSpace: "nowrap",
          boxShadow: "0 6px 20px rgba(0,0,0,.5)",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function ChatPanel({ party, isMobile, onClose }) {
  const [draft, setDraft] = useState("");
  const [editingName, setEditingName] = useState(!party.name);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const chat = party.chat || [];

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  useEffect(() => { if (!editingName) inputRef.current?.focus(); }, [editingName]);

  const submit = (e) => {
    e.preventDefault();
    party.sendChat(draft);
    setDraft("");
  };

  const field = {
    width: "100%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)",
    borderRadius: 8, color: "#f5efe9", fontSize: 14, padding: "10px 12px", outline: "none",
    fontFamily: "'Inter', system-ui, sans-serif",
  };

  return (
    <div style={{
      position: "absolute", zIndex: 4,
      top: isMobile ? "auto" : 0, bottom: 0, right: 0,
      left: isMobile ? 0 : "auto",
      width: isMobile ? "100%" : 340,
      height: isMobile ? "55%" : "100%",
      display: "flex", flexDirection: "column",
      background: "rgba(10,6,5,.92)", backdropFilter: "blur(10px)",
      borderLeft: isMobile ? "none" : "1px solid rgba(255,255,255,.1)",
      borderTop: isMobile ? "1px solid rgba(255,255,255,.1)" : "none",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <MessageCircle size={18} color="#e0532f" />
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 15 }}>Chat</span>
        {party.name && !editingName && (
          <button className="mf-btn" onClick={() => setEditingName(true)}
            style={{ background: "none", border: "none", color: "#9a8d84", fontSize: 12, cursor: "pointer", padding: 0 }}>
            you’re <span style={{ color: "#cbbfb6", fontWeight: 600 }}>{party.name}</span> · edit
          </button>
        )}
        <button className="mf-btn" onClick={onClose} aria-label="Close chat"
          style={{ marginLeft: "auto", background: "none", border: "none", color: "#cbbfb6", display: "flex", padding: 4 }}>
          <X size={20} />
        </button>
      </div>

      {editingName ? (
        <form
          onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { party.setName(draft.trim().slice(0, 24)); setDraft(""); } setEditingName(false); }}
          style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <label style={{ fontSize: 13, color: "#cbbfb6" }}>What should your friend see you as?</label>
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder={party.name || "Your name"} maxLength={24} style={field} />
          <button type="submit" className="mf-btn"
            style={{ background: "#e0532f", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            Start chatting
          </button>
        </form>
      ) : (
        <>
          <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {chat.length === 0 ? (
              <p style={{ color: "#8a7d74", fontSize: 13, lineHeight: 1.5, margin: "auto", textAlign: "center" }}>
                No messages yet. Say hi 👋<br />Messages aren’t saved — they vanish when you reload.
              </p>
            ) : chat.map((m) => (
              <div key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                {!m.mine && <div style={{ fontSize: 11, color: "#9a8d84", marginBottom: 2, marginLeft: 4 }}>{m.name}</div>}
                <div style={{
                  background: m.mine ? "#e0532f" : "rgba(120,110,102,.3)",
                  color: "#fff", padding: "8px 12px", borderRadius: 12,
                  borderBottomRightRadius: m.mine ? 3 : 12, borderBottomLeftRadius: m.mine ? 12 : 3,
                  fontSize: 14, lineHeight: 1.4, wordBreak: "break-word",
                }}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={submit} style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
            <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder="Message…" maxLength={500} style={{ ...field, flex: 1 }} />
            <button type="submit" className="mf-btn" aria-label="Send"
              style={{ background: "#e0532f", color: "#fff", border: "none", borderRadius: 8, padding: "0 14px", display: "flex", alignItems: "center", cursor: "pointer" }}>
              <Send size={18} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function Player({ item, onClose, onNext, party, apiRef, pendingSyncRef, onSync }) {
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
  const [chatOpen, setChatOpen] = useState(false);

  /* --- chat unread badge --- */
  const chat = party.chat || [];
  const seenCount = useRef(chat.length);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (chatOpen) { seenCount.current = chat.length; setUnread(0); return; }
    const missed = chat.length - seenCount.current;
    if (missed > 0) setUnread(missed);
  }, [chat.length, chatOpen]);

  /* --- watch party sync --- */
  const getState = useCallback(() => {
    const v = videoRef.current;
    if (!v || v.readyState < 1) return null;
    return { ref: item.ref, time: v.currentTime, playing: !v.paused };
  }, [item.ref]);

  const share = useCallback(() => {
    const s = getState();
    if (s) onSync(s);
  }, [getState, onSync]);

  const apply = useCallback((m) => {
    const v = videoRef.current;
    if (!v || v.readyState < 1) { pendingSyncRef.current = m; return; }
    const target = m.time + (m.playing ? (performance.now() - m.at) / 1000 : 0);
    if (Math.abs(v.currentTime - target) > (m.hard ? HARD_DRIFT : SOFT_DRIFT)) {
      v.currentTime = Math.min(target, v.duration || target);
    }
    if (m.playing && v.paused) {
      // Unmuted autoplay can be blocked without a tap; fall back to muted.
      v.play().catch(() => { v.muted = true; setMuted(true); v.play().catch(() => {}); });
    } else if (!m.playing) {
      v.pause(); // even if already paused: this also cancels a pending autoplay
    }
  }, [pendingSyncRef]);

  useEffect(() => {
    apiRef.current = { getState, apply };
    return () => { apiRef.current = null; };
  }, [apiRef, getState, apply]);

  const onMeta = (e) => {
    setDuration(e.target.duration || 0);
    const m = pendingSyncRef.current;
    if (m && sameRef(m.ref, item.ref)) {
      pendingSyncRef.current = null;
      apply(m);
    }
  };

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
    share();
    showUi();
  }, [showUi, share]);

  const skip = useCallback((delta) => {
    const v = videoRef.current;
    if (!v || !isFinite(v.duration)) return;
    v.currentTime = Math.min(Math.max(v.currentTime + delta, 0), v.duration);
    setFlash(delta < 0 ? "back" : "forward");
    setTimeout(() => setFlash(null), 450);
    share();
    showUi();
  }, [showUi, share]);

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

  const endScrub = () => {
    if (!scrubbing) return;
    setScrubbing(false);
    share();
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
        <div style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
          {party.room && (
            <button className="mf-btn" onClick={() => setChatOpen((o) => !o)}
              aria-label={chatOpen ? "Hide chat" : "Show chat"}
              style={{ ...iconBtn, position: "relative", color: chatOpen ? "#e0532f" : "#f5efe9" }}>
              <MessageCircle size={22} />
              {unread > 0 && !chatOpen && (
                <span style={{
                  position: "absolute", top: 4, right: 4, minWidth: 16, height: 16,
                  padding: "0 4px", borderRadius: 8, background: "#e0532f", color: "#fff",
                  fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
          )}
          <PartyControl party={party} compact={isMobile} />
        </div>
      </div>

      {party.room && chatOpen && (
        <ChatPanel party={party} isMobile={isMobile} onClose={() => setChatOpen(false)} />
      )}

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
              onLoadedMetadata={onMeta}
              onDurationChange={(e) => setDuration(e.target.duration || 0)}
              onError={() => { setFailed(true); setWaiting(false); }}
              onEnded={() => onNext && onNext({ auto: true })}
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
            onMouseUp={endScrub}
            onMouseLeave={endScrub}
            onTouchStart={(e) => { setScrubbing(true); seekFromEvent(e); }}
            onTouchMove={(e) => seekFromEvent(e)}
            onTouchEnd={endScrub}
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
                <button className="mf-btn" onClick={() => onNext()}
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
