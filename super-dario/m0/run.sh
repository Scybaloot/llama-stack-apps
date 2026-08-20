#!/usr/bin/env sh
# getUserMedia needs a secure context. localhost counts, so a plain static
# server is enough — no build step, no certificate.
PORT="${1:-8000}"
echo "Super Dario M0  →  http://localhost:$PORT"
python3 -m http.server "$PORT" --bind 127.0.0.1
