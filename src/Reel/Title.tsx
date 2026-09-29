import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { blurInOut } from "./motion";
import { colors, fonts, layout, shadows, type } from "./theme";

// Kicker ("шаг 1") + bold title. Words reveal left to right out of a blur,
// the whole block dissolves on exit.
export const Title: React.FC<{
  kicker: string;
  title: string;
  durationInFrames: number;
}> = ({ kicker, title, durationInFrames }) => {
  const frame = useCurrentFrame();
  const block = blurInOut({ frame, duration: durationInFrames, inFrames: 1 });
  const words = title.split(" ");
  const kickerIn = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        opacity: block.opacity,
        filter: block.filter,
        fontFamily: fonts.ui,
        color: colors.white,
        textShadow: shadows.text,
        alignItems: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: layout.kickerY - type.kicker.fontSize / 2,
          ...type.kicker,
          opacity: kickerIn,
          filter: `blur(${(1 - kickerIn) * 8}px)`,
        }}
      >
        {kicker}
      </div>
      <div
        style={{
          position: "absolute",
          top: layout.titleY - type.title.fontSize / 2,
          width: layout.width - 80,
          textAlign: "center",
          lineHeight: 1.05,
          ...type.title,
        }}
      >
        {words.map((w, i) => {
          const local = frame - 3 - i * 3;
          const p = interpolate(local, [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                opacity: p,
                filter: `blur(${(1 - p) * 14}px)`,
                transform: `translateX(${(1 - p) * 18}px)`,
                marginRight: i < words.length - 1 ? "0.25em" : 0,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
