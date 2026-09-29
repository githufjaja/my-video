import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { CaptionPage } from "./schema";
import { colors, fonts, layout, type } from "./theme";

// Karaoke captions: uppercase heavy grotesk, already-spoken words turn cream-yellow,
// upcoming words stay white. Pages cut hard (no transition), like the reference.
export const Captions: React.FC<{ pages: CaptionPage[] }> = ({ pages }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const page = pages.find((p) => ms >= p.startMs && ms < p.endMs);
  if (!page) return null;

  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: layout.captionY - type.caption.fontSize / 2,
          width: layout.width - 120,
          textAlign: "center",
          fontFamily: fonts.caption,
          textTransform: "uppercase",
          lineHeight: 1.1,
          ...type.caption,
          // Thin dark outline + soft drop shadow keeps it readable on any footage.
          WebkitTextStroke: "5px rgba(20, 16, 12, 0.9)",
          paintOrder: "stroke fill",
          textShadow: "0 3px 10px rgba(0, 0, 0, 0.45)",
        }}
      >
        {page.words.map((w, i) => (
          <span
            key={i}
            style={{ color: ms >= w.startMs ? colors.spoken : colors.white }}
          >
            {w.text}
            {i < page.words.length - 1 ? " " : ""}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
