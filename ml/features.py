import numpy as np


def add_deltas(seq):
    """seq: (T, NUM_BLENDSHAPES) -> (T, NUM_BLENDSHAPES*2), appending
    frame-to-frame deltas so the model can see rate-of-change (e.g. blink
    speed, how fast an expression is shifting), not just static per-frame
    values. Frame 0 has no prior frame, so its delta is zero.

    client/src/lib/engagementScorer.ts builds the same representation before
    invoking the exported model, preserving training/inference parity.
    """
    deltas = np.zeros_like(seq)
    deltas[1:] = seq[1:] - seq[:-1]
    return np.concatenate([seq, deltas], axis=-1)
