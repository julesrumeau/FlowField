# GPU Particles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move particle simulation (noise evaluation + physics integration) from the CPU main thread to the GPU via `GPUComputationRenderer`, targeting 150k particles at 60fps stable.

**Architecture:** Two RGBA32F float textures (512×512 = 262 144 slots) ping-pong each frame via fragment shaders — `velocityShader` evaluates GLSL Perlin noise and integrates velocity, `positionShader` integrates position and wraps bounds. `ParticleMesh` is rewritten with a `ShaderMaterial` whose vertex shader reads positions directly from the GPU texture. Zero CPU↔GPU transfer on the hot path.

**Tech Stack:** `GPUComputationRenderer` (`three/addons/misc/GPUComputationRenderer.js`, available via existing CDN import map), WebGL2 RGBA32F float textures, GLSL ES fragment + vertex shaders. No new build tooling.

**Behavioral contract:** Visual and physical output must be identical to the CPU version — same seeded Perlin noise (permutation table uploaded as a `DataTexture`), same three independent noise fields with offsets `+100 / +200` and rates `0.031 / 0.050 / 0.041`, same EMA velocity lerp, same axis-by-axis wrap bounds, same radial alpha fade on particles.

**Note on tests:** There is no JS test framework in this project. Verification for each task is visual (docker compose up → browser). Task 6 has a comprehensive visual checklist covering all behavioral requirements.

---

## File map

| Action | File | Responsibility |
|---|---|---|
| Create | `frontend/src/simulation/shaders/velocityShader.js` | GLSL string — noise3D + EMA velocity |
| Create | `frontend/src/simulation/shaders/positionShader.js` | GLSL string — position integration + wrap bounds |
| Replace | `frontend/src/simulation/ParticleSystem.js` | GPUComputationRenderer engine, perm texture, public API |
| Replace | `frontend/src/renderer/ParticleMesh.js` | ShaderMaterial + aIndex geometry + vertex/fragment shaders |
| Modify | `frontend/src/renderer/Renderer.js` | tick() update, add `get threeRenderer()` |
| Modify | `frontend/src/main.js` | Remove FlowField, call `particleSystem.init()` after `renderer.init()` |
| Modify | `frontend/src/ui/Controls.js` | Remove flowField dep, route noiseScale to particleSystem |
| Delete | `frontend/src/simulation/FlowField.js` | Replaced by velocityShader |
| Delete | `frontend/src/simulation/noise.js` | Perm logic inlined in ParticleSystem |

---

## Task 1 — velocityShader.js

**Files:**
- Create: `frontend/src/simulation/shaders/velocityShader.js`

- [ ] **Step 1: Create `frontend/src/simulation/shaders/velocityShader.js`**

