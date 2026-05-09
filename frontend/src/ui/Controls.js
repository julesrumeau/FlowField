export class Controls {
  constructor({ particleSystem, particleMesh, renderer }) {
    this._ps       = particleSystem;
    this._pm       = particleMesh;
    this._renderer = renderer;
    this._inputs   = {};
    document.body.appendChild(this._build());
  }

  _build() {
    const panel = document.createElement('div');
    panel.id = 'controls';

    const sliders = [
      { key: 'speed',         label: 'Speed',       min: 0.1,  max: 50.0,  step: 0.1,  value: 0.8   },
      { key: 'turbulence',    label: 'Turbulence',  min: 0.01, max: 1.0,   step: 0.01, value: 0.3   },
      { key: 'noiseScale',    label: 'Noise Scale', min: 0.1,  max: 5.0,   step: 0.1,  value: 1.2   },
      { key: 'particleCount', label: 'Particles',   min: 1000, max: 300000, step: 1000, value: 80000 }, // cap UI à 300k pour les perfs — capacité GPU réelle : 524 288
      { key: 'size',          label: 'Size',        min: 0.2,  max: 8.0,   step: 0.1,  value: 1.5   },
      { key: 'trailLength',   label: 'Trails',      min: 0.0, max: 0.99,  step: 0.01, value: 0.95  },
      { key: 'bloomStrength', label: 'Bloom',       min: 0.0,  max: 3.0,   step: 0.1,  value: 1.0   },
    ];

    for (const cfg of sliders) panel.appendChild(this._row(cfg));
    return panel;
  }

  _row({ key, label, min, max, step, value }) {
    const row = document.createElement('div');
    row.className = 'ctrl-row';

    const lbl = document.createElement('span');
    lbl.className = 'ctrl-label';
    lbl.textContent = label;

    const val = document.createElement('span');
    val.className = 'ctrl-value';
    val.textContent = value.toFixed(2);

    const input = document.createElement('input');
    input.type  = 'range';
    input.min   = min;
    input.max   = max;
    input.step  = step;
    input.value = value;

    this._inputs[key] = input;

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      val.textContent = v.toFixed(2);
      this._apply(key, v);
    });

    row.appendChild(lbl);
    row.appendChild(input);
    row.appendChild(val);
    return row;
  }

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

  getParams() {
    const result = {};
    for (const [key, input] of Object.entries(this._inputs)) {
      result[key] = parseFloat(input.value);
    }
    return result;
  }

  setParams(params) {
    for (const [key, value] of Object.entries(params)) {
      if (!this._inputs[key]) continue;
      const numeric = parseFloat(value);
      if (!Number.isFinite(numeric)) continue;
      this._inputs[key].value = numeric;
      this._inputs[key].dispatchEvent(new InputEvent('input'));
    }
  }
}
