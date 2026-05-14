import asyncio
import json
import logging
from typing import Awaitable, Callable

import redis.asyncio as async_redis
from redis import Redis
from redis.exceptions import RedisError

from ..core.config import REDIS_URL, WEBSOCKET_REDIS_CHANNEL

logger = logging.getLogger(__name__)

EventHandler = Callable[[dict, int | None], Awaitable[None]]


class RedisEventBus:
    """Redis pub/sub transport for events emitted outside the API process."""

    def __init__(self, redis_url: str, channel: str) -> None:
        self.redis_url = redis_url
        self.channel = channel
        self._publisher: Redis | None = None

    def publish(self, payload: dict, video_id: int | None = None) -> None:
        """Publish an event for the API process to forward over WebSocket."""
        message = json.dumps(
            {"payload": payload, "video_id": video_id},
            separators=(",", ":"),
        )
        try:
            self._get_publisher().publish(self.channel, message)
        except RedisError as exc:
            logger.warning("Could not publish websocket event to Redis: %s", exc)

    async def listen(self, handler: EventHandler) -> None:
        """Listen forever and pass messages to the local WebSocket manager."""
        while True:
            client = async_redis.from_url(self.redis_url, decode_responses=True)
            pubsub = client.pubsub()
            try:
                await pubsub.subscribe(self.channel)
                logger.info("Listening for websocket events on Redis channel %s", self.channel)
                async for message in pubsub.listen():
                    if message.get("type") != "message":
                        continue
                    event = json.loads(message.get("data") or "{}")
                    await handler(event.get("payload") or {}, event.get("video_id"))
            except asyncio.CancelledError:
                raise
            except (RedisError, json.JSONDecodeError) as exc:
                logger.warning("Redis websocket event listener error: %s", exc)
                await asyncio.sleep(3)
            finally:
                await pubsub.aclose()
                await client.aclose()

    def _get_publisher(self) -> Redis:
        if self._publisher is None:
            self._publisher = Redis.from_url(self.redis_url, decode_responses=True)
        return self._publisher


redis_event_bus = RedisEventBus(REDIS_URL, WEBSOCKET_REDIS_CHANNEL)