```js
export const velocityShader = /* glsl */`
  uniform float u_time;
  uniform float u_speed;
  uniform float u_turbulence;
  uniform float u_noiseScale;
  uniform float u_seedOffset;
  uniform sampler2D tPerm;

  float fade(float t) { return t*t*t*(t*(t*6.0 - 15.0) + 10.0); }

  // Read perm[i] from a 16×32 RGBA8 texture (R channel = uint8 value / 255)
  float permLookup(float i) {
    float col = mod(i, 16.0);
    float row = floor(i / 16.0);
    vec2 uv = (vec2(col, row) + 0.5) / vec2(16.0, 32.0);
    return floor(texture2D(tPerm, uv).r * 255.0 + 0.5);
  }

  float gradF(float hash, float x, float y, float z) {
    float h = mod(hash, 16.0);
    float u = h < 8.0 ? x : y;
    float v = (h < 4.0) ? y : ((abs(h - 12.0) < 0.5 || abs(h - 14.0) < 0.5) ? x : z);
    return (mod(h, 2.0) < 1.0 ? u : -u) + (mod(floor(h / 2.0), 2.0) < 1.0 ? v : -v);
  }

  float noise3D(float x, float y, float z) {
    float X = mod(floor(x), 256.0);
    float Y = mod(floor(y), 256.0);
    float Z = mod(floor(z), 256.0);
    x -= floor(x); y -= floor(y); z -= floor(z);
    float u = fade(x), v = fade(y), w = fade(z);
    float A  = permLookup(X)       + Y;
    float AA = permLookup(A)       + Z;
    float AB = permLookup(A + 1.0) + Z;
    float B  = permLookup(X + 1.0) + Y;
    float BA = permLookup(B)       + Z;
    float BB = permLookup(B + 1.0) + Z;
    return mix(
      mix(
        mix(gradF(permLookup(AA),       x,      y,      z      ),
            gradF(permLookup(BA),       x-1.0,  y,      z      ), u),
        mix(gradF(permLookup(AB),       x,      y-1.0,  z      ),
            gradF(permLookup(BB),       x-1.0,  y-1.0,  z      ), u), v),
      mix(
        mix(gradF(permLookup(AA + 1.0), x,      y,      z-1.0  ),
            gradF(permLookup(BA + 1.0), x-1.0,  y,      z-1.0  ), u),
        mix(gradF(permLookup(AB + 1.0), x,      y-1.0,  z-1.0  ),
            gradF(permLookup(BB + 1.0), x-1.0,  y-1.0,  z-1.0  ), u), v), w);
  }

  void main() {
    vec2 uv  = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;

    float s = u_noiseScale;
    float o = u_seedOffset;
    float t = u_time;

    float vx = noise3D(pos.x*s + o,         pos.y*s + o,         pos.z*s + t*0.031 + o        );
    float vy = noise3D(pos.x*s + o + 100.0,  pos.y*s + o + 100.0, pos.z*s + t*0.050 + o + 100.0);
    float vz = noise3D(pos.x*s + o + 200.0,  pos.y*s + o + 200.0, pos.z*s + t*0.041 + o + 200.0);

    float len = length(vec3(vx, vy, vz));
    if (len < 0.0001) len = 1.0;
    vec3 dir = vec3(vx, vy, vz) / len;

    vec3 target = dir * u_speed;
    vel += (target - vel) * u_turbulence;

    gl_FragColor = vec4(vel, 1.0);
  }
`;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/simulation/shaders/velocityShader.js
git commit -m "feat: add GLSL velocity shader — Perlin noise + EMA velocity integration"
```

---

## Task 2 — positionShader.js

**Files:**
- Create: `frontend/src/simulation/shaders/positionShader.js`

- [ ] **Step 1: Create `frontend/src/simulation/shaders/positionShader.js`**

```js
export const positionShader = /* glsl */`
  uniform float u_dt;
  uniform float u_bounds;

  void main() {
    vec2 uv  = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;

    pos += vel * u_dt;

    if (pos.x >  u_bounds) pos.x = -u_bounds;
    if (pos.x < -u_bounds) pos.x =  u_bounds;
    if (pos.y >  u_bounds) pos.y = -u_bounds;
    if (pos.y < -u_bounds) pos.y =  u_bounds;
    if (pos.z >  u_bounds) pos.z = -u_bounds;
    if (pos.z < -u_bounds) pos.z =  u_bounds;

    gl_FragColor = vec4(pos, 1.0);
  }
`;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/simulation/shaders/positionShader.js
git commit -m "feat: add GLSL position shader — Euler integration + axis-by-axis wrap bounds"
```

---

## Task 3 — ParticleSystem.js (GPUComputationRenderer engine)

**Files:**
- Replace: `frontend/src/simulation/ParticleSystem.js`

- [ ] **Step 1: Replace `frontend/src/simulation/ParticleSystem.js` with this content**

