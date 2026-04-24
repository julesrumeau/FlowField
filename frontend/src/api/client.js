const BASE = '/api';

export async function listPresets() {
  const res = await fetch(`${BASE}/presets/`);
  if (!res.ok) throw new Error(`listPresets: ${res.status}`);
  return res.json();
}

export async function savePreset(nom, params) {
  const res = await fetch(`${BASE}/presets/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom, seed: 0, params }),
  });
  if (!res.ok) throw new Error(`savePreset: ${res.status}`);
  return res.json();
}

export async function deletePreset(id) {
  const res = await fetch(`${BASE}/presets/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deletePreset: ${res.status}`);
}
