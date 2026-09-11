// Real-time engagement scoring pipeline: MediaPipe Face Landmarker extracts
// blendshape and head-pose features for two ONNX Runtime Web models.
//
// Task-specific artifacts preserve the strongest checkpoint for each output:
// engagement.onnx supplies engagement and boredom, while confused.onnx
// supplies the combined comprehension-problem signal defined in ml/labels.py.
//
// Must mirror ml/preprocess.py + ml/features.py exactly: same raw feature
// layout (52 blendshapes + 6 head-pose numbers) and the same frame-to-frame
// delta expansion, or the models see a different distribution than they
// were trained on.
import type { EngagementScores } from "../types";

const BLENDSHAPE_SAMPLE_HZ = 2; // matches ml/preprocess.py's FRAME_SAMPLE_RATE_HZ
const WINDOW_SIZE = 20; // ~10s of buffered frames, matches training clip length
const MIN_FRAMES_BEFORE_SCORING = 5;
const NUM_BLENDSHAPES = 52;
const NUM_HEAD_POSE = 6;
const NUM_RAW_FEATURES = NUM_BLENDSHAPES + NUM_HEAD_POSE;

// A fixed 0.5 threshold provides a consistent decision boundary across
// subject-disjoint evaluation data.
const DISENGAGED_THRESHOLD = 0.5;

// A neutral band stabilizes the UI around the decision boundary while
// preserving clear engaged and bored states at either end of the range.
const NEUTRAL_BAND = 0.12;

// Per-task display ranges map observed model outputs onto the full 0–100
// dashboard scale while preserving their ordering.
const CAL_LOW_ENGAGEMENT = { min: 0.05, max: 0.55 };
const CAL_BOREDOM = { min: 0.05, max: 0.75 };

// The comprehension-problem head combines confusion and frustration into a
// broader signal of difficulty. Its display range highlights useful changes
// in the model output for the teacher dashboard.
const CAL_CONFUSED = { min: 0.08, max: 0.4 };

function stretch(raw: number, { min, max }: { min: number; max: number }): number {
  return Math.min(1, Math.max(0, (raw - min) / (max - min)));
}

function engagementStatus(raw: number): EngagementScores["engagementStatus"] {
  if (raw > DISENGAGED_THRESHOLD + NEUTRAL_BAND) return "bored";
  if (raw < DISENGAGED_THRESHOLD - NEUTRAL_BAND) return "engaged";
  return "neutral";
}

const MEDIAPIPE_VERSION = "1.0.1";
const FACE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

// Loaded globally via the <script> tag in index.html.
declare const ort: {
  InferenceSession: { create(path: string): Promise<OrtSession> };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
};

interface OrtSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>;
}

interface FaceLandmarkerResult {
  faceBlendshapes?: { categories: { score: number }[] }[];
  facialTransformationMatrixes?: { data: Float32Array }[];
}

interface FaceLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): FaceLandmarkerResult;
}

let faceLandmarkerPromise: Promise<FaceLandmarkerLike> | null = null;
let engagementSessionPromise: Promise<OrtSession> | null = null;
let confusedSessionPromise: Promise<OrtSession> | null = null;

