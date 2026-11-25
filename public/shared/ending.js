// Ending screen + balance sheet renderer (host screen and /ending-preview).
(function () {
  const { inr, num, esc } = window.U;

  const ROWS = {
    assets: [
      ['cash', 'Cash in bank', 'Cash'],
      ['receivable', 'Money owed by ZipEats', 'Receivable'],
      ['inventory', 'Ingredients in stock', 'Inventory'],
      ['equipment', 'Kitchen equipment, after wear and tear', 'Fixed assets (net)'],
    ],
    liabilities: [
      ['bridgeLoan', 'Bridge loan', 'Borrowings'],
      ['emergencyLoan', 'Emergency rescue loan', 'Borrowings'],
      ['interestOwed', 'Interest owed', 'Accrued interest'],
      ['unpaidBills', 'Unpaid bills: rent, staff, suppliers', 'Payables'],
    ],
    equity: [
      ['ownerCapital', 'Owner’s money put in', 'Owner’s capital'],
      ['retained', 'Profit / loss so far', 'Retained earnings'],
      ['funding', 'Investor funding', 'Share capital raised'],
    ],
  };

  function sheetHtml(sheet, opts = {}) {
    const marks = {};
    (opts.callouts || []).forEach((c, i) => { if (!marks[c.key]) marks[c.key] = i + 1; });
    const row = (group, [k, label, term]) => {
      const v = sheet[group][k] || 0;
      if (k === 'funding' && !v) return '';
      if (opts.compact && !v && group === 'liabilities') return '';
      const bad = (k === 'unpaidBills' && v > 0) || (k === 'retained' && v < 0);
      const zeroCash = k === 'cash' && opts.bankrupt;
      const mark = marks[k] ? `<span class="mark">${marks[k]}</span>` : '';
      return `<div class="bs-row ${bad || zeroCash ? 'bad' : ''} ${!v ? 'zero' : ''} ${marks[k] ? 'marked' : ''}"><div class="bs-lab">${mark}${esc(label)}<small>${esc(term)}</small></div><div class="bs-val">${inr(v)}</div></div>`;
    };
    const tick = sheet.balanced ? '<span class="bs-tick" title="Both sides match">✓ balances</span>' : '<span class="bs-tick bad">✗</span>';
    return `<div class="bs ${opts.compact ? 'bs-compact' : ''}">
      <div class="bs-col">
        <h4>What the kitchen has <small>Assets</small></h4>
        ${ROWS.assets.map((r) => row('assets', r)).join('')}
        <div class="bs-total"><div>Total</div><div>${inr(sheet.totalAssets)}</div></div>
      </div>
      <div class="bs-eq" aria-hidden="true">=</div>
      <div class="bs-col">
        <h4>What it owes <small>Liabilities</small></h4>
        ${ROWS.liabilities.map((r) => row('liabilities', r)).join('')}
        <h4 class="bs-h-eq">Owner’s side <small>Equity</small></h4>
        ${ROWS.equity.map((r) => row('equity', r)).join('')}
        <div class="bs-total"><div>Total ${tick}</div><div>${inr(sheet.totalLiabilities + sheet.totalEquity)}</div></div>
      </div>
    </div>`;
  }

  const ART = {
    truck: '🚚', tag: '🏷️', megaphone: '📣', chain: '⛓️', drip: '💧', gauge: '⛽', fridge: '🧊', snail: '🐌', sprout: '🌱', rocket: '🚀',
  };

  // data: { content, sheet, chart, comparison, stats, podium, goal, weeks }
  // step 0: title + balance sheet + callouts; 1: chart + CFO; 2: smarter path + crowd
  function renderEnding(root, data, step = 0) {
    const c = data.content;
    const bankrupt = c.bankrupt;
    const steps = [
      () => `
        <div class="end-grid end-sheet">
          <div class="end-left">
            <div class="end-badge">Ending ${c.n} of 10</div>
            <div class="end-art">${ART[c.art] || '🍛'}</div>
            <h1 class="end-title">${esc(c.title)}</h1>
            <p class="end-tag">“${esc(c.tagline)}”</p>
            <ol class="callouts">${c.callouts.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ol>
          </div>
          <div class="end-right">
            <h3 class="sec">Balance sheet at the end ${bankrupt ? '<span class="pill red">Closed</span>' : ''}</h3>
            ${sheetHtml(data.sheet, { callouts: c.callouts, bankrupt })}
          </div>
        </div>`,
      () => `
        <div class="end-grid end-chart">
          <div class="end-chart-box"><h3 class="sec">Orders vs cash, week by week</h3><div id="end-chart"></div></div>
          <div class="cfo">
            <div class="cfo-who">🧑‍💼 What a CFO would say</div>
            ${c.cfo.map((x) => `<p>${esc(x)}</p>`).join('')}
          </div>
        </div>`,
      () => {
        const s = data.stats || {};
        const names = s.names || {};
        const pct = (x) => (x == null ? '–' : Math.round(x * 100) + '%');
        const cmp = data.comparison;
        return `
        <div class="end-grid end-compare">
          <div class="cmp">
            <h3 class="sec">Same kitchen, different choices</h3>
            <p class="cmp-sub">Same weeks, same events, same luck. Played the careful-growth way (10% off, small ads, right-sized stock, hire only when full):</p>
            <div class="cmp-cols">
              <div class="cmp-col theme-${c.theme}"><div class="cmp-h">You: <b>${esc(c.title)}</b></div>${miniSheet(data.sheet)}</div>
              <div class="cmp-col theme-${cmp.theme}"><div class="cmp-h">Careful path: <b>${esc(cmp.title)}</b></div>${miniSheet(cmp.sheet)}</div>
            </div>
          </div>
          <div class="crowd">
            <h3 class="sec">The room</h3>
            <div class="stat"><b>${pct(s.roomAccuracy)}</b><span>of predictions were right</span></div>
            <div class="stat"><b>${esc(names[s.mostTrusted] || '–')}</b><span>the advisor you followed most</span></div>
            <div class="stat"><b>${esc(names[s.mostRight] || '–')}</b><span>the advisor who was right most often</span></div>
            <h3 class="sec">Sharpest forecasters</h3>
            <div class="podium">${(data.podium || []).map((p, i) => `<div class="pod pod${i + 1}"><div class="pod-medal">${['🥇', '🥈', '🥉'][i]}</div><div class="pod-nick">${esc(p.nick)}</div><div class="pod-score">${num(p.score)} pts</div></div>`).join('') || '<p class="muted">No players</p>'}</div>
          </div>
        </div>`;
      },
    ];
    root.className = `ending theme-${c.theme} step-${step}`;
    root.innerHTML = `<div class="end-step">${steps[Math.min(step, steps.length - 1)]()}</div>
      <div class="end-dots">${steps.map((_, i) => `<span class="${i === step ? 'on' : ''}"></span>`).join('')}</div>`;
    if (step === 1 && window.Chart2) {
      window.Chart2.renderChart(document.getElementById('end-chart'), data.chart, { weeks: data.weeks, goal: data.goal, w: 1100, h: 560, compare: data.comparison && data.comparison.history });
      const leg = document.createElement('div');
      leg.className = 'ch-legend';
      leg.innerHTML = '<span class="lg-o">▲ Orders</span><span class="lg-c">● Cash in bank</span><span class="lg-g">Faint lines: the careful path</span>';
      document.getElementById('end-chart').appendChild(leg);
    }
    return steps.length;
  }

  function miniSheet(sh) {
    const loans = sh.liabilities.bridgeLoan + sh.liabilities.emergencyLoan;
    const rows = [
      ['Cash in bank', sh.assets.cash],
      ['Owed by ZipEats', sh.assets.receivable],
      ['Ingredients in stock', sh.assets.inventory],
      ['Loans', loans],
      ['Unpaid bills', sh.liabilities.unpaidBills],
      ['Profit / loss so far', sh.equity.retained],
      ['Investor funding', sh.equity.funding],
    ].filter((r, i) => i < 3 || r[1]);
    return `<div class="mini">${rows.map(([l, v]) => `<div class="mini-row ${v < 0 || (l === 'Unpaid bills' && v > 0) ? 'bad' : ''}"><span>${l}</span><b>${inr(v)}</b></div>`).join('')}</div>`;
  }

  window.Ending = { renderEnding, sheetHtml };
})();
