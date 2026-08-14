#!/usr/bin/env python3
"""Particle Studio server: static files + shared community design library.

Every design uploaded via the UI is stored in community_designs/ and listed
for all users of this server.

Run:  python server.py [port]     (default port 8000)
"""
import json
import re
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DESIGNS = ROOT / "community_designs"
DESIGNS.mkdir(exist_ok=True)

MAX_BODY = 64 * 1024 * 1024  # 64 MB (projects embed textures as data URLs)


def safe_name(name: str) -> str:
    name = re.sub(r"[^\w\- ]+", "", name).strip().replace(" ", "_")
    return name[:80] or "design"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/designs":
            items = []
            for f in DESIGNS.glob("*.json"):
                items.append({"file": f.name,
                              "name": f.stem.replace("_", " "),
                              "time": int(f.stat().st_mtime)})
            items.sort(key=lambda x: -x["time"])
            return self._json(200, items)
        m = re.match(r"^/api/designs/([\w\-. ]+)$", self.path)
        if m:
            f = DESIGNS / m.group(1)
            if f.suffix == ".json" and f.parent == DESIGNS and f.is_file():
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(f.stat().st_size))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(f.read_bytes())
                return
            return self._json(404, {"error": "not found"})
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/designs":
            return self._json(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            if n <= 0 or n > MAX_BODY:
                return self._json(413, {"error": "body too large"})
            data = json.loads(self.rfile.read(n).decode("utf-8"))
            name = safe_name(str(data.get("name", "design")))
            proj = data.get("proj")
            if not isinstance(proj, dict) or proj.get("app") != "particle-simple":
                return self._json(400, {"error": "not a particle project"})
            f = DESIGNS / (name + ".json")
            if f.exists():  # never overwrite someone else's design
                f = DESIGNS / ("%s_%d.json" % (name, int(time.time())))
            f.write_text(json.dumps(proj), encoding="utf-8")
            return self._json(200, {"ok": True, "file": f.name})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"error": str(e)})

    def log_message(self, fmt, *args):  # quieter logs
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Particle Studio server on http://localhost:{port}/simple.html")
    print(f"Shared designs folder: {DESIGNS}")
    ThreadingHTTPServer(("", port), Handler).serve_forever()
