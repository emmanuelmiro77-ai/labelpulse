/**
 * Audio Analysis Module
 *
 * Free in-browser audio analysis for LabelPulse demos.
 * Uses Essentia.js for BPM and key detection, plus Web Audio API for energy.
 *
 * Outputs:
 * - BPM (tempo)
 * - Musical key (Camelot wheel notation + traditional notation)
 * - Energy (0-1 normalized RMS-based)
 * - Danceability proxy (0-1, beat-strength based)
 */

// ==================== CAMELOT WHEEL ====================
// Maps from pitch class + mode (major/minor) to Camelot code.
// Pitch class: 0=C, 1=C#, 2=D, 3=D#, 4=E, 5=F, 6=F#, 7=G, 8=G#, 9=A, 10=A#, 11=B

interface CamelotEntry {
  code: string; // e.g. "8B"
  name: string; // e.g. "A Major" or "F# Minor"
}

// Major keys: starting at C Major = 8B (per Camelot wheel)
const MAJOR_CAMELOT = [
  "8B", // C
  "3B", // C#
  "10B", // D
  "5B", // D#
  "12B", // E
  "7B", // F
  "2B", // F#
  "9B", // G
  "4B", // G#
  "11B", // A
  "6B", // A#
  "1B", // B
];

// Minor keys: starting at A Minor = 8A
const MINOR_CAMELOT = [
  "5A", // C minor
  "12A", // C# minor
  "7A", // D minor
  "2A", // D# minor
  "9A", // E minor
  "4A", // F minor
  "11A", // F# minor
  "6A", // G minor
  "1A", // G# minor
  "8A", // A minor
  "3A", // A# minor
  "10A", // B minor
];

const PITCH_CLASS_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

/**
 * Convert a pitch class (0-11) and mode (0=minor, 1=major) to Camelot notation.
 */
export function pitchToCamelot(
  pitchClass: number,
  mode: 0 | 1
): CamelotEntry {
  const clamped = ((pitchClass % 12) + 12) % 12;
  const code = mode === 1 ? MAJOR_CAMELOT[clamped] : MINOR_CAMELOT[clamped];
  const noteName = PITCH_CLASS_NAMES[clamped];
  const modeName = mode === 1 ? "Major" : "Minor";
  return { code, name: `${noteName} ${modeName}` };
}

/**
 * Check if two Camelot codes are compatible for harmonic mixing.
 * Compatible = same number, or ±1 on the wheel (same letter), or relative major/minor.
 */
export function isCamelotCompatible(c1: string, c2: string): boolean {
  if (!c1 || !c2) return false;
  if (c1 === c2) return true;
  const n1 = parseInt(c1);
  const n2 = parseInt(c2);
  const l1 = c1.slice(-1);
  const l2 = c2.slice(-1);
  if (l1 === l2) {
    // Same letter: ±1 number compatible (wraps 12→1)
    const diff = Math.abs(n1 - n2);
    return diff === 1 || diff === 11;
  } else {
    // Different letters: must be same number (relative major/minor)
    return n1 === n2;
  }
}

/**
 * Get a list of Camelot codes compatible with the given code.
 */
export function getCompatibleCamelotCodes(code: string): string[] {
  if (!code) return [];
  const n = parseInt(code);
  const letter = code.slice(-1);
  const result = [code]; // itself
  // Same letter, ±1
  result.push(`${((n - 1 + 11) % 12) + 1}${letter}`);
  result.push(`${(n % 12) + 1}${letter}`);
  // Same number, other letter
  const otherLetter = letter === "A" ? "B" : "A";
  result.push(`${n}${otherLetter}`);
  return Array.from(new Set(result));
}

// ==================== ANALYSIS TYPES ====================

export interface AudioAnalysisResult {
  bpm: number;
  bpmConfidence: number; // 0-1
  key: {
    pitchClass: number; // 0-11
    mode: 0 | 1; // 0=minor, 1=major
    camelot: string; // e.g. "8B"
    name: string; // e.g. "A Major"
    confidence: number; // 0-1
  };
  energy: number; // 0-1 normalized
  danceability: number; // 0-1 normalized
  loudness: number; // dBFS average
  duration: number; // seconds
  analysisSource: "essentia" | "cyanite";
  analysisDate: string; // ISO timestamp
  // Cyanite-only fields (optional)
  cyaniteGenre?: string;
  cyaniteMoods?: string[];
  cyaniteInstruments?: string[];
}

