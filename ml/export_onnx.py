"""
Export the model architecture or a trained checkpoint to ONNX for browser
inference with ONNX Runtime Web.

Interface contract with client/src/lib/engagementScorer.ts: a
(1, seq_len, MODEL_INPUT_SIZE) feature sequence in and four named 0–1 outputs
out. seq_len is dynamic to support the app's rolling feature window.
"""
import argparse
import os

import torch

from model import TASKS, DeploymentWrapper, EngagementModel, MODEL_INPUT_SIZE


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", default=None, help="Trained .pt weights; omit for architecture/interface validation")
    parser.add_argument("--seq-len", type=int, default=20, help="Example sequence length for tracing")
    parser.add_argument("--out", default="../public/models/engagement.onnx")
    args = parser.parse_args()

    model = EngagementModel()
    if args.checkpoint:
        model.load_state_dict(torch.load(args.checkpoint, map_location="cpu"))
    model.eval()
    export_model = DeploymentWrapper(model)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    dummy = torch.randn(1, args.seq_len, MODEL_INPUT_SIZE)
    torch.onnx.export(
        export_model,
        dummy,
        args.out,
        input_names=["blendshapes"],
        output_names=TASKS,
        dynamic_axes={"blendshapes": {1: "seq_len"}},
        opset_version=13,
    )
    print(f"exported {'trained' if args.checkpoint else 'initialized validation'} model -> {args.out}")
    print(f"outputs: {TASKS}")


if __name__ == "__main__":
    main()
