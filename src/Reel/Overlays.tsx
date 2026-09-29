import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { blurInOut, msToFrame, pop } from "./motion";
import type { OverlayCue } from "./schema";
import { colors, fonts, layout, shadows } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// White card; turns lime-bordered with a glow once its action is "done".
const Card: React.FC<{
  done: number;
  width?: number;
  padding?: string;
  children: React.ReactNode;
}> = ({ done, width = layout.cardWidth, padding = "28px 34px", children }) => (
  <div
    style={{
      width,
      padding,
      boxSizing: "border-box",
      background: "rgba(255, 255, 255, 0.97)",
      borderRadius: layout.radius,
      border: `3px solid ${done > 0.5 ? colors.limeBorder : colors.cardBorder}`,
      boxShadow: `${shadows.card}, 0 0 ${30 * done}px ${colors.limeGlow}`,
      fontFamily: fonts.ui,
      color: colors.ink,
    }}
  >
    {children}
  </div>
);

export const ClaudeIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 48 48">
    <rect width="48" height="48" rx="11" fill={colors.claude} />
    {Array.from({ length: 12 }).map((_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const r1 = 4;
      const r2 = i % 2 === 0 ? 15 : 12.5;
      return (
        <line
          key={i}
          x1={24 + Math.cos(a) * r1}
          y1={24 + Math.sin(a) * r1}
          x2={24 + Math.cos(a) * r2}
          y2={24 + Math.sin(a) * r2}
          stroke="#fff"
          strokeWidth={3.4}
          strokeLinecap="round"
        />
      );
    })}
  </svg>
);

const CommandCard: React.FC<{ command: string; copiedAt: number }> = ({
  command,
  copiedAt,
}) => {
  const frame = useCurrentFrame();
  const done = interpolate(frame, [copiedAt, copiedAt + 4], [0, 1], clamp);
  const copied = frame >= copiedAt;
  return (
    <Card done={done} padding="22px 22px 22px 34px">
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 40, flex: 1 }}>
          <span style={{ color: colors.muted }}>$ </span>
          {command}
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            padding: "16px 26px",
            borderRadius: 18,
            background: copied ? colors.lime : "#F1F1F1",
            transform: `scale(${1 + (copied ? 0.06 * (1 - done) : 0)})`,
          }}
        >
          {copied ? "скопировано" : "копировать"}
        </div>
      </div>
    </Card>
  );
};

const ModelBadge: React.FC<{ label: string; model: string }> = ({
  label,
  model,
}) => (
  <Card done={1} width={600} padding="24px 36px 24px 26px">
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <ClaudeIcon size={92} />
      <div>
        <div style={{ fontSize: 24, fontWeight: 600, color: colors.muted }}>
          {label}
        </div>
        <div
          style={{
            fontSize: 68,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
          }}
        >
          {model}
        </div>
      </div>
    </div>
  </Card>
);

const PromptCard: React.FC<{
  label: string;
  text: string;
  typingFrames: number;
}> = ({ label, text, typingFrames }) => {
  const frame = useCurrentFrame();
  const chars = Math.round(
    interpolate(frame, [6, 6 + typingFrames], [0, text.length], clamp),
  );
  const done = interpolate(
    frame,
    [6 + typingFrames, 10 + typingFrames],
    [0, 1],
    clamp,
  );
  const caretOn = Math.floor(frame / 8) % 2 === 0 || chars < text.length;
  return (
    <Card done={done}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 24,
          fontWeight: 600,
          color: colors.muted,
          marginBottom: 12,
        }}
      >
        <ClaudeIcon size={32} />
        {label}
      </div>
      <div
        style={{
          fontSize: 38,
          fontWeight: 700,
          lineHeight: 1.25,
          letterSpacing: "-0.01em",
          minHeight: 48,
        }}
      >
        {text.slice(0, chars)}
        <span
          style={{
            display: "inline-block",
            width: 3,
            height: 42,
            marginLeft: 2,
            verticalAlign: "-6px",
            background: colors.ink,
            opacity: caretOn ? 1 : 0,
          }}
        />
      </div>
    </Card>
  );
};

const Cursor: React.FC = () => (
  <svg width="44" height="54" viewBox="0 0 22 27">
    <path
      d="M2 2 L2 21 L7 16.5 L10.5 24.5 L14 23 L10.6 15.2 L17 15.2 Z"
      fill="#111"
      stroke="#fff"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

// App icon for the pill tracker: a pearl on an ink tile.
export const PearlIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 48 48">
    <defs>
      <radialGradient id="pearl" cx="0.38" cy="0.34" r="0.7">
        <stop offset="0" stopColor="#FFFFFF" />
        <stop offset="0.55" stopColor="#EDE8E1" />
        <stop offset="1" stopColor="#B9B1A8" />
      </radialGradient>
    </defs>
    <rect width="48" height="48" rx="11" fill={colors.ink} />
    <circle cx="24" cy="24" r="12.5" fill="url(#pearl)" />
    <circle
      cx="24"
      cy="24"
      r="16.5"
      fill="none"
      stroke={colors.lime}
      strokeWidth="2"
    />
  </svg>
);

