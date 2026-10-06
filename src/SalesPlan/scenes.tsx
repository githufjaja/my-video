import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Big, C, Counter, glow, Mono, Panel, Scene, Sparkle, Tag, Typed, useRise, useSlam, Wire } from "./ui";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const center: React.CSSProperties = { justifyContent: "center", alignItems: "center", flexDirection: "column" };

// 1. Хук: планы на октябрь
export const S1Hook: React.FC<{ dur: number }> = ({ dur }) => {
  const a = useSlam(20);
  const b = useRise(60);
  return (
    <Scene dur={dur}>
      <AbsoluteFill style={{ ...center, justifyContent: "flex-start", paddingTop: 170 }}>
        <Typed text="ДНІПРО-М · УЖГОРОД · ЖОВТЕНЬ 2026" start={4} cps={45} size={30} color={C.dim} style={{ marginBottom: 40, letterSpacing: 3 }} />
        <div style={{ ...a, display: "flex", alignItems: "baseline", gap: 40 }}>
          <Big size={210}>
            <Counter to={1900000} start={20} dur={40} />
          </Big>
          <Big size={100} color={C.violet}>
            грн
          </Big>
        </div>
        <div style={{ ...b, marginTop: 24 }}>
          <Mono size={34} color={C.violetHi} style={{ letterSpacing: 4 }}>
            ПЛАН НА МІСЯЦЬ
          </Mono>
        </div>
      </AbsoluteFill>
      <Panel x={260} y={660} w={640} h={210} start={110}>
        <Box big="608 000" small="перша декада · 01–10.10" />
      </Panel>
      <Panel x={1020} y={660} w={640} h={210} start={215} accent>
        <Box big="500 000" small="енергозабезпечення · окремий план" />
      </Panel>
      <Sparkle x={1660} y={250} delay={60} size={46} />
    </Scene>
  );
};

// 2. Вопрос
export const S2Question: React.FC<{ dur: number }> = ({ dur }) => {
  const a = useSlam(2);
  const b = useSlam(16);
  const c = useSlam(30, 1.8);
  return (
    <Scene dur={dur}>
      <AbsoluteFill style={center}>
        <div style={a}>
          <Big size={150}>Як збільшити</Big>
        </div>
        <div style={{ ...b, marginTop: 10 }}>
          <Big size={150}>обсяг</Big>
        </div>
        <div style={{ ...c, marginTop: 10 }}>
          <Big size={170} color={C.violet}>
            продажів?
          </Big>
        </div>
      </AbsoluteFill>
      <Sparkle x={1560} y={760} delay={36} />
    </Scene>
  );
};

// 3. Темп
export const S3Pace: React.FC<{ dur: number }> = ({ dur }) => {
  const head = useSlam(4);
  return (
    <Scene dur={dur} glowY={35}>
      <Tag>Потрібний темп</Tag>
      <div style={{ position: "absolute", left: 0, right: 0, top: 210, textAlign: "center", ...head }}>
        <Big size={180}>
          ≈ <Counter to={61300} start={4} dur={36} />
        </Big>
        <Mono size={34} color={C.violetHi} style={{ marginTop: 20, letterSpacing: 4 }}>
          ГРИВЕНЬ НА ДЕНЬ · 1 900 000 / 31
        </Mono>
      </div>
      <Panel x={260} y={640} w={380} h={170} start={120}>
        <Box big="план" small="на місяць / декаду" />
      </Panel>
      <Wire x1={640} y1={725} x2={770} y2={725} start={136} />
      <Panel x={770} y={640} w={380} h={170} start={146}>
        <Box big="− факт" small="порахувати сьогодні" />
      </Panel>
      <Wire x1={1150} y1={725} x2={1280} y2={725} start={162} />
      <Panel x={1280} y={640} w={380} h={170} start={172} accent>
        <Box big="÷ дні" small="що лишились" />
      </Panel>
      <div style={{ position: "absolute", left: 0, right: 0, top: 880, textAlign: "center" }}>
        <Typed text="= щоденний темп → цифру на стіну" start={260} cps={40} size={30} color={C.white} />
      </div>
    </Scene>
  );
};

