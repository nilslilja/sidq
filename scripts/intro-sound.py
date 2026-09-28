"""
The sound under Sidq's first-launch intro. About six seconds: a warm pad that
swells in, one soft chime when the dot appears and another as the name is
written, and a long release as the intro leaves.

    python3 scripts/intro-sound.py  ->  src-tauri/resources/intro/intro.m4a

Beats are shared with src/routes/Intro.tsx; change one, change both.
"""

import pathlib
import subprocess
import tempfile
import wave

import numpy as np

SR = 44100
DUR = 6.4
N = int(SR * DUR)
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src-tauri" / "resources" / "intro" / "intro.m4a"
rng = np.random.RandomState(9)
dry = np.zeros((2, N))
send = np.zeros((2, N))

DOT = 0.45
NAME = 2.0
LINE = 3.1
OUT_AT = 5.0

def hz(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def times(d):
    return np.arange(int(d * SR)) / SR


def place(sig, t0, gain=1.0, pan=0.0, verb=0.35):
    i = int(round(t0 * SR))
    if i >= N or len(sig) == 0:
        return
    n = min(len(sig), N - i)
    for ch, g in ((0, np.sqrt(0.5 * (1 - pan))), (1, np.sqrt(0.5 * (1 + pan)))):
        dry[ch, i : i + n] += sig[:n] * gain * g
        send[ch, i : i + n] += sig[:n] * gain * g * verb


def env(d, a, decay):
    t = times(d)
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / decay)


def tail(sig, fade=0.08):
    b = min(len(sig), int(fade * SR))
    out = sig.copy()
    out[-b:] *= np.linspace(1, 0, b)
    return out


def lowpass(x, cutoff):
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(np.fft.rfft(x) / np.sqrt(1 + (f / cutoff) ** 4), len(x))


def felt(note, d=3.0, vel=0.5):
    """A felt piano: soft hammer, few bright partials, a long warm decay."""
    f0 = hz(note)
    t = times(d)
    out = np.zeros_like(t)
    for n in range(1, 9):
        fn = n * f0 * np.sqrt(1 + 0.0003 * n * n)
        amp = vel ** (0.8 + 0.45 * n) / n**1.4
        tau = 2.8 / n**0.8
        for det in (0.9995, 1.0005):
            out += 0.5 * amp * np.sin(2 * np.pi * fn * det * t + rng.uniform(0, 6.283)) * np.exp(-t / tau)
    return tail(out * np.minimum(1, t / 0.008))


def pad(notes, d, cutoff=900, attack=1.2, release=1.2):
    t = times(d)
    out = np.zeros_like(t)
    for n in notes:
        for det in (0.997, 1.0, 1.003):
            f = hz(n) * det
            for k in range(1, 7):
                out += np.sin(2 * np.pi * f * k * t + rng.uniform(0, 6.283)) / k / np.sqrt(1 + (f * k / cutoff) ** 4)
    shape = np.clip(np.minimum(t / attack, (d - t) / release), 0, 1)
    return out * shape / (3 * len(notes))


def tick(pitch=1.0):
    d = 0.06
    t = times(d)
    f = 1500 * pitch * np.exp(-t / 0.03) + 700 * pitch
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(d, 0.001, 0.012)


def chime(a, b):
    d = 2.2
    return sum(np.sin(2 * np.pi * hz(n) * times(d)) * env(d, 0.003, 0.9) * g for n, g in ((a, 1.0), (b, 0.6)))


def air(d):
    return lowpass(rng.uniform(-1, 1, int(d * SR)), 700) * np.clip(np.minimum(times(d) / 1.5, (d - times(d)) / 1.5), 0, 1)


def reverb(x, seconds=3.2):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros_like(x)
    for ch in range(2):
        ir = lowpass(rng.uniform(-1, 1, n) * np.exp(-t / 0.9), 4200)
        ir[: int(0.02 * SR)] = 0
        size = 1 << int(np.ceil(np.log2(x.shape[1] + n)))
        out[ch] = np.fft.irfft(np.fft.rfft(x[ch], size) * np.fft.rfft(ir, size), size)[: x.shape[1]] / np.max(np.abs(ir)) * 0.02
    return out



F2, A3, C4, E4, G4, F3, C3 = 41, 57, 60, 64, 67, 53, 48


def main():
    place(pad([F2 + 12, A3, C4, E4, G4], DUR, 900, 1.4, 1.6), 0.0, 0.55)
    place(felt(F2, 5.0, 0.45), 0.05, 0.35, 0, 0.5)
    place(chime(88, 95), DOT, 0.1, 0.0, 0.8)
    for i, n in enumerate((72, 76, 79, 84)):
        place(felt(n, 3.0, 0.34), NAME + i * 0.2, 0.28, (i - 1.5) * 0.3, 0.6)
    for n, g in ((F3, 0.3), (C4 + 12, 0.22), (G4 + 12, 0.16)):
        place(felt(n, 3.2, 0.42), LINE, g, 0, 0.7)
    mix = dry + reverb(send)
    t = times(DUR)
    mix *= np.clip(t / 0.25, 0, 1) * np.clip((DUR - t) / 1.4, 0, 1)
    mix *= 0.7 / np.max(np.abs(mix))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        wav = pathlib.Path(d) / "intro.wav"
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((mix.T * 32767).astype(np.int16).tobytes())
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "160000", str(wav), str(OUT)], check=True)
    print("intro sound written", OUT)


if __name__ == "__main__":
    main()
