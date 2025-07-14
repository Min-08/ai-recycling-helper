"""AI Recycling Helper – Flask backend (debugged)
Usage:
1.  export GEMINI_API_KEY="<your_api_key>"
2.  (optional) export GEMINI_MODEL="gemini-1.5-flash"  # default
3.  python app.py
"""
import base64
import logging
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from dotenv import load_dotenv
load_dotenv()

# ---------------------------------------------------------------------------
# Flask & CORS setup
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app, resources={r"/analyze-image": {"origins": "*"}})  # ★ dev‑only; tighten in prod

# ---------------------------------------------------------------------------
# Configuration (env‑vars, fall‑backs)
# ---------------------------------------------------------------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")  # ← set this in .env or shell
GEMINI_MODEL   = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")

if not GEMINI_API_KEY:
    logging.warning("GEMINI_API_KEY env var is not defined – requests will fail.")

GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_base64(data_url: str) -> str:
    """Return the base64 component from a Data‑URL or plain base64 string."""
    if "," in data_url:
        return data_url.split(",", 1)[1]
    return data_url

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze-image")
def analyze_image():
    if not GEMINI_API_KEY:
        return jsonify({"error": "Server mis‑configuration: no API key."}), 500

    payload_in = request.get_json(silent=True) or {}
    image_data_url = payload_in.get("imageData")
    prompt        = payload_in.get("prompt")

    if not image_data_url or not prompt:
        return jsonify({"error": "Missing 'imageData' or 'prompt' field."}), 400

    base64_image = _extract_base64(image_data_url)

    gemini_req = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {
                        "inlineData": {
                            "mimeType": "image/png",
                            "data": base64_image,
                        }
                    },
                ],
            }
        ]
    }

    try:
        gresp = requests.post(GEMINI_URL, json=gemini_req, timeout=30)
        gresp.raise_for_status()
        gdata = gresp.json()

        text = (
            gdata.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "분석 결과를 받아오지 못했습니다. 다시 시도해 주세요.")
        )
        return {"text": text}

    except requests.HTTPError as exc:
        logging.error("Gemini API HTTPError %s", exc)
        return jsonify({"error": "Gemini API 연결 실패", "detail": str(exc)}), 502
    except Exception as exc:  # noqa: BLE001,E722 – generic catch for safety
        logging.exception("Unexpected error")
        return jsonify({"error": "Internal server error."}), 500


if __name__ == "__main__":
    # Run in dev‑mode on all interfaces
    app.run(host="0.0.0.0", port=5000, debug=True)