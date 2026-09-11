"""Shared logic for turning DAiSEE's raw 0-3 affect scores into the
multi-task binary targets model.py trains on. Used by train.py and any
evaluation script so the label definition can't drift between them.
"""
import os

import pandas as pd

from model import TASKS

SPLIT_LABEL_FILES = {
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
        "confusion": cols[next(k for k in cols if "confus" in k)],
        "frustration": cols[next(k for k in cols if "frustrat" in k)],
    }


def load_multitask_labels(data_root, split):
    """Returns {clip_id: {task: 0.0/1.0, ...}} for every clip in this split's
    label CSV, using the same thresholding as preprocess.py's binary target."""
    path = os.path.join(data_root, "Labels", SPLIT_LABEL_FILES[split])
    df = pd.read_csv(path)
    df.columns = df.columns.str.strip()
    cols = find_label_columns(df)

    out = {}
    for row in df.itertuples(index=False):
        clip_id = str(getattr(row, cols["clip_id"]))
        engagement = getattr(row, cols["engagement"])
        boredom = getattr(row, cols["boredom"])
        confusion = getattr(row, cols["confusion"])
        frustration = getattr(row, cols["frustration"])

        # "disengaged" is the binary primary label used for deployment and
        # evaluation. Auxiliary heads retain the normalized 0–3 annotations as
        # continuous targets, preserving ordinal information near class
        # boundaries. Higher values consistently represent concern signals.
        #
        # comprehension_problem uses the maximum normalized confusion or
        # frustration score, matching the OR semantics of the binary target.
        low_engagement_binary = float(engagement <= 1)
        high_boredom_binary = float(boredom >= 2)
        out[clip_id] = {
            "disengaged": float(low_engagement_binary or high_boredom_binary),
            "low_engagement": float(1 - engagement / 3),
            "high_boredom": float(boredom / 3),
            "comprehension_problem": max(confusion / 3, frustration / 3),
        }
    assert set(next(iter(out.values())).keys()) == set(TASKS)
    return out


def load_binary_labels(data_root, split):
    """Return hard 0/1 targets for classification evaluation. Training uses
    the continuous auxiliary targets from load_multitask_labels instead."""
    path = os.path.join(data_root, "Labels", SPLIT_LABEL_FILES[split])
    df = pd.read_csv(path)
    df.columns = df.columns.str.strip()
    cols = find_label_columns(df)

    out = {}
    for row in df.itertuples(index=False):
        clip_id = str(getattr(row, cols["clip_id"]))
        engagement = getattr(row, cols["engagement"])
        boredom = getattr(row, cols["boredom"])
        confusion = getattr(row, cols["confusion"])
        frustration = getattr(row, cols["frustration"])

        low_engagement = float(engagement <= 1)
        high_boredom = float(boredom >= 2)
        out[clip_id] = {
            "disengaged": float(low_engagement or high_boredom),
            "low_engagement": low_engagement,
            "high_boredom": high_boredom,
            "comprehension_problem": float(confusion >= 2 or frustration >= 2),
        }
    return out
