import { toPages } from "./demo";
import { ritualProps } from "./ritual";
import type { ScreenReelProps } from "./ScreenReel";

// Ukrainian version of the "Ритуал" demo: same edit and timings, new text.

const s = (sec: number) => Math.round(sec * 1000);
const END = ritualProps.durationMs / 1000;

// Voiceover phrases (public/voiceover-uk.mp3, ElevenLabs "Kateryna"), with where
// each one sits in the mix, in seconds. Captions follow the voice: each phrase is
// split into its caption pages, timed by text length.
const phrases: [number, number, string[]][] = [
  [0.0, 2.82, ["Це Ритуал —", "трекер добавок", "від Perla Helsa."]],
  [
    3.02,
    6.54,
    ["Усі твої курси", "в одному місці:", "що пити,", "скільки", "і о котрій."],
  ],
  [6.8, 10.01, ["Налаштовуєш один раз —", "і календар прийомів", "готовий."]],
  [10.21, 11.8, ["Зранку приходить", "нагадування."]],
  [12.0, 14.24, ["Приймаєш —", "відмічаєш", "одним дотиком."]],
  [14.6, 17.53, ["Колаген,", "омега-3,", "магній —", "усе за планом."]],
  [
    18.1,
    21.41,
    ["Закриваєш день —", "отримуєш нагороду", "і серію", "без пропусків."],
  ],
  [24.0, 25.27, ["Усе на сьогодні", "прийнято."]],
  [
    26.1,
    30.27,
    [
      "Хочеш новий курс?",
      "Увесь каталог",
      "Perla Helsa —",
      "просто в застосунку.",
    ],
  ],
  [30.6, 33.61, ["Знаходиш потрібне —", "наприклад, колаген", "з персиком."]],
  [33.81, 36.68, ["Час, дозування,", "частота —", "за пару секунд."]],
  [37.2, 39.7, ["А детальніше —", "одразу на сайті", "бренду."]],
  [40.2, 43.28, ["Додаєш у розклад —", "і він уже", "в плані на сьогодні."]],
  [43.48, 45.27, ["Відмічаєш —", "і знову", "нагорода."]],
  [46.9, 47.68, ["Ти молодець!"]],
  [48.4, 49.68, ["Шість із шести."]],
  [
    49.88,
    53.43,
    ["Щодня —", "маленький ритуал.", "Ритуал", "від Perla Helsa."],
  ],
];

// Keep the last caption of a phrase up a little after the voice stops.
const HOLD = 0.35;

const script: [number, string][] = phrases.flatMap(
  ([start, stop, pages], i) => {
    const total = pages.reduce((n, t) => n + t.length, 0);
    let cursor = start;
    const rows: [number, string][] = pages.map((text) => {
      const row: [number, string] = [cursor, text];
      cursor += ((stop - start) * text.length) / total;
      return row;
    });
    const next = i + 1 < phrases.length ? phrases[i + 1][0] : END;
    if (stop + HOLD < next) rows.push([stop + HOLD, ""]);
    return rows;
  },
);

export const ritualUkProps: ScreenReelProps = {
  ...ritualProps,
  voiceover: "voiceover-uk.mp3",
  titles: [
    {
      fromMs: 0,
      toMs: s(2.5),
      kicker: "Perla Helsa",
      title: "Ритуал — трекер добавок",
    },
    { fromMs: s(2.7), toMs: s(7.9), kicker: "крок 1", title: "Твої курси" },
    {
      fromMs: s(8.1),
      toMs: s(9.9),
      kicker: "крок 2",
      title: "Календар прийомів",
    },
    {
      fromMs: s(10.1),
      toMs: s(17.9),
      kicker: "крок 3",
      title: "Відмічай прийом",
    },
    {
      fromMs: s(18.1),
      toMs: s(25.9),
      kicker: "нагорода",
      title: "Серія без пропусків",
    },
    {
      fromMs: s(26.1),
      toMs: s(37.0),
      kicker: "крок 4",
      title: "Каталог Perla Helsa",
    },
    {
      fromMs: s(37.2),
      toMs: s(40.0),
      kicker: "в один дотик",
      title: "На сайт бренду",
    },
    {
      fromMs: s(40.2),
      toMs: s(49.7),
      kicker: "крок 5",
      title: "Новий курс у плані",
    },
    {
      fromMs: s(49.9),
      toMs: s(END),
      kicker: "Perla Helsa",
      title: "Ритуал щодня",
    },
  ],
  captions: toPages(script, END),
  overlays: [
    {
      type: "reminder",
      fromMs: s(10.2),
      toMs: s(12.6),
      app: "Ритуал · Perla Helsa",
      time: "07:30",
      title: "Час прийняти",
      text: "Морський колаген · 1 стік",
      button: "Прийняти",
      doneButton: "Прийнято",
      doneAtMs: 1500,
    },
    {
      type: "streak",
      fromMs: s(21.0),
      toMs: s(23.9),
      label: "без пропусків",
      days: 2,
      total: 7,
      suffix: "дн.",
    },
    {
      type: "subscribe",
      fromMs: s(50.2),
      toMs: s(END),
      clickAtMs: 1300,
      label: "Почати ритуал",
      doneLabel: "Ритуал розпочато",
    },
  ],
};
