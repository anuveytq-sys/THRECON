from __future__ import annotations

from pathlib import Path

import torch
from torch import nn


class CompletionNet(nn.Module):
    """Small convolutional baseline: RGB + occluded depth + occlusion mask -> completed depth."""

    def __init__(self):
        super().__init__()
        layers: list[nn.Module] = []
        channels = [5, 32, 64, 96, 64, 32, 16, 1]
        for index in range(len(channels) - 1):
            layers.append(nn.Conv2d(channels[index], channels[index + 1], 3, padding=1))
            if index < len(channels) - 2:
                groups = 8 if channels[index + 1] % 8 == 0 else 4
                layers.extend([nn.GroupNorm(groups, channels[index + 1]), nn.GELU()])
        self.net = nn.Sequential(*layers)

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        return torch.sigmoid(self.net(value))


def load_completion_checkpoint(path: Path, device: str):
    if not path.is_file():
        raise FileNotFoundError(
            f"Stage 4 checkpoint not found at {path}. Generate Blender training scenes "
            "and run training/world_completion/train.py first."
        )
    payload = torch.load(path, map_location=device, weights_only=True)
    if payload.get("architecture") != "virtual-itg-depth-completion-v1":
        raise RuntimeError("Unsupported Stage 4 checkpoint architecture.")
    model = CompletionNet().to(device)
    model.load_state_dict(payload["state_dict"])
    model.eval()
    return model, payload
