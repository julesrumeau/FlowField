import { FlowField }      from './simulation/FlowField.js';
import { ParticleSystem } from './simulation/ParticleSystem.js';
import { ParticleMesh }   from './renderer/ParticleMesh.js';
import { Renderer }       from './renderer/Renderer.js';
import { Controls }       from './ui/Controls.js';
import { PresetPanel }    from './ui/PresetPanel.js';
import { VideoExporter }  from './export/VideoExporter.js';

const canvas = document.getElementById('canvas');

const noiseScale     = 1.2;
const seed           = 42;
const speed          = 0.8;
const turbulence     = 0.3;
const particleCount  = 80000;
const bounds         = 50;
const trailLength    = 0.95;
const bloomStrength  = 1.0;

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const flowField      = new FlowField({ noiseScale, seed });
const particleSystem = new ParticleSystem({ particleCount, flowField, speed, turbulence, bounds });
const particleMesh   = new ParticleMesh(particleSystem.positions);
const renderer = new Renderer({
  canvas,
  particleSystem,
  particleMesh,
  trailLength,
  bloomStrength,
  bounds,
  stats
});
renderer.init();
renderer.start();

const controls = new Controls({ particleSystem, particleMesh, flowField, renderer });
new PresetPanel({ controls });

const exporter = new VideoExporter({ renderer });
document.getElementById('btn-export').addEventListener('click', () => exporter.export());
