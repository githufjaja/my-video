import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Captions } from "./Captions";
import { msToFrame } from "./motion";
import { Overlay } from "./Overlays";
import type { ReelProps } from "./schema";
import { Title } from "./Title";

// Stand-in for the talking-head footage: warm, soft, room-like.
const Placeholder: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "radial-gradient(60% 45% at 50% 42%, #d9c4b0 0%, #b89c86 45%, #6f5647 100%)",
    }}
  >
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(38% 30% at 50% 55%, rgba(245,238,230,0.55), rgba(0,0,0,0) 70%)",
      }}
    />
  </AbsoluteFill>
);

const Footage: React.FC<{ src: string; zooms: ReelProps["zooms"] }> = ({
  src,
  zooms,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const active = [...zooms].reverse().find((z) => ms >= z.fromMs);
  const scale = active?.scale ?? 1;
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})` }}>
      {src ? (
        <OffthreadVideo
          src={staticFile(src)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <Placeholder />
      )}
    </AbsoluteFill>
  );
};

export const Reel: React.FC<ReelProps> = ({
  footage,
  titles,
  captions,
  overlays,
  zooms,
}) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Footage src={footage} zooms={zooms} />
    <Layers titles={titles} captions={captions} overlays={overlays} />
  </AbsoluteFill>
);

// Titles, overlay cards and captions: the design system on top of any footage.
export const Layers: React.FC<
  Pick<ReelProps, "titles" | "captions" | "overlays">
> = ({ titles, captions, overlays }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      {titles.map((t, i) => {
        const from = msToFrame(t.fromMs, fps);
        const duration = msToFrame(t.toMs, fps) - from;
        return (
          <Sequence
            key={`t${i}`}
            from={from}
            durationInFrames={duration}
            layout="none"
          >
            <Title
              kicker={t.kicker}
              title={t.title}
              durationInFrames={duration}
            />
          </Sequence>
        );
      })}

      {overlays.map((o, i) => {
        const from = msToFrame(o.fromMs, fps);
        const duration = msToFrame(o.toMs, fps) - from;
        return (
          <Sequence
            key={`o${i}`}
            from={from}
            durationInFrames={duration}
            layout="none"
          >
            <Overlay cue={o} durationInFrames={duration} />
          </Sequence>
        );
      })}

      <Captions pages={captions} />
    </AbsoluteFill>
  );
};
