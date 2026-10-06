import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { continueRender, delayRender, staticFile } from "remotion";

// Шрифты лежат локально в public/fonts (рендер без доступа к Google Fonts).
const CYR = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";
const LAT =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const fontFiles: [string, string, string][] = [
  ["Montserrat", "montserrat-cyrillic.woff2", CYR],
  ["Montserrat", "montserrat-latin.woff2", LAT],
  ["JetBrains Mono", "jetbrainsmono-cyrillic.woff2", CYR],
  ["JetBrains Mono", "jetbrainsmono-latin.woff2", LAT],
];
if (typeof document !== "undefined") {
  const handle = delayRender("Загрузка шрифтов");
  Promise.all(
    fontFiles.map(([family, file, unicodeRange]) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)}) format("woff2")`, {
        weight: "100 900",
        unicodeRange,
      });
      document.fonts.add(face);
      return face.load();
    }),
  )
    .then(() => continueRender(handle))
    .catch((e) => {
      console.error(e);
      continueRender(handle);
    });
}
const display = { fontFamily: "Montserrat, sans-serif" };
const mono = { fontFamily: "'JetBrains Mono', monospace" };

export const C = {
  bg: "#06050b",
  violet: "#8b5cf6",
  violetHi: "#a78bfa",
  hot: "#c084fc",
  white: "#f4f1ff",
  dim: "rgba(244,241,255,0.55)",
  line: "rgba(244,241,255,0.75)",
  display: display.fontFamily,
  mono: mono.fontFamily,
};

export const glow = (a = 0.9, r = 28) =>
  `0 0 ${r}px rgba(139,92,246,${a}), 0 0 ${r * 2.5}px rgba(139,92,246,${a * 0.5})`;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const useSlam = (delay = 0, from = 1.35) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.6, stiffness: 180 } });
  return {
    opacity: interpolate(frame - delay, [0, 4], [0, 1], clamp),
    transform: `scale(${interpolate(s, [0, 1], [from, 1])})`,
    filter: `blur(${interpolate(frame - delay, [0, 6], [14, 0], clamp)}px)`,
  } as React.CSSProperties;
};

export const useRise = (delay = 0, dist = 40) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame - delay, [0, 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return {
    opacity: t,
    transform: `translateY(${(1 - t) * dist}px)`,
    filter: `blur(${(1 - t) * 8}px)`,
  } as React.CSSProperties;
};

// Фон: сетка, фиолетовое свечение, виньетка.
export const Background: React.FC<{ glowX?: number; glowY?: number }> = ({ glowX = 50, glowY = 45 }) => {
  const frame = useCurrentFrame();
  const shift = (frame * 0.4) % 80;
  const pulse = 0.55 + 0.1 * Math.sin(frame / 18);
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(244,241,255,0.07) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(244,241,255,0.07) 1.5px, transparent 1.5px)",
          backgroundSize: "80px 80px",
          backgroundPosition: `${shift}px ${shift / 2}px`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 55% 45% at ${glowX}% ${glowY}%, rgba(124,58,237,${pulse * 0.45}) 0%, rgba(76,29,149,0.12) 45%, transparent 75%)`,
        }}
      />
      <AbsoluteFill
        style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.85) 100%)" }}
      />
    </AbsoluteFill>
  );
};

