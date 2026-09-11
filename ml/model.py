import torch
import torch.nn as nn

# MediaPipe Face Landmarker's blendshape output size, plus a 6-number head
# pose representation (first two columns of the facial transformation
# matrix's rotation submatrix — see preprocess.py's head_pose_features).
# Fixed by the feature extraction pipeline, not a tunable hyperparameter.
NUM_BLENDSHAPES = 52
NUM_HEAD_POSE = 6
NUM_RAW_FEATURES = NUM_BLENDSHAPES + NUM_HEAD_POSE
# Raw features + frame-to-frame deltas (see features.add_deltas).
MODEL_INPUT_SIZE = NUM_RAW_FEATURES * 2

# The primary target ("disengaged") plus DAiSEE's other affective states as
# auxiliary heads. Multi-task training on the correlated labels regularizes
# the shared representation; only "disengaged" is used for the primary
# decision (see export_onnx.py's DeploymentWrapper).
#
# The comprehension_problem head combines confusion and frustration into a
# unified learning target. This increases positive-example coverage and lets
# the shared backbone learn a broader representation of student difficulty.
# See ml/labels.py for the exact label definition.
TASKS = ["disengaged", "low_engagement", "high_boredom", "comprehension_problem"]

# "disengaged" is trained with BCE against a hard binary label. The rest are
# trained as continuous 0-1 regression targets (DAiSEE's raw 0-3 score / 3)
# rather than hard-thresholded binary labels, preserving the ordinal signal
# available to the shared backbone.
REGRESSION_TASKS = {t for t in TASKS if t != "disengaged"}


class EngagementModel(nn.Module):
    """Sequence of per-frame (blendshape + delta) vectors -> P(disengaged),
    plus auxiliary DAiSEE affect regressions used only during training.

    Matches the deployment shape: a short rolling window of recent frames
    from a live webcam feed, not a fixed-length clip.
    """

    def __init__(self, input_size=MODEL_INPUT_SIZE, hidden_size=64, dropout=0.3):
        super().__init__()
        self.gru = nn.GRU(input_size, hidden_size, batch_first=True)
        self.attn = nn.Linear(hidden_size, 1)
        self.dropout = nn.Dropout(dropout)
        self.heads = nn.ModuleDict({task: nn.Linear(hidden_size, 1) for task in TASKS})

    def forward(self, x):
        # x: (batch, seq_len, MODEL_INPUT_SIZE)
        output, _ = self.gru(x)  # (batch, seq_len, hidden_size) — every timestep, not just the last
        attn_weights = torch.softmax(self.attn(output), dim=1)  # (batch, seq_len, 1)
        context = (attn_weights * output).sum(dim=1)  # (batch, hidden_size), a learned weighted summary
        h = self.dropout(context)
        return {task: torch.sigmoid(head(h)) for task, head in self.heads.items()}


class DeploymentWrapper(nn.Module):
    """Exposes all task heads as a tuple of named ONNX outputs, in TASKS
    order, so the dashboard can show the full affect breakdown rather than
    just the derived "disengaged" flag."""

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, x):
        out = self.model(x)
        return tuple(out[task] for task in TASKS)