function loadFaceLandmarker(): Promise<FaceLandmarkerLike> {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import(
        /* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`
      );
      const filesetResolver = await FilesetResolver.forVisionTasks(
        `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
      );
      return FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL_URL },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: "VIDEO",
        numFaces: 1,
      });
    })();
  }
  return faceLandmarkerPromise;
}

function loadEngagementSession(): Promise<OrtSession> {
  if (!engagementSessionPromise) {
    engagementSessionPromise = ort.InferenceSession.create("/models/engagement.onnx");
  }
  return engagementSessionPromise;
}

function loadConfusedSession(): Promise<OrtSession> {
  if (!confusedSessionPromise) {
    confusedSessionPromise = ort.InferenceSession.create("/models/confused.onnx");
  }
  return confusedSessionPromise;
}

// First two columns of the rotation submatrix (6 numbers) — must match
// ml/preprocess.py's head_pose_features exactly. MediaPipe's JS Matrix type
// stores the 4x4 column-major as a flat `data` array (unlike Python's numpy
// array, which is indexed [row][col] directly), so the index math differs
// between the two even though it extracts the same values: column 0 is
// data[0..2], column 1 is data[4..6].
function headPoseFeatures(matrix: { data: Float32Array }): number[] {
  const d = matrix.data;
  return [d[0], d[1], d[2], d[4], d[5], d[6]];
}

// Matches ml/features.py's add_deltas: appends frame-to-frame deltas
// (frame 0's delta is zero, no prior frame).
function addDeltas(sequence: number[][]): number[][] {
  return sequence.map((frame, t) => {
    const prev = t === 0 ? frame : sequence[t - 1];
    const delta = frame.map((v, i) => v - prev[i]);
    return frame.concat(delta);
  });
}

/**
 * Starts scoring `videoEl`'s live feed, calling `onScore` with the full
 * affect breakdown roughly every `intervalMs`. Returns a cleanup function —
 * call it (e.g. from a React effect's cleanup) to stop scoring.
 */
export function startEngagementScorer(
  videoEl: HTMLVideoElement,
  onScore: (scores: EngagementScores) => void,
  intervalMs = 1000 / BLENDSHAPE_SAMPLE_HZ
): () => void {
  const state: { stopped: boolean; intervalId?: ReturnType<typeof setInterval> } = { stopped: false };

  (async () => {
    const [faceLandmarker, engagementSession, confusedSession] = await Promise.all([
      loadFaceLandmarker(),
      loadEngagementSession(),
      loadConfusedSession(),
    ]);
    if (state.stopped) return;
    const buffer: number[][] = [];
    let busy = false; // reentrancy guard: skip a tick if the previous one hasn't finished

    state.intervalId = setInterval(async () => {
      if (videoEl.readyState < 2) return; // video not ready yet
      if (busy) return; // a slow cycle (e.g. cold WASM) can outlast intervalMs — never overlap session.run() calls
      busy = true;
      try {
        const result = faceLandmarker.detectForVideo(videoEl, performance.now());
        if (!result.faceBlendshapes?.length || !result.facialTransformationMatrixes?.length) return;

        const blendshapes = result.faceBlendshapes[0].categories.map((c) => c.score);
        const pose = headPoseFeatures(result.facialTransformationMatrixes[0]);
        buffer.push(blendshapes.concat(pose));
        if (buffer.length > WINDOW_SIZE) buffer.shift();
        if (buffer.length < MIN_FRAMES_BEFORE_SCORING) return;

        const withDeltas = addDeltas(buffer);
        const tensor = new ort.Tensor(
          "float32",
          Float32Array.from(withDeltas.flat()),
          [1, withDeltas.length, NUM_RAW_FEATURES * 2]
        );
        // Both models consume the same feature window. Run them sequentially
        // because the threaded/SIMD WASM backend serializes session execution.
        const engagementOutput = await engagementSession.run({ blendshapes: tensor });
        const confusedOutput = await confusedSession.run({ blendshapes: tensor });

        const engagementPct = Math.round(
          (1 - stretch(engagementOutput.low_engagement.data[0], CAL_LOW_ENGAGEMENT)) * 100
        );
        const boredomPct = Math.round(stretch(engagementOutput.high_boredom.data[0], CAL_BOREDOM) * 100);
        const confusedPct = Math.round(stretch(confusedOutput.comprehension_problem.data[0], CAL_CONFUSED) * 100);

        // Every dashboard bar uses a consistent midpoint rule; engagement is
        // inverted because higher engagement represents the positive state.
        onScore({
          engagementStatus: engagementStatus(engagementOutput.disengaged.data[0]),
          engagementPct,
          lowEngagement: engagementPct < 50,
          boredomPct,
          highBoredom: boredomPct >= 50,
          confusedPct,
          highConfused: confusedPct >= 50,
        });
      } finally {
        busy = false;
      }
    }, intervalMs);
  })();

  return () => {
    state.stopped = true;
    if (state.intervalId) clearInterval(state.intervalId);
  };
}
