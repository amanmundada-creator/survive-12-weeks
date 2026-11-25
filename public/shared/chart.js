// The signature chart: Orders (rising) vs Cash in bank (falling), week by week.
(function () {
  const { inrShort, num } = window.U;

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / p;
    const n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
    return n * p;
  }

  // series: [{week, orders, cash}], opts: {weeks, goal, w, h, compare:[…], animate}
  function renderChart(el, series, opts) {
    const W = opts.w || 900, H = opts.h || 420;
    const pad = { l: 92, r: 104, t: 54, b: 52 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const weeks = Math.max(opts.weeks || 8, series.length - 1);
    const all = series.concat(opts.compare || []);
    const oMax = niceMax(Math.max(opts.goal ? opts.goal * 1.15 : 0, ...all.map((d) => d.orders || 0), 500));
    const cMax = niceMax(Math.max(600000, ...all.map((d) => d.cash || 0)));
    const x = (w) => pad.l + (w / weeks) * iw;
    const yo = (v) => pad.t + ih - (v / oMax) * ih;
    const yc = (v) => pad.t + ih - (Math.max(0, v) / cMax) * ih;
    const ordPts = series.filter((d) => d.orders != null).map((d) => [x(d.week), yo(d.orders)]);
    const cashPts = series.map((d) => [x(d.week), yc(d.cash)]);
    const path = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const danger = yc(100000);
    let g = '';
    // grid + axes
    for (let i = 0; i <= 4; i++) {
      const yy = pad.t + (ih * i) / 4;
      g += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${yy}" y2="${yy}" class="ch-grid"/>`;
      g += `<text x="${pad.l - 12}" y="${yy + 6}" text-anchor="end" class="ch-ax ch-ax-o">${num(oMax * (1 - i / 4))}</text>`;
      g += `<text x="${pad.l + iw + 12}" y="${yy + 6}" class="ch-ax ch-ax-c">${inrShort(cMax * (1 - i / 4))}</text>`;
    }
    for (let w = 0; w <= weeks; w++) g += `<text x="${x(w)}" y="${H - 18}" text-anchor="middle" class="ch-ax">${w === 0 ? 'Start' : 'W' + w}</text>`;
    g += `<rect x="${pad.l}" y="${danger}" width="${iw}" height="${pad.t + ih - danger}" class="ch-danger"/>`;
    g += `<text x="${pad.l + 10}" y="${pad.t + ih - 10}" class="ch-danger-t">Danger zone: under ₹1 lakh</text>`;
    if (opts.goal) g += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${yo(opts.goal)}" y2="${yo(opts.goal)}" class="ch-goal"/><text x="${pad.l + iw - 8}" y="${yo(opts.goal) - 8}" text-anchor="end" class="ch-goal-t">Goal ${num(opts.goal)} orders</text>`;
    if (opts.compare && opts.compare.length) {
      const co = opts.compare.filter((d) => d.orders != null).map((d) => [x(d.week), yo(d.orders)]);
      const cc = opts.compare.map((d) => [x(d.week), yc(d.cash)]);
      g += `<path d="${path(co)}" class="ch-line ch-o ch-ghost"/><path d="${path(cc)}" class="ch-line ch-c ch-ghost"/>`;
    }
    g += `<path d="${path(ordPts)}" class="ch-line ch-o ${opts.animate ? 'ch-draw' : ''}" pathLength="1"/>`;
    g += `<path d="${path(cashPts)}" class="ch-line ch-c ${opts.animate ? 'ch-draw' : ''}" pathLength="1"/>`;
    ordPts.forEach((p) => (g += `<circle cx="${p[0]}" cy="${p[1]}" r="6" class="ch-dot ch-o-dot"/>`));
    cashPts.forEach((p) => (g += `<circle cx="${p[0]}" cy="${p[1]}" r="6" class="ch-dot ch-c-dot"/>`));
    // direct labels at line ends (not colour-only)
    const lo = ordPts[ordPts.length - 1], lc = cashPts[cashPts.length - 1];
    const lastO = series.filter((d) => d.orders != null).slice(-1)[0];
    const lastC = series[series.length - 1];
    const lab = (p, dy, cls, text) => {
      const right = p[0] > W - pad.r - 180;
      return `<text x="${right ? p[0] - 12 : p[0] + 12}" y="${p[1] + dy}" text-anchor="${right ? 'end' : 'start'}" class="ch-lab ${cls}">${text}</text>`;
    };
    const sep = lo && lc && Math.abs(lo[1] - lc[1]) < 40 ? (lo[1] < lc[1] ? [-16, 34] : [34, -16]) : [-16, 34];
    if (lo) g += lab(lo, sep[0], 'ch-o-lab', `▲ Orders ${num(lastO.orders)}`);
    if (lc) g += lab(lc, sep[1], 'ch-c-lab', `● Cash ${inrShort(lastC.cash)}`);
    g += `<text x="${pad.l - 80}" y="${pad.t - 26}" class="ch-ax-title ch-o-lab">▲ Orders / week</text>`;
    g += `<text x="${pad.l + iw + 100}" y="${pad.t - 26}" text-anchor="end" class="ch-ax-title ch-c-lab">Cash in bank ●</text>`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Orders per week versus cash in bank">${g}</svg>`;
  }

  window.Chart2 = { renderChart };
})();
