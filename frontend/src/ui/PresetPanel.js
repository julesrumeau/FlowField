import { listPresets, savePreset, deletePreset } from '../services/client.js';

export class PresetPanel {
  constructor({ controls }) {
    this._controls = controls;
    this._panel    = this._build();
    document.body.appendChild(this._panel);
    this._loadList();
  }

  _build() {
    const panel = document.createElement('div');
    panel.id = 'preset-panel';

    const header = document.createElement('div');
    header.className = 'preset-header';
    header.textContent = 'PRESETS';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'preset-save-btn';
    saveBtn.textContent = 'Save current';
    saveBtn.addEventListener('click', () => this._openPopup());

    this._errorMsg = document.createElement('div');
    this._errorMsg.className = 'preset-error';

    this._list = document.createElement('div');
    this._list.className = 'preset-list';

    panel.appendChild(header);
    panel.appendChild(saveBtn);
    panel.appendChild(this._errorMsg);
    panel.appendChild(this._list);
    return panel;
  }

  async _loadList() {
    this._errorMsg.textContent = '';
    try {
      const presets = await listPresets();
      this._renderList(presets);
    } catch (e) {
      console.error('loadList failed:', e);
      this._errorMsg.textContent = 'Erreur chargement';
    }
  }

  _renderList(presets) {
    this._list.innerHTML = '';
    if (presets.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'preset-name';
      empty.style.cursor = 'default';
      empty.textContent = 'Aucun preset sauvegardé';
      this._list.appendChild(empty);
      return;
    }
    for (const preset of presets) {
      this._list.appendChild(this._row(preset));
    }
  }

  _row(preset) {
    const row = document.createElement('div');
    row.className = 'preset-row';

    const name = document.createElement('span');
    name.className = 'preset-name';
    name.textContent = preset.nom;
    name.title = preset.nom;
    name.addEventListener('click', () => this._controls.setParams(preset.params));

    const del = document.createElement('button');
    del.className = 'preset-delete';
    del.textContent = '✕';
    del.setAttribute('aria-label', `Supprimer ${preset.nom}`);
    del.addEventListener('click', () => this._delete(preset.id, row));

    row.appendChild(name);
    row.appendChild(del);
    return row;
  }

  async _delete(id, row) {
    try {
      await deletePreset(id);
      row.remove();
      this._loadList();
    } catch (e) {
      console.error('deletePreset failed:', e);
      this._errorMsg.textContent = 'Erreur suppression';
      setTimeout(() => { this._errorMsg.textContent = ''; }, 3000);
    }
  }

  _openPopup() {
    if (document.getElementById('preset-popup-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'preset-popup-overlay';

    const box = document.createElement('div');
    box.className = 'popup-box';

    const input = document.createElement('input');
    input.type        = 'text';
    input.placeholder = 'Nom du preset';
    input.className   = 'popup-input';

    const actions = document.createElement('div');
    actions.className = 'popup-actions';

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Sauvegarder';
    confirmBtn.className   = 'popup-confirm';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Annuler';
    cancelBtn.className   = 'popup-cancel';

    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);
    box.appendChild(input);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    input.focus();

    const close = () => overlay.remove();

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const submit = async () => {
      const nom = input.value.trim();
      if (!nom) return;
      close();
      try {
        await savePreset(nom, this._controls.getParams());
        await this._loadList();
      } catch {
        this._errorMsg.textContent = 'Erreur lors de la sauvegarde';
        setTimeout(() => { this._errorMsg.textContent = ''; }, 3000);
      }
    };

    confirmBtn.addEventListener('click', submit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  submit();
      if (e.key === 'Escape') close();
    });
  }
}
