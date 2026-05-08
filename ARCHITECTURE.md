# Justification architecturale — FlowField

## Langage et technologie

**Backend : Python + FastAPI.** Le backend est un CRUD pur sur une table PostgreSQL. FastAPI génère automatiquement la documentation Swagger (`/docs`), la validation des données est automatique via Pydantic, et `asyncpg` fournit un accès async natif à la base sans ORM superflu. Python est l'un des six langages du module ; ce cas d'usage (API REST légère) est exactement là où il excelle.

**Frontend : JavaScript natif + Three.js.** La simulation et le rendu vivent dans le navigateur via WebGL. Pas de framework, pas de bundler — une import map charge Three.js depuis CDN, Nginx sert des fichiers statiques. Ce choix élimine toute chaîne de build à maintenir.

## Architecture retenue

**4 services Docker :**

- `frontend` — Nginx sert les assets et proxifie `/api/` et `/export-api/`
- `backend` — FastAPI + asyncpg, CRUD presets
- `export` — FastAPI + ffmpeg, conversion WebM → MP4
- `db` — PostgreSQL 16, stockage presets

**Pattern fat client :** toute la simulation tourne côté navigateur (GPU). Le backend ne connaît pas la simulation — il stocke uniquement des configurations. Ce choix s'applique parce que la simulation est un rendu génératif local sans état partagé entre utilisateurs : la dupliquer côté serveur créerait deux sources de vérité sans valeur ajoutée.

**Simulation GPU (GPUComputationRenderer + GLSL) :** la vélocité et la position de chaque particule sont calculées dans des fragment shaders. Le bruit de Perlin 3D est entièrement implémenté en GLSL, avec la table de permutation passée via une `DataTexture`. Le CPU ne touche plus aux données de simulation après l'initialisation. C'est la seule approche viable pour 300 000 particules à 60 fps — JavaScript ne peut pas itérer sur autant de données à cette fréquence.

**Trails par accumulation buffer :** chaque frame, un quad noir semi-transparent (`opacity = 1 - trailLength`) est rendu par-dessus le buffer GPU précédent, puis les nouvelles positions sont stampées dessus. La persistance des trails est O(1) en mémoire, quelle que soit la durée de la simulation.

**Export vidéo :** le client enregistre via `MediaRecorder` avec `captureStream(0)` (mode manuel, frames soumises explicitement via `requestFrame()` pour maintenir le framerate), puis envoie le blob WebM au service export. Ce dernier détecte le codec et soit remuxe sans ré-encodage (`-c copy` si avc1), soit ré-encode en H.264 (`libx264`). ffmpeg est isolé dans son propre conteneur pour ne pas alourdir l'image du backend métier.

## Alternatives considérées et rejetées

**Bundler (Vite / Webpack) :** rejeté. Le projet n'a pas besoin de tree-shaking ni de transpilation. Une import map CDN suffit et supprime toute dépendance à un outil de build.

**Simulation CPU (JavaScript) :** rejeté dès la conception. Au-delà de ~10 000 particules, la boucle JS est le goulot d'étranglement à 60 fps. GPUComputationRenderer déplace le calcul là où les données vivent déjà.

**Export GIF :** rejeté au profit de MP4. Les encodeurs GIF en JS (CCapture, gif.js) sont lents, produisent des fichiers volumineux et bloquent le thread principal. MediaRecorder + ffmpeg côté service produit un fichier plus petit, de meilleure qualité, sans bloquer le rendu.

**Backend monolithique (presets + ffmpeg) :** rejeté. ffmpeg nécessite un binaire système (`apt install ffmpeg`) qui alourdit considérablement l'image Docker. Séparer les responsabilités permet des images minimales et des déploiements indépendants.

## Compromis assumés

- Le champ `seed` de la table `presets` est toujours `0` : les presets sauvegardent une configuration visuelle (sliders), pas un état de simulation exactement reproductible. Acceptable pour ce cas d'usage.
- `allow_origins=["*"]` sur le backend : pas d'authentification, pas de données sensibles — le CORS ouvert est un choix délibéré pour un projet sans utilisateurs distincts.
