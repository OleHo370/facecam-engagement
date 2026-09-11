"""
Train the engagement/boredom classifier on cached MediaPipe blendshape
features produced by preprocess.py.

Train + Validation are pooled and re-split by SUBJECT (not by clip) into an
internal train/val set: DAiSEE's official Validation split has a very
different class balance than Test (an artifact of splitting by subject), so
selecting checkpoints against it was picking models that fit Validation's
particular ratio rather than ones that generalize. A subject-aware re-split
avoids both that mismatch and subject leakage (the same person's clips
appearing in both train and validation).

Trains multi-task: the primary "disengaged" target (binary) plus DAiSEE's
three other affect states as continuous auxiliary regressions, which
regularizes the shared GRU backbone. Only "disengaged" is used at inference
time. Class imbalance on the primary task is handled via a weighted sampler
rather than loss reweighting, so the model actually sees minority examples
more often instead of just having their loss scaled up.
"""
import argparse
import os

import numpy as np
import torch
import wandb
from sklearn.metrics import roc_auc_score
from torch.nn.utils.rnn import pad_sequence
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler

from features import add_deltas
from labels import load_multitask_labels
from model import EngagementModel, TASKS

PRIMARY_TASK = "disengaged"


def load_pooled_clips(features_dir, data_root):
    """Merge Train+Validation cached features with fresh multi-task labels,
    keyed by clip_id, applying delta features."""
    X, subject_ids, Y = [], [], []
    for split, npz_name in [("Train", "train.npz"), ("Validation", "validation.npz")]:
        data = np.load(os.path.join(features_dir, npz_name), allow_pickle=True)
        clip_labels = load_multitask_labels(data_root, split)
        for feats, clip_id in zip(data["X"], data["clip_ids"]):
            if clip_id not in clip_labels:
                continue
            X.append(add_deltas(feats.astype(np.float32)))
            subject_ids.append(clip_id[:6])
            Y.append([clip_labels[clip_id][task] for task in TASKS])
    return X, np.array(subject_ids), np.array(Y, dtype=np.float32)


def subject_split(subject_ids, val_fraction=0.15, seed=42):
    unique_subjects = sorted(set(subject_ids))
    rng = np.random.default_rng(seed)
    rng.shuffle(unique_subjects)
    n_val = max(1, int(len(unique_subjects) * val_fraction))
    val_subjects = set(unique_subjects[:n_val])
    is_val = np.array([s in val_subjects for s in subject_ids])
    return ~is_val, is_val


class ClipDataset(Dataset):
    def __init__(self, X, Y):
        self.X = X
        self.Y = Y

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return torch.from_numpy(self.X[idx]), torch.from_numpy(self.Y[idx])


def collate(batch):
    seqs, labels = zip(*batch)
    padded = pad_sequence(seqs, batch_first=True)
    return padded, torch.stack(labels)  # labels: (batch, len(TASKS))


def balanced_accuracy(preds, labels):
    accs = []
    for c in (0.0, 1.0):
        mask = labels == c
        if mask.sum() == 0:
            continue
        accs.append((preds[mask] == labels[mask]).float().mean().item())
    return sum(accs) / len(accs)


# All four DAiSEE-derived binary cutoffs land at the same normalized point:
# raw_score>=2 out of 0-3 corresponds to continuous_target>=2/3 (see
# labels.py — low_engagement is inverted but the correspondence still holds).
AUX_POSITIVE_THRESHOLD = 2 / 3


