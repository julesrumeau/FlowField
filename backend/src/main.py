from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.db.client import init_db, get_pool
from src.routes.presets import router as presets_router


# lifespan remplace les anciens @app.on_event("startup"/"shutdown") (dépréciés).
# Le code avant le yield s'exécute au démarrage, le code après à l'arrêt.
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()   # crée le pool de connexions et applique la migration SQL
    yield
    pool = await get_pool()
    await pool.close()   # ferme proprement toutes les connexions à l'arrêt du serveur


app = FastAPI(title="FlowField API", lifespan=lifespan)

# CORS ouvert (*) : ce projet n'a pas d'authentification ni de données sensibles.
# En production avec auth, il faudrait restreindre allow_origins aux domaines autorisés.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(presets_router)


@app.get("/health")
async def health():
    # Vérifie non seulement que l'API tourne, mais aussi que la base de données répond.
    # Utilisé par le healthcheck Docker pour retarder le démarrage du frontend.
    db_status = "ko"
    try:
        p = await get_pool()
        async with p.acquire() as conn:
            await conn.fetchval("SELECT 1")
        db_status = "ok"
    except Exception:
        pass
    return {"status": "ok", "db": db_status}
