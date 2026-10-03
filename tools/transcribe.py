#!/usr/bin/env python3
"""Голосове / аудіо / відео → текст.

    python3 tools/transcribe.py <файл> [мова, напр. uk]

Відео спершу перетворюється на аудіо через ffmpeg. Два способи розпізнавання — береться
перший, що працює:
  1. локальний Whisper (faster-whisper) — безкоштовно; потрібен доступ до huggingface.co
     для першого завантаження моделі;
  2. ElevenLabs Scribe — потрібна змінна ELEVENLABS_API_KEY з робочим ключем.
"""
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
import uuid

API = "https://api.elevenlabs.io/v1/speech-to-text"
AUDIO = {".mp3", ".m4a", ".ogg", ".oga", ".opus", ".wav", ".aac", ".flac", ".webm"}


def to_audio(path):
    if os.path.splitext(path)[1].lower() in AUDIO:
        return path
    out = os.path.join(tempfile.mkdtemp(), "audio.mp3")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", path, "-vn", "-ac", "1", "-b:a", "64k", out], check=True)
    return out


def whisper_local(audio, lang=None):
    from faster_whisper import WhisperModel  # pip install faster-whisper
    model = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), device="cpu", compute_type="int8")
    segs, _ = model.transcribe(audio, language=lang, vad_filter=True)
    return {"text": " ".join(s.text.strip() for s in segs)}


def transcribe(path, lang=None):
    audio = to_audio(path)
    errors = []
    try:
        return whisper_local(audio, lang)
    except Exception as e:  # немає пакета чи моделі — пробуємо ElevenLabs
        errors.append("whisper: " + str(e)[:200])
    try:
        return elevenlabs(audio, lang)
    except Exception as e:
        errors.append("elevenlabs: " + str(e)[:200])
    raise SystemExit("Не вдалося розпізнати:\n  " + "\n  ".join(errors))


def elevenlabs(audio, lang=None):
    boundary = uuid.uuid4().hex
    fields = {"model_id": "scribe_v1"}
    if lang:
        fields["language_code"] = lang
    body = b""
    for k, v in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    with open(audio, "rb") as f:
        body += (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{os.path.basename(audio)}"\r\n'
                 "Content-Type: application/octet-stream\r\n\r\n").encode() + f.read() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(API, data=body, method="POST", headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "xi-api-key": os.environ.get("ELEVENLABS_API_KEY", "injected-by-proxy"),
    })
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    res = transcribe(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    print(res.get("text", "").strip())
