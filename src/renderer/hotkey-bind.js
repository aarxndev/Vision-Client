
(function () {
  const MOUSE_LABELS = {
    0: 'Mouse1',
    1: 'Middle',
    2: 'Mouse2',
    3: 'Mouse4',
    4: 'Mouse5',
  };

  const KEY_ALIASES = {
    ' ': 'Space',
    Escape: 'Escape',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
  };

  let activeCapture = null;

  function formatModifiers(e) {
    const mods = [];
    if (e.ctrlKey) mods.push('Control');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    return mods;
  }

  function formatKeyEvent(e) {
    if (e.key === 'Escape') return null;
    const mods = formatModifiers(e);
    let key = KEY_ALIASES[e.key] || e.key;
    if (/^F\d{1,2}$/i.test(key)) key = key.toUpperCase();
    else if (key.length === 1) key = key.toUpperCase();
    else if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null;
    return [...mods, key].join('+');
  }

  function formatMouseEvent(e) {
    const label = MOUSE_LABELS[e.button];
    if (!label) return null;
    const mods = formatModifiers(e);
    return mods.length ? `${mods.join('+')}+${label}` : label;
  }

  function displayLabel(accel, fallback) {
    return accel || fallback || 'Unbound';
  }

  function extractFilterKey(accel) {
    if (!accel || typeof accel !== 'string') return '';
    const mod = /^(Control|Alt|Shift|Meta|CommandOrControl|Ctrl|Cmd)$/i;
    const parts = accel.split('+').map((p) => p.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (mod.test(parts[i])) continue;
      const k = parts[i];
      if (/^F\d{1,2}$/i.test(k)) return k.toUpperCase();
      if (k.length === 1) return k.toUpperCase();
      return k;
    }
    return '';
  }

  function stopCapture() {
    if (!activeCapture) return;
    const { btn, onKeyDown, onMouseDown } = activeCapture;
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('mousedown', onMouseDown, true);
    btn.classList.remove('capturing');
    activeCapture = null;
  }

  function startCapture(btn, { onCapture, allowMouse = true } = {}) {
    stopCapture();
    const prior = btn.dataset.value || btn.dataset.default || '';
    btn.classList.add('capturing');
    btn.textContent = 'Press a key…';

    function finish(accel) {
      stopCapture();
      if (accel) {
        btn.dataset.value = accel;
        btn.textContent = displayLabel(accel, btn.dataset.default);
        if (onCapture) onCapture(accel);
      } else {
        btn.textContent = displayLabel(prior, btn.dataset.default);
      }
    }

    function onKeyDown(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        finish(null);
        return;
      }
      const accel = formatKeyEvent(e);
      if (accel) finish(accel);
    }

    function onMouseDown(e) {
      if (!allowMouse) return;
      if (e.button === 0 && e.target === btn) return;
      e.preventDefault();
      e.stopPropagation();
      const accel = formatMouseEvent(e);
      if (accel) finish(accel);
    }

    activeCapture = { btn, onKeyDown, onMouseDown };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousedown', onMouseDown, true);
  }

  function mountBindButton(btn, options) {
    const apply = (val) => {
      btn.dataset.value = val || '';
      btn.textContent = displayLabel(val, btn.dataset.default);
    };
    apply(btn.dataset.value || options.value || '');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startCapture(btn, {
        allowMouse: options.allowMouse !== false,
        onCapture: async (accel) => {
          apply(accel);
          if (options.onCapture) await options.onCapture(accel);
        },
      });
    });
    return { setValue: apply, stop: stopCapture };
  }

  function mountBindButtons(selector, options) {
    return [...document.querySelectorAll(selector)].map((btn) => mountBindButton(btn, {
      ...options,
      value: btn.dataset.value || options?.getValue?.(btn) || '',
      onCapture: (accel) => options?.onCapture?.(accel, btn),
    }));
  }

  window.HotkeyBind = { mountBindButton, mountBindButtons, displayLabel, extractFilterKey, stopCapture };
})();
