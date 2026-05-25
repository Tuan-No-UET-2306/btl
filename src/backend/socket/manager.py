import asyncio
import json
import logging
from typing import Dict, Set
from uuid import uuid4

from fastapi import WebSocket

from ..core.config import REDIS_EVENT_CHANNEL, REDIS_URL

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Set[WebSocket] = set()
        self.video_connections: Dict[int, Set[WebSocket]] = {}
        self.instance_id = uuid4().hex
        self._redis_client = None
        self._redis_listener_task: asyncio.Task | None = None

    def _update_ws_gauge(self) -> None:
        """Update the Prometheus gauge with the current number of WebSocket connections."""
        try:
            from ..main import ACTIVE_WS_CONNECTIONS as _gauge
            total = len(self.active_connections) + sum(len(v) for v in self.video_connections.values())
            _gauge.set(total)
        except ImportError:
            pass  # metrics module not available (e.g. during testing)

    async def connect(self, websocket: WebSocket, video_id: int | None = None) -> None:
        await websocket.accept()
        if video_id is None:
            self.active_connections.add(websocket)
        else:
            self.video_connections.setdefault(video_id, set()).add(websocket)
        self._update_ws_gauge()

    def disconnect(self, websocket: WebSocket, video_id: int | None = None) -> None:
        if video_id is None:
            self.active_connections.discard(websocket)
        else:
            connections = self.video_connections.get(video_id)
            if connections:
                connections.discard(websocket)
                if not connections:
                    self.video_connections.pop(video_id, None)
        self._update_ws_gauge()

    def _cleanup(self, websocket: WebSocket) -> None:
        self.active_connections.discard(websocket)
        for video_id in list(self.video_connections.keys()):
            self.video_connections[video_id].discard(websocket)
            if not self.video_connections[video_id]:
                self.video_connections.pop(video_id, None)

    async def _broadcast(self, payload: dict, video_id: int | None = None) -> None:
        targets = set(self.active_connections)
        if video_id is not None:
            targets.update(self.video_connections.get(video_id, set()))

        stale: Set[WebSocket] = set()
        for websocket in targets:
            try:
                await websocket.send_json(payload)
            except Exception:
                stale.add(websocket)

        for websocket in stale:
            self._cleanup(websocket)

    def _publish_event(self, payload: dict, video_id: int | None = None) -> None:
        try:
            import redis

            if self._redis_client is None:
                self._redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

            message = {
                "source": self.instance_id,
                "video_id": video_id,
                "payload": payload,
            }
            self._redis_client.publish(REDIS_EVENT_CHANNEL, json.dumps(message, default=str))
        except Exception as exc:
            logger.debug("Redis event publish skipped: %s", exc)

    async def _redis_listener_loop(self) -> None:
        while True:
            client = None
            pubsub = None
            try:
                import redis.asyncio as redis_async

                client = redis_async.Redis.from_url(REDIS_URL, decode_responses=True)
                pubsub = client.pubsub()
                await pubsub.subscribe(REDIS_EVENT_CHANNEL)
                logger.info("Redis event listener subscribed to %s", REDIS_EVENT_CHANNEL)

                async for message in pubsub.listen():
                    if message.get("type") != "message":
                        continue

                    data = json.loads(message.get("data") or "{}")
                    if data.get("source") == self.instance_id:
                        continue

                    await self._broadcast(
                        data.get("payload") or {},
                        video_id=data.get("video_id"),
                    )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Redis event listener disconnected: %s", exc)
                await asyncio.sleep(5)
            finally:
                if pubsub is not None:
                    await pubsub.aclose()
                if client is not None:
                    await client.aclose()

    def start_redis_listener(self) -> None:
        if self._redis_listener_task and not self._redis_listener_task.done():
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            logger.warning("Redis event listener skipped: no running event loop")
            return
        self._redis_listener_task = loop.create_task(self._redis_listener_loop())

    async def stop_redis_listener(self) -> None:
        if not self._redis_listener_task:
            return
        self._redis_listener_task.cancel()
        try:
            await self._redis_listener_task
        except asyncio.CancelledError:
            pass
        self._redis_listener_task = None

    def broadcast_event(
        self,
        payload: dict,
        video_id: int | None = None,
        publish: bool = True,
    ) -> None:
        if publish:
            self._publish_event(payload, video_id)

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(self._broadcast(payload, video_id))
            return
        loop.create_task(self._broadcast(payload, video_id))


manager = ConnectionManager()
