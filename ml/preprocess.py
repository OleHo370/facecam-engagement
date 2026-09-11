"""
Extract per-frame MediaPipe face-blendshape features from DAiSEE clips and
cache them to .npz files, one per split.

Expects the dataset extracted to --data-root in the official DAiSEE layout:
    <data-root>/Labels/{TrainLabels,ValidationLabels,TestLabels}.csv
    <data-root>/DataSet/{Train,Validation,Test}/<subjectID>/<clipID>/<clipID>.avi

Video files are located by recursively searching for the ClipID rather than
assuming an exact nesting depth, so minor structural differences won't break
this.

Before running, download MediaPipe's face landmarker model:
    curl -L -o face_landmarker.task \
      https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task
"""
import argparse
import glob
import os

import cv2
import mediapipe as mp
import numpy as np
import pandas as pd
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

# 10s clip sampled at 2Hz -> ~20 frames, matching the live app's rolling window
FRAME_SAMPLE_RATE_HZ = 2

SPLITS = {
    "Train": "TrainLabels.csv",
    "Validation": "ValidationLabels.csv",
    "Test": "TestLabels.csv",
}


def find_label_columns(df):
    cols = {c.lower(): c for c in df.columns}
    return {
        "clip_id": cols[next(k for k in cols if "clip" in k)],
        "boredom": cols[next(k for k in cols if "bore" in k)],
        "engagement": cols[next(k for k in cols if "engag" in k)],
    }


def find_clip_file(dataset_root, split, clip_id):
    stem = os.path.splitext(clip_id)[0]
    matches = glob.glob(os.path.join(dataset_root, split, "**", f"{stem}.*"), recursive=True)
    return matches[0] if matches else None


def make_landmarker(model_path):
    # Use the CPU delegate for consistent MediaPipe behavior across macOS hosts.
    options = mp_vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(
            model_asset_path=model_path,
            delegate=mp_python.BaseOptions.Delegate.CPU,
        ),
        output_face_blendshapes=True,
        output_facial_transformation_matrixes=True,
        num_faces=1,
    )
    return mp_vision.FaceLandmarker.create_from_options(options)


def head_pose_features(matrix):
    # The first two rotation-matrix columns provide a numerically stable
    # six-value head-pose representation shared with engagementScorer.ts.
    return [matrix[0, 0], matrix[1, 0], matrix[2, 0], matrix[0, 1], matrix[1, 1], matrix[2, 1]]


def extract_clip_features(landmarker, video_path, sample_rate_hz=FRAME_SAMPLE_RATE_HZ):
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    step = max(int(round(fps / sample_rate_hz)), 1)

    features = []
    frame_idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame_idx % step == 0:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect(mp_image)
            if result.face_blendshapes and result.facial_transformation_matrixes:
                blendshapes = [c.score for c in result.face_blendshapes[0]]
                pose = head_pose_features(result.facial_transformation_matrixes[0])
                features.append(blendshapes + pose)
        frame_idx += 1
    cap.release()
    return np.array(features, dtype=np.float32)  # (num_sampled_frames, 58)


def process_split(data_root, split, landmarker, max_clips=None):
    labels_path = os.path.join(data_root, "Labels", SPLITS[split])
    df = pd.read_csv(labels_path)
    cols = find_label_columns(df)
    dataset_root = os.path.join(data_root, "DataSet")

    X, y, clip_ids = [], [], []
    for i, row in enumerate(df.itertuples(index=False)):
        if max_clips and i >= max_clips:
            break

        clip_id = str(getattr(row, cols["clip_id"]))
        video_path = find_clip_file(dataset_root, split, clip_id)
        if not video_path:
            print(f"[skip] no video found for clip {clip_id}")
            continue

        feats = extract_clip_features(landmarker, video_path)
        if len(feats) == 0:
            print(f"[skip] no face detected in {clip_id}")
            continue

        boredom = getattr(row, cols["boredom"])
        engagement = getattr(row, cols["engagement"])
        # collapse DAiSEE's 0-3 scale into a single binary "disengaged" label
        disengaged = int(engagement <= 1 or boredom >= 2)

        X.append(feats)
        y.append(disengaged)
        clip_ids.append(clip_id)

    return X, np.array(y, dtype=np.float32), clip_ids


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True, help="Path to extracted DAiSEE folder")
    parser.add_argument("--model-path", default="face_landmarker.task")
    parser.add_argument("--out-dir", default="data/features")
    parser.add_argument("--max-clips", type=int, default=None, help="Cap clips per split for a quick first pass")
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    landmarker = make_landmarker(args.model_path)

    for split in SPLITS:
        labels_path = os.path.join(args.data_root, "Labels", SPLITS[split])
        if not os.path.exists(labels_path):
            print(f"Skipping {split}: label file not found at {labels_path}")
            continue

        print(f"Processing {split}...")
        X, y, clip_ids = process_split(args.data_root, split, landmarker, args.max_clips)
        out_path = os.path.join(args.out_dir, f"{split.lower()}.npz")
        # variable frame counts per clip -> save as an object array
        np.savez(out_path, X=np.array(X, dtype=object), y=y, clip_ids=np.array(clip_ids))
        print(f"  saved {len(y)} clips -> {out_path}")


if __name__ == "__main__":
    main()