const Box: React.FC<{ big: string; small: string }> = ({ big, small }) => (
  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%" }}>
    <div style={{ fontFamily: C.display, fontWeight: 900, fontSize: 64, color: C.white }}>{big}</div>
    <Mono size={22} style={{ marginTop: 8 }}>
      {small}
    </Mono>
  </div>
);

// 4. Вспышка «5 важелів»
export const S4Flash: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const s = useSlam(0, 1.25);
  const flick = frame < 6 ? (frame % 2 === 0 ? 1 : 0.6) : 1;
  const out = interpolate(frame, [dur - 5, dur], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: C.violet, opacity: flick * out, ...center }}>
      <div style={s}>
        <Big size={220} color="#0b0614" style={{ textShadow: "none" }}>
          5 важелів.
        </Big>
      </div>
    </AbsoluteFill>
  );
};

// 5. График пяти рычагов
const levers = [
  { n: "01", name: "Ядро акцій", lo: 60, hi: 130 },
  { n: "02", name: "Допродаж на касі", lo: 50, hi: 80 },
  { n: "03", name: "Сезон: пили, сад, дрова", lo: 30, hi: 60 },
  { n: "04", name: "B2B: бригади, СТО, фермери", lo: 20, hi: 60 },
  { n: "05", name: "Обдзвін покупців", lo: 15, hi: 40 },
];

export const S5Levers: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const x0 = 820;
  const scale = 6.4; // пикселей на 1 тис.
  const total = useSlam(260);
  return (
    <Scene dur={dur} glowX={60}>
      <Tag>Приріст до плану · оцінка, тис. грн</Tag>
      {[0, 50, 100, 130].map((v) => (
        <div key={v} style={{ position: "absolute", left: x0 + v * scale - 30, top: 200, width: 60, textAlign: "center", opacity: interpolate(frame, [6, 18], [0, 1], clamp) }}>
          <Mono size={20}>{v}</Mono>
          <div style={{ width: 1, height: 560, background: "rgba(244,241,255,0.15)", margin: "8px auto 0" }} />
        </div>
      ))}
      {levers.map((l, i) => {
        const d = 14 + i * 14;
        const t = interpolate(frame - d, [0, 22], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        const y = 270 + i * 105;
        return (
          <div key={l.n} style={{ position: "absolute", top: y, left: 0, right: 0, height: 70 }}>
            <div style={{ position: "absolute", left: 120, top: 8, display: "flex", gap: 20, alignItems: "baseline", opacity: t, transform: `translateX(${(1 - t) * -30}px)` }}>
              <Mono size={26} color={C.violetHi}>
                {l.n}
              </Mono>
              <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 36, color: C.white }}>{l.name}</div>
            </div>
            {/* минимум — сплошной, до максимума — штриховка */}
            <div style={{ position: "absolute", left: x0, top: 10, height: 50, width: l.lo * scale * t, background: C.violet, boxShadow: glow(0.8, 14) }} />
            <div
              style={{
                position: "absolute",
                left: x0 + l.lo * scale * t,
                top: 10,
                height: 50,
                width: (l.hi - l.lo) * scale * t,
                border: `2px solid ${C.violetHi}`,
                borderLeft: "none",
                boxSizing: "border-box",
                background: "repeating-linear-gradient(135deg, rgba(167,139,250,0.35) 0 6px, transparent 6px 14px)",
              }}
            />
            <div style={{ position: "absolute", left: x0 + l.hi * scale * t + 20, top: 18, opacity: t }}>
              <Mono size={28} color={C.white}>
                {l.lo}–{l.hi}
              </Mono>
            </div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: 830, textAlign: "center", ...total }}>
        <Big size={86}>
          реально: <span style={{ color: C.violet, textShadow: glow(0.9, 24) }}>+150–250 тис.</span>
        </Big>
        <Mono size={24} style={{ marginTop: 14 }}>
          сума 175–370 тис., важелі 1 і 2 перетинаються · оцінка при ~25 чеках/день, перерахуємо за фактом
        </Mono>
      </div>
    </Scene>
  );
};