def run_epoch(model, loader, optimizer=None, aux_weight=0.3, aux_pos_weights=None):
    train = optimizer is not None
    model.train(train)
    bce = torch.nn.BCELoss()
    total_loss, total = 0.0, 0
    primary_idx = TASKS.index(PRIMARY_TASK)
    all_probs, all_labels = [], []

    for x, y in loader:
        out = model(x)
        primary_loss = bce(out[PRIMARY_TASK], y[:, primary_idx:primary_idx + 1])

        aux_losses = []
        for i, task in enumerate(TASKS):
            if task == PRIMARY_TASK:
                continue
            target = y[:, i:i + 1]
            sq_err = (out[task] - target) ** 2
            if aux_pos_weights is not None:
                # Upweight positive examples so every auxiliary task
                # contributes meaningfully under class imbalance.
                is_positive = target >= AUX_POSITIVE_THRESHOLD
                weights = torch.where(is_positive, aux_pos_weights[task], torch.tensor(1.0))
                sq_err = sq_err * weights
            aux_losses.append(sq_err.mean())
        loss = primary_loss + aux_weight * torch.stack(aux_losses).mean()

        if train:
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

        total_loss += loss.item() * len(y)
        total += len(y)
        all_probs.append(out[PRIMARY_TASK].detach().squeeze(1))
        all_labels.append(y[:, primary_idx])

    probs, labels = torch.cat(all_probs), torch.cat(all_labels)
    preds = (probs > 0.5).float()
    acc = (preds == labels).float().mean().item()
    bal_acc = balanced_accuracy(preds, labels)
    auc = roc_auc_score(labels.numpy(), probs.numpy()) if len(set(labels.tolist())) > 1 else float("nan")
    return total_loss / total, acc, bal_acc, auc


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--features-dir", default="data/features")
    parser.add_argument("--data-root", default="data/raw/DAiSEE", help="For reading raw label CSVs")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--dropout", type=float, default=0.3)
    parser.add_argument("--aux-weight", type=float, default=0.3)
    parser.add_argument("--val-fraction", type=float, default=0.15, help="Fraction of subjects held out for internal validation")
    parser.add_argument("--out", default="checkpoints/model.pt")
    parser.add_argument("--wandb-project", default="facecam-engagement")
    parser.add_argument("--no-wandb", action="store_true", help="Skip experiment tracking (no W&B account needed)")
    args = parser.parse_args()

    if not args.no_wandb:
        wandb.init(project=args.wandb_project, config=vars(args))

    X, subject_ids, Y = load_pooled_clips(args.features_dir, args.data_root)
    train_mask, val_mask = subject_split(subject_ids, args.val_fraction)
    print(f"pooled {len(X)} clips ({subject_ids[train_mask].size} in train, "
          f"{subject_ids[val_mask].size} in val, split by {len(set(subject_ids))} subjects)")

    train_X = [X[i] for i in np.where(train_mask)[0]]
    val_X = [X[i] for i in np.where(val_mask)[0]]
    train_ds = ClipDataset(train_X, Y[train_mask])
    val_ds = ClipDataset(val_X, Y[val_mask])

    # Balance primary-task sampling so each class contributes consistently.
    primary_idx = TASKS.index(PRIMARY_TASK)
    primary_labels = Y[train_mask][:, primary_idx].astype(int)
    class_counts = np.bincount(primary_labels, minlength=2)
    class_weights = 1.0 / np.maximum(class_counts, 1)
    sample_weights = class_weights[primary_labels]
    sampler = WeightedRandomSampler(sample_weights, num_samples=len(sample_weights), replacement=True)

    # Per-task weights preserve the contribution of less frequent auxiliary
    # targets during multi-task optimization.
    aux_pos_weights = {}
    for i, task in enumerate(TASKS):
        if task == PRIMARY_TASK:
            continue
        pos_rate = (Y[train_mask][:, i] >= AUX_POSITIVE_THRESHOLD).mean()
        aux_pos_weights[task] = torch.tensor((1 - pos_rate) / max(pos_rate, 1e-6))
        print(f"  {task}: pos_rate={pos_rate:.3f}, pos_weight={aux_pos_weights[task]:.2f}")

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, sampler=sampler, collate_fn=collate)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, collate_fn=collate)

    model = EngagementModel(dropout=args.dropout)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    best_val_bal_acc = 0.0
    for epoch in range(args.epochs):
        train_loss, train_acc, train_bal_acc, train_auc = run_epoch(
            model, train_loader, optimizer, args.aux_weight, aux_pos_weights)
        val_loss, val_acc, val_bal_acc, val_auc = run_epoch(
            model, val_loader, aux_weight=args.aux_weight, aux_pos_weights=aux_pos_weights)
        print(f"epoch {epoch+1}: train_loss={train_loss:.3f} train_bal_acc={train_bal_acc:.3f} train_auc={train_auc:.3f} "
              f"val_loss={val_loss:.3f} val_acc={val_acc:.3f} val_bal_acc={val_bal_acc:.3f} val_auc={val_auc:.3f}")
        if not args.no_wandb:
            wandb.log({
                "epoch": epoch + 1,
                "train_loss": train_loss, "train_acc": train_acc,
                "train_bal_acc": train_bal_acc, "train_auc": train_auc,
                "val_loss": val_loss, "val_acc": val_acc,
                "val_bal_acc": val_bal_acc, "val_auc": val_auc,
            })
        if val_bal_acc > best_val_bal_acc:
            best_val_bal_acc = val_bal_acc
            torch.save(model.state_dict(), args.out)

    print(f"best val balanced acc {best_val_bal_acc:.3f}, saved to {args.out}")
    if not args.no_wandb:
        wandb.summary["best_val_bal_acc"] = best_val_bal_acc
        wandb.finish()


if __name__ == "__main__":
    main()