```js
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { velocityShader } from './shaders/velocityShader.js';
import { positionShader } from './shaders/positionShader.js';

export const TEXTURE_WIDTH  = 512;
export const TEXTURE_HEIGHT = 512;
const MAX_COUNT = TEXTURE_WIDTH * TEXTURE_HEIGHT;

function buildPermTexture(seed) {
  const src = new Uint8Array(256);
  for (let i = 0; i < 256; i++) src[i] = i;
  let s = (seed ^ 0x45FA91C3) >>> 0;
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = src[i]; src[i] = src[j]; src[j] = tmp;
  }
  const data = new Uint8Array(512 * 4);
  for (let i = 0; i < 512; i++) data[i * 4] = src[i % 256];
  const tex = new THREE.DataTexture(data, 16, 32, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS     = THREE.ClampToEdgeWrapping;
  tex.wrapT     = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export class ParticleSystem {
  constructor({ particleCount, speed, turbulence, noiseScale, bounds, seed }) {
    this._count      = Math.max(1000, Math.min(Math.round(particleCount), MAX_COUNT));
    this._speed      = speed;
    this._turbulence = turbulence;
    this._noiseScale = noiseScale;
    this._bounds     = bounds;
    this._seedOffset = (seed % 1000) * 0.001;
    this._permTex    = buildPermTexture(seed);
    this._gpuCompute = null;
    this._velVar     = null;
    this._posVar     = null;
  }

  init(threeRenderer) {
    this._gpuCompute = new GPUComputationRenderer(TEXTURE_WIDTH, TEXTURE_HEIGHT, threeRenderer);

    // Position init — random within bounds
    const posTex  = this._gpuCompute.createTexture();
    const posData = posTex.image.data;
    for (let i = 0; i < MAX_COUNT; i++) {
      posData[i * 4]     = (Math.random() * 2 - 1) * this._bounds;
      posData[i * 4 + 1] = (Math.random() * 2 - 1) * this._bounds;
      posData[i * 4 + 2] = (Math.random() * 2 - 1) * this._bounds;
      posData[i * 4 + 3] = 0;
    }

    // Velocity init — zeros (createTexture returns a Float32Array-backed texture, default 0)
    const velTex = this._gpuCompute.createTexture();

    this._velVar = this._gpuCompute.addVariable('textureVelocity', velocityShader, velTex);
    this._posVar = this._gpuCompute.addVariable('texturePosition', positionShader, posTex);

    this._gpuCompute.setVariableDependencies(this._velVar, [this._velVar, this._posVar]);
    this._gpuCompute.setVariableDependencies(this._posVar, [this._posVar, this._velVar]);

    const err = this._gpuCompute.init();
    if (err !== null) console.error('GPUComputationRenderer init error:', err);

    const vu = this._velVar.material.uniforms;
    vu.u_time       = { value: 0 };
    vu.u_speed      = { value: this._speed };
    vu.u_turbulence = { value: this._turbulence };
    vu.u_noiseScale = { value: this._noiseScale };
    vu.u_seedOffset = { value: this._seedOffset };
    vu.tPerm        = { value: this._permTex };

    const pu = this._posVar.material.uniforms;
    pu.u_dt     = { value: 0.016 };
    pu.u_bounds = { value: this._bounds };
  }

  update(dt, time) {
    this._velVar.material.uniforms.u_time.value = time;
    this._posVar.material.uniforms.u_dt.value   = dt;
    this._gpuCompute.compute();
  }

  getPositionTexture() {
    return this._gpuCompute.getCurrentRenderTarget(this._posVar).texture;
  }

  setParams({ speed, turbulence, noiseScale }) {
    if (speed      !== undefined) { this._speed      = speed;      this._velVar.material.uniforms.u_speed.value      = speed;      }
    if (turbulence !== undefined) { this._turbulence = turbulence; this._velVar.material.uniforms.u_turbulence.value = turbulence; }
    if (noiseScale !== undefined) { this._noiseScale = noiseScale; this._velVar.material.uniforms.u_noiseScale.value = noiseScale; }
  }

  setCount(n) {
    this._count = Math.max(1000, Math.min(Math.round(n), MAX_COUNT));
  }

  get count() { return this._count; }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/simulation/ParticleSystem.js
git commit -m "feat: replace CPU ParticleSystem with GPUComputationRenderer engine"
```

---

## Task 4 — ParticleMesh.js (GPU-driven rendering)

**Files:**
- Replace: `frontend/src/renderer/ParticleMesh.js`

- [ ] **Step 1: Replace `frontend/src/renderer/ParticleMesh.js` with this content**

