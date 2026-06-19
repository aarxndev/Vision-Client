const list = document.getElementById('list');
const chipMap = new Map(); 

const SLIDE_OUT_MS = 280;

function createChip(m) {
  const chip = document.createElement('div');
  chip.className = 'ov-chip slide-in';
  chip.dataset.id = m.id;
  chip.innerHTML = `
    <span class="ov-dot"></span>
    <span class="ov-text">
      <span class="ov-name"></span>
      <span class="ov-meta"></span>
    </span>`;
  updateChipContent(chip, m);
  list.appendChild(chip);
  chipMap.set(m.id, { el: chip, data: m });
  chip.addEventListener('animationend', (e) => {
    if (e.animationName === 'slideIn') chip.classList.remove('slide-in');
  });
}

function updateChipContent(chip, m) {
  chip.querySelector('.ov-name').textContent = m.name;
  chip.querySelector('.ov-meta').textContent = `${m.port} · ${m.dir}`;
}

function removeChip(id) {
  const entry = chipMap.get(id);
  if (!entry) return;
  const { el } = entry;
  chipMap.delete(id);

  el.classList.remove('slide-in');
  if (!el.classList.contains('slide-out')) {
    el.classList.add('slide-out');
    const onEnd = (e) => {
      if (e.animationName !== 'slideOut') return;
      el.removeEventListener('animationend', onEnd);
      el.remove();
    };
    el.addEventListener('animationend', onEnd);
    setTimeout(() => {
      if (el.isConnected) el.remove();
    }, SLIDE_OUT_MS + 50);
    return;
  }
  el.remove();
}

function render(mods) {
  const active = (mods || []).filter((m) => m.on);
  const activeIds = new Set(active.map((m) => m.id));

  for (const id of [...chipMap.keys()]) {
    if (!activeIds.has(id)) removeChip(id);
  }

  for (const m of active) {
    const existing = chipMap.get(m.id);
    if (existing) {
      existing.el.classList.remove('slide-out');
      updateChipContent(existing.el, m);
      existing.data = m;
    } else {
      createChip(m);
    }
  }
}

window.overlayApi.onUpdate(render);
render([]);
