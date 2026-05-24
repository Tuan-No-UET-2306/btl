"""Small SORT tracker used by the video worker.

This keeps the backend independent from the demo-only imports in the local
``sort`` submodule while preserving the same SORT data contract:
``update([[x1, y1, x2, y2, score], ...]) -> [[x1, y1, x2, y2, track_id], ...]``.
"""

from __future__ import annotations

import numpy as np
from filterpy.kalman import KalmanFilter
from scipy.optimize import linear_sum_assignment


def _linear_assignment(cost_matrix: np.ndarray) -> np.ndarray:
    rows, cols = linear_sum_assignment(cost_matrix)
    return np.asarray(list(zip(rows, cols)), dtype=int)


def _iou_batch(detections: np.ndarray, trackers: np.ndarray) -> np.ndarray:
    trackers = np.expand_dims(trackers, 0)
    detections = np.expand_dims(detections, 1)

    x1 = np.maximum(detections[..., 0], trackers[..., 0])
    y1 = np.maximum(detections[..., 1], trackers[..., 1])
    x2 = np.minimum(detections[..., 2], trackers[..., 2])
    y2 = np.minimum(detections[..., 3], trackers[..., 3])
    width = np.maximum(0.0, x2 - x1)
    height = np.maximum(0.0, y2 - y1)
    intersection = width * height

    detection_area = (detections[..., 2] - detections[..., 0]) * (
        detections[..., 3] - detections[..., 1]
    )
    tracker_area = (trackers[..., 2] - trackers[..., 0]) * (
        trackers[..., 3] - trackers[..., 1]
    )
    return intersection / np.maximum(1e-9, detection_area + tracker_area - intersection)


def _bbox_to_z(bbox: np.ndarray) -> np.ndarray:
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    x_center = bbox[0] + width / 2.0
    y_center = bbox[1] + height / 2.0
    scale = width * height
    ratio = width / max(float(height), 1e-9)
    return np.asarray([x_center, y_center, scale, ratio]).reshape((4, 1))


def _x_to_bbox(x: np.ndarray) -> np.ndarray:
    x_center = float(x[0, 0])
    y_center = float(x[1, 0])
    scale = float(x[2, 0])
    ratio = float(x[3, 0])
    width = np.sqrt(max(scale * ratio, 0.0))
    height = scale / max(width, 1e-9)
    return np.asarray(
        [
            x_center - width / 2.0,
            y_center - height / 2.0,
            x_center + width / 2.0,
            y_center + height / 2.0,
        ]
    ).reshape((1, 4))


class _KalmanBoxTracker:
    count = 0

    def __init__(self, bbox: np.ndarray) -> None:
        self.kf = KalmanFilter(dim_x=7, dim_z=4)
        self.kf.F = np.asarray(
            [
                [1, 0, 0, 0, 1, 0, 0],
                [0, 1, 0, 0, 0, 1, 0],
                [0, 0, 1, 0, 0, 0, 1],
                [0, 0, 0, 1, 0, 0, 0],
                [0, 0, 0, 0, 1, 0, 0],
                [0, 0, 0, 0, 0, 1, 0],
                [0, 0, 0, 0, 0, 0, 1],
            ],
            dtype=float,
        )
        self.kf.H = np.asarray(
            [
                [1, 0, 0, 0, 0, 0, 0],
                [0, 1, 0, 0, 0, 0, 0],
                [0, 0, 1, 0, 0, 0, 0],
                [0, 0, 0, 1, 0, 0, 0],
            ],
            dtype=float,
        )
        self.kf.R[2:, 2:] *= 10.0
        self.kf.P[4:, 4:] *= 1000.0
        self.kf.P *= 10.0
        self.kf.Q[-1, -1] *= 0.01
        self.kf.Q[4:, 4:] *= 0.01
        self.kf.x[:4] = _bbox_to_z(bbox)

        self.time_since_update = 0
        self.id = _KalmanBoxTracker.count
        _KalmanBoxTracker.count += 1
        self.hits = 0
        self.hit_streak = 0
        self.age = 0

    def update(self, bbox: np.ndarray) -> None:
        self.time_since_update = 0
        self.hits += 1
        self.hit_streak += 1
        self.kf.update(_bbox_to_z(bbox))

    def predict(self) -> np.ndarray:
        if (self.kf.x[6] + self.kf.x[2]) <= 0:
            self.kf.x[6] *= 0.0
        self.kf.predict()
        self.age += 1
        if self.time_since_update > 0:
            self.hit_streak = 0
        self.time_since_update += 1
        return _x_to_bbox(self.kf.x)

    def get_state(self) -> np.ndarray:
        return _x_to_bbox(self.kf.x)


