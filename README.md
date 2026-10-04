# MarsFlix

React + Vite frontend for the MarsFlix library. It talks to a FastAPI backend
(`VITE_API_URL`) that lists the catalogue and signs B2 stream URLs.

```bash
npm install
npm run dev
```

## Watch together

Open any title, press **Watch together** in the player's top bar, and send the
copied invite link to a friend. When they open it they jump to the same title and
timestamp. After that, whenever either of you plays, pauses, seeks, skips or picks
a new title, it happens for both of you. Whoever acted last sends a small
heartbeat every 4 seconds, which keeps everyone within about 2 seconds of each other.

Each person's browser fetches its own signed stream URL, so nothing about the
video itself goes through the sync server. Only tiny `play / pause / seek` messages do.

### The sync server

Parties need a small WebSocket relay that both of you can reach:

```bash
npm run sync          # listens on :8787 (override with PORT=...)
```

Point the frontend at it in `.env.local`:

```
VITE_API_URL=https://your-api.example.com
VITE_SYNC_URL=wss://your-sync.example.com
```

`server/sync-server.js` is a single file with one dependency (`ws`), so it runs on
any Node host (Render, Railway, Fly.io, a VPS). Use `wss://` when the site is
served over HTTPS.

### Or: add it to the FastAPI backend instead

If you'd rather not run a second service, add this endpoint to the existing
backend and set `VITE_SYNC_URL=wss://your-api.example.com/ws`:

```python
import json
from collections import defaultdict
from fastapi import WebSocket, WebSocketDisconnect

rooms: dict[str, set[WebSocket]] = defaultdict(set)

async def _broadcast(room: str, text: str, skip: WebSocket | None = None):
    for peer in list(rooms[room]):
        if peer is not skip:
            try:
                await peer.send_text(text)
            except Exception:
                pass

@app.websocket("/ws/room/{room}")
async def watch_party(ws: WebSocket, room: str):
    await ws.accept()
    rooms[room].add(ws)
    await _broadcast(room, json.dumps({"t": "peers", "count": len(rooms[room])}))
    try:
        while True:
            text = await ws.receive_text()
            if len(text) <= 4096:
                await _broadcast(room, text, skip=ws)
    except WebSocketDisconnect:
        pass
    finally:
        rooms[room].discard(ws)
        if rooms[room]:
            await _broadcast(room, json.dumps({"t": "peers", "count": len(rooms[room])}))
        else:
            rooms.pop(room, None)
```

### Notes

- Your friend needs to be able to reach the site **and** the API, not just the sync server.
- Browsers block autoplay with sound until you interact with the page, so a
  joining viewer may start muted. Tap the speaker icon to unmute.
