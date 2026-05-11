import asyncio
from typing import Dict, Set

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Set[WebSocket] = set()
        self.video_connections: Dict[int, Set[WebSocket]] = {}
        self.loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, websocket: WebSocket, video_id: int | None = None) -> None:
        self.loop = asyncio.get_running_loop()
        await websocket.accept()
        if video_id is None:
            self.active_connections.add(websocket)
            return
        self.video_connections.setdefault(video_id, set()).add(websocket)

    def disconnect(self, websocket: WebSocket, video_id: int | None = None) -> None:
        if video_id is None:
            self.active_connections.discard(websocket)
        else:
            connections = self.video_connections.get(video_id)
            if connections:
                connections.discard(websocket)
                if not connections:
                    self.video_connections.pop(video_id, None)

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

    def broadcast_event(self, payload: dict, video_id: int | None = None) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            if self.loop and self.loop.is_running():
                asyncio.run_coroutine_threadsafe(self._broadcast(payload, video_id), self.loop)
                return
            asyncio.run(self._broadcast(payload, video_id))
            return
        loop.create_task(self._broadcast(payload, video_id))


manager = ConnectionManager()
