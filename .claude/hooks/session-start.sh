#!/bin/bash
# Installs the toolchain for Claude Code on the web sessions:
# project npm deps, yt-dlp, Editly, the Python deps of the vendored
# video-use skill (.claude/skills/video-use) and the designer agent tools (design/).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Remotion project dependencies
npm install --no-audit --no-fund

# System libraries for Editly's native modules (canvas, headless-gl) + xvfb
if ! dpkg -s libpango1.0-dev xvfb >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    build-essential pkg-config libpango1.0-dev libjpeg-dev libgif-dev \
    librsvg2-dev libxi-dev libglu1-mesa-dev libglew-dev xvfb ffmpeg
fi

# Editly: 0.14.x pins gl@6, which no longer builds with current GCC
command -v editly >/dev/null || npm install -g --no-audit --no-fund editly@0.15.0-rc.1

# yt-dlp + video-use helper deps
pip install -q -U yt-dlp requests librosa matplotlib pillow numpy

# Таблиці й PDF для агента payroll
pip install -q pandas openpyxl pdfplumber

# Інструменти агента roblox-dev (Rojo, luau-lsp + довідник API Roblox)
"$CLAUDE_PROJECT_DIR/tools/install-roblox-tools.sh" || echo "roblox tools: не вдалося встановити"

# Інструменти агента-дизайнера (HTML → PNG, шрифти, QR); браузер уже є в /opt/pw-browsers
(cd design && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-audit --no-fund)

# Локальне розпізнавання мови для tools/transcribe.py (модель качається з huggingface.co,
# якщо мережа середовища це дозволяє); не критично, тому помилку ігноруємо
pip install -q faster-whisper || true

# video-use's transcribe.py requires a non-empty key; the agent proxy injects
# the real ElevenLabs credentials for api.elevenlabs.io.
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -z "${ELEVENLABS_API_KEY:-}" ]; then
  echo 'export ELEVENLABS_API_KEY="injected-by-proxy"' >> "$CLAUDE_ENV_FILE"
fi
