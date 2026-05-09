// /api/ is proxied by nginx to backend:8000/ — relative URLs work in all Docker environments
const BASE = '/api';
const TIMEOUT_MS = 10_000;

function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

export async function listPresets() {
  const res = await fetchWithTimeout(`${BASE}/presets/`);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`listPresets: ${res.status} — ${detail}`);
  }
  return res.json();
}

export async function savePreset(nom, params) {
  // seed est requis par le schéma backend mais n'a pas encore de contrôle UI — fixé à 0 pour l'instant.
  // TODO : ajouter un slider seed pour permettre de sauvegarder des presets vraiment reproductibles
  //        (champ vectoriel identique à chaque rechargement, pas seulement les paramètres visuels).
  const res = await fetchWithTimeout(`${BASE}/presets/`, {
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
  const res = await fetchWithTimeout(`${BASE}/presets/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`deletePreset: ${res.status} — ${detail}`);
  }
}
