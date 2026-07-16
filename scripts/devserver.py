"""Static dev server that never lets the browser cache.

python -m http.server sends Last-Modified and no Cache-Control, so Chrome
heuristic-caches CSS/JS and keeps serving a stale copy after an edit — which
makes "I changed it and reloaded" quietly untrue. This sends no-store on
everything so a reload always shows what is on disk.

    python scripts/devserver.py [port]
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_header(self, keyword, value):
        # SimpleHTTPRequestHandler emits its own Last-Modified; dropping it stops
        # the browser from trying to revalidate its way back to a stale copy.
        if keyword == "Last-Modified":
            return
        super().send_header(keyword, value)

    def log_message(self, fmt, *args):
        pass  # quiet


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5056
    handler = partial(NoCacheHandler, directory=str(ROOT))
    print(f"serving {ROOT} at http://localhost:{port} (no-store)")
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