export interface AnalysisProgress {
  stage: "fetching" | "decoding" | "analyzing" | "done" | "error";
  message: string;
  progress: number; // 0-1
}

// ==================== AUDIO FETCHING ====================

/**
 * Fetch audio bytes through our CORS-bypassing proxy.
 * Returns an ArrayBuffer ready for decoding.
 */
export async function fetchAudioThroughProxy(
  sourceUrl: string,
  onProgress?: (progress: number) => void
): Promise<ArrayBuffer> {
  const proxyUrl = `/api/audio-proxy?url=${encodeURIComponent(sourceUrl)}`;

  const resp = await fetch(proxyUrl);
  if (!resp.ok) {
    let errorMsg: string;
    try {
      const errData = await resp.json();
      errorMsg = errData.error || `HTTP ${resp.status}`;
    } catch {
      errorMsg = `HTTP ${resp.status} ${resp.statusText}`;
    }
    throw new Error(errorMsg);
  }

  // Stream-download with progress reporting
  const contentLength = resp.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength) : 0;

  if (!resp.body || !total) {
    // Fallback: no streaming, just get the array buffer
    const buf = await resp.arrayBuffer();
    onProgress?.(1);
    return buf;
  }

  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onProgress?.(Math.min(0.9, received / total));
    }
  }

  onProgress?.(1);
  // Concatenate chunks into a single ArrayBuffer
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged.buffer;
}

// ==================== DIRECT FILE ANALYSIS ====================

/**
 * Analyze a locally-uploaded audio File directly (no network needed).
 * This is the most reliable path since it bypasses all CORS/proxy issues.
 */
export async function analyzeAudioFile(
  file: File,
  onProgress?: (p: AnalysisProgress) => void
): Promise<AudioAnalysisResult> {
  onProgress?.({
    stage: "fetching",
    message: `Lettura file ${file.name}...`,
    progress: 0.2,
  });

  const arrayBuffer = await file.arrayBuffer();

  return analyzeAudioBufferInternal(arrayBuffer, onProgress);
}

// ==================== ESSENTIA LOADER (script-tag based) ====================
/**
 * Load Essentia.js engine via <script> tags from /public.
 * This completely bypasses the Next.js bundler (Turbopack/webpack) which breaks
 * the ESM↔WASM interop of essentia.js, causing "u is not a constructor" errors.
 *
 * Returns a fully initialized Essentia instance ready for analysis.
 * Cached after first load — subsequent calls return instantly.
 */
let _essentiaCache: any = null;
let _essentiaLoading: Promise<any> | null = null;

async function loadEssentiaEngine(): Promise<any> {
  if (_essentiaCache) return _essentiaCache;
  if (_essentiaLoading) return _essentiaLoading;

  _essentiaLoading = (async () => {
    const w = window as any;

    // 1. Load WASM factory script (if not already loaded)
    if (!w.EssentiaWASM) {
      await loadScriptTag("/essentia-wasm.web.js");
    }

    // 2. Initialize WASM module with correct WASM file path
    const wasmModule = await w.EssentiaWASM({
      locateFile: (path: string) => `/essentia-wasm.web.wasm`,
    });

    // 3. Load Essentia core (if not already loaded)
    if (!w.EssentiaCore) {
      await loadScriptTag("/essentia.js-core.js");
    }

    // 4. Create Essentia instance with the initialized WASM module
    const essentia = new w.EssentiaCore(wasmModule);

    _essentiaCache = essentia;
    return essentia;
  })();

  try {
    return await _essentiaLoading;
  } catch (err) {
    _essentiaLoading = null;
    throw err;
  }
}

