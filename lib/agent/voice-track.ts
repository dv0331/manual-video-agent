import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { cpuBudget, LEAD_SECONDS, runFfmpeg } from "@/lib/agent/ffmpeg";

/** The TTS voice is 24 kHz mono; the film keeps that rate, since upsampling adds encode work and no detail. */
const RATE = 24_000;
/**
 * The film's sound is mono, as the voice is. Players copy a mono track into
 * both speakers, so -19 LUFS mono plays as loud as -16 LUFS stereo (AES TD1004).
 */
const TARGET_MONO_LUFS = -16 - 10 * Math.log10(2);
const PEAK_LIMIT = 10 ** (-1.5 / 20);

/** Format and sample span of a RIFF/WAVE file, or null if it is not one. */
function wavLayout(buffer: Buffer) {
  if (buffer.length < 12 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }
  let offset = 12;
  let format: { channels: number; rate: number; bits: number; type: number } | null = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      format = {
        type: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        rate: buffer.readUInt32LE(body + 4),
        bits: buffer.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      if (!format) return null;
      // Streamed WAVs often leave the size as 0 or 0xFFFFFFFF.
      const end = size > 0 && body + size <= buffer.length ? body + size : buffer.length;
      return { format, start: body, end };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

/** Length of a PCM WAV from its header, without spawning ffprobe. */
export function wavSeconds(buffer: Buffer) {
  const wav = wavLayout(buffer);
  if (!wav || wav.format.type !== 1 || !wav.format.rate || !wav.format.channels || !wav.format.bits) return null;
  return (wav.end - wav.start) / (wav.format.rate * wav.format.channels * (wav.format.bits / 8));
}

function parsePcm16Wav(buffer: Buffer) {
  const wav = wavLayout(buffer);
  if (!wav || wav.format.type !== 1 || wav.format.bits !== 16 || wav.format.rate !== RATE) return null;
  const { channels } = wav.format;
  const frames = Math.floor((wav.end - wav.start) / (2 * channels));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += buffer.readInt16LE(wav.start + (i * channels + c) * 2);
    out[i] = sum / channels / 32768;
  }
  return out;
}

function decodeWithFfmpeg(filePath: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      ["-v", "error", "-i", filePath, "-f", "f32le", "-ac", "1", "-ar", String(RATE), "-"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-800);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || `ffmpeg exited ${code}`));
      const all = Buffer.concat(chunks);
      resolve(new Float32Array(all.buffer, all.byteOffset, Math.floor(all.length / 4)).slice());
    });
  });
}

async function readVoice(filePath: string) {
  return parsePcm16Wav(await readFile(filePath)) ?? (await decodeWithFfmpeg(filePath));
}

function biquad(input: Float32Array, b: number[], a: number[]) {
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    out[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  return out;
}

/** ITU-R BS.1770-4 integrated loudness of a mono signal (K-weighting, 400 ms blocks, two gates). */
export function integratedLoudness(samples: Float32Array, rate = RATE) {
  let K = Math.tan((Math.PI * 1681.974450955533) / rate);
  const Q1 = 0.7071752369554196;
  const Vh = 10 ** (3.999843853973347 / 20);
  const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q1 + K * K;
  const shelf = biquad(
    samples,
    [(Vh + (Vb * K) / Q1 + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q1 + K * K) / a0],
    [1, (2 * (K * K - 1)) / a0, (1 - K / Q1 + K * K) / a0],
  );
  K = Math.tan((Math.PI * 38.13547087602444) / rate);
  const Q2 = 0.5003270373238773;
  a0 = 1 + K / Q2 + K * K;
  const weighted = biquad(shelf, [1, -2, 1], [1, (2 * (K * K - 1)) / a0, (1 - K / Q2 + K * K) / a0]);

  const block = Math.round(rate * 0.4);
  const hop = Math.round(rate * 0.1);
  const powers: number[] = [];
  for (let start = 0; start + block <= weighted.length; start += hop) {
    let sum = 0;
    for (let i = start; i < start + block; i++) sum += weighted[i] * weighted[i];
    powers.push(sum / block);
  }
  const lufs = (power: number) => -0.691 + 10 * Math.log10(power);
  const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / Math.max(values.length, 1);
  const audible = powers.filter((p) => p > 0 && lufs(p) > -70);
  if (!audible.length) return -Infinity;
  const relative = lufs(mean(audible)) - 10;
  const gated = audible.filter((p) => lufs(p) > relative);
  return lufs(mean(gated.length ? gated : audible));
}

function wavFile(samples: Float32Array) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/**
 * Lay every scene's voice on one timeline (each line LEAD_SECONDS into its
 * scene), measure the whole track once, and encode it once. The film's
 * audio is then a stream copy, so it is never encoded twice.
 */
export async function buildVoiceTrack(options: {
  segments: Array<{ audioPath?: string; seconds: number }>;
  wavPath: string;
  outputPath: string;
}) {
  const total = options.segments.reduce((sum, s) => sum + Math.round(s.seconds * RATE), 0);
  const timeline = new Float32Array(total);
  let cursor = 0;
  for (const segment of options.segments) {
    const length = Math.round(segment.seconds * RATE);
    if (segment.audioPath) {
      const voice = await readVoice(segment.audioPath);
      const start = cursor + Math.round(LEAD_SECONDS * RATE);
      const room = Math.max(0, cursor + length - start);
      timeline.set(voice.subarray(0, Math.min(voice.length, room)), start);
    }
    cursor += length;
  }

  const loudness = integratedLoudness(timeline);
  const gain = Number.isFinite(loudness) ? Math.max(-12, Math.min(18, TARGET_MONO_LUFS - loudness)) : 0;
  await writeFile(options.wavPath, wavFile(timeline));

  const small = cpuBudget() < 1;
  await runFfmpeg([
    "-i",
    options.wavPath,
    "-af",
    `volume=${gain.toFixed(2)}dB,alimiter=limit=${PEAK_LIMIT.toFixed(3)}:attack=5:release=60:level=0`,
    "-c:a",
    "aac",
    "-aac_coder",
    small ? "fast" : "twoloop",
    "-b:a",
    "96k",
    ...(small ? ["-threads", "1"] : []),
    options.outputPath,
  ]);
  return { path: options.outputPath, loudness, gain, seconds: total / RATE };
}