```js
import * as THREE from 'three';
import { TEXTURE_WIDTH, TEXTURE_HEIGHT } from '../simulation/ParticleSystem.js';

const MAX_COUNT = TEXTURE_WIDTH * TEXTURE_HEIGHT;

const VERTEX_SHADER = `
  attribute float aIndex;
  uniform sampler2D texturePosition;
  uniform float u_size;
  uniform float u_count;
  uniform float u_bounds;

  varying float vAlpha;

  void main() {
    if (aIndex >= u_count) {
      gl_Position  = vec4(0.0, 0.0, 9999.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }

    float col = mod(aIndex, ${TEXTURE_WIDTH}.0);
    float row = floor(aIndex / ${TEXTURE_WIDTH}.0);
    vec2 uv   = (vec2(col, row) + 0.5) / vec2(${TEXTURE_WIDTH}.0, ${TEXTURE_HEIGHT}.0);
    vec3 pos  = texture2D(texturePosition, uv).xyz;

    // Radial alpha fade — same formula as the former CPU sync()
    float dist      = length(pos);
    float noiseFade = (sin(pos.x * 0.11) + sin(pos.y * 0.13) + sin(pos.z * 0.17)) * 0.2;
    float d         = dist + noiseFade * u_bounds * 0.15;
    float fadeStart = u_bounds * 0.4;
    float t         = smoothstep(fadeStart, u_bounds, d);
    vAlpha          = 1.0 - t * t;

    vec4 mvPosition  = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize     = u_size * (300.0 / -mvPosition.z);
    gl_Position      = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = `
  varying float vAlpha;

  void main() {
    // Circular radial gradient matching the former CanvasTexture
    vec2  uv = gl_PointCoord - vec2(0.5);
    float r  = length(uv) * 2.0;
    float a1 = mix(1.0, 0.9, smoothstep(0.0, 0.8, r));
    float a2 = mix(0.9, 0.0, smoothstep(0.8, 1.0, r));
    float circleAlpha = r < 0.8 ? a1 : a2;
    if (circleAlpha < 0.01) discard;
    gl_FragColor = vec4(1.0, 1.0, 1.0, circleAlpha * vAlpha);
  }
`;

export class ParticleMesh {
  constructor({ bounds = 50 } = {}) {
    const indices = new Float32Array(MAX_COUNT);
    for (let i = 0; i < MAX_COUNT; i++) indices[i] = i;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('aIndex', new THREE.BufferAttribute(indices, 1));

    this._material = new THREE.ShaderMaterial({
      uniforms: {
        texturePosition: { value: null },
        u_size:          { value: 1.5 },
        u_count:         { value: MAX_COUNT },
        u_bounds:        { value: bounds },
      },
      vertexShader:   VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      blending:       THREE.AdditiveBlending,
      depthWrite:     false,
      depthTest:      false,
      transparent:    true,
    });

    this.mesh = new THREE.Points(geometry, this._material);
  }

  setPositionTexture(tex) { this._material.uniforms.texturePosition.value = tex; }
  setSize(n)              { this._material.uniforms.u_size.value  = n; }
  setCount(n)             { this._material.uniforms.u_count.value = n; }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/renderer/ParticleMesh.js
git commit -m "feat: replace ParticleMesh with ShaderMaterial reading GPU position texture"
```

---

## Task 5 — Renderer.js

**Files:**
- Modify: `frontend/src/renderer/Renderer.js`

- [ ] **Step 1: Replace `frontend/src/renderer/Renderer.js` with this content**

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PostProcessing } from './PostProcessing.js';

export class Renderer {
  constructor({ canvas, particleSystem, particleMesh, trailLength = 0.95, bloomStrength = 1.0, stats }) {
    this._canvas         = canvas;
    this._particleSystem = particleSystem;
    this._particleMesh   = particleMesh;
    this._trailLength    = trailLength;
    this._bloomStrength  = bloomStrength;
    this._time   = 0;
    this._lastTs = null;
    this._stats  = stats;
  }

  init() {
    this._renderer = new THREE.WebGLRenderer({ canvas: this._canvas, antialias: false });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setSize(window.innerWidth, window.innerHeight);

    this._scene = new THREE.Scene();
    this._scene.add(this._particleMesh.mesh);

    this._camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this._camera.position.z = 150;

    this._controls = new OrbitControls(this._camera, this._canvas);
    this._controls.enableDamping = true;

    this._post = new PostProcessing({
      renderer:      this._renderer,
      scene:         this._scene,
      camera:        this._camera,
      trailLength:   this._trailLength,
      bloomStrength: this._bloomStrength,
    });

    window.addEventListener('resize', () => this._onResize());
  }

  get canvas()        { return this._canvas;   }
  get threeRenderer() { return this._renderer; }

  resize(w, h) {
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
    this._post.resize(w, h);
  }

  _onResize() { this.resize(window.innerWidth, window.innerHeight); }

  start() { requestAnimationFrame(ts => this._loop(ts)); }

  _loop(ts) {
    requestAnimationFrame(ts2 => this._loop(ts2));
    const dt = this._lastTs === null ? 0.016 : Math.min((ts - this._lastTs) / 1000, 0.05);
    this._lastTs = ts;
    this.tick(dt, this._time);
    this._time += dt;
  }

  tick(dt, time) {
    this._stats?.begin();
    this._particleSystem.update(dt, time);
    this._particleMesh.setPositionTexture(this._particleSystem.getPositionTexture());
    this._controls.update();
    this._post.render();
    this._stats?.end();
  }

  setTrailLength(v)   { this._post.setTrailLength(v);   }
  setBloomStrength(v) { this._post.setBloomStrength(v); }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/renderer/Renderer.js
git commit -m "refactor: update Renderer.tick() for GPU pipeline, add threeRenderer getter"
```

---

## Task 6 — Wiring + cleanup + smoke test

**Files:**
- Replace: `frontend/src/main.js`
- Modify: `frontend/src/ui/Controls.js`
- Delete: `frontend/src/simulation/FlowField.js`
- Delete: `frontend/src/simulation/noise.js`

- [ ] **Step 1: Replace `frontend/src/main.js` with this content**

```js
import { ParticleSystem } from './simulation/ParticleSystem.js';
import { ParticleMesh }   from './renderer/ParticleMesh.js';
import { Renderer }       from './renderer/Renderer.js';
import { Controls }       from './ui/Controls.js';
import { PresetPanel }    from './ui/PresetPanel.js';
import { VideoExporter }  from './export/VideoExporter.js';

const canvas = document.getElementById('canvas');

const noiseScale    = 1.2;
const seed          = 42;
const speed         = 0.8;
const turbulence    = 0.3;
const particleCount = 80000;
const bounds        = 50;
const trailLength   = 0.95;
const bloomStrength = 1.0;

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const particleSystem = new ParticleSystem({ particleCount, speed, turbulence, noiseScale, bounds, seed });
const particleMesh   = new ParticleMesh({ bounds });
const renderer = new Renderer({ canvas, particleSystem, particleMesh, trailLength, bloomStrength, stats });

renderer.init();
particleSystem.init(renderer.threeRenderer);
renderer.start();

const controls = new Controls({ particleSystem, particleMesh, renderer });
new PresetPanel({ controls });

const exporter = new VideoExporter({ renderer });
document.getElementById('btn-export').addEventListener('click', () => exporter.export());
```

- [ ] **Step 2: Update `frontend/src/ui/Controls.js`**

Replace the constructor signature and body (lines 1–8) — remove `flowField`:

```js
  constructor({ particleSystem, particleMesh, renderer }) {
    this._ps       = particleSystem;
    this._pm       = particleMesh;
    this._renderer = renderer;
    this._inputs   = {};
    document.body.appendChild(this._build());
  }
```

Replace the `_apply` method entirely:

```js
  _apply(key, value) {
    if (key === 'noiseScale') {
      this._ps.setParams({ noiseScale: value });
    } else if (key === 'particleCount') {
      this._ps.setCount(value);
      this._pm.setCount(value);
    } else if (key === 'size') {
      this._pm.setSize(value);
    } else if (key === 'trailLength') {
      this._renderer.setTrailLength(value);
    } else if (key === 'bloomStrength') {
      this._renderer.setBloomStrength(value);
    } else {
      this._ps.setParams({ [key]: value });
    }
  }
```

- [ ] **Step 3: Delete the two obsolete simulation files**

```bash
rm frontend/src/simulation/FlowField.js frontend/src/simulation/noise.js
```

- [ ] **Step 4: Smoke test**

```bash
docker compose up --build
```

Open `http://localhost`. Verify all of the following:

1. **Particles render** — simulation starts immediately, particles visible
2. **Speed slider** — moving it changes how fast particles flow
3. **Turbulence slider** — moving it changes smoothness vs chaos of movement
4. **Noise Scale slider** — moving it changes density/scale of the flow pattern
5. **Particles slider** — increasing to 150 000 stays at 60fps (check stats.js panel)
6. **Size slider** — particles grow and shrink
7. **Trails slider** — persistence of trails changes
8. **Bloom slider** — glow intensity changes
9. **Wrap bounds** — particles that exit one side reappear on the other (visible at low trail length)
10. **Radial alpha fade** — particles near center are brighter than at the edges of the volume
11. **OrbitControls** — drag to rotate, scroll to zoom, right-click to pan — all functional
12. **PostProcessing** — bloom and trails still working (no regression)
13. **No console errors** — browser devtools show no WebGL or JS errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/main.js frontend/src/ui/Controls.js
git rm frontend/src/simulation/FlowField.js frontend/src/simulation/noise.js
git commit -m "feat: wire GPU particle system end-to-end, remove CPU FlowField and noise"
```
