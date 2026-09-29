import { Easing, interpolate, spring } from "remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// The one transition the reference uses everywhere: elements appear out of a blur
// and dissolve back into one. `frame` is local to the element, `duration` is its
// total length in frames.
export const blurInOut = ({
  frame,
  duration,
  inFrames = 9,
  outFrames = 8,
  blur = 18,
}: {
  frame: number;
  duration: number;
  inFrames?: number;
  outFrames?: number;
  blur?: number;
}) => {
  const enter = interpolate(frame, [0, inFrames], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const exit = interpolate(frame, [duration - outFrames, duration], [0, 1], {
    ...clamp,
    easing: Easing.in(Easing.cubic),
  });
  const visible = enter * (1 - exit);
  return {
    opacity: visible,
    filter: `blur(${(1 - visible) * blur}px)`,
    enter,
    exit,
  };
};

export const pop = (frame: number, fps: number, delay = 0) =>
  spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, stiffness: 180, mass: 0.7 },
  });

export const msToFrame = (ms: number, fps: number) =>
  Math.round((ms / 1000) * fps);
