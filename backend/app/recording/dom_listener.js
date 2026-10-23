// WhistleCode DOM Event Listener Script
// Injected into Playwright disposable context to record structured interactions
(function() {
  if (window.__whistleCodeInitialized) return;
  window.__whistleCodeInitialized = true;

  function getElementRole(el) {
    if (el.getAttribute('role')) return el.getAttribute('role');
    const tag = el.tagName.toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a') return 'link';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['button', 'submit', 'reset'].includes(type)) return 'button';
      if (['checkbox', 'radio'].includes(type)) return type;
      return 'textbox';
    }
    return tag;
  }

  function getElementAccessibleName(el) {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    if (el.getAttribute('aria-labelledby')) {
      const lblEl = document.getElementById(el.getAttribute('aria-labelledby'));
      if (lblEl) return lblEl.innerText.trim();
    }
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) return label.innerText.trim();
    }
    const parentLabel = el.closest('label');
    if (parentLabel) return parentLabel.innerText.trim();
    if (el.innerText && el.innerText.length < 60) return el.innerText.trim();
    if (el.getAttribute('title')) return el.getAttribute('title').trim();
    if (el.getAttribute('placeholder')) return el.getAttribute('placeholder').trim();
    return null;
  }

  function getElementTestId(el) {
    return el.getAttribute('data-testid') || 
           el.getAttribute('data-test') || 
           el.getAttribute('data-qa') || 
           (el.id && !el.id.match(/\d{5,}/) ? el.id : null);
  }

  function getCssFallback(el) {
    if (el.id) return `#${el.id}`;
    let path = [];
    while (el && el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(/\s+/).filter(c => c && !c.includes(':')).slice(0, 2);
        if (classes.length) selector += '.' + classes.join('.');
      }
      path.unshift(selector);
      if (path.length >= 3) break;
      el = el.parentNode;
    }
    return path.join(' > ');
  }

  function extractTargetDescriptor(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
    const form = el.closest('form');
    let rect = null;
    try {
      const r = el.getBoundingClientRect();
      rect = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    } catch (e) {}

    return {
      role: getElementRole(el),
      name: getElementAccessibleName(el),
      test_id: getElementTestId(el),
      label: el.id ? (document.querySelector(`label[for="${el.id}"]`)?.innerText.trim() || null) : null,
      text: el.innerText ? el.innerText.slice(0, 60).trim() : null,
      css_fallback: getCssFallback(el),
      bounding_box: rect,
      active_window: document.title || window.location.hostname,
      context: {
        within: form ? (form.id ? `form#${form.id}` : 'form') : null,
        landmark: el.closest('main, header, nav, footer, section')?.tagName.toLowerCase() || null
      },
      min_confidence: 0.85
    };
  }

  function emit(type, el, value = null, meta = {}) {
    const isPassword = el && el.tagName === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() === 'password';
    const target = extractTargetDescriptor(el);

    const event = {
      type: type,
      url: window.location.href,
      target: target,
      value: isPassword ? '[MASKED_SECRET]' : value,
      is_password: isPassword,
      active_window: document.title || window.location.hostname,
      metadata: Object.assign({
        page_title: document.title,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      }, meta)
    };

    if (window.whistleCodeEmitEvent) {
      window.whistleCodeEmitEvent(JSON.stringify(event));
    }
  }

  // Intercept click with coordinates
  document.addEventListener('click', (e) => {
    if (window.__whistleCodeCaptureClicks === false) return;
    const el = e.target.closest('button, a, input, select, textarea, [role="button"]') || e.target;
    emit('click', el, null, {
      mouse_x: e.clientX,
      mouse_y: e.clientY,
      button: e.button
    });
  }, true);

  // Intercept change / input
  document.addEventListener('change', (e) => {
    if (window.__whistleCodeCaptureKeyboard === false) return;
    const el = e.target;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
      let val = el.value;
      if (el.type === 'checkbox') val = el.checked ? 'true' : 'false';
      emit('input', el, val);
    }
  }, true);

  // Intercept keyboard Enter / Tab / Escape on inputs
  document.addEventListener('keydown', (e) => {
    if (window.__whistleCodeCaptureKeyboard === false) return;
    if (['Enter', 'Tab', 'Escape'].includes(e.key)) {
      const el = e.target;
      emit('keypress', el, e.key, { key: e.key, code: e.code });
    }
  }, true);

  // Intercept submit
  document.addEventListener('submit', (e) => {
    if (window.__whistleCodeCaptureClicks === false) return;
    const form = e.target;
    const submitBtn = form.querySelector('[type="submit"]') || form;
    emit('submit', submitBtn);
  }, true);

  console.log('[WhistleCode] DOM event & accessibility recording hooks attached.');
})();
