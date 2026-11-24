"""Deterministic, evidence-aware spatial relationship analysis for VIRTUAL ITG Stage 5."""
from __future__ import annotations

from itertools import combinations
from typing import Literal

from pydantic import BaseModel, Field


class SpatialObjectInput(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=120)
    # Normalized image-space rectangle: x, y, width, height.
    bbox: tuple[float, float, float, float]
    depth_response: float = Field(default=0.5, ge=0.0, le=1.0)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class SpatialAnalysisRequest(BaseModel):
    objects: list[SpatialObjectInput] = Field(min_length=1, max_length=64)


class SpatialRelationship(BaseModel):
    source_id: str
    target_id: str
    relation: Literal[
        "left_of", "right_of", "above", "below", "overlaps",
        "higher_depth_response", "lower_depth_response"
    ]
    strength: float


def analyze_relationships(objects: list[SpatialObjectInput]) -> list[SpatialRelationship]:
    """Infer image-plane relations and depth-response ordering; never claim metric geometry."""
    edges: list[SpatialRelationship] = []
    for a, b in combinations(objects, 2):
        ax, ay, aw, ah = a.bbox
        bx, by, bw, bh = b.bbox
        acx, acy = ax + aw / 2, ay + ah / 2
        bcx, bcy = bx + bw / 2, by + bh / 2
        overlap_x = max(0.0, min(ax + aw, bx + bw) - max(ax, bx))
        overlap_y = max(0.0, min(ay + ah, by + bh) - max(ay, by))
        overlap = overlap_x * overlap_y / max(1e-6, min(aw * ah, bw * bh))
        if overlap > 0.18:
            edges.append(SpatialRelationship(source_id=a.id, target_id=b.id,
                                              relation="overlaps", strength=min(1.0, overlap)))
        else:
            dx, dy = bcx - acx, bcy - acy
            if abs(dx) > 0.07:
                edges.append(SpatialRelationship(source_id=a.id, target_id=b.id,
                    relation="right_of" if dx < 0 else "left_of", strength=min(1.0, abs(dx))))
            if abs(dy) > 0.07:
                edges.append(SpatialRelationship(source_id=a.id, target_id=b.id,
                    relation="below" if dy < 0 else "above", strength=min(1.0, abs(dy))))
        dd = a.depth_response - b.depth_response
        if abs(dd) > 0.08:
            edges.append(SpatialRelationship(source_id=a.id, target_id=b.id,
                relation="higher_depth_response" if dd > 0 else "lower_depth_response",
                strength=min(1.0, abs(dd))))
    return edges
