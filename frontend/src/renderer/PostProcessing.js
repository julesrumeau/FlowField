import * as THREE from 'three';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

export class PostProcessing {
  constructor({ renderer, scene, camera, trailLength = 0.95, bloomStrength = 1.0 }) {
    this._renderer    = renderer;
    this._scene       = scene;
    this._camera      = camera;
    this._initialized = false;

    const w   = window.innerWidth;
    const h   = window.innerHeight;
    const dpr = renderer.getPixelRatio();

    // Buffer d'accumulation des trails : une texture GPU où on "dessine" de frame en frame.
    // depthBuffer:false car c'est une composition 2D pure — pas besoin de tester la profondeur.
    this._trailTarget = new THREE.WebGLRenderTarget(w * dpr, h * dpr, {
      minFilter:   THREE.LinearFilter,
      magFilter:   THREE.LinearFilter,
      depthBuffer: false,
    });

    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Quad plein écran noir semi-transparent rendu à chaque frame sur le buffer.
    // opacity = 1 - trailLength → trailLength=0.95 donne opacity=0.05 → 5% du buffer effacé par frame.
    // Effet : chaque frame les anciennes positions "s'estompent" progressivement.
    this._fadeMat = new THREE.MeshBasicMaterial({
      color:       0x000000,
      transparent: true,
      opacity:     1 - trailLength,
      depthTest:   false,
      depthWrite:  false,
    });
    this._fadeScene = new THREE.Scene();
    this._fadePlaneGeo = new THREE.PlaneGeometry(2, 2);
    this._fadeScene.add(new THREE.Mesh(this._fadePlaneGeo, this._fadeMat));
    this._fadeCamera = ortho;

    // Scène d'affichage : un quad plein écran qui affiche le buffer accumulé
    const displayScene = new THREE.Scene();
    this._displayPlaneGeo = new THREE.PlaneGeometry(2, 2);
    this._displayMat = new THREE.MeshBasicMaterial({ map: this._trailTarget.texture, depthTest: false, depthWrite: false });
    displayScene.add(new THREE.Mesh(this._displayPlaneGeo, this._displayMat));

    // Pipeline de post-processing : buffer accumulé → bloom → sortie écran
    this._composer = new EffectComposer(renderer);
    this._composer.setSize(w, h);
    this._composer.addPass(new RenderPass(displayScene, ortho));

    // UnrealBloomPass : bloom multi-résolution (issu d'Unreal Engine).
    // strength=slider, radius=0.4 (étalement), threshold=0.0 (tout brille)
    this._bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), bloomStrength, 0.4, 0.0);
    this._composer.addPass(this._bloomPass);
    this._composer.addPass(new OutputPass());   // conversion colorimétrique finale (sRGB)
  }

  setTrailLength(v)   { this._fadeMat.opacity     = 1 - v; }
  setBloomStrength(v) { this._bloomPass.strength   = v;     }

  render() {
    const r = this._renderer;

    // On redirige le rendu vers le buffer de trail (pas directement vers l'écran)
    r.setRenderTarget(this._trailTarget);

    // Premier frame uniquement : on efface le buffer pour éviter des résidus mémoire GPU
    if (!this._initialized) {
      r.autoClear = true;
      r.clear();
      this._initialized = true;
    }

    // autoClear=false : on ne veut PAS que WebGL efface le buffer entre les deux rendus.
    // On veut accumuler : d'abord le quad de fondu, puis les nouvelles particules par-dessus.
    r.autoClear = false;
    r.render(this._fadeScene, this._fadeCamera);  // 1. estompe les trails existants (-5%)
    r.render(this._scene, this._camera);           // 2. stamp les nouvelles positions

    // On repasse en rendu vers l'écran, puis on applique bloom + sortie
    r.setRenderTarget(null);
    r.autoClear = true;
    this._composer.render();
  }

  resize(w, h) {
    const dpr = this._renderer.getPixelRatio();
    this._trailTarget.setSize(w * dpr, h * dpr);
    this._composer.setSize(w, h);
    this._initialized = false;
  }

  dispose() {
    this._fadePlaneGeo.dispose();
    this._fadeMat.dispose();
    this._displayPlaneGeo.dispose();
    this._displayMat.dispose();
    this._trailTarget.dispose();
    this._composer.dispose();
  }
}
