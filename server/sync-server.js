// ============================================================================
// MarsFlix watch-party relay. Clients connect to /room/<id>; every message a
// client sends is forwarded to everyone else in that room. The server also
// tells the room how many people are in it: {"t":"peers","count":n}.
//
//   PORT=8787 node server/sync-server.js
// ============================================================================

import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8787;
const MAX_MSG = 4096;

const rooms = new Map(); // id -> Set<WebSocket>

const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("marsflix sync ok\n");
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG });

server.on("upgrade", (req, socket, head) => {
  const m = req.url.match(/^\/room\/([\w-]{1,64})\/?$/);
  if (!m) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => join(ws, m[1]));
});

function announce(room) {
  const msg = JSON.stringify({ t: "peers", count: room.size });
  for (const peer of room) if (peer.readyState === 1) peer.send(msg);
}

function join(ws, id) {
  let room = rooms.get(id);
  if (!room) rooms.set(id, (room = new Set()));
  room.add(ws);
  ws.alive = true;
  announce(room);

  ws.on("pong", () => { ws.alive = true; });

  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    const text = data.toString();
    for (const peer of room) if (peer !== ws && peer.readyState === 1) peer.send(text);
  });

  ws.on("close", () => {
    room.delete(ws);
    if (room.size) announce(room);
    else rooms.delete(id);
  });
}

// Drop dead connections and keep idle ones alive behind proxies.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => console.log(`marsflix sync listening on :${PORT}`));
