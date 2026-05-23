from fastapi import APIRouter

from .endpoints import auth, blacklist, detections, lpr, traffic, users, videos, ws

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(detections.router, prefix="/detections", tags=["detections"])
api_router.include_router(videos.router, prefix="/videos", tags=["videos"])
api_router.include_router(lpr.router, prefix="/lpr", tags=["lpr"])
api_router.include_router(blacklist.router, prefix="/blacklist", tags=["blacklist"])
api_router.include_router(traffic.router, prefix="/traffic", tags=["traffic"])
api_router.include_router(ws.router, tags=["websocket"])
