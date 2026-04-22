from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from src.db.client import get_pool

router = APIRouter(prefix="/presets", tags=["presets"])


class PresetIn(BaseModel):
    nom: str
    seed: int
    params: dict


@router.post("/", status_code=201)
async def create_preset(preset: PresetIn):
    pool = await get_pool()
    row = await pool.fetchrow(
        "INSERT INTO presets (nom, seed, params) VALUES ($1, $2, $3) RETURNING *",
        preset.nom,
        preset.seed,
        preset.params,
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