function loadScriptTag(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

// ==================== SHARED ANALYSIS CORE ====================

/**
 * Internal: run Essentia.js analysis on a decoded ArrayBuffer.
 *
 * Wrapped in try/catch with a Web-Audio-only fallback. Essentia.js is
 * compiled with -s DISABLE_EXCEPTION_CATCHING=1, so any C++ exception
 * (input too short, unsupported sample rate, NaN in signal) becomes a
 * hard abort — the browser shows "73028368 - Exception catching is
 * disabled, this exception cannot be caught". When that happens we
 * fall back to a Web-Audio-only BPM estimator so the user still gets
 * a usable result instead of an error.
 */
async function analyzeAudioBufferInternal(
  arrayBuffer: ArrayBuffer,
  onProgress?: (p: AnalysisProgress) => void
): Promise<AudioAnalysisResult> {
  onProgress?.({
    stage: "decoding",
    message: "Decodifica audio...",
    progress: 0.5,
  });

  const { monoData, sampleRate, audioBuffer } = await decodeAudio(arrayBuffer);

  // Pre-analysis validation — prevents most essentia.js aborts.
  // Essentia requires at least ~5 seconds of audio for reliable BPM,
  // and accepts standard sample rates (8000/16000/22050/32000/44100/48000).
  const MIN_SAMPLES = sampleRate * 5; // 5 seconds minimum
  const SUPPORTED_RATES = [8000, 16000, 22050, 32000, 44100, 48000];
  const isSampleRateOk = SUPPORTED_RATES.includes(sampleRate);
  const isLengthOk = monoData.length >= MIN_SAMPLES;

  onProgress?.({
    stage: "analyzing",
    message: "Caricamento motore di analisi (WASM ~2MB)...",
    progress: 0.65,
  });

  // If pre-conditions fail, skip essentia entirely and go straight to fallback
  if (!isSampleRateOk || !isLengthOk) {
    console.warn(
      "[audio-analysis] Skipping Essentia.js — pre-conditions not met:",
      `sampleRate=${sampleRate} (supported: ${SUPPORTED_RATES.join(",")})`,
      `length=${monoData.length} samples (${(monoData.length / sampleRate).toFixed(1)}s, min 5s)`
    );
    return runWebAudioFallback(monoData, sampleRate, audioBuffer.duration, onProgress, {
      reason: !isSampleRateOk ? "sample rate non supportato" : "audio troppo corto (<5s)",
    });
  }

  // Try Essentia.js — wrap every call so an abort in any of them
  // triggers the fallback instead of crashing the whole analysis.
  try {
    // Load Essentia.js via script tags to bypass Next.js bundler completely.
    const essentia = await loadEssentiaEngine();

    // BPM detection
    const vectorSignal = essentia.arrayToVector(Float32Array.from(monoData));
    const bpmResult = essentia.PercivalBpmEstimator(
      vectorSignal,
      1024, 128,
      sampleRate,
      1024, 512,
      60, 180
    );
    const bpm = Math.round(bpmResult.bpm);
    vectorSignal.delete?.();
    bpmResult.delete?.();

    // Validate BPM result — essentia sometimes returns 0 or NaN on
    // problematic input without throwing, leaving a useless result.
    if (!Number.isFinite(bpm) || bpm < 30 || bpm > 250) {
      console.warn(
        `[audio-analysis] Essentia returned invalid BPM (${bpm}), using fallback`
      );
      return runWebAudioFallback(monoData, sampleRate, audioBuffer.duration, onProgress, {
        reason: `BPM essentia non valido (${bpm})`,
      });
    }

    // Key detection (first 60 seconds for stability)
    const sixtySecSamples = Math.min(monoData.length, sampleRate * 60);
    const sixtySecSlice = monoData.slice(0, sixtySecSamples);
    const keyInput = essentia.arrayToVector(Float32Array.from(sixtySecSlice));
    const keyResult = essentia.Key(keyInput, true, true, false, false, false);
    keyInput.delete?.();

    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const keyName = keyResult.key || "C";
    const scale = (keyResult.scale || "minor").toLowerCase();
    const sharpIdx = keyName.indexOf("#");
    let baseNote = keyName.charAt(0).toUpperCase();
    if (sharpIdx > 0) baseNote += "#";
    const pc = noteNames.indexOf(baseNote);
    const pitchClass = pc >= 0 ? pc : 0;
    const mode: 0 | 1 = scale === "major" ? 1 : 0;

    const camelot = pitchToCamelot(pitchClass, mode);
    keyResult.delete?.();

    onProgress?.({
      stage: "analyzing",
      message: "Calcolo energia e danceability...",
      progress: 0.9,
    });

    const energy = computeEnergy(monoData);
    const loudness = computeLoudness(monoData);
    const danceability = computeDanceability(monoData, sampleRate, bpm);

    onProgress?.({
      stage: "done",
      message: "Analisi completata!",
      progress: 1,
    });

    return {
      bpm,
      bpmConfidence: 0.85,
      key: {
        pitchClass,
        mode,
        camelot: camelot.code,
        name: camelot.name,
        confidence: 0.8,
      },
      energy,
      danceability,
      loudness,
      duration: audioBuffer.duration,
      analysisSource: "essentia",
      analysisDate: new Date().toISOString(),
    };
  } catch (essentiaErr: any) {
    // Essentia.js WASM abort (the infamous "73028368 - Exception catching
    // is disabled" message). The abort actually terminates the script,
    // but if we got here it means the exception was catchable — fall back.
    console.warn(
      "[audio-analysis] Essentia.js failed, falling back to Web Audio analyzer:",
      essentiaErr?.message || essentiaErr
    );
    return runWebAudioFallback(monoData, sampleRate, audioBuffer.duration, onProgress, {
      reason: essentiaErr?.message || "errore essentia.js",
    });
  }
}

/**
 * Web-Audio-only fallback: gives BPM + energy + loudness + danceability
 * without essentia.js. Key detection is not possible, so we mark it as
 * "Sconosciuta" with confidence 0 (the UI knows to display it differently).
 *
 * Used when:
 *   - Essentia.js fails to load or aborts
 *   - Audio is too short (<5s) for reliable essentia analysis
 *   - Sample rate is non-standard
 *   - Essentia returns an invalid BPM (0, NaN, out of range)
 */
async function runWebAudioFallback(
  monoData: Float32Array,
  sampleRate: number,
  durationSec: number,
  onProgress?: (p: AnalysisProgress) => void,
  failureInfo?: { reason: string }
): Promise<AudioAnalysisResult> {
  onProgress?.({
    stage: "analyzing",
    message: failureInfo
      ? `Modalità fallback (${failureInfo.reason})...`
      : "Modalità fallback (analisi BPM semplificata)...",
    progress: 0.85,
  });

  const bpm = computeBpmWebAudio(monoData, sampleRate);
  const energy = computeEnergy(monoData);
  const loudness = computeLoudness(monoData);
  const danceability = computeDanceability(monoData, sampleRate, bpm);

  onProgress?.({
    stage: "done",
    message: "Analisi completata (modalità fallback)",
    progress: 1,
  });

  // Fallback result: key is unknown, marked as C Major (8B) for compatibility
  // but with confidence 0 so the UI can show it as "sconosciuta"
  const camelot = pitchToCamelot(0, 1);
  return {
    bpm,
    bpmConfidence: 0.6, // lower confidence for fallback
    key: {
      pitchClass: 0,
      mode: 1,
      camelot: camelot.code,
      name: "Sconosciuta",
      confidence: 0,
    },
    energy,
    danceability,
    loudness,
    duration: durationSec,
    analysisSource: "essentia", // keep source type for UI compat
    analysisDate: new Date().toISOString(),
  };
}

/**
 * Pure-JS BPM estimator using autocorrelation on the audio envelope.
 * Less accurate than essentia.js's PercivalBpmEstimator but works on
 * any input without external dependencies. Range: 60-180 BPM.
 *
 * Algorithm:
 *   1. Compute envelope via low-pass on |signal|
 *   2. Find autocorrelation peaks in the lag range [SR/180, SR/60]
 *   3. The lag with the highest autocorrelation → BPM = 60 * SR / lag
 */
export function computeBpmWebAudio(
  mono: Float32Array,
  sampleRate: number,
  minBpm = 60,
  maxBpm = 180
): number {
  if (!mono || mono.length < sampleRate * 2) return 0;

  // Downsample to ~110 Hz envelope for speed (1 sample per 400 samples)
  const envelopeHop = 400;
  const envelopeLength = Math.floor(mono.length / envelopeHop);
  const envelope = new Float32Array(envelopeLength);

  for (let i = 0; i < envelopeLength; i++) {
    let sum = 0;
    const start = i * envelopeHop;
    const end = Math.min(start + envelopeHop, mono.length);
    for (let j = start; j < end; j++) {
      sum += Math.abs(mono[j]);
    }
    envelope[i] = sum / (end - start);
  }

  // Effective sample rate of the envelope
  const envSampleRate = sampleRate / envelopeHop;

  // Autocorrelation lag range corresponding to BPM range
  const minLag = Math.floor(envSampleRate * 60 / maxBpm);
  const maxLag = Math.ceil(envSampleRate * 60 / minBpm);

  let bestLag = 0;
  let bestCorr = -Infinity;

  for (let lag = minLag; lag <= Math.min(maxLag, envelopeLength - 1); lag++) {
    let corr = 0;
    // Sample 2000 pairs for speed
    const sampleStep = Math.max(1, Math.floor((envelopeLength - lag) / 2000));
    for (let i = 0; i < envelopeLength - lag; i += sampleStep) {
      corr += envelope[i] * envelope[i + lag];
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  if (bestLag === 0) return 0;

  let bpm = Math.round((envSampleRate * 60) / bestLag);

  // Octave correction: if BPM is in the upper half of the range, it might
  // be a double of the true BPM; if in the lower half, half of it.
  if (bpm > 0 && bpm < minBpm) bpm *= 2;
  if (bpm > maxBpm) bpm = Math.round(bpm / 2);

  return Math.max(minBpm, Math.min(maxBpm, bpm));
}

// ==================== AUDIO DECODING ====================

/**
 * Decode an audio ArrayBuffer into an AudioBuffer using Web Audio API.
 * Downmixes to mono for analysis efficiency.
 */
export async function decodeAudio(
  arrayBuffer: ArrayBuffer
): Promise<{ audioBuffer: AudioBuffer; monoData: Float32Array; sampleRate: number }> {
  // Use OfflineAudioContext for decoding (no need for actual playback)
  const AudioContextClass =
    (typeof window !== "undefined" &&
      ((window as any).AudioContext || (window as any).webkitAudioContext)) ||
    null;

  if (!AudioContextClass) {
    throw new Error("Web Audio API not supported in this browser");
  }

  // Use a temporary context just for decoding
  const tempCtx = new AudioContextClass();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
  } finally {
    tempCtx.close();
  }

  // Downmix to mono
  const channelCount = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < channelCount; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i] / channelCount;
    }
  }

  return {
    audioBuffer,
    monoData: mono,
    sampleRate: audioBuffer.sampleRate,
  };
}

