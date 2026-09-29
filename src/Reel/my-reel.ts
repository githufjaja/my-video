import captionsJson from "./captions.json";
import type { CaptionPage, ReelProps } from "./schema";

// Your own reel. Steps:
// 1. Put your footage at public/footage.mp4 and set `footage` below.
// 2. `npm run captions -- public/footage.mp4` fills src/Reel/captions.json.
// 3. Edit titles / overlays / zooms (see demo.ts for every overlay type).

// Written by `npm run captions`.
const captions = captionsJson as CaptionPage[];
const lastCaptionEnd = captions.reduce((max, p) => Math.max(max, p.endMs), 0);

export const myReelProps: ReelProps = {
  footage: "",
  durationMs: Math.max(lastCaptionEnd + 500, 5000),
  titles: [
    { fromMs: 0, toMs: 3000, kicker: "за одну минуту", title: "Ваш заголовок" },
  ],
  captions,
  overlays: [],
  zooms: [],
};
