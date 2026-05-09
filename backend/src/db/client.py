import json
import asyncpg
from pathlib import Path
from src.config import DATABASE_URL

pool: asyncpg.Pool | None = None


async def init_db():
    global pool

    async def _set_codecs(conn):
        await conn.set_type_codec(
            "jsonb",
            encoder=json.dumps,
            decoder=json.loads,
            schema="pg_catalog",
            format="text",
        )

    pool = await asyncpg.create_pool(DATABASE_URL, init=_set_codecs)

    migration_sql = (Path(__file__).parent / "migrations" / "001_init.sql").read_text()
    async with pool.acquire() as conn:
        await conn.execute(migration_sql)


async def get_pool() -> asyncpg.Pool:
    if pool is None:
        raise RuntimeError("Database pool not initialised")
    return pool