// ==================== ENERGY / DANCEABILITY ====================

/**
 * Compute energy (0-1) from mono audio data using RMS.
 * Electronic music typically ranges 0.4-0.8.
 */
export function computeEnergy(mono: Float32Array): number {
  if (mono.length === 0) return 0;
  let sumSquares = 0;
  // Sample every 4th value to speed up
  const step = 4;
  let count = 0;
  for (let i = 0; i < mono.length; i += step) {
    sumSquares += mono[i] * mono[i];
    count++;
  }
  const rms = Math.sqrt(sumSquares / count);
  // Normalize: typical electronic music RMS is ~0.05-0.25
  // Map 0→0, 0.3→1 with a curve
  const normalized = Math.min(1, Math.pow(rms / 0.3, 0.7));
  return Math.round(normalized * 100) / 100;
}

/**
 * Compute loudness (dBFS) from mono audio data.
 */
export function computeLoudness(mono: Float32Array): number {
  if (mono.length === 0) return -60;
  let sumSquares = 0;
  const step = 4;
  let count = 0;
  for (let i = 0; i < mono.length; i += step) {
    sumSquares += mono[i] * mono[i];
    count++;
  }
  const rms = Math.sqrt(sumSquares / count);
  if (rms < 1e-6) return -60;
  return Math.round((20 * Math.log10(rms)) * 10) / 10;
}

