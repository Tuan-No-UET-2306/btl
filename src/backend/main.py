import asyncio
import contextlib
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.router import api_router
from .core.config import CORS_ORIGINS
from .core.exception_handlers import register_exception_handlers
from .models.database import Base, engine, ensure_schema
from .services.minio_service import minio_service
from .socket.manager import manager
from .socket.redis_bus import redis_event_bus

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="LPR System API")

# Register global exception handlers
register_exception_handlers(app)


@app.on_event("startup")
async def on_startup() -> None:
    logger.info("Running startup initialization...")
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    minio_service.ensure_bucket()
    app.state.redis_event_listener = asyncio.create_task(
        redis_event_bus.listen(manager.broadcast_local)
    )
    logger.info("Startup complete.")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    listener = getattr(app.state, "redis_event_listener", None)
    if listener is None:
        return
    listener.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await listener


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "ok", "version": "1.0"}


app.include_router(api_router, prefix="/api/v1")
