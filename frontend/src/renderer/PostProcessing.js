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

    // Trail accumulation buffer — no depth needed, pure 2D compositing
    this._trailTarget = new THREE.WebGLRenderTarget(w * dpr, h * dpr, {
      minFilter:   THREE.LinearFilter,
      magFilter:   THREE.LinearFilter,
      depthBuffer: false,
    });

    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Fade scene: black quad that darkens the trail buffer each frame.
    // opacity = (1 - trailLength) so trailLength=0.95 → 5% black overlay → 95% persistence.
    this._fadeMat = new THREE.MeshBasicMaterial({
      color:       0x000000,
      transparent: true,
      opacity:     1 - trailLength,
      depthTest:   false,
      depthWrite:  false,
    });
    this._fadeScene = new THREE.Scene();
    this._fadeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._fadeMat));
    this._fadeCamera = ortho;

    // Display scene: full-screen quad showing the accumulated trail texture
    const displayScene = new THREE.Scene();
    displayScene.add(new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this._trailTarget.texture, depthTest: false, depthWrite: false })
    ));

    // Composer: display → bloom → screen
    this._composer = new EffectComposer(renderer);
    this._composer.setSize(w, h);
    this._composer.addPass(new RenderPass(displayScene, ortho));

    this._bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), bloomStrength, 0.4, 0.0);
    this._composer.addPass(this._bloomPass);
    this._composer.addPass(new OutputPass());
  }

  setTrailLength(v)   { this._fadeMat.opacity     = 1 - v; }
  setBloomStrength(v) { this._bloomPass.strength   = v;     }

  render() {
    const r = this._renderer;

    r.setRenderTarget(this._trailTarget);

    // Clear only on the very first frame to avoid garbage in the buffer
    if (!this._initialized) {
      r.autoClear = true;
      r.clear();
      this._initialized = true;
    }

    r.autoClear = false;
    r.render(this._fadeScene, this._fadeCamera); // decay existing trails
    r.render(this._scene, this._camera);          // stamp new particles on top

    r.setRenderTarget(null);
    r.autoClear = true;
    this._composer.render(); // bloom + output to screen
  }

  resize(w, h) {
    const dpr = this._renderer.getPixelRatio();
    this._trailTarget.setSize(w * dpr, h * dpr);
    this._composer.setSize(w, h);
  }
}
