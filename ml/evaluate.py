"""
Evaluate the deployed ONNX artifacts (client/public/models/*.onnx) on
DAiSEE's subject-disjoint Test split, which is excluded from training and
checkpoint selection.

Runs through ONNX Runtime directly (not the .pt checkpoints) so what's
measured is exactly what ships to the browser, sidestepping any drift
between a checkpoint's architecture and what's currently in model.py.

For each task consumed by the app, report AUC-ROC, AUC-PR, F1 at fixed and
optimized thresholds, balanced accuracy, and Brier score. Positive-class
prevalence provides the appropriate reference point for imbalanced tasks.

Also benchmarks ONNX Runtime CPU inference latency/throughput on a
realistic (1, 20, 116) window, matching the app's actual input shape.

Usage:
    python evaluate.py
"""
import time

import numpy as np
import onnxruntime as ort
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    f1_score,
    roc_auc_score,
)

from features import add_deltas
from labels import load_binary_labels
from model import MODEL_INPUT_SIZE, TASKS

ENGAGEMENT_ONNX = "../client/public/models/engagement.onnx"
CONFUSED_ONNX = "../client/public/models/confused.onnx"

# Which onnx file supplies which task at inference time — must mirror
# client/src/lib/engagementScorer.ts's per-task model routing exactly.
TASK_SOURCE = {
    "disengaged": ENGAGEMENT_ONNX,
    "low_engagement": ENGAGEMENT_ONNX,
    "high_boredom": ENGAGEMENT_ONNX,
    "comprehension_problem": CONFUSED_ONNX,
}


def load_test_set(features_dir, data_root):
    data = np.load(f"{features_dir}/test.npz", allow_pickle=True)
    clip_labels = load_binary_labels(data_root, "Test")
    X, Y, clip_ids = [], [], []
    for feats, clip_id in zip(data["X"], data["clip_ids"]):
        if clip_id not in clip_labels:
            continue
        X.append(add_deltas(feats.astype(np.float32)))
        Y.append([clip_labels[clip_id][task] for task in TASKS])
        clip_ids.append(clip_id)
    return X, np.array(Y, dtype=np.float32), clip_ids


def best_f1_threshold(labels, probs):
    thresholds = np.unique(probs)
    best_t, best_f1 = 0.5, f1_score(labels, probs > 0.5, zero_division=0)
    for t in thresholds:
        f1 = f1_score(labels, probs >= t, zero_division=0)
        if f1 > best_f1:
            best_f1, best_t = f1, t
    return best_t, best_f1


def balanced_accuracy(preds, labels):
    accs = []
    for c in (0.0, 1.0):
        mask = labels == c
        if mask.sum() == 0:
            continue
        accs.append((preds[mask] == labels[mask]).mean())
    return sum(accs) / len(accs)


def run_onnx_batch(onnx_path, X):
    session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    output_names = [o.name for o in session.get_outputs()]
    # seq_len is a dynamic axis but batch is fixed at 1 in the exported
    # graph's tracing (see export_onnx.py) — run per-clip, not as one batch.
    per_task_probs = {name: [] for name in output_names}
    for i in range(len(X)):
        x = X[i][None, ...].astype(np.float32)
        out = session.run(None, {input_name: x})
        for name, val in zip(output_names, out):
            per_task_probs[name].append(val[0, 0])
    return {name: np.array(vals) for name, vals in per_task_probs.items()}


def evaluate():
    X, Y, clip_ids = load_test_set("data/features", "data/raw/DAiSEE")
    print(f"Test set: {len(X)} clips (DAiSEE Test split, subject-disjoint and "
          f"excluded from training and checkpoint selection)\n")

    cache = {}
    for task, onnx_path in TASK_SOURCE.items():
        if onnx_path not in cache:
            cache[onnx_path] = run_onnx_batch(onnx_path, X)

    for i, task in enumerate(TASKS):
        probs = cache[TASK_SOURCE[task]][task]
        labels = Y[:, i]
        pos_rate = labels.mean()

        auc_roc = roc_auc_score(labels, probs) if len(set(labels)) > 1 else float("nan")
        auc_pr = average_precision_score(labels, probs) if len(set(labels)) > 1 else float("nan")
        f1_at_half = f1_score(labels, probs > 0.5, zero_division=0)
        best_t, best_f1 = best_f1_threshold(labels, probs)
        bal_acc = balanced_accuracy((probs > 0.5).astype(float), labels)
        brier = brier_score_loss(labels, probs)
        brier_baseline = pos_rate * (1 - pos_rate)  # Brier of always predicting the population base rate

        print(f"[{task}]  ({TASK_SOURCE[task].split('/')[-1]})  positive rate: {pos_rate:.1%}")
        print(f"  AUC-ROC: {auc_roc:.3f}   AUC-PR: {auc_pr:.3f}  (vs {pos_rate:.3f} random-baseline AUC-PR)")
        print(f"  F1@0.5:  {f1_at_half:.3f}   Best-F1: {best_f1:.3f} @ threshold {best_t:.3f}")
        print(f"  Balanced accuracy: {bal_acc:.3f}")
        print(f"  Brier score: {brier:.3f}  (constant base-rate reference: {brier_baseline:.3f}, "
              f"delta: {brier - brier_baseline:+.3f})")
        print()


def benchmark_onnx(onnx_path, seq_len=20, n_warmup=20, n_runs=500):
    session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    x = np.random.randn(1, seq_len, MODEL_INPUT_SIZE).astype(np.float32)
    input_name = session.get_inputs()[0].name

    for _ in range(n_warmup):
        session.run(None, {input_name: x})

    latencies_ms = []
    for _ in range(n_runs):
        t0 = time.perf_counter()
        session.run(None, {input_name: x})
        latencies_ms.append((time.perf_counter() - t0) * 1000)

    latencies_ms = np.array(latencies_ms)
    print(f"[{onnx_path.split('/')[-1]}]  {n_runs} runs, single-sample (1, {seq_len}, {MODEL_INPUT_SIZE}) input, CPUExecutionProvider")
    print(f"  mean: {latencies_ms.mean():.3f} ms   p50: {np.percentile(latencies_ms, 50):.3f} ms   "
          f"p95: {np.percentile(latencies_ms, 95):.3f} ms   p99: {np.percentile(latencies_ms, 99):.3f} ms")
    print(f"  throughput: {1000 / latencies_ms.mean():.0f} inferences/sec (single-threaded, CPU)\n")


if __name__ == "__main__":
    evaluate()
    for path in [ENGAGEMENT_ONNX, CONFUSED_ONNX]:
        benchmark_onnx(path)
