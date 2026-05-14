from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from src.db.client import get_pool

router = APIRouter(prefix="/presets", tags=["presets"])


# Pydantic valide automatiquement chaque champ à la réception de la requête.
# ge/le = greater-or-equal / less-or-equal : si une valeur sort des bornes,
# FastAPI répond 422 Unprocessable Entity sans qu'on écrive une ligne de validation.
class PresetParams(BaseModel):
    speed:         float = Field(ge=0.1,  le=50.0)
    turbulence:    float = Field(ge=0.01, le=1.0)
    noiseScale:    float = Field(ge=0.1,  le=5.0)
    particleCount: int   = Field(ge=1000, le=524288)
    size:          float = Field(ge=0.2,  le=8.0)
    trailLength:   float = Field(ge=0.0,  le=0.99)
    bloomStrength: float = Field(ge=0.0,  le=3.0)


class PresetIn(BaseModel):
    nom:    str         = Field(min_length=1, max_length=100)
    seed:   int
    params: PresetParams   # objet imbriqué → stocké en JSONB dans PostgreSQL


@router.post("/", status_code=201)
async def create_preset(preset: PresetIn):
    pool = await get_pool()
    # $1, $2, $3 = paramètres positionnels (protection contre les injections SQL)
    # RETURNING * = retourne la ligne insérée avec son id et created_at générés par la DB
    row = await pool.fetchrow(
        "INSERT INTO presets (nom, seed, params) VALUES ($1, $2, $3) RETURNING *",
        preset.nom,
        preset.seed,
        preset.params.model_dump(),   # convertit le modèle Pydantic en dict → JSONB
    )
    return dict(row)


@router.get("/")
async def list_presets():
    pool = await get_pool()
    # ORDER BY created_at DESC : les presets les plus récents apparaissent en premier
    rows = await pool.fetch("SELECT * FROM presets ORDER BY created_at DESC")
    return [dict(r) for r in rows]


@router.delete("/{preset_id}", status_code=204)
async def delete_preset(preset_id: UUID):
    pool = await get_pool()
    result = await pool.execute("DELETE FROM presets WHERE id = $1", preset_id)
    # asyncpg retourne "DELETE N" où N est le nombre de lignes supprimées.
    # Si N=0, la ligne n'existait pas → on retourne 404 plutôt qu'un succès silencieux.
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Preset not found")