// Обёртка сцены: глитч на входе, плавный уход в конце.
export const Scene: React.FC<{ dur: number; children: React.ReactNode; glowX?: number; glowY?: number; bare?: boolean }> = ({
  dur,
  children,
  glowX,
  glowY,
  bare,
}) => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [dur - 8, dur], [1, 0], clamp);
  const jitter = frame < 4 ? (frame % 2 === 0 ? 10 : -7) : 0;
  return (
    <AbsoluteFill>
      {!bare && <Background glowX={glowX} glowY={glowY} />}
      <AbsoluteFill
        style={{
          opacity: out,
          transform: `translateX(${jitter}px) scale(${interpolate(out, [0, 1], [1.04, 1])})`,
          filter: `blur(${(1 - out) * 10}px)`,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Mono: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({
  children,
  size = 26,
  color = C.dim,
  style,
}) => (
  <div style={{ fontFamily: C.mono, fontSize: size, color, letterSpacing: 0.5, ...style }}>{children}</div>
);

// Печать текста с курсором.
export const Typed: React.FC<{
  text: string;
  start?: number;
  cps?: number;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
  cursor?: boolean;
}> = ({ text, start = 0, cps = 40, size = 26, color = C.white, style, cursor = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.max(0, Math.floor(((frame - start) / fps) * cps));
  const shown = text.slice(0, n);
  const done = n >= text.length;
  const blink = Math.floor(frame / 8) % 2 === 0;
  if (frame < start) return null;
  return (
    <div style={{ fontFamily: C.mono, fontSize: size, color, whiteSpace: "pre-wrap", ...style }}>
      {shown}
      {cursor && (!done || blink) ? (
        <span style={{ display: "inline-block", width: size * 0.55, height: size * 1.05, background: C.violetHi, verticalAlign: "text-bottom", marginLeft: 3, boxShadow: glow(0.8, 10) }} />
      ) : null}
    </div>
  );
};

export const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export const Counter: React.FC<{ to: number; from?: number; start?: number; dur?: number; style?: React.CSSProperties }> = ({
  to,
  from = 0,
  start = 0,
  dur = 30,
  style,
}) => {
  const frame = useCurrentFrame();
  const v = interpolate(frame - start, [0, dur], [from, to], { ...clamp, easing: Easing.out(Easing.cubic) });
  return <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>{fmt(v)}</span>;
};

export const Big: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({
  children,
  size = 150,
  color = C.white,
  style,
}) => (
  <div
    style={{
      fontFamily: C.display,
      fontWeight: 900,
      fontSize: size,
      lineHeight: 0.95,
      color,
      textTransform: "uppercase",
      letterSpacing: -1,
      textShadow: color === C.white ? glow(0.35, 30) : glow(0.9, 30),
      ...style,
    }}
  >
    {children}
  </div>
);

// Рамка-панель с рисующейся обводкой.
export const Panel: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  start?: number;
  children?: React.ReactNode;
  accent?: boolean;
  style?: React.CSSProperties;
}> = ({ x, y, w, h, start = 0, children, accent, style }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame - start, [0, 16], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const per = 2 * (w + h);
  const inner = interpolate(frame - start, [8, 20], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, ...style }}>
      <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <rect
          x={1}
          y={1}
          width={w - 2}
          height={h - 2}
          fill={accent ? "rgba(139,92,246,0.14)" : "rgba(6,5,11,0.6)"}
          fillOpacity={t}
          stroke={accent ? C.violetHi : C.line}
          strokeWidth={2}
          strokeDasharray={per}
          strokeDashoffset={per * (1 - t)}
          style={{ filter: accent ? "drop-shadow(0 0 10px rgba(139,92,246,0.9))" : undefined }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, opacity: inner }}>{children}</div>
    </div>
  );
};

// Линия с бегущей светящейся точкой.
export const Wire: React.FC<{ x1: number; y1: number; x2: number; y2: number; start?: number; dur?: number }> = ({
  x1,
  y1,
  x2,
  y2,
  start = 0,
  dur = 18,
}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame - start, [0, dur], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const cx = x1 + (x2 - x1) * t;
  const cy = y1 + (y2 - y1) * t;
  return (
    <svg style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }} width={1920} height={1080}>
      <line x1={x1} y1={y1} x2={cx} y2={cy} stroke={C.line} strokeWidth={2} strokeDasharray="8 6" />
      {t > 0 && t < 1 && <circle cx={cx} cy={cy} r={9} fill={C.white} style={{ filter: "drop-shadow(0 0 12px #a78bfa) drop-shadow(0 0 24px #8b5cf6)" }} />}
      {t >= 1 && <circle cx={x2} cy={y2} r={6} fill={C.violetHi} style={{ filter: "drop-shadow(0 0 10px #8b5cf6)" }} />}
    </svg>
  );
};

export const Tag: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => {
  const st = useRise(delay, 20);
  return (
    <div style={{ position: "absolute", left: 120, top: 90, display: "flex", alignItems: "center", gap: 18, ...st }}>
      <div style={{ width: 14, height: 14, background: C.violetHi, boxShadow: glow(1, 12) }} />
      <Mono size={28} color={C.white} style={{ letterSpacing: 4, textTransform: "uppercase" }}>
        {children}
      </Mono>
    </div>
  );
};

export const Sparkle: React.FC<{ x: number; y: number; delay?: number; size?: number }> = ({ x, y, delay = 0, size = 40 }) => {
  const frame = useCurrentFrame();
  const t = frame - delay;
  if (t < 0) return null;
  const s = interpolate(t, [0, 6, 30], [0, 1.3, 0.8], clamp) * (0.85 + 0.15 * Math.sin(t / 3));
  return (
    <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, transform: `scale(${s}) rotate(${t * 2}deg)` }}>
      <div style={{ position: "absolute", left: "50%", top: 0, width: 3, height: "100%", marginLeft: -1.5, background: C.white, boxShadow: glow(1, 10) }} />
      <div style={{ position: "absolute", top: "50%", left: 0, height: 3, width: "100%", marginTop: -1.5, background: C.white, boxShadow: glow(1, 10) }} />
    </div>
  );
};
