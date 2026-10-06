import React from "react";
import { AbsoluteFill, Html5Audio, Sequence, Series, staticFile } from "remotion";
import {
  S1Hook,
  S2Question,
  S3Pace,
  S4Flash,
  S5Levers,
  S6Core,
  S7Cross,
  S8Season,
  S9B2B,
  S10Calls,
  S11Energy,
  S12Timeline,
  S13Daily,
  S14Final,
} from "./scenes";

// Презентация плана продаж Дніпро-М Ужгород, октябрь 2026.
// Озвучка (ElevenLabs, голос Yevhen Professional) лежит в public/vo/NN.mp3;
// длина сцены = максимум из минимальной длины анимации и длины озвучки.
const FPS = 30;
const VO_START = 6;
const scenes: [React.FC<{ dur: number }>, number, number][] = [
  // [сцена, минимум кадров, длина озвучки в секундах]
  [S1Hook, 150, 10.76],
  [S2Question, 90, 1.9],
  [S3Pace, 200, 22.38],
  [S4Flash, 45, 1.11],
  [S5Levers, 270, 16.21],
  [S6Core, 240, 17.65],
  [S7Cross, 420, 17.51],
  [S8Season, 200, 11.47],
  [S9B2B, 190, 10.45],
  [S10Calls, 270, 15.28],
  [S11Energy, 260, 25.63],
  [S12Timeline, 250, 11.38],
  [S13Daily, 200, 7.52],
  [S14Final, 210, 5.15],
];

const durOf = (min: number, vo: number) => Math.max(min, Math.ceil(vo * FPS) + VO_START + 24);

export const SALES_PLAN_DURATION = scenes.reduce((s, [, min, vo]) => s + durOf(min, vo), 0);

// Интервалы озвучки (в кадрах) — под них музыка приглушается.
const voIntervals = (() => {
  let at = 0;
  return scenes.map(([, min, vo]) => {
    const r: [number, number] = [at + VO_START, at + VO_START + Math.ceil(vo * FPS)];
    at += durOf(min, vo);
    return r;
  });
})();

const MUSIC_UNDER_VOICE = 0.12;
const MUSIC_OPEN = 0.3;
const musicVolume = (f: number) => {
  // плавно: 10 кадров на подъём/спад
  let k = 0;
  for (const [a, b] of voIntervals) {
    if (f >= a - 10 && f <= b + 10) {
      k = Math.max(k, Math.min(1, (f - (a - 10)) / 10, (b + 10 - f) / 10));
    }
  }
  return MUSIC_OPEN + (MUSIC_UNDER_VOICE - MUSIC_OPEN) * k;
};

export const SalesPlan: React.FC = () => (
  <AbsoluteFill style={{ background: "#06050b" }}>
    <Html5Audio src={staticFile("music/bg.mp3")} volume={musicVolume} />
    <Series>
      {scenes.map(([Comp, min, vo], i) => {
        const dur = durOf(min, vo);
        return (
          <Series.Sequence key={i} durationInFrames={dur}>
            <Comp dur={dur} />
            <Sequence from={VO_START} layout="none">
              <Html5Audio src={staticFile(`vo/${String(i + 1).padStart(2, "0")}.mp3`)} />
            </Sequence>
          </Series.Sequence>
        );
      })}
    </Series>
  </AbsoluteFill>
);
