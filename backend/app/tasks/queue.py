from redis import Redis
from rq import Queue

from app.core.config import REDIS_URL, RQ_QUEUE_NAME

_redis = Redis.from_url(REDIS_URL)
queue = Queue(RQ_QUEUE_NAME, connection=_redis)
