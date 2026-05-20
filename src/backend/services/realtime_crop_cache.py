"""Small in-memory cache for realtime plate crops."""

from __future__ import annotations

import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np

from ..core.config import (
    VIDEO_REALTIME_CROP_CACHE_MAX_ITEMS,
    VIDEO_REALTIME_CROP_CACHE_TTL_SECONDS,
    VIDEO_REALTIME_CROP_JPEG_QUALITY,
)


@dataclass(frozen=True)
class CachedCrop:
    data: bytes
    content_type: str
    created_at: float
    expires_at: float
    metadata: dict[str, Any] = field(default_factory=dict)


class RealtimeCropCache:
    """Thread-safe TTL cache for JPEG crops produced by realtime detection."""

    def __init__(
        self,
        ttl_seconds: int = VIDEO_REALTIME_CROP_CACHE_TTL_SECONDS,
        max_items: int = VIDEO_REALTIME_CROP_CACHE_MAX_ITEMS,
        jpeg_quality: int = VIDEO_REALTIME_CROP_JPEG_QUALITY,
    ) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_items = max_items
        self.jpeg_quality = jpeg_quality
        self._items: OrderedDict[str, CachedCrop] = OrderedDict()
        self._lock = threading.RLock()

    def put_rgb_image(
        self,
        image_rgb: np.ndarray,
        metadata: dict[str, Any] | None = None,
    ) -> str | None:
        if image_rgb.size == 0:
            return None

        image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
        ok, encoded = cv2.imencode(
            ".jpg",
            image_bgr,
            [int(cv2.IMWRITE_JPEG_QUALITY), self.jpeg_quality],
        )
        if not ok:
            return None

        return self.put_bytes(
            encoded.tobytes(),
            content_type="image/jpeg",
            metadata=metadata,
        )

    def put_bytes(
        self,
        data: bytes,
        *,
        content_type: str = "image/jpeg",
        metadata: dict[str, Any] | None = None,
    ) -> str:
        now = time.monotonic()
        cache_key = uuid.uuid4().hex
        item = CachedCrop(
            data=data,
            content_type=content_type,
            created_at=now,
            expires_at=now + self.ttl_seconds,
            metadata=metadata or {},
        )

        with self._lock:
            self._delete_expired_locked(now)
            self._items[cache_key] = item
            while len(self._items) > self.max_items:
                self._items.popitem(last=False)

        return cache_key

    def get(self, cache_key: str) -> CachedCrop | None:
        now = time.monotonic()
        with self._lock:
            self._delete_expired_locked(now)
            item = self._items.get(cache_key)
            if item is None:
                return None
            self._items.move_to_end(cache_key)
            return item

    def stats(self) -> dict[str, int]:
        with self._lock:
            self._delete_expired_locked(time.monotonic())
            return {
                "items": len(self._items),
                "max_items": self.max_items,
                "ttl_seconds": self.ttl_seconds,
            }

    def _delete_expired_locked(self, now: float) -> None:
        expired_keys = [
            cache_key
            for cache_key, item in self._items.items()
            if item.expires_at <= now
        ]
        for cache_key in expired_keys:
            self._items.pop(cache_key, None)


realtime_crop_cache = RealtimeCropCache()
