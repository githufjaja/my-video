import type { CaptionPage, ReelProps } from "./schema";

// Timeline of the reference reel ("Монтаж рилсов в Claude"), read off its frames.
// Replace with your own script, or generate captions with `npm run captions`.

const s = (sec: number) => Math.round(sec * 1000);

// [start in seconds, text]. Each page lasts until the next one; "" = no caption.
const script: [number, string][] = [
  [0.0, "Давайте теперь"],
  [1.0, "расскажу за минуту,"],
  [2.0, "как в Claude"],
  [2.5, "монтировать вот такие"],
  [3.25, "вот красивые рилсы"],
  [4.5, "с анимациями,"],
  [5.5, "переходами,"],
  [6.25, "сменами камер,"],
  [7.75, "звуковыми эффектами и"],
  [8.75, "прочим."],
  [9.75, "Что мы делаем?"],
  [10.5, "Мы переходим в"],
  [11.0, "браузер,"],
  [12.0, "заходим на сайт"],
  [13.0, "remotion.dev и просто"],
  [15.0, "копируем команду."],
  [16.0, "Дальше мы ее"],
  [16.75, "вставляем себе в"],
  [17.5, "Claude и"],
  [19.25, "устанавливаем."],
  [20.0, "Он нам сам"],
  [20.5, "установит."],
  [21.0, "Дальше мы заходим"],
  [22.25, "в Claude,"],
  [24.0, "скидываем ему наш"],
  [24.75, "снятый рилс,"],
  [25.75, "говорим давай его"],
  [26.25, "смонтируем с помощью"],
  [27.0, "Remotion."],
  [27.5, "И важно,"],
  [28.5, "чтобы у нас"],
  [28.75, "стояла моделька"],
  [30.0, "Opus 5.5,"],
  [31.25, ""],
  [33.0, "вот Opus 5.5,"],
  [34.75, ""],
  [35.25, "он нам его"],
  [35.75, "монтирует так,"],
  [36.5, "как мы ему"],
  [37.0, "опишем."],
  [37.25, "Но если ты"],
  [37.75, "не хочешь париться,"],
  [38.5, "можешь просто мой"],
  [39.25, "рилс скопировать,"],
  [40.25, "он тоже с"],
  [40.75, "помощью Claude Code"],
  [42.75, "смонтирован."],
  [43.75, "Или где-то на"],
  [44.5, "просторах интернета"],
  [45.25, "можешь найти любой"],
  [46.25, "ролик,"],
  [46.75, "закинуть в"],
  [47.25, "Claude Code,"],
  [47.75, "сказать разбери"],
  [49.0, "дизайн-систему,"],
  [49.75, "как это вообще"],
  [50.25, "всё смонтировано,"],
  [51.0, "и давай будем"],
  [51.5, "делать такие же."],
  [52.75, "Всё."],
  [54.0, "Всё просто."],
  [55.25, "Не забудь"],
  [55.5, "подписаться,"],
  [56.0, "у меня много"],
  [57.0, "полезного в профиле"],
  [58.5, "по работе с"],
  [59.0, "нейросетями,"],
  [59.75, "поэтому переходи,"],
  [60.5, "смотри и"],
  [61.0, "подписывайся."],
];

const END = 61.8;

// Spread a page's time across its words proportionally to their length.
export const toPages = (rows: [number, string][], end: number): CaptionPage[] =>
  rows.flatMap(([start, text], i) => {
    if (!text) return [];
    const stop = i + 1 < rows.length ? rows[i + 1][0] : end;
    const words = text.split(" ");
    const total = words.reduce((n, w) => n + w.length, 0);
    let cursor = start;
    return [
      {
        startMs: s(start),
        endMs: s(stop),
        words: words.map((w) => {
          const len = ((stop - start) * w.length) / total;
          const word = { text: w, startMs: s(cursor), endMs: s(cursor + len) };
          cursor += len;
          return word;
        }),
      },
    ];
  });

export const demoProps: ReelProps = {
  footage: "",
  durationMs: s(END),
  titles: [
    {
      fromMs: s(0),
      toMs: s(2.9),
      kicker: "за одну минуту",
      title: "Монтаж рилсов в Claude",
    },
    {
      fromMs: s(11.4),
      toMs: s(16.3),
      kicker: "шаг 1",
      title: "Сайт remotion.dev",
    },
    {
      fromMs: s(16.6),
      toMs: s(21.0),
      kicker: "шаг 2",
      title: "Команду — в Claude Code",
    },
    {
      fromMs: s(21.4),
      toMs: s(28.6),
      kicker: "шаг 3",
      title: "Скинуть рилс в Claude",
    },
    {
      fromMs: s(29.0),
      toMs: s(37.4),
      kicker: "шаг 4",
      title: "Выбрать модель",
    },
    {
      fromMs: s(37.6),
      toMs: s(43.6),
      kicker: "или",
      title: "Скопируй этот рилс",
    },
    {
      fromMs: s(43.9),
      toMs: s(52.8),
      kicker: "или",
      title: "Повтори любой ролик",
    },
    {
      fromMs: s(54.8),
      toMs: s(END),
      kicker: "@vladlyamin",
      title: "Полезное про нейросети",
    },
  ],
  captions: toPages(script, END),
  overlays: [
    {
      type: "command",
      fromMs: s(15.0),
      toMs: s(17.9),
      command: "npx create-video@latest",
      copiedAtMs: 250,
    },
    {
      type: "model",
      fromMs: s(29.8),
      toMs: s(34.0),
      label: "модель в Claude Code",
      model: "Opus 5.5",
    },
    {
      type: "prompt",
      fromMs: s(46.8),
      toMs: s(52.3),
      label: "промпт в Claude Code",
      text: "Разбери дизайн-систему этого ролика и давай сделаем такой же",
      typingMs: 3200,
    },
    { type: "subscribe", fromMs: s(55.3), toMs: s(END), clickAtMs: 900 },
  ],
  zooms: [
    { fromMs: s(0), scale: 1 },
    { fromMs: s(21.0), scale: 1.12 },
    { fromMs: s(25.75), scale: 1 },
    { fromMs: s(37.25), scale: 1.12 },
    { fromMs: s(43.75), scale: 1 },
    { fromMs: s(51.0), scale: 1.1 },
    { fromMs: s(54.0), scale: 1 },
  ],
};
