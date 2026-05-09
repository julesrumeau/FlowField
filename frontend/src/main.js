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

const stats = window.Stats ? new window.Stats() : null;
if (stats) {
  stats.showPanel(0);
  document.body.appendChild(stats.dom);
}

const particleSystem = new ParticleSystem({ particleCount, speed, turbulence, noiseScale, bounds, seed });
const particleMesh   = new ParticleMesh({ bounds });
const renderer = new Renderer({ canvas, particleSystem, particleMesh, trailLength, bloomStrength, stats });

renderer.init();
particleSystem.init(renderer.threeRenderer);
renderer.start();

const controls = new Controls({ particleSystem, particleMesh, renderer });
new PresetPanel({ controls });

const exporter = new VideoExporter({ renderer });
document.getElementById('btn-record-start').addEventListener('click', () => exporter.startRecording());
document.getElementById('btn-record-stop').addEventListener('click',  () => exporter.stopRecording());
