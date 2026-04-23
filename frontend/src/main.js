import { FlowField }      from './simulation/FlowField.js';
import { ParticleSystem } from './simulation/ParticleSystem.js';
import { ParticleMesh }   from './renderer/ParticleMesh.js';
import { Renderer }       from './renderer/Renderer.js';
import { Controls }       from './ui/Controls.js';

const canvas = document.getElementById('canvas');

const noiseScale     = 1.2;
const seed           = 42;
const speed          = 0.8;
const turbulence     = 0.3;
const particleCount  = 80000;
const bounds         = 50;

const flowField      = new FlowField({ noiseScale, seed });
const particleSystem = new ParticleSystem({ particleCount, flowField, speed, turbulence, bounds });
const particleMesh   = new ParticleMesh(particleSystem.positions);
const renderer       = new Renderer({ canvas, particleSystem, particleMesh });

renderer.init();
renderer.start();

new Controls({ particleSystem, particleMesh, flowField });