def _associate(
    detections: np.ndarray,
    trackers: np.ndarray,
    iou_threshold: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if len(trackers) == 0:
        return (
            np.empty((0, 2), dtype=int),
            np.arange(len(detections)),
            np.empty((0,), dtype=int),
        )

    iou_matrix = _iou_batch(detections, trackers)
    if min(iou_matrix.shape) > 0:
        pairs = (iou_matrix > iou_threshold).astype(np.int32)
        if pairs.sum(1).max() == 1 and pairs.sum(0).max() == 1:
            matched = np.stack(np.where(pairs), axis=1)
        else:
            matched = _linear_assignment(-iou_matrix)
    else:
        matched = np.empty((0, 2), dtype=int)

    unmatched_detections = [d for d in range(len(detections)) if d not in matched[:, 0]]
    unmatched_trackers = [t for t in range(len(trackers)) if t not in matched[:, 1]]
    matches = []
    for pair in matched:
        if iou_matrix[pair[0], pair[1]] < iou_threshold:
            unmatched_detections.append(pair[0])
            unmatched_trackers.append(pair[1])
        else:
            matches.append(pair.reshape(1, 2))

    if matches:
        matches_array = np.concatenate(matches, axis=0)
    else:
        matches_array = np.empty((0, 2), dtype=int)

    return (
        matches_array,
        np.asarray(unmatched_detections, dtype=int),
        np.asarray(unmatched_trackers, dtype=int),
    )


class Sort:
    def __init__(self, max_age: int = 1, min_hits: int = 3, iou_threshold: float = 0.3) -> None:
        self.max_age = max_age
        self.min_hits = min_hits
        self.iou_threshold = iou_threshold
        self.trackers: list[_KalmanBoxTracker] = []
        self.frame_count = 0

    def update(self, detections: np.ndarray = np.empty((0, 5))) -> np.ndarray:
        self.frame_count += 1
        predicted = np.zeros((len(self.trackers), 5))
        to_delete = []
        for index in range(len(predicted)):
            position = self.trackers[index].predict()[0]
            predicted[index, :] = [position[0], position[1], position[2], position[3], 0]
            if np.any(np.isnan(position)):
                to_delete.append(index)

        predicted = np.ma.compress_rows(np.ma.masked_invalid(predicted))
        for index in reversed(to_delete):
            self.trackers.pop(index)

        matched, unmatched_detections, _ = _associate(
            detections,
            predicted,
            self.iou_threshold,
        )

        for detection_index, tracker_index in matched:
            self.trackers[tracker_index].update(detections[detection_index, :])

        for detection_index in unmatched_detections:
            self.trackers.append(_KalmanBoxTracker(detections[detection_index, :]))

        output = []
        for index, tracker in reversed(list(enumerate(self.trackers))):
            state = tracker.get_state()[0]
            if (
                tracker.time_since_update < 1
                and (tracker.hit_streak >= self.min_hits or self.frame_count <= self.min_hits)
            ):
                output.append(np.concatenate((state, [tracker.id + 1])).reshape(1, -1))
            if tracker.time_since_update > self.max_age:
                self.trackers.pop(index)

        if output:
            return np.concatenate(output)
        return np.empty((0, 5))
