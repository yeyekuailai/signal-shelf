import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const VOICE = "af_heart";
const SAMPLE_RATE = 24000;
let modelPromise = null;
let generationVersion = 0;

function report(id, update) { postMessage({ id, type: "progress", update }); }
function loadModel(id) {
  if (!modelPromise) {
    const useWebGPU = Boolean(navigator.gpu);
    modelPromise = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: useWebGPU ? "q4f16" : "q4",
      device: useWebGPU ? "webgpu" : "wasm",
      progress_callback: update => {
        if (update?.status === "progress" && Number.isFinite(update.progress)) report(id, { phase: "download", percent: Math.round(update.progress) });
      }
    }).catch(error => { modelPromise = null; throw error; });
  }
  return modelPromise;
}
function polish(text) { const clean=text.replace(/\s+/g," ").trim();return /[.!?…]$/.test(clean)?clean:`${clean}.`; }
function fadeEdges(samples,milliseconds=9) { const size=Math.min(Math.floor(SAMPLE_RATE*milliseconds/1000),Math.floor(samples.length/2));for(let i=0;i<size;i+=1){const gain=i/size;samples[i]*=gain;samples[samples.length-1-i]*=gain;}return samples; }
function encodeWav(samples) {
  const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
  const write=(offset,value)=>[...value].forEach((char,index)=>view.setUint8(offset+index,char.charCodeAt(0)));
  write(0,"RIFF");view.setUint32(4,36+samples.length*2,true);write(8,"WAVE");write(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,SAMPLE_RATE,true);view.setUint32(28,SAMPLE_RATE*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,"data");view.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i+=1){const sample=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,sample<0?sample*32768:sample*32767,true);}return buffer;
}
async function generate(id,segments) {
  const version=generationVersion;report(id,{phase:"loading",percent:0});const tts=await loadModel(id);
  for(let index=0;index<segments.length;index+=1){if(version!==generationVersion)return;const segment=segments[index];report(id,{phase:"generating",percent:Math.round(index/segments.length*100)});const result=await tts.generate(polish(segment.text),{voice:VOICE,speed:1});if(version!==generationVersion)return;const speech=fadeEdges(result.audio),silence=new Float32Array(Math.round(SAMPLE_RATE*(segment.pauseMs||180)/1000)),combined=new Float32Array(speech.length+silence.length);combined.set(speech);combined.set(silence,speech.length);const wav=encodeWav(combined);postMessage({id,type:"segment",index,total:segments.length,wav},[wav]);}
  report(id,{phase:"generating",percent:100});postMessage({id,type:"complete"});
}
addEventListener("message",event=>{if(event.data.type==="cancel"){generationVersion+=1;return;}const {id,segments}=event.data;generate(id,segments).catch(error=>postMessage({id,type:"error",error:error?.message||String(error)}));});
