// Transcribe your footage into karaoke caption pages for the Reel composition.
//
//   npm run captions -- public/footage.mp4
//
// Downloads whisper.cpp and a model into ./whisper on the first run,
// then writes src/Reel/captions.json.

import { createTikTokStyleCaptions } from "@remotion/captions";
import {
  downloadWhisperModel,
  installWhisperCpp,
  toCaptions,
  transcribe,
} from "@remotion/install-whisper-cpp";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run captions -- public/footage.mp4");
  process.exit(1);
}

const WHISPER_PATH = path.join(process.cwd(), "whisper");
const WHISPER_VERSION = "1.5.5";
const MODEL = "medium";
const LANGUAGE = "ru";
// Words closer together than this end up on the same caption page.
const PAGE_MS = 900;

await installWhisperCpp({ to: WHISPER_PATH, version: WHISPER_VERSION });
await downloadWhisperModel({ folder: WHISPER_PATH, model: MODEL });

const wav = path.join(WHISPER_PATH, "input.wav");
execSync(`npx remotion ffmpeg -y -i "${input}" -ar 16000 -ac 1 "${wav}"`, {
  stdio: "inherit",
});

const output = await transcribe({
  inputPath: wav,
  model: MODEL,
  whisperPath: WHISPER_PATH,
  whisperCppVersion: WHISPER_VERSION,
  tokenLevelTimestamps: true,
  language: LANGUAGE,
});

const { captions } = toCaptions({ whisperCppOutput: output });
const { pages } = createTikTokStyleCaptions({
  captions,
  combineTokensWithinMilliseconds: PAGE_MS,
});

const result = pages.map((page) => ({
  startMs: page.startMs,
  endMs: page.startMs + page.durationMs,
  words: page.tokens
    .map((t) => ({ text: t.text.trim(), startMs: t.fromMs, endMs: t.toMs }))
    .filter((w) => w.text.length > 0),
}));

fs.writeFileSync(
  "src/Reel/captions.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(`Wrote ${result.length} caption pages to src/Reel/captions.json`);