/**
 * Compute a danceability proxy (0-1) using beat-strength detection.
 * Based on how regular and strong the onsets are.
 */
export function computeDanceability(
  mono: Float32Array,
  sampleRate: number,
  bpm: number
): number {
  if (bpm <= 0) return 0.5;
  // Compute spectral flux as a beat-strength proxy
  const windowSize = 1024;
  const hopSize = 512;
  const windows: number[] = [];
  for (let i = 0; i + windowSize < mono.length; i += hopSize) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) {
      energy += mono[i + j] * mono[i + j];
    }
    windows.push(energy / windowSize);
  }

  if (windows.length < 4) return 0.5;

  // Compute flux (positive energy differences)
  let fluxSum = 0;
  let fluxCount = 0;
  for (let i = 1; i < windows.length; i++) {
    const diff = windows[i] - windows[i - 1];
    if (diff > 0) {
      fluxSum += diff;
      fluxCount++;
    }
  }
  const avgFlux = fluxCount > 0 ? fluxSum / fluxCount : 0;

  // BPM in danceable range (100-140) is preferred
  const bpmScore = bpm >= 100 && bpm <= 140
    ? 1
    : bpm >= 80 && bpm <= 160
      ? 0.7
      : 0.4;

  // Combine flux strength with BPM score
  const fluxScore = Math.min(1, avgFlux * 50);
  const danceability = 0.6 * bpmScore + 0.4 * fluxScore;
  return Math.round(Math.min(1, Math.max(0, danceability)) * 100) / 100;
}

