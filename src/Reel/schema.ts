import { z } from "zod";

const word = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
});

// One caption "page": 1-3 words shown together, highlighted word by word.
export const captionPage = z.object({
  startMs: z.number(),
  endMs: z.number(),
  words: z.array(word),
});

export const titleCue = z.object({
  fromMs: z.number(),
  toMs: z.number(),
  kicker: z.string(),
  title: z.string(),
});

const cueBase = { fromMs: z.number(), toMs: z.number() };

export const overlayCue = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("command"),
    ...cueBase,
    command: z.string(),
    // When the "копировать" pill flips to "скопировано", relative to fromMs.
    copiedAtMs: z.number(),
  }),
  z.object({
    type: z.literal("model"),
    ...cueBase,
    label: z.string(),
    model: z.string(),
  }),
  z.object({
    type: z.literal("prompt"),
    ...cueBase,
    label: z.string(),
    text: z.string(),
    // How long the typing takes, relative to fromMs.
    typingMs: z.number(),
  }),
  z.object({
    type: z.literal("subscribe"),
    ...cueBase,
    // When the cursor clicks, relative to fromMs.
    clickAtMs: z.number(),
    // Button text before / after the click. Defaults: Подписаться / Вы подписаны.
    label: z.string().optional(),
    doneLabel: z.string().optional(),
  }),
  z.object({
    // Push-style reminder; its button flips to the lime "done" state.
    type: z.literal("reminder"),
    ...cueBase,
    app: z.string(),
    time: z.string(),
    title: z.string(),
    text: z.string(),
    button: z.string(),
    doneButton: z.string(),
    // When the button is tapped, relative to fromMs.
    doneAtMs: z.number(),
  }),
  z.object({
    // Streak counter: a row of days filling in lime one by one.
    type: z.literal("streak"),
    ...cueBase,
    label: z.string(),
    days: z.number(),
    total: z.number(),
    suffix: z.string(),
  }),
]);

export const zoomCue = z.object({
  fromMs: z.number(),
  scale: z.number(),
});

export const reelSchema = z.object({
  // File in public/, e.g. "footage.mp4". Empty = placeholder background.
  footage: z.string(),
  durationMs: z.number(),
  titles: z.array(titleCue),
  captions: z.array(captionPage),
  overlays: z.array(overlayCue),
  // Hard "jump zooms" on the talking head, like camera changes.
  zooms: z.array(zoomCue),
});

export type ReelProps = z.infer<typeof reelSchema>;
export type CaptionPage = z.infer<typeof captionPage>;
export type TitleCue = z.infer<typeof titleCue>;
export type OverlayCue = z.infer<typeof overlayCue>;