// Заголовок рычага
const LeverHead: React.FC<{ n: string; title: string; sub?: string }> = ({ n, title, sub }) => {
  const a = useSlam(2, 1.2);
  const b = useRise(12);
  return (
    <>
      <div style={{ position: "absolute", left: 120, top: 80, display: "flex", alignItems: "center", gap: 30, ...a, transformOrigin: "left center" }}>
        <div style={{ fontFamily: C.mono, fontWeight: 700, fontSize: 40, color: C.bg, background: C.violet, padding: "6px 16px", boxShadow: glow(0.9, 18) }}>{n}</div>
        <Big size={84}>{title}</Big>
      </div>
      {sub && (
        <div style={{ position: "absolute", left: 124, top: 190, ...b }}>
          <Mono size={28}>{sub}</Mono>
        </div>
      )}
    </>
  );
};

// 6. Ядро акций
const core = [
  { name: "CD-200BC KIT", qty: 82, note: "шуруповерт" },
  { name: "FC-230", qty: 58, note: "зарядка" },
  { name: "BP-260", qty: 47, note: "АКБ 6 Аг" },
  { name: "BP-240", qty: 45, note: "АКБ" },
  { name: "CSD-36X", qty: 45, note: "викрутка" },
  { name: "VC-10BC", qty: 26, note: "пилосос" },
  { name: "DHR-203BCX", qty: 12, note: "перфоратор" },
  { name: "Набір DGA 9 999", qty: 10, note: "болгарка + набір" },
];

