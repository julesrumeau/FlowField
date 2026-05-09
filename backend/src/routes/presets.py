from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from src.db.client import get_pool

router = APIRouter(prefix="/presets", tags=["presets"])


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
    params: PresetParams


@router.post("/", status_code=201)
async def create_preset(preset: PresetIn):
    pool = await get_pool()
    row = await pool.fetchrow(
        "INSERT INTO presets (nom, seed, params) VALUES ($1, $2, $3) RETURNING *",
        preset.nom,
        preset.seed,
        preset.params.model_dump(),
    )
    return dict(row)


@router.get("/")
async def list_presets():
    pool = await get_pool()
    rows = await pool.fetch("SELECT * FROM presets ORDER BY created_at DESC")
    return [dict(r) for r in rows]


@router.delete("/{preset_id}", status_code=204)
async def delete_preset(preset_id: UUID):
    pool = await get_pool()
    result = await pool.execute("DELETE FROM presets WHERE id = $1", preset_id)
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Preset not found")