// ==================== CYANITE BYOK ====================

/**
 * Submit audio to Cyanite for full analysis (requires user-provided API token).
 * This is the BYOK (Bring Your Own Key) flow — the user pays for their own subscription.
 */
export async function analyzeWithCyanite(
  sourceUrl: string,
  apiToken: string,
  onProgress?: (p: AnalysisProgress) => void
): Promise<AudioAnalysisResult> {
  onProgress?.({
    stage: "fetching",
    message: "Scaricamento audio per Cyanite...",
    progress: 0.1,
  });

  // Fetch audio bytes
  const audioBytes = await fetchAudioThroughProxy(sourceUrl, (p) =>
    onProgress?.({
      stage: "fetching",
      message: `Scaricamento audio... ${Math.round(p * 100)}%`,
      progress: p * 0.5,
    })
  );

  onProgress?.({
    stage: "analyzing",
    message: "Invio a Cyanite per analisi avanzata...",
    progress: 0.6,
  });

  // Step 1: Upload audio to Cyanite
  const uploadMutation = `
    mutation UploadAudio($file: Upload!) {
      uploadAudioFile(input: { file: $file }) {
        __typename
        ... on AudioFileUploadSuccess {
          uploadedAudio { id filename }
        }
        ... on Error {
          message
        }
      }
    }
  `;

  const formData = new FormData();
  formData.append(
    "operations",
    JSON.stringify({
      query: uploadMutation,
      variables: { file: null },
    })
  );
  formData.append("map", JSON.stringify({ "0": ["variables.file"] }));
  formData.append("0", new Blob([audioBytes]), "demo.mp3");

  const uploadResp = await fetch("https://api.cyanite.ai/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}` },
    body: formData,
  });

  const uploadData = await uploadResp.json();
  if (uploadData.errors) {
    throw new Error(`Cyanite upload error: ${uploadData.errors[0]?.message}`);
  }

  const audioId = uploadData.data?.uploadAudioFile?.uploadedAudio?.id;
  if (!audioId) {
    throw new Error("Cyanite: no audio ID returned");
  }

  onProgress?.({
    stage: "analyzing",
    message: "Analisi in corso su Cyanite (può richiedere 30-60s)...",
    progress: 0.7,
  });

  // Step 2: Trigger analysis
  const analyzeMutation = `
    mutation AnalyzeAudio($input: AnalyzeAudioInput!) {
      analyzeAudio(input: $input) {
        __typename
        ... on AnalysisSuccess { analysis { id } }
        ... on Error { message }
      }
    }
  `;

  const analyzeResp = await fetch("https://api.cyanite.ai/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      query: analyzeMutation,
      variables: { input: { audioId: parseInt(audioId) } },
    }),
  });

  const analyzeData = await analyzeResp.json();
  if (analyzeData.errors) {
    throw new Error(`Cyanite analyze error: ${analyzeData.errors[0]?.message}`);
  }

  const analysisId = analyzeData.data?.analyzeAudio?.analysis?.id;
  if (!analysisId) {
    throw new Error("Cyanite: no analysis ID returned");
  }

  // Step 3: Poll for results (max 90 seconds)
  const fetchAnalysisQuery = `
    query FetchAnalysis($id: ID!) {
      analysis(id: $id) {
        id
        status
        bpm
        key
        energy
        arousal
        valence
        genreTags { tag { name } }
        moodTags { tag { name } }
        instrumentTags { tag { name } }
      }
    }
  `;

  let attempts = 0;
  while (attempts < 30) {
    await new Promise((r) => setTimeout(r, 3000));
    attempts++;

    const resultResp = await fetch("https://api.cyanite.ai/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        query: fetchAnalysisQuery,
        variables: { id: analysisId },
      }),
    });

    const resultData = await resultResp.json();
    const analysis = resultData.data?.analysis;
    if (!analysis) continue;

    if (analysis.status === "finished") {
      onProgress?.({
        stage: "done",
        message: "Analisi Cyanite completata!",
        progress: 1,
      });

      // Convert Cyanite's key format to Camelot
      // Cyanite returns keys like "A Major" or "F# Minor"
      const keyMatch = analysis.key?.match(
        /^([A-G])(#|b)?\s+(Major|Minor)$/i
      );
      let pitchClass = 0;
      let mode: 0 | 1 = 1;
      if (keyMatch) {
        const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        let note = keyMatch[1].toUpperCase();
        if (keyMatch[2] === "#") note += "#";
        if (keyMatch[2] === "b") {
          // Convert flat to sharp
          const flats: Record<string, string> = {
            Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#",
          };
          note = flats[note + "b"] || note;
        }
        pitchClass = noteNames.indexOf(note);
        mode = keyMatch[3].toLowerCase() === "major" ? 1 : 0;
      }
      const camelot = pitchToCamelot(pitchClass, mode);

      return {
        bpm: Math.round(analysis.bpm || 0),
        bpmConfidence: 0.9,
        key: {
          pitchClass,
          mode,
          camelot: camelot.code,
          name: camelot.name,
          confidence: 0.9,
        },
        energy: analysis.energy ?? 0,
        danceability: 0.5, // Cyanite doesn't return this directly
        loudness: -10,
        duration: 0,
        analysisSource: "cyanite",
        analysisDate: new Date().toISOString(),
        cyaniteGenre: analysis.genreTags?.[0]?.tag?.name,
        cyaniteMoods: analysis.moodTags?.map((t: any) => t.tag.name).slice(0, 5),
        cyaniteInstruments: analysis.instrumentTags?.map((t: any) => t.tag.name).slice(0, 5),
      };
    }

    if (analysis.status === "failed") {
      throw new Error("Cyanite analysis failed");
    }

    onProgress?.({
      stage: "analyzing",
      message: `In attesa dei risultati... (${attempts * 3}s)`,
      progress: 0.7 + (attempts / 30) * 0.25,
    });
  }

  throw new Error("Cyanite: timeout waiting for analysis");
}

// ==================== MAIN ANALYSIS FUNCTIONS ====================

/**
 * Analyze audio from a URL using free in-browser analysis.
 * Falls back through the proxy if CORS blocks direct fetch.
 */
export async function analyzeAudio(
  sourceUrl: string,
  onProgress?: (p: AnalysisProgress) => void
): Promise<AudioAnalysisResult> {
  onProgress?.({
    stage: "fetching",
    message: "Scaricamento audio...",
    progress: 0.05,
  });

  // Fetch through proxy
  const audioBytes = await fetchAudioThroughProxy(sourceUrl, (p) =>
    onProgress?.({
      stage: "fetching",
      message: `Scaricamento audio... ${Math.round(p * 100)}%`,
      progress: p * 0.5,
    })
  );

  // Use shared analysis core
  return analyzeAudioBufferInternal(audioBytes, onProgress);
}
