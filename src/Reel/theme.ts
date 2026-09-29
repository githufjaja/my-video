import { loadFont } from "@remotion/fonts";
import interCyrillic from "@fontsource-variable/inter/files/inter-cyrillic-wght-normal.woff2";
import interLatin from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2";
import monoLatin from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2";
import montserratCyrillic from "@fontsource/montserrat/files/montserrat-cyrillic-900-normal.woff2";
import montserratLatin from "@fontsource/montserrat/files/montserrat-latin-900-normal.woff2";

// Design tokens measured from the reference reel (720x1280), scaled x1.5 to 1080x1920.

// Fonts are bundled from npm, so rendering never depends on a font CDN.
const CYRILLIC = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";
const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212, U+FEFF, U+FFFD";

const faces = [
  {
    family: "Inter",
    url: interCyrillic,
    weight: "100 900",
    unicodeRange: CYRILLIC,
  },
  { family: "Inter", url: interLatin, weight: "100 900", unicodeRange: LATIN },
  {
    family: "Montserrat",
    url: montserratCyrillic,
    weight: "900",
    unicodeRange: CYRILLIC,
  },
  {
    family: "Montserrat",
    url: montserratLatin,
    weight: "900",
    unicodeRange: LATIN,
  },
  {
    family: "JetBrains Mono",
    url: monoLatin,
    weight: "400",
    unicodeRange: LATIN,
  },
];
faces.forEach((face) => loadFont(face));

export const fonts = {
  ui: "Inter, sans-serif",
  caption: "Montserrat, Inter, sans-serif",
  mono: "'JetBrains Mono', monospace",
};

export const colors = {
  white: "#FFFFFF",
  // Words that have already been spoken in the karaoke captions.
  spoken: "#F8F0A8",
  // Accent for "done / active" states: copied pill, finished prompt, subscribe button.
  lime: "#E1F777",
  limeBorder: "#D2E87A",
  limeGlow: "rgba(214, 240, 110, 0.55)",
  ink: "#111111",
  muted: "#8A8A8A",
  claude: "#D97757",
  cardBorder: "rgba(0, 0, 0, 0.06)",
};

export const layout = {
  width: 1080,
  height: 1920,
  // Vertical anchors (center lines) for the three layers.
  kickerY: 270,
  titleY: 345,
  overlayY: 1400,
  captionY: 1650,
  cardWidth: 920,
  radius: 26,
};

export const type = {
  kicker: { fontSize: 30, fontWeight: 600 },
  title: { fontSize: 72, fontWeight: 800, letterSpacing: "-0.035em" },
  caption: { fontSize: 44, fontWeight: 900, letterSpacing: "-0.01em" },
};

export const shadows = {
  text: "0 2px 14px rgba(0, 0, 0, 0.45), 0 1px 3px rgba(0, 0, 0, 0.35)",
  card: "0 18px 50px rgba(0, 0, 0, 0.28)",
};
