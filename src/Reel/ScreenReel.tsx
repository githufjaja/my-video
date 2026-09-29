import { z } from "zod";
import {
  AbsoluteFill,
  Easing,
  Freeze,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { msToFrame } from "./motion";
import { Layers } from "./Reel";
import { reelSchema } from "./schema";

// A vertical reel cut from a horizontal screen recording: the recording plays in
// a rounded "window" between the titles and the captions, over a blurred copy of itself.

const segment = z.object({
  // Source range in seconds, played at `rate`. rate 0 = hold the `fromS` frame.
  fromS: z.number(),
  toS: z.number(),
  rate: z.number(),
  // Length of a hold (rate 0), in seconds.
  holdS: z.number().optional(),
});

const cameraCue = z.object({
  // Output time the camera starts moving here.
  fromMs: z.number(),
  // Point of the source recording to center on, in source pixels.
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});

export const screenReelSchema = reelSchema
  .omit({ footage: true, zooms: true })
  .extend({
    source: z.string(),
    sourceWidth: z.number(),
    sourceHeight: z.number(),
    segments: z.array(segment),
    camera: z.array(cameraCue),
  });

export type ScreenReelProps = z.infer<typeof screenReelSchema>;
type Segment = z.infer<typeof segment>;

export const segmentSeconds = (s: Segment) =>
  s.rate === 0 ? (s.holdS ?? 1) : (s.toS - s.fromS) / s.rate;

export const WINDOW = { x: 40, y: 430, width: 1000, height: 1160, radius: 44 };
const MOVE_FRAMES = 10;

type View = { x: number; y: number; zoom: number };

const useCamera = (camera: ScreenReelProps["camera"], fallback: View): View => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  let prev = fallback;
  let current = fallback;
  let start = 0;
  for (const cue of camera) {
    const at = msToFrame(cue.fromMs, fps);
    if (at > frame) break;
    prev = current;
    current = cue;
    start = at;
  }
  const t = interpolate(frame, [start, start + MOVE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  return {
    x: prev.x + (current.x - prev.x) * t,
    y: prev.y + (current.y - prev.y) * t,
    zoom: prev.zoom + (current.zoom - prev.zoom) * t,
  };
};

const SegmentVideo: React.FC<{
  src: string;
  seg: Segment;
  view: View;
  sourceWidth: number;
  sourceHeight: number;
}> = ({ src, seg, view, sourceWidth, sourceHeight }) => {
  const { fps } = useVideoConfig();
  // Zoom 1 = the recording's full height fills the window.
  const scale = (WINDOW.height / sourceHeight) * view.zoom;
  const w = sourceWidth * scale;
  const h = sourceHeight * scale;
  // Keep the recording covering the whole window.
  const left = Math.min(
    0,
    Math.max(WINDOW.width - w, WINDOW.width / 2 - view.x * scale),
  );
  const top = Math.min(
    0,
    Math.max(WINDOW.height - h, WINDOW.height / 2 - view.y * scale),
  );
  const video = (style: React.CSSProperties) => (
    <OffthreadVideo
      src={staticFile(src)}
      muted
      trimBefore={Math.round(seg.fromS * fps)}
      trimAfter={seg.rate === 0 ? undefined : Math.round(seg.toS * fps)}
      playbackRate={seg.rate === 0 ? 1 : seg.rate}
      style={style}
    />
  );
  const content = (
    <AbsoluteFill>
      {video({
        width: "100%",
        height: "100%",
        objectFit: "cover",
        filter: "blur(48px) brightness(0.62) saturate(1.2)",
        transform: "scale(1.25)",
      })}
      <div
        style={{
          position: "absolute",
          left: WINDOW.x,
          top: WINDOW.y,
          width: WINDOW.width,
          height: WINDOW.height,
          borderRadius: WINDOW.radius,
          overflow: "hidden",
          boxShadow: "0 30px 90px rgba(0, 0, 0, 0.5)",
          outline: "2px solid rgba(255, 255, 255, 0.14)",
          outlineOffset: -2,
        }}
      >
        {video({
          position: "absolute",
          left,
          top,
          width: w,
          height: h,
          // Tailwind's preflight caps media at max-width: 100%.
          maxWidth: "none",
        })}
      </div>
    </AbsoluteFill>
  );
  return seg.rate === 0 ? <Freeze frame={0}>{content}</Freeze> : content;
};

export const ScreenReel: React.FC<ScreenReelProps> = ({
  source,
  sourceWidth,
  sourceHeight,
  segments,
  camera,
  titles,
  captions,
  overlays,
}) => {
  const { fps } = useVideoConfig();
  const view = useCamera(camera, {
    x: sourceWidth / 2,
    y: sourceHeight / 2,
    zoom: 1,
  });
  let cursor = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#1b1320" }}>
      {segments.map((seg, i) => {
        const from = cursor;
        const duration = Math.round(segmentSeconds(seg) * fps);
        cursor += duration;
        return (
          <Sequence key={i} from={from} durationInFrames={duration}>
            <SegmentVideo
              src={source}
              seg={seg}
              view={view}
              sourceWidth={sourceWidth}
              sourceHeight={sourceHeight}
            />
          </Sequence>
        );
      })}
      <Layers titles={titles} captions={captions} overlays={overlays} />
    </AbsoluteFill>
  );
};
