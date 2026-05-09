# Questions probables en soutenance — réponses prêtes

---

## GPU / Simulation

**"Pourquoi GPUComputationRenderer ?"**
JavaScript ne peut pas itérer sur 300k positions à 60fps. GPUComputationRenderer exécute le calcul dans des fragment shaders GLSL — chaque "pixel" d'une texture 1024×512 représente une particule. Le CPU ne touche plus aux données après `init()`.

**"Pourquoi `gl_Position = vec4(0, 0, 9999, 1)` dans le vertex shader ?"** (`ParticleMesh.js`)
Les particules au-delà du count actif sont envoyées hors frustum (z=9999) avec `gl_PointSize = 0`. Ça évite de synchroniser CPU↔GPU pour mettre à jour `drawRange` à chaque frame — le count est un simple uniform GPU.

**"Pourquoi `frustumCulled = false` ?"** (`ParticleMesh.js`)
Three.js ne peut pas calculer de bounding box sur un mesh dont les positions viennent d'une texture GPU. Sans ce flag, le mesh "zéro" sort immédiatement du frustum et disparaît.

**"À quoi servent les offsets 100.0 et 200.0 dans le velocity shader ?"** (`velocityShader.js`)
Pour que vx, vy, vz échantillonnent des régions différentes de l'espace de bruit et ne soient pas corrélées. Sans ça, les trois axes donnent la même valeur → les particules s'alignent sur la diagonale.

**"Pourquoi t×0.031, t×0.050, t×0.041 ?"** (`velocityShader.js`)
Trois vitesses d'évolution légèrement différentes pour éviter que les axes se synchronisent dans le temps. Des valeurs "irrationnelles" proches évitent la périodicité visible.

**"Comment fonctionne la table de permutation en texture ?"** (`ParticleSystem.js` + `velocityShader.js`)
Le bruit de Perlin a besoin de `perm[i]` pour i de 0 à 511. On ne peut pas passer un tableau en uniform GLSL, donc on encode les 512 valeurs dans une `DataTexture` 16×32 (RGBA8). Le lookup dans le shader lit le canal R et dénormalise : `floor(r * 255.0 + 0.5)`.

---

## Rendu / Post-processing

**"Pourquoi `r.autoClear = false` ?"** (`PostProcessing.js`)
L'effet de trail repose sur l'accumulation du buffer entre frames. Si le renderer nettoyait automatiquement, on perdrait la frame précédente. Le `r.clear()` explicite n'a lieu qu'à la première frame pour initialiser le buffer sans garbage.

**"Pourquoi `preserveDrawingBuffer: true` ?"** (`Renderer.js`)
Requis pour `captureStream()`. Sans ce flag, le navigateur efface le canvas après composition — le MediaRecorder lirait des frames noires.

---

## Export vidéo

**"Pourquoi `captureStream(0)` et pas `captureStream(60)` ?"** (`VideoExporter.js`)
`captureStream(fps)` automatique est synchronisé avec le compositor du navigateur (souvent limité à 30fps). `captureStream(0)` + `requestFrame()` dans un RAF dédié soumet chaque frame exactement au moment où le GPU a fini de la rendre → on capture à 60fps réels.

**"Pourquoi un service export séparé et pas ffmpeg dans le backend ?"**
ffmpeg nécessite `apt install ffmpeg` — ça triplerait la taille de l'image backend. Séparer les responsabilités permet des images Docker minimales et des déploiements indépendants.

**"Pourquoi `-c copy` pour avc1 ?"** (`export/src/main.py`)
Chrome enregistre du H.264 dans un conteneur WebM (codec avc1). Si on détecte avc1, on remuxe sans ré-encoder (`-c copy`) — c'est quasi-instantané. Pour VP8/VP9 on ré-encode avec libx264.

**"Pourquoi `-movflags +faststart` ?"** (`export/src/main.py`)
Déplace l'atome `moov` en début de fichier MP4 pour permettre la lecture progressive (streaming). Sans ça il faut télécharger tout le fichier avant de pouvoir lire.

**"Pourquoi `BackgroundTask(shutil.rmtree)` ?"** (`export/src/main.py`)
Le nettoyage du dossier temporaire a lieu *après* que la réponse est envoyée, pas avant — le fichier doit encore exister sur disque pendant que FastAPI le sert.

---

## Frontend / UI

**"Pourquoi `dispatchEvent(new InputEvent('input'))` ?"** (`Controls.js`)
Au chargement d'un preset, on met à jour `input.value` puis on déclenche l'événement synthétique pour réutiliser le même handler que le slider humain. Évite de dupliquer la logique `_apply`.

**"Le delete est optimiste ?"** (`PresetPanel.js`)
Oui : la ligne est supprimée visuellement avant la réponse API. Si l'appel échoue, on recharge la liste — l'item réapparaît. Ça rend l'UI réactive sans bloquer sur le réseau.

---

## Backend

**"Pourquoi pas Alembic pour les migrations ?"** (`db/client.py`)
Une seule table qui ne changera pas. `CREATE TABLE IF NOT EXISTS` est idempotent — on peut rejouer la migration à chaque démarrage sans risque. Alembic serait du sur-engineering pour ce cas.

**"Pourquoi un pool global ?"** (`db/client.py`)
Le pool est créé au démarrage (`lifespan`) et partagé pour toute la durée de vie de l'app. Pas besoin de dependency injection — FastAPI garantit un seul processus uvicorn, un seul pool.

**"Pourquoi `dict(row)` ?"** (`routes/presets.py`)
asyncpg retourne des `Record`, pas des dicts. FastAPI sérialise les dicts en JSON automatiquement, avec gestion des UUID et datetime. `dict(row)` est la conversion standard asyncpg → JSON.

**"Que retourne `result == 'DELETE 0'` ?"** (`routes/presets.py`)
asyncpg retourne une chaîne de statut PostgreSQL après `execute()`. `"DELETE 0"` signifie qu'aucune ligne n'a été touchée → l'UUID n'existait pas → 404.

---

## Architecture générale

**"Pourquoi pas de bundler ?"**
Pas besoin de tree-shaking ni de transpilation. L'import map CDN résout Three.js directement, Nginx sert des fichiers statiques. Zéro tooling à maintenir.

**"Pourquoi PostgreSQL hors cluster K8S ?"**
PostgreSQL est un service stateful avec persistance sur volume. Le déployer dans K8S complexifie la gestion des volumes persistants et les backups. Sur VM avec Docker, c'est simple, fiable et adapté à l'échelle du projet.

**"Pourquoi `seed: 0` hardcodé dans les presets ?"**
Les presets sauvegardent une configuration visuelle (sliders), pas un état de simulation reproductible. Le seed de la simulation est fixé à 42 au démarrage — le champ `seed` en base est une limitation connue, documentée dans ARCHITECTURE.md.
