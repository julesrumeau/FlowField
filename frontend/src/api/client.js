// /api/ is proxied by nginx to backend:8000/ — relative URLs work in all Docker environments
const BASE = '/api';

export async function listPresets() {
  const res = await fetch(`${BASE}/presets/`);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`listPresets: ${res.status} — ${detail}`);
  }
  return res.json();
}

export async function savePreset(nom, params) {
  // seed is required by the backend schema but has no UI slider yet — fixed at 0 until a seed control is added
  const res = await fetch(`${BASE}/presets/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom, seed: 0, params }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`savePreset: ${res.status} — ${detail}`);
  }
  return res.json();
}

export async function deletePreset(id) {
  const res = await fetch(`${BASE}/presets/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`deletePreset: ${res.status} — ${detail}`);
  }
}
