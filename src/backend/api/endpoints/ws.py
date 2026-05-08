from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ...socket.manager import manager

router = APIRouter()


@router.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data.lower() == "ping":
                await websocket.send_json({"event": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.websocket("/ws/videos/{video_id}")
async def websocket_video(websocket: WebSocket, video_id: int):
    await manager.connect(websocket, video_id=video_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data.lower() == "ping":
                await websocket.send_json({"event": "pong", "video_id": video_id})
    except WebSocketDisconnect:
        manager.disconnect(websocket, video_id=video_id)
