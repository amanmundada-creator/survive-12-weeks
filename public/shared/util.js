// Shared helpers for host, phone and preview pages (no build step, plain JS).
(function () {
  const inr = (x) => {
    if (x == null || isNaN(x)) return '–';
    const neg = x < 0;
    const n = Math.round(Math.abs(x)).toString();
    let out;
    if (n.length <= 3) out = n;
    else out = n.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + n.slice(-3);
    return (neg ? '−₹' : '₹') + out;
  };
  // ₹3.4L / ₹45k style for tight spaces
  const inrShort = (x) => {
    if (x == null || isNaN(x)) return '–';
    const a = Math.abs(x), s = x < 0 ? '−' : '';
    if (a >= 100000) return `${s}₹${(a / 100000).toFixed(a >= 1000000 ? 1 : 2).replace(/\.?0+$/, '')}L`;
    if (a >= 1000) return `${s}₹${Math.round(a / 1000)}k`;
    return `${s}₹${Math.round(a)}`;
  };
  const num = (x) => (x == null ? '–' : Math.round(x).toLocaleString('en-IN'));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, reducedMotion() ? Math.min(ms, 60) : ms));

  // Count a number up/down inside an element.
  function countTo(el, from, to, ms, fmt = num) {
    return new Promise((resolve) => {
      if (reducedMotion() || ms <= 0) { el.textContent = fmt(to); return resolve(); }
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / ms);
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (k < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  const DECISION_LABELS = {
    discount: { title: 'Discount', none: 'No discount', d10: '10% off', d30: '30% off' },
    ads: { title: 'Ad spend', none: 'No ads', small: 'Small · ₹15k', big: 'Big · ₹45k' },
    stock: { title: 'Ingredient stock', lean: 'Lean', right: 'Right-sized', heavy: 'Heavy' },
    staff: { title: 'Staff', keep: 'Keep team', add: 'Add a cook' },
    bonus: { title: 'Boardroom', take: 'Yes', skip: 'No' },
  };

  window.U = { inr, inrShort, num, esc, $, sleep, countTo, reducedMotion, DECISION_LABELS };
})();