export const S6Core: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const w = 390;
  const h = 170;
  const est = useRise(420);
  return (
    <Scene dur={dur}>
      <LeverHead n="01" title="Ядро акцій" sub="на видне місце · пропонувати першим" />
      {core.map((p, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const st = 20 + i * 6;
        return (
          <Panel key={p.name} x={120 + col * (w + 30)} y={290 + row * (h + 30)} w={w} h={h} start={st} accent={i === 0}>
            <div style={{ padding: "22px 28px", display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
              <div style={{ fontFamily: C.display, fontWeight: 900, fontSize: 34, color: C.white }}>{p.name}</div>
              <Mono size={22}>{p.note}</Mono>
              <div style={{ marginTop: "auto", display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontFamily: C.display, fontWeight: 900, fontSize: 48, color: C.violetHi, textShadow: glow(0.7, 14) }}>
                  <Counter to={p.qty} start={st + 8} dur={22} />
                </span>
                <Mono size={22}>шт на залишку</Mono>
              </div>
            </div>
          </Panel>
        );
      })}
      <div style={{ position: "absolute", left: 120, top: 750, display: "flex", alignItems: "center", gap: 24, opacity: interpolate(frame, [300, 314], [0, 1], clamp) }}>
        <div style={{ width: 20, height: 20, borderRadius: 10, background: C.hot, boxShadow: glow(1, 14), opacity: Math.floor(frame / 10) % 2 ? 1 : 0.35 }} />
        <Mono size={30} color={C.white}>
          ~15.10 акції оновлюються → продаємо ядро до зміни
        </Mono>
      </div>
      <div style={{ position: "absolute", left: 120, top: 830 }}>
        <Typed text="Клієнту чесно: «акція діє до оновлення акцій, нові ціни можуть бути іншими»." start={340} cps={60} size={28} color={C.dim} />
      </div>
      <div style={{ position: "absolute", left: 120, top: 920, ...est }}>
        <Mono size={30} color={C.violetHi}>
          оцінка: +60–130 тис. грн
        </Mono>
      </div>
    </Scene>
  );
};

// 7. Допродаж
const pairs = [
  { x: "Перфоратор DHR-203BCX", y: "BP-260 + FC-230", why: "без АКБ і зарядки", say: "«Перфоратор іде без батареї і зарядки; BP-260 і FC-230 зараз за акцією.»" },
  { x: "Ліхтар DCL-202", y: "АКБ BP-240 · 1 350", why: "без АКБ", say: "«Ліхтар без батареї; з BP-240 буде світло на випадок відключення.»" },
  { x: "CD-200BC KIT", y: "друга АКБ BP-240", why: "щоб не чекати зарядку", say: "«Щоб не чекати зарядку посеред роботи, візьміть другу батарею за 1 350.»" },
  { x: "Бензопила NSG", y: "масло + напилок", why: "одразу до роботи", say: "«Для пили одразу беріть масло для ланцюга і напилок.»" },
];

export const S7Cross: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const per = 75;
  const base = 70;
  const idx = Math.min(pairs.length - 1, Math.max(0, Math.floor((frame - base) / per)));
  const local = frame - base - idx * per;
  const p = pairs[idx];
  const swap = interpolate(local, [0, 8], [0, 1], clamp);
  const calc = useRise(base + per * 4 - 10);
  const rule = useRise(base + per * 4 + 6);
  return (
    <Scene dur={dur} glowX={50} glowY={50}>
      <LeverHead n="02" title="Допродаж на касі" sub="купив X → запропонуй Y · одна зв'язка, одна фраза, один раз" />
      <Panel x={160} y={330} w={620} h={220} start={14}>
        <div style={{ padding: 30 }}>
          <Mono size={24} color={C.violetHi}>
            КУПИВ
          </Mono>
          <div style={{ fontFamily: C.display, fontWeight: 900, fontSize: 46, color: C.white, marginTop: 16, opacity: swap, transform: `translateY(${(1 - swap) * 20}px)` }}>{p.x}</div>
        </div>
      </Panel>
      <Wire key={`w${idx}`} x1={780} y1={440} x2={1140} y2={440} start={base + idx * per} dur={16} />
      <div style={{ position: "absolute", left: 800, top: 380, width: 320, textAlign: "center", opacity: swap }}>
        <Mono size={22}>{p.why}</Mono>
      </div>
      <Panel x={1140} y={330} w={620} h={220} start={24} accent>
        <div style={{ padding: 30 }}>
          <Mono size={24} color={C.violetHi}>
            ЗАПРОПОНУЙ
          </Mono>
          <div style={{ fontFamily: C.display, fontWeight: 900, fontSize: 46, color: C.white, marginTop: 16, opacity: interpolate(local, [12, 20], [0, 1], clamp) }}>{p.y}</div>
        </div>
      </Panel>
      <div style={{ position: "absolute", left: 160, top: 600, width: 1600 }}>
        <Typed key={idx} text={`> ${p.say}`} start={base + idx * per + 14} cps={70} size={30} color={C.white} />
      </div>
      <div style={{ position: "absolute", left: 160, top: 700, display: "flex", gap: 14 }}>
        {pairs.map((_, i) => (
          <div key={i} style={{ width: 60, height: 6, background: i <= idx ? C.violetHi : "rgba(244,241,255,0.2)", boxShadow: i === idx ? glow(0.9, 10) : undefined }} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 160, top: 780, ...calc }}>
        <Mono size={30} color={C.white}>
          ~650 чеків × 30% з допродажем × ~350 грн (допущення)
        </Mono>
        <div style={{ fontFamily: C.display, fontWeight: 900, fontSize: 64, color: C.violet, textShadow: glow(0.9, 24), marginTop: 10 }}>≈ +50–80 тис. грн</div>
      </div>
      <div style={{ position: "absolute", right: 160, top: 800, width: 640, textAlign: "right", ...rule }}>
        <Mono size={24}>знижка 5/10/15% — лише на неакційні позиції в чеку</Mono>
      </div>
    </Scene>
  );
};

// 8. Сезон
const season = [
  "Бензопили NSG-52H, NSG-45H, DCS-201BC",
  "Масло для ланцюга + напилки 4,0 мм",
  "Повітродувки та садові пилососи",
  "Подрібнювач GSB-38 · 5 997",
];

export const S8Season: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const est = useRise(240);
  return (
    <Scene dur={dur} glowX={30}>
      <LeverHead n="03" title="Сезон" sub="листя · дрова · підготовка до зими" />
      {season.map((s, i) => {
        const d = 20 + i * 14;
        const t = interpolate(frame - d, [0, 12], [0, 1], clamp);
        return (
          <div key={s} style={{ position: "absolute", left: 160, top: 310 + i * 100, display: "flex", alignItems: "center", gap: 30, opacity: t, transform: `translateX(${(1 - t) * -40}px)` }}>
            <div style={{ width: 44, height: 44, border: `2px solid ${C.violetHi}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: glow(0.6, 10) }}>
              <div style={{ width: 22, height: 22, background: C.violetHi, transform: `scale(${interpolate(frame - d - 8, [0, 6], [0, 1], clamp)})` }} />
            </div>
            <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 40, color: C.white }}>{s}</div>
          </div>
        );
      })}
      <Panel x={1340} y={300} w={440} h={350} start={185} accent>
        <div style={{ padding: 34 }}>
          <Mono size={24} color={C.hot}>
            ! РИЗИК
          </Mono>
          <div style={{ fontFamily: C.display, fontWeight: 900, fontSize: 60, color: C.white, marginTop: 14 }}>3 + 3 + 4</div>
          <Mono size={26} color={C.white} style={{ marginTop: 6 }}>
            пили на полиці
          </Mono>
          <Mono size={24} style={{ marginTop: 18 }}>
            дозамовити пили, ланцюги, масло
          </Mono>
        </div>
      </Panel>
      <div style={{ position: "absolute", left: 160, top: 760, ...est }}>
        <Mono size={26}>не рекламувати «є все» — запас малий</Mono>
        <div style={{ fontFamily: C.display, fontWeight: 900, fontSize: 64, color: C.violet, textShadow: glow(0.9, 24), marginTop: 14 }}>≈ +30–60 тис. грн</div>
      </div>
    </Scene>
  );
};

// 9. B2B — орбита сегментов
const b2b = ["Бригади", "СТО", "Фермери", "Монтажники", "ОСББ"];

export const S9B2B: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const cx = 620;
  const cy = 600;
  const r = 280;
  const hub = useSlam(10);
  const r1 = useRise(50);
  const r2 = useRise(70);
  const r3 = useRise(95);
  return (
    <Scene dur={dur} glowX={32} glowY={55}>
      <LeverHead n="04" title="B2B" />
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(244,241,255,0.25)" strokeWidth={2} strokeDasharray="6 10" />
        {b2b.map((_, i) => {
          const a = (i / b2b.length) * Math.PI * 2 - Math.PI / 2 + frame / 160;
          const t = interpolate(frame - 16 - i * 6, [0, 14], [0, 1], clamp);
          return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * r * t} y2={cy + Math.sin(a) * r * t} stroke="rgba(167,139,250,0.5)" strokeWidth={2} />;
        })}
      </svg>
      <div style={{ position: "absolute", left: cx - 110, top: cy - 110, width: 220, height: 220, borderRadius: 110, background: "rgba(139,92,246,0.25)", border: `2px solid ${C.violetHi}`, boxShadow: glow(0.9, 30), display: "flex", alignItems: "center", justifyContent: "center", ...hub }}>
        <div style={{ fontFamily: C.display, fontWeight: 900, fontSize: 34, color: C.white, textAlign: "center", lineHeight: 1.1 }}>
          ДНІПРО-М
          <br />
          <span style={{ fontFamily: C.mono, fontWeight: 400, fontSize: 18, color: C.dim }}>Капушанська, 34</span>
        </div>
      </div>
      {b2b.map((s, i) => {
        const a = (i / b2b.length) * Math.PI * 2 - Math.PI / 2 + frame / 160;
        const t = interpolate(frame - 26 - i * 6, [0, 10], [0, 1], clamp);
        return (
          <div key={s} style={{ position: "absolute", left: cx + Math.cos(a) * r - 120, top: cy + Math.sin(a) * r - 30, width: 240, textAlign: "center", opacity: t }}>
            <div style={{ display: "inline-block", padding: "10px 20px", background: C.bg, border: `2px solid ${C.line}`, fontFamily: C.display, fontWeight: 700, fontSize: 30, color: C.white }}>{s}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 1080, top: 380, width: 720 }}>
        <div style={r1}>
          <Mono size={26}>щотижня</Mono>
          <div style={{ fontFamily: C.display, fontWeight: 900, fontSize: 70, color: C.white }}>5–8 контактів</div>
        </div>
        <div style={{ ...r2, marginTop: 30 }}>
          <Mono size={26}>закрити</Mono>
          <div style={{ fontFamily: C.display, fontWeight: 900, fontSize: 70, color: C.white }}>1–3 угоди</div>
          <Mono size={26}>по 10–30 тис. · безготівка, договір</Mono>
        </div>
        <div style={{ ...r3, marginTop: 40, fontFamily: C.display, fontWeight: 900, fontSize: 64, color: C.violet, textShadow: glow(0.9, 24) }}>≈ +20–60 тис. грн</div>
      </div>
    </Scene>
  );
};

// 10. Обзвон — воронка
const funnel = [
  { v: 100, label: "дзвінків" },
  { v: 40, label: "дозвонів" },
  { v: 10, label: "покупок / візитів" },
];

export const S10Calls: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const est = useRise(240);
  return (
    <Scene dur={dur} glowX={35}>
      <LeverHead n="05" title="Обдзвін бази" sub="лише покупці за 60–90 днів · 8–10 дзвінків на день · без розсилок" />
      {funnel.map((f, i) => {
        const d = 150 + i * 25;
        const t = interpolate(frame - d, [0, 18], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        const w = 760 - i * 160;
        return (
          <div key={f.label} style={{ position: "absolute", left: 160 + (760 - w) / 2, top: 310 + i * 150, width: w * t, height: 120, background: i === 2 ? C.violet : "rgba(139,92,246,0.18)", border: `2px solid ${C.violetHi}`, boxShadow: i === 2 ? glow(0.9, 24) : undefined, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 18, padding: "24px 30px", whiteSpace: "nowrap", opacity: t }}>
              <span style={{ fontFamily: C.display, fontWeight: 900, fontSize: 60, color: C.white }}>
                <Counter to={f.v} start={d} dur={20} />
              </span>
              <Mono size={26} color={C.white}>
                {f.label}
              </Mono>
            </div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 160, top: 790, ...est }}>
        <Mono size={28} color={C.white}>
          10 × ~2 500 грн
        </Mono>
        <div style={{ fontFamily: C.display, fontWeight: 900, fontSize: 64, color: C.violet, textShadow: glow(0.9, 24), marginTop: 8 }}>≈ +15–40 тис. грн</div>
      </div>
      <Panel x={1060} y={300} w={700} h={460} start={40}>
        <div style={{ padding: 34 }}>
          <Mono size={22} color={C.violetHi}>
            СКРИПТ ДЗВІНКА
          </Mono>
          <Typed
            text={"«Добрий день! Це керуючий Дніпро-М на Капушанській. Ви нещодавно брали у нас шуруповерт — як він вам, усе працює добре?\n\nДо речі, зараз діє акція на АКБ BP-240. Відкласти для вас до вихідних?»"}
            start={56}
            cps={55}
            size={26}
            style={{ marginTop: 18, lineHeight: 1.45 }}
          />
        </div>
      </Panel>
    </Scene>
  );
};

// 11. Энергия
const energy = [
  "Кафе, аптеки, магазини, СТО, стоматології",
  "Гостьові будинки, садиби, приватні будинки",
  "Агро та малі виробництва",
  "ОСББ",
  "Бюджетні установи",
];

export const S11Energy: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const head = useSlam(4);
  const foot = useRise(200);
  const steps = [
    { v: "15", l: "контактів" },
    { v: "4", l: "КП" },
    { v: "1", l: "рахунок" },
  ];
  return (
    <Scene dur={dur} glowX={70} glowY={40}>
      <Tag>Окремо від основного плану</Tag>
      <div style={{ position: "absolute", left: 120, top: 160, ...head, transformOrigin: "left center" }}>
        <Big size={110}>
          Енергія <span style={{ color: C.violet, textShadow: glow(0.9, 30) }}>/</span> резерв
        </Big>
        <Mono size={30} color={C.white} style={{ marginTop: 18 }}>
          план <span style={{ color: C.violetHi }}>500 000 грн</span> · на полиці ≈ 1,05 млн · станції, генератори, інвертори + АКБ
        </Mono>
      </div>
      <div style={{ position: "absolute", left: 120, top: 420 }}>
        <Mono size={24} color={C.violetHi}>
          КОМУ ПРОПОНУВАТИ (від швидкого до довгого)
        </Mono>
        {energy.map((e, i) => {
          const t = interpolate(frame - 330 - i * 40, [0, 12], [0, 1], clamp);
          return (
            <div key={e} style={{ display: "flex", gap: 22, alignItems: "baseline", marginTop: 22, opacity: t, transform: `translateX(${(1 - t) * -30}px)` }}>
              <Mono size={26} color={C.violetHi}>
                0{i + 1}
              </Mono>
              <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 38, color: C.white }}>{e}</div>
            </div>
          );
        })}
      </div>
      <Panel x={1180} y={400} w={600} h={470} start={540} accent>
        <div style={{ padding: 34 }}>
          <Mono size={22} color={C.violetHi}>
            ЦІЛЬ ТИЖНЯ
          </Mono>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
            {steps.map((s, i) => {
              const t = interpolate(frame - 560 - i * 30, [0, 10], [0, 1], clamp);
              return (
                <div key={s.l} style={{ display: "flex", alignItems: "baseline", gap: 20, opacity: t }}>
                  <span style={{ fontFamily: C.display, fontWeight: 900, fontSize: 64, color: C.white, width: 90 }}>{s.v}</span>
                  <Mono size={30} color={C.white}>
                    {s.l}
                  </Mono>
                </div>
              );
            })}
          </div>
          <Mono size={22} style={{ marginTop: 22 }}>
            30 адрес · 5 точок на день · по людині, не масово
          </Mono>
        </div>
      </Panel>
      <div style={{ position: "absolute", left: 120, right: 120, top: 925, ...foot }}>
        <Mono size={28} color={C.white} style={{ lineHeight: 1.5 }}>
          1 комплект Growatt SPE12000ES + 16LM-A1 = 161 тис. → план = <span style={{ color: C.violetHi }}>3–4 великі продажі</span>. Замість знижки: наявність, договір, гарантія, розрахунок навантаження.
        </Mono>
      </div>
    </Scene>
  );
};

// 12. Таймлайн по неделям
const weeks = [
  { d: "06–11.10", t: "Запуск", s: "ядро на видне місце, зв'язки на касу; 10.10 — підсумок декади 608k" },
  { d: "12–18.10", t: "Зміна акцій", s: "15.10 — оновити каталог і зв'язки, сезонна викладка" },
  { d: "19–25.10", t: "Нове ядро + B2B", s: "бригади, СТО, фермери; повторний контакт по КП" },
  { d: "26–31.10", t: "Дотиснути", s: "розрив до 1,9 млн ÷ дні, що лишились" },
];

export const S12Timeline: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const x0 = 200;
  const x1 = 1720;
  const y = 470;
  const t = interpolate(frame, [14, dur - 70], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const px = x0 + (x1 - x0) * t;
  const foot = useRise(dur - 60);
  return (
    <Scene dur={dur}>
      <Tag>План по тижнях · жовтень</Tag>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <line x1={x0} y1={y} x2={x1} y2={y} stroke="rgba(244,241,255,0.2)" strokeWidth={2} />
        <line x1={x0} y1={y} x2={px} y2={y} stroke={C.violetHi} strokeWidth={4} style={{ filter: "drop-shadow(0 0 8px #8b5cf6)" }} />
        <circle cx={px} cy={y} r={12} fill={C.white} style={{ filter: "drop-shadow(0 0 14px #a78bfa) drop-shadow(0 0 28px #8b5cf6)" }} />
      </svg>
      {weeks.map((w, i) => {
        const wx = x0 + ((x1 - x0) / 4) * i + 20;
        const on = interpolate(px - wx, [-10, 30], [0, 1], clamp);
        return (
          <div key={w.d} style={{ position: "absolute", left: wx, top: 250, width: 340 }}>
            <Mono size={24} color={on > 0.5 ? C.violetHi : C.dim}>
              ТИЖДЕНЬ {i + 1}
            </Mono>
            <div style={{ fontFamily: C.display, fontWeight: 900, fontSize: 40, color: C.white, marginTop: 8, opacity: 0.3 + 0.7 * on }}>{w.d}</div>
            <div style={{ position: "absolute", left: -20, top: 211, width: 18, height: 18, marginLeft: -9, transform: "rotate(45deg)", background: on > 0.5 ? C.violetHi : C.bg, border: `2px solid ${C.violetHi}` }} />
            <div style={{ marginTop: 130, opacity: on, transform: `translateY(${(1 - on) * 20}px)` }}>
              <div style={{ fontFamily: C.display, fontWeight: 900, fontSize: 40, color: i === 1 ? C.violet : C.white, textShadow: i === 1 ? glow(0.8, 18) : undefined }}>{w.t}</div>
              <Mono size={24} style={{ marginTop: 12, lineHeight: 1.4 }}>
                {w.s}
              </Mono>
            </div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: 880, textAlign: "center", ...foot }}>
        <Mono size={28} color={C.white}>
          31.10 — підсумок у журнал: що спрацювало, що прибрати
        </Mono>
      </div>
    </Scene>
  );
};

// 13. Ежедневный листок — «форма»
const daily = [
  "Продажі за день і з місяця · скільки до плану (декада / 1,9 млн)",
  "Кількість чеків · середній чек",
  "Чеки з допродажем · сума допродажів",
  "Продані штуки ядра акцій",
  "Дзвінки: зроблено / дозвон / купили",
  "B2B: контакти, КП, рахунки",
  "Енергія: звернення, рахунки, продажі",
];

export const S13Daily: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const bar = interpolate(frame, [0, 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const foot = useRise(130);
  return (
    <Scene dur={dur}>
      <div style={{ position: "absolute", left: 160, top: 110, width: 1600 * bar, height: 90, background: C.white, overflow: "hidden", display: "flex", alignItems: "center" }}>
        <div style={{ fontFamily: C.display, fontWeight: 900, fontSize: 52, color: C.bg, paddingLeft: 30, whiteSpace: "nowrap" }}>ФОРМА · ЩОДНЯ ВВЕЧЕРІ</div>
        <Mono size={24} color={C.bg} style={{ marginLeft: "auto", paddingRight: 30, whiteSpace: "nowrap" }}>
          2 хвилини
        </Mono>
      </div>
      {daily.map((d, i) => {
        const st = 20 + i * 14;
        const t = interpolate(frame - st, [0, 10], [0, 1], clamp);
        const check = interpolate(frame - st - 10, [0, 6], [0, 1], clamp);
        return (
          <div key={d} style={{ position: "absolute", left: 160, top: 250 + i * 92, display: "flex", alignItems: "center", gap: 30, opacity: t }}>
            <Mono size={24}>{String(i + 1).padStart(2, "0")}</Mono>
            <div style={{ width: 40, height: 40, border: `2px solid ${C.line}`, position: "relative" }}>
              <svg width={40} height={40} style={{ position: "absolute", inset: 0 }}>
                <path d="M8 21 L17 30 L33 10" fill="none" stroke={C.violetHi} strokeWidth={5} strokeDasharray={40} strokeDashoffset={40 * (1 - check)} style={{ filter: "drop-shadow(0 0 6px #8b5cf6)" }} />
              </svg>
            </div>
            <div style={{ fontFamily: C.display, fontWeight: 700, fontSize: 38, color: C.white }}>{d}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 160, top: 920, ...foot }}>
        <Mono size={26}>раз на тиждень: що спрацювало, що прибрати</Mono>
      </div>
    </Scene>
  );
};

// 14. Финал
export const S14Final: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const a = useSlam(4);
  const b = useSlam(125, 1.8);
  const top = useRise(0);
  const foot = useRise(140);
  const flash = interpolate(frame, [123, 125, 133], [0, 0.55, 0], clamp);
  return (
    <Scene dur={dur}>
      <AbsoluteFill style={center}>
        <Mono size={30} style={{ letterSpacing: 3, ...top }}>
          ЗВЕРХ ЗВИЧАЙНОГО ТЕМПУ
        </Mono>
        <div style={{ ...a, marginTop: 30 }}>
          <Big size={200} color={C.violet}>
            +150–250
          </Big>
        </div>
        <div style={{ ...a, marginTop: 10 }}>
          <Big size={90}>тис. грн</Big>
        </div>
        <div style={{ ...b, marginTop: 70 }}>
          <Big size={130}>Поїхали.</Big>
        </div>
        <Mono size={24} style={{ marginTop: 60, ...foot }}>
          Дніпро-М · Ужгород, Капушанська, 34 · оцінки за цінами сайту, не прогноз
        </Mono>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: C.violet, opacity: flash }} />
      <Sparkle x={1500} y={330} delay={20} />
    </Scene>
  );
};
