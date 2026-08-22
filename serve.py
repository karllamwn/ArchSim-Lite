#!/usr/bin/env python3
"""Local dev server for ArchSim Lite.

Same as `python -m http.server`, with one difference that matters in a
workshop: it tells the browser never to cache. Without that you edit a file,
reload, and see the old version, which costs a room full of students a lot of
confused minutes.

    python serve.py            # http://localhost:3100
    python serve.py 8080       # another port
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3100


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Only report problems. A wall of 200s hides the 404 you care about.
        status = str(args[1]) if len(args) > 1 else ""
        if not status.startswith("2"):
            super().log_message(fmt, *args)


def main():
    handler = partial(NoCacheHandler, directory=".")
    with ThreadingHTTPServer(("", PORT), handler) as server:
        print(f"ArchSim Lite running at http://localhost:{PORT}")
        print("Caching is off, so a reload always shows your latest edit.")
        print("Ctrl+C to stop.")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
