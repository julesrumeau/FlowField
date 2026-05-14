import json
import asyncpg
from pathlib import Path
from src.config import DATABASE_URL

pool: asyncpg.Pool | None = None


async def init_db():
    global pool

    # Par défaut, asyncpg reçoit les colonnes JSONB sous forme de chaîne brute.
    # Ce codec enregistre des fonctions de conversion : json.dumps pour écrire (Python→JSON),
    # json.loads pour lire (JSON→Python). Après ça, on manipule directement des dicts Python.
    async def _set_codecs(conn):
        await conn.set_type_codec(
            "jsonb",
            encoder=json.dumps,
            decoder=json.loads,
            schema="pg_catalog",
            format="text",
        )

    # create_pool crée un pool de connexions réutilisables (évite d'ouvrir/fermer une
    # connexion TCP à chaque requête). init=_set_codecs applique le codec sur chaque connexion.
    pool = await asyncpg.create_pool(DATABASE_URL, init=_set_codecs)

    # Migration au démarrage : crée la table si elle n'existe pas encore.
    # "IF NOT EXISTS" rend l'opération idempotente : on peut redémarrer sans risquer
    # d'effacer les données existantes.
    migration_sql = (Path(__file__).parent / "migrations" / "001_init.sql").read_text()
    async with pool.acquire() as conn:
        await conn.execute(migration_sql)


async def get_pool() -> asyncpg.Pool:
    if pool is None:
        raise RuntimeError("Database pool not initialised")
    return pool
