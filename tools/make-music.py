"""Фоновая музыка в стиле synthwave, генерируется кодом (без ИИ и лицензий).

python3 tools/make-music.py <длина_сек> <выход.wav>
100 BPM, Am – F – C – G: бас восьмыми, пэд, бочка, хэт, тихий арпеджио.
Под голос: громкость трека задаётся уже в монтаже.
"""
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
BPM = 100
BEAT = 60 / BPM
BAR = BEAT * 4

length = float(sys.argv[1])
out = sys.argv[2]
n = int(length * SR)
rng = np.random.default_rng(7)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def saw(f, t):
    return 2 * ((t * f) % 1.0) - 1


def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, "low", fs=SR, output="sos"), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x)


def env(dur, a, r):
    t = np.arange(int(dur * SR)) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / r)


def place(buf, start, sig):
    end = min(len(buf), start + len(sig))
    if end > start:
        buf[start:end] += sig[: end - start]


# Аккорды (MIDI): Am, F, C, G
chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
roots = [33, 29, 36, 31]

pad = np.zeros(n)
bass = np.zeros(n)
arp = np.zeros(n)
drums = np.zeros(n)

bars = int(np.ceil(length / BAR))
for b in range(bars):
    ci = b % 4
    s0 = int(b * BAR * SR)
    seg = min(int(BAR * SR), n - s0)
    if seg <= 0:
        break
    t = np.arange(seg) / SR
    # пэд: детюн пилы
    pad[s0 : s0 + seg] += sum(saw(midi(m) * d, t) for m in chords[ci] for d in (0.997, 1.003)) / 6
    # бас восьмыми
    for k in range(8):
        e = env(BEAT / 2, 0.005, 0.12)
        tt = np.arange(len(e)) / SR
        place(bass, s0 + int(k * BEAT / 2 * SR), saw(midi(roots[ci]), tt) * e)
    # арпеджио шестнадцатыми (со 2-го цикла)
    if b >= 4:
        notes = chords[ci] + [chords[ci][0] + 12]
        for k in range(16):
            e = env(BEAT / 4, 0.003, 0.06)
            tt = np.arange(len(e)) / SR
            place(arp, s0 + int(k * BEAT / 4 * SR), np.sign(np.sin(2 * np.pi * midi(notes[k % 4] + 12) * tt)) * e)
    # барабаны (с 3-го такта)
    if b >= 2:
        for k in range(4):
            st = s0 + int(k * BEAT * SR)
            e = env(0.35, 0.001, 0.09)
            tt = np.arange(len(e)) / SR
            f = 45 + 90 * np.exp(-tt * 30)
            place(drums, st, np.sin(2 * np.pi * np.cumsum(f) / SR) * e * 0.9)
            he = env(0.06, 0.001, 0.015)
            place(drums, st + int(BEAT / 2 * SR), hp(rng.standard_normal(len(he)), 7000) * he * 0.25)
            if k in (1, 3):
                ce = env(0.18, 0.001, 0.05)
                place(drums, st, hp(rng.standard_normal(len(ce)), 1500) * ce * 0.25)

pad = lp(pad, 1400) * 0.5
bass = lp(bass, 400) * 0.55
arp = lp(arp, 2500) * 0.07
mix = pad + bass + arp + drums * 0.6

# простой стерео-эффект: разные задержки пэда и арпеджио
wet = lp(pad + arp, 3000)
left = mix + 0.25 * np.roll(wet, int(0.031 * SR))
right = mix + 0.25 * np.roll(wet, int(0.047 * SR))
st = np.stack([left, right], axis=1)

fi, fo = int(2 * SR), int(4 * SR)
st[:fi] *= np.linspace(0, 1, fi)[:, None]
st[-fo:] *= np.linspace(1, 0, fo)[:, None]
st /= np.max(np.abs(st)) + 1e-9
st *= 0.89
wavfile.write(out, SR, (st * 32767).astype(np.int16))
print(out, round(len(st) / SR, 2), "s")
