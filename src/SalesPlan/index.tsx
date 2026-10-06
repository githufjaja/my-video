import React from "react";
import { AbsoluteFill, Series } from "remotion";
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
const scenes: [React.FC<{ dur: number }>, number][] = [
  [S1Hook, 150],
  [S2Question, 90],
  [S3Pace, 200],
  [S4Flash, 40],
  [S5Levers, 270],
  [S6Core, 240],
  [S7Cross, 300],
  [S8Season, 200],
  [S9B2B, 190],
  [S10Calls, 270],
  [S11Energy, 260],
  [S12Timeline, 250],
  [S13Daily, 200],
  [S14Final, 160],
];

export const SALES_PLAN_DURATION = scenes.reduce((s, [, d]) => s + d, 0);

export const SalesPlan: React.FC = () => (
  <AbsoluteFill style={{ background: "#06050b" }}>
    <Series>
      {scenes.map(([Comp, dur], i) => (
        <Series.Sequence key={i} durationInFrames={dur}>
          <Comp dur={dur} />
        </Series.Sequence>
      ))}
    </Series>
  </AbsoluteFill>
);
