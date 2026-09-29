# Remotion video

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

Welcome to your Remotion project!

## Commands

**Install Dependencies**

```console
npm i
```

**Start Preview**

```console
npm run dev
```

**Render video**

```console
npx remotion render
```

**Upgrade Remotion**

```console
npx remotion upgrade
```

## Reel template (`src/Reel`)

A 1080×1920 talking-head reel in the style of "Монтаж рилсов в Claude":
footage underneath, then three layers on top.

| Layer | Position | Style | Motion |
| --- | --- | --- | --- |
| Title | top, ~14–18% | small kicker (`шаг 1`, `или`, `@handle`) + bold Inter 72px, white, soft shadow | words reveal left→right out of a blur; block dissolves on exit |
| Overlay | ~73% | white card, 26px radius; lime border + glow = "done" state | blur + scale 0.92→1 in, blur out |
| Captions | ~86% | Montserrat Black 44px, UPPERCASE, dark outline; spoken words `#F8F0A8`, upcoming white | 1–3 word pages, hard cuts, word-by-word karaoke |

Accent: lime `#E1F777`. Overlay types: `command` (copy pill flips
копировать → скопировано), `model` (Claude icon + model name), `prompt`
(typed text with caret), `subscribe` (cursor clicks Подписаться → Вы подписаны).
Tokens live in `src/Reel/theme.ts`, the full timeline of the original reel is in
`src/Reel/demo.ts` (composition `Reel`).

**Make your own (`MyReel`):**

1. Put your footage at `public/footage.mp4` and set `footage: "footage.mp4"` in `src/Reel/my-reel.ts`.
2. `npm run captions -- public/footage.mp4` transcribes it (whisper.cpp, Russian) into `src/Reel/captions.json`.
3. Add titles / overlays / zooms in `src/Reel/my-reel.ts`, preview with `npm run dev`.
4. `npx remotion render MyReel out/my-reel.mp4`

## Perla Helsa «Ритуал» demo (`Ritual`)

`src/Reel/ScreenReel.tsx` cuts a horizontal screen recording into the same
vertical reel: the recording plays in a rounded window over a blurred copy of
itself, with speed-ups (`segments`) and smooth push-ins (`camera`). The edit,
script and cards for the pill tracker live in `src/Reel/ritual.ts`; the
recording is `public/ritual-demo.mp4`.

```console
npx remotion render Ritual out/ritual-perla-helsa.mp4
```

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
