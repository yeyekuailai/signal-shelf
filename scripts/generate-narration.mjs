import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { KokoroTTS } from "kokoro-js";

const ROOT = path.resolve(import.meta.dirname, "..");
const SAMPLE_RATE = 24000;
const VOICE = "af_heart";
const onlyId = process.argv[2] ? Number(process.argv[2]) : null;

function readStories(source) {
  const start = source.indexOf("const stories = ");
  const end = source.indexOf(";\n\nconst trackedAccounts", start);
  if (start < 0 || end < 0) throw new Error("Could not find the stories array in dist/app.js");
  return vm.runInNewContext(source.slice(start + "const stories = ".length, end));
}

function sentences(text) {
  return text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
}

function narrationSegments(story) {
  const blocks = [`${story.title}.`, story.lede];
  story.sections.forEach(section => blocks.push(`${section[0]}.`, section[1], section[2]));
  blocks.push("What to remember.", ...story.takeaways);
  const segments = [];
  let current = "";
  blocks.flatMap(sentences).forEach(part => {
    const next = current ? `${current} ... ${part.trim()}` : part.trim();
    if (next.length > 430 && current) {
      segments.push({ text: current, pauseMs: 340 });
      current = part.trim();
    } else current = next;
  });
  if (current) segments.push({ text: current, pauseMs: 620 });
  return segments;
}

function fade(samples, milliseconds = 10) {
  const count = Math.min(Math.floor(SAMPLE_RATE * milliseconds / 1000), Math.floor(samples.length / 2));
  for (let i = 0; i < count; i += 1) {
    const gain = i / count;
    samples[i] *= gain;
    samples[samples.length - 1 - i] *= gain;
  }
}

async function encodeMp3(samples, output) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0.89 ? 0.89 / peak : 1;
  if (gain < 1) for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;
  await fs.mkdir(path.dirname(output), { recursive: true });
  await new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-f", "f32le", "-ar", String(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "64k", "-ar", String(SAMPLE_RATE), "-ac", "1", "-y", output]);
    ffmpeg.once("error", reject);
    ffmpeg.once("exit", code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
    ffmpeg.stdin.end(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
  });
}

const source = await fs.readFile(path.join(ROOT, "dist/app.js"), "utf8");
const stories = readStories(source).filter(story => onlyId === null || story.id === onlyId);
if (!stories.length) throw new Error(`No story found for id ${onlyId}`);

console.log("Loading the offline narration model…");
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });

for (const story of stories) {
  const output = path.join(ROOT, "dist/audio", `story-${story.id}.mp3`);
  if (onlyId === null) {
    try {
      const existing = await fs.stat(output);
      if (existing.size > 0) {
        console.log(`Skipping story ${story.id}; narration already exists.`);
        continue;
      }
    } catch {}
  }
  const segments = narrationSegments(story);
  const rendered = [];
  let total = 0;
  console.log(`Generating story ${story.id}: ${story.title}`);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const result = await tts.generate(segment.text, { voice: VOICE, speed: 1 });
    fade(result.audio);
    const silence = new Float32Array(Math.round(SAMPLE_RATE * segment.pauseMs / 1000));
    rendered.push(result.audio, silence);
    total += result.audio.length + silence.length;
    console.log(`  ${index + 1}/${segments.length}`);
  }
  const combined = new Float32Array(total);
  let offset = 0;
  for (const samples of rendered) {
    combined.set(samples, offset);
    offset += samples.length;
  }
  await encodeMp3(combined, output);
}
