import { toPages } from "./demo";
import type { ScreenReelProps } from "./ScreenReel";
import { segmentSeconds } from "./ScreenReel";

// Demo reel for Perla Helsa: the "Ритуал" supplement tracker, cut from a
// 1280x966 screen recording (public/ritual-demo.mp4).

const s = (sec: number) => Math.round(sec * 1000);

const segments: ScreenReelProps["segments"] = [
  { fromS: 0, toS: 2.6, rate: 1 }, // login: "Ритуал"
  { fromS: 29.2, toS: 31.8, rate: 1 }, // my courses
  { fromS: 32, toS: 34.8, rate: 1 }, // edit a course
  { fromS: 35.6, toS: 38.6, rate: 1.5 }, // calendar
  { fromS: 39.5, toS: 49.5, rate: 1.25 }, // today: mark doses taken
  { fromS: 49.5, toS: 55.5, rate: 1 }, // reward: "Ти молодець!"
  { fromS: 64, toS: 66, rate: 1 }, // 5/5 done for today
  { fromS: 67, toS: 72, rate: 1.5 }, // catalog
  { fromS: 76, toS: 82.5, rate: 1.5 }, // search "колаг"
  { fromS: 82.5, toS: 86, rate: 1 }, // new course form
  { fromS: 87.8, toS: 90.8, rate: 1 }, // product page on perlahelsa.ua
  { fromS: 91, toS: 95, rate: 1.25 }, // add to schedule
  { fromS: 95, toS: 101.5, rate: 1 }, // mark it, reward, 6/6
  { fromS: 101.4, toS: 101.4, rate: 0, holdS: 3.6 }, // outro hold
];

const END = segments.reduce((sum, seg) => sum + segmentSeconds(seg), 0);

// [start in seconds, text]; "" = no caption.
const script: [number, string][] = [
  [0.2, "Это Ритуал —"],
  [1.2, "трекер добавок"],
  [2.0, "от Perla Helsa."],
  [2.7, "Все твои курсы"],
  [3.7, "в одном месте:"],
  [4.6, "что пить,"],
  [5.2, "сколько"],
  [5.8, "и во сколько."],
  [6.8, "Настроил один раз"],
  [8.1, "и календарь приёмов"],
  [9.1, "готов."],
  [10.1, "Утром приходит"],
  [11.0, "напоминание."],
  [12.0, "Выпил —"],
  [12.8, "отметил"],
  [13.6, "одним тапом."],
  [14.6, "Коллаген,"],
  [15.4, "омега-3,"],
  [16.2, "магний —"],
  [17.0, "всё по плану."],
  [18.1, "Закрыл день —"],
  [19.2, "получил награду"],
  [20.4, "и серию"],
  [21.2, "без пропусков."],
  [22.6, ""],
  [24.0, "Всё на сегодня"],
  [25.0, "принято."],
  [26.1, "Хочешь новый курс?"],
  [27.4, "Весь каталог"],
  [28.4, "Perla Helsa"],
  [29.3, "прямо в приложении."],
  [30.6, "Нашёл нужное —"],
  [31.8, "например, коллаген"],
  [33.0, "с персиком."],
  [33.8, "Время, дозировка,"],
  [35.0, "частота"],
  [35.8, "за пару секунд."],
  [37.2, "А подробнее —"],
  [38.2, "сразу на сайте"],
  [39.2, "бренда."],
  [40.2, "Добавил в расписание —"],
  [41.8, "и он уже"],
  [42.6, "в плане на сегодня."],
  [43.4, "Отметил —"],
  [44.2, "и снова"],
  [44.8, "награда."],
  [45.8, ""],
  [46.9, "Ты молодец!"],
  [48.4, "Шесть из шести."],
  [49.4, "Каждый день —"],
  [50.2, "маленький ритуал."],
  [51.4, "Ритуал"],
  [51.9, "от Perla Helsa."],
];

export const ritualProps: ScreenReelProps = {
  source: "ritual-demo.mp4",
  sourceWidth: 1280,
  sourceHeight: 966,
  durationMs: s(END),
  segments,
  voiceover: "",
  camera: [
    { fromMs: 0, x: 650, y: 360, zoom: 1.25 },
    { fromMs: s(2.6), x: 650, y: 483, zoom: 1 },
    { fromMs: s(20.4), x: 650, y: 460, zoom: 1.3 },
    { fromMs: s(24.0), x: 650, y: 483, zoom: 1 },
    { fromMs: s(37.17), x: 760, y: 483, zoom: 1 },
    { fromMs: s(40.17), x: 650, y: 483, zoom: 1 },
    { fromMs: s(46.8), x: 650, y: 460, zoom: 1.3 },
    { fromMs: s(48.3), x: 650, y: 483, zoom: 1 },
  ],
  titles: [
    {
      fromMs: 0,
      toMs: s(2.5),
      kicker: "Perla Helsa",
      title: "Ритуал — трекер добавок",
    },
    { fromMs: s(2.7), toMs: s(7.9), kicker: "шаг 1", title: "Твои курсы" },
    {
      fromMs: s(8.1),
      toMs: s(9.9),
      kicker: "шаг 2",
      title: "Календарь приёмов",
    },
    { fromMs: s(10.1), toMs: s(17.9), kicker: "шаг 3", title: "Отмечай приём" },
    {
      fromMs: s(18.1),
      toMs: s(25.9),
      kicker: "награда",
      title: "Серия без пропусков",
    },
    {
      fromMs: s(26.1),
      toMs: s(37.0),
      kicker: "шаг 4",
      title: "Каталог Perla Helsa",
    },
    {
      fromMs: s(37.2),
      toMs: s(40.0),
      kicker: "в один тап",
      title: "На сайт бренда",
    },
    {
      fromMs: s(40.2),
      toMs: s(49.7),
      kicker: "шаг 5",
      title: "Новый курс в плане",
    },
    {
      fromMs: s(49.9),
      toMs: s(END),
      kicker: "Perla Helsa",
      title: "Ритуал каждый день",
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
      title: "Пора принять",
      text: "Морской коллаген · 1 стик",
      button: "Принять",
      doneButton: "Принято",
      doneAtMs: 1500,
    },
    {
      type: "streak",
      fromMs: s(21.0),
      toMs: s(23.9),
      label: "без пропусков",
      days: 2,
      total: 7,
      suffix: "дн.",
    },
    {
      type: "subscribe",
      fromMs: s(50.2),
      toMs: s(END),
      clickAtMs: 1300,
      label: "Начать ритуал",
      doneLabel: "Ритуал начат",
    },
  ],
};
