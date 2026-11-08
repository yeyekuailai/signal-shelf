const worker = new Worker(new URL("./tts-worker.js?v=kokoro-6", import.meta.url), { type: "module" });
const pending = new Map();
let requestId = 0;

worker.addEventListener("message", event => {
  const { id, type, update, wav, index, total, error } = event.data;
  const request = pending.get(id);
  if (!request) return;
  if (type === "progress") {
    request.onProgress?.(update);
    return;
  }
  if (type === "segment") {
    request.onSegment?.({ index, total, url: URL.createObjectURL(new Blob([wav], { type: "audio/wav" })) });
    return;
  }
  pending.delete(id);
  if (type === "complete") request.resolve();
  else {
    request.reject(new Error(error || "Neural narration failed"));
  }
});

worker.addEventListener("error", event => {
  for (const request of pending.values()) request.reject(new Error(event.message || "Voice worker failed"));
  pending.clear();
});

function streamNarration(segments, { onProgress, onSegment }) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress, onSegment });
    worker.postMessage({ id, segments });
  });
}

function cancelAll() {
  worker.postMessage({ type: "cancel" });
  for (const request of pending.values()) request.reject(new DOMException("Narration cancelled", "AbortError"));
  pending.clear();
}

window.SignalShelfTTS = { engine: "Kokoro-82M", voice: "Heart", streamNarration, cancelAll };
window.dispatchEvent(new Event("signal-shelf-tts-ready"));