const ReminderCard: React.FC<{
  app: string;
  time: string;
  title: string;
  text: string;
  button: string;
  doneButton: string;
  doneAt: number;
}> = ({ app, time, title, text, button, doneButton, doneAt }) => {
  const frame = useCurrentFrame();
  const done = interpolate(frame, [doneAt, doneAt + 4], [0, 1], clamp);
  const isDone = frame >= doneAt;
  const press = interpolate(
    frame,
    [doneAt - 3, doneAt, doneAt + 5],
    [1, 0.93, 1],
    clamp,
  );
  return (
    <Card done={done} padding="24px 26px 24px 26px">
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <PearlIcon size={84} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 22,
              fontWeight: 600,
              color: colors.muted,
            }}
          >
            <span>{app}</span>
            <span>{time}</span>
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              marginTop: 2,
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 28, fontWeight: 500, color: "#555" }}>
            {text}
          </div>
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            padding: "18px 26px",
            borderRadius: 18,
            whiteSpace: "nowrap",
            background: isDone ? colors.lime : "#F1F1F1",
            transform: `scale(${press})`,
          }}
        >
          {isDone ? doneButton : button}
        </div>
      </div>
    </Card>
  );
};

const StreakCard: React.FC<{
  label: string;
  days: number;
  total: number;
  suffix: string;
}> = ({ label, days, total, suffix }) => {
  const frame = useCurrentFrame();
  // One day lights up every 4 frames, starting after the card has landed.
  const lit = Math.min(days, Math.max(0, Math.floor((frame - 8) / 4) + 1));
  const done = lit >= days ? 1 : 0;
  return (
    <Card done={done} padding="26px 34px 30px">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 600, color: colors.muted }}>
          {label}
        </div>
        <div
          style={{ fontSize: 60, fontWeight: 800, letterSpacing: "-0.03em" }}
        >
          {lit} <span style={{ fontSize: 34 }}>{suffix}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 12,
              background: i < lit ? colors.lime : "#EFEFEF",
              border: `2px solid ${i < lit ? colors.limeBorder : "transparent"}`,
            }}
          />
        ))}
      </div>
    </Card>
  );
};

const SubscribeButton: React.FC<{
  clickAt: number;
  label: string;
  doneLabel: string;
}> = ({ clickAt, label, doneLabel }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const subscribed = frame >= clickAt;
  const press = interpolate(
    frame,
    [clickAt - 3, clickAt, clickAt + 5],
    [1, 0.92, 1],
    clamp,
  );
  // Cursor glides in from the lower right, clicks, then fades away.
  const glide = pop(frame, fps, clickAt - 16);
  const cursorOut = interpolate(
    frame,
    [clickAt + 10, clickAt + 18],
    [1, 0],
    clamp,
  );
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          transform: `scale(${press})`,
          padding: "26px 56px",
          borderRadius: 999,
          fontFamily: fonts.ui,
          fontSize: 36,
          fontWeight: 700,
          color: colors.ink,
          background: subscribed ? colors.white : colors.lime,
          border: `3px solid ${subscribed ? colors.limeBorder : colors.lime}`,
          boxShadow: `${shadows.card}, 0 0 28px ${colors.limeGlow}`,
          whiteSpace: "nowrap",
        }}
      >
        {subscribed ? doneLabel : label}
      </div>
      <div
        style={{
          position: "absolute",
          left: "62%",
          top: "55%",
          opacity: glide * cursorOut,
          transform: `translate(${(1 - glide) * 160}px, ${(1 - glide) * 120}px)`,
        }}
      >
        <Cursor />
      </div>
    </div>
  );
};

// Everything in this layer sits in one slot just above the captions.
export const Overlay: React.FC<{
  cue: OverlayCue;
  durationInFrames: number;
}> = ({ cue, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = blurInOut({ frame, duration: durationInFrames });
  const scale =
    interpolate(t.enter, [0, 1], [0.92, 1]) *
    interpolate(t.exit, [0, 1], [1, 0.96]);

  let content: React.ReactNode;
  switch (cue.type) {
    case "command":
      content = (
        <CommandCard
          command={cue.command}
          copiedAt={msToFrame(cue.copiedAtMs, fps)}
        />
      );
      break;
    case "model":
      content = <ModelBadge label={cue.label} model={cue.model} />;
      break;
    case "prompt":
      content = (
        <PromptCard
          label={cue.label}
          text={cue.text}
          typingFrames={msToFrame(cue.typingMs, fps)}
        />
      );
      break;
    case "subscribe":
      content = (
        <SubscribeButton
          clickAt={msToFrame(cue.clickAtMs, fps)}
          label={cue.label ?? "Подписаться"}
          doneLabel={cue.doneLabel ?? "Вы подписаны"}
        />
      );
      break;
    case "reminder":
      content = (
        <ReminderCard
          app={cue.app}
          time={cue.time}
          title={cue.title}
          text={cue.text}
          button={cue.button}
          doneButton={cue.doneButton}
          doneAt={msToFrame(cue.doneAtMs, fps)}
        />
      );
      break;
    case "streak":
      content = (
        <StreakCard
          label={cue.label}
          days={cue.days}
          total={cue.total}
          suffix={cue.suffix}
        />
      );
      break;
  }

  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: layout.overlayY,
          transform: `translateY(-50%) scale(${scale})`,
          opacity: t.opacity,
          filter: t.filter,
        }}
      >
        {content}
      </div>
    </AbsoluteFill>
  );
};
