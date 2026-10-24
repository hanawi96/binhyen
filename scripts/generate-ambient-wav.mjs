/**
 * Tao 3 file WAV nhe (loop) de demo ambient local — khong can ffmpeg.
 * Chay: node scripts/generate-ambient-wav.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join("public", "ambient");
const RATE = 16000;
const SECONDS = 8;

mkdirSync(DIR, { recursive: true });

writeWav(join(DIR, "stream.wav"), softStream(RATE, SECONDS), RATE);
writeWav(join(DIR, "rain.wav"), softRain(RATE, SECONDS), RATE);
writeWav(join(DIR, "piano.wav"), softPiano(RATE, SECONDS), RATE);

console.log(
  JSON.stringify({
    ok: true,
    dir: DIR,
    rate: RATE,
    seconds: SECONDS,
    files: ["stream.wav", "rain.wav", "piano.wav"]
  })
);

function softStream(rate, seconds) {
  const n = rate * seconds;
  const out = new Float32Array(n);
  let brown = 0;
  for (let i = 0; i < n; i += 1) {
    const white = Math.random() * 2 - 1;
    brown = (brown + white * 0.02) * 0.98;
    const ripple = Math.sin(i * 0.011) * 0.04 + Math.sin(i * 0.003) * 0.03;
    out[i] = clamp(brown * 0.55 + white * 0.08 + ripple, -1, 1);
  }
  return fadeLoop(out, Math.floor(rate * 0.2));
}

function softRain(rate, seconds) {
  const n = rate * seconds;
  const out = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i += 1) {
    const white = Math.random() * 2 - 1;
    const hiss = white * 0.22;
    prev = prev * 0.92 + white * 0.08;
    let drop = 0;
    if (Math.random() < 0.004) drop = (Math.random() * 2 - 1) * 0.35;
    out[i] = clamp(hiss + prev * 0.35 + drop, -1, 1);
  }
  return fadeLoop(out, Math.floor(rate * 0.15));
}

function softPiano(rate, seconds) {
  const n = rate * seconds;
  const out = new Float32Array(n);
  const chords = [
    [261.63, 329.63, 392.0],
    [220.0, 277.18, 329.63],
    [246.94, 311.13, 369.99],
    [196.0, 246.94, 293.66]
  ];
  const beat = Math.floor(rate * 2);

  for (let i = 0; i < n; i += 1) {
    const chord = chords[Math.floor(i / beat) % chords.length];
    const local = i % beat;
    const env = Math.exp(-local / (rate * 1.1)) * (1 - local / beat) ** 0.15;
    let sample = 0;
    for (const freq of chord) {
      sample += Math.sin((2 * Math.PI * freq * i) / rate) * 0.18;
      sample += Math.sin((4 * Math.PI * freq * i) / rate) * 0.04;
    }
    out[i] = clamp(sample * env, -1, 1);
  }
  return fadeLoop(out, Math.floor(rate * 0.25));
}

function fadeLoop(samples, fade) {
  const n = samples.length;
  const edge = Math.min(fade, Math.floor(n / 4));
  for (let i = 0; i < edge; i += 1) {
    const t = i / edge;
    const a = samples[i];
    const b = samples[n - edge + i];
    const mixed = a * t + b * (1 - t);
    samples[i] = mixed;
    samples[n - edge + i] = mixed;
  }
  return samples;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function writeWav(path, samples, sampleRate) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE((s * 0x7fff) | 0, 44 + i * 2);
  }

  writeFileSync(path, buffer);
}
