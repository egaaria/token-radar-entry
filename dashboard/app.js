/* Token Radar dashboard: a self-contained, no-network view over window.RADAR. */
(function dashboard() {
  'use strict';

  var data = window.RADAR;
  var mount = document.getElementById('board');
  if (!data || !mount) return;

  var state = { query: '', category: 'all', tab: 'pre-token', sort: 'implied', direction: -1, selected: null };
  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var model = data.model;

  function finite(value, fallback) { return typeof value === 'number' && isFinite(value) ? value : fallback; }
  function moneyText(value) {
    if (!isFinite(value)) return 'n/a';
    if (Math.abs(value) >= 1e9) return '$' + (value / 1e9).toFixed(2) + 'B';
    if (Math.abs(value) >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
    if (Math.abs(value) >= 1e3) return '$' + Math.round(value / 1e3) + 'K';
    return money.format(value);
  }
  function percent(value) { return value === null || value === undefined || !isFinite(value) ? 'n/a' : (value >= 0 ? '+' : '') + value.toFixed(1) + '%'; }
  function ageText(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function text(value, fallback) { return value === null || value === undefined || value === '' ? fallback : String(value); }
  function chains(row) { return row.chains && row.chains.length ? row.chains : ['chain unavailable']; }
  function category(row) { return text(row.category, 'Other'); }

  function node(tag, attrs) {
    var item = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (value === null || value === undefined) return;
      if (key === 'class') item.className = value;
      else if (key === 'content') item.textContent = value;
      else if (key.slice(0, 2) === 'on') item.addEventListener(key.slice(2), value);
      else item.setAttribute(key, value);
    });
    for (var i = 2; i < arguments.length; i++) append(item, arguments[i]);
    return item;
  }
  function append(parent, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) child.forEach(function (part) { append(parent, part); });
    else if (typeof child === 'string') parent.appendChild(document.createTextNode(child));
    else parent.appendChild(child);
  }
  function clear(element) { while (element.firstChild) element.removeChild(element.firstChild); }

  /* This is deliberately the same arithmetic documented in model.ts and carried by board.json. */
  function recompute(row) {
    var rawGrowth = finite(row.change_7d, 0);
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
    var growthMultiplier = 1 + growth / 100 * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days * model.maturity_range;
    var breadth = 1 + Math.min((row.chains || []).length, 5) * model.chain_weight;
    var implied = Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMultiplier * maturity * breadth));
    return { growth: growth, growthMultiplier: growthMultiplier, maturity: maturity, breadth: breadth, implied: implied };
  }
  function matches(row) {
    if (state.category !== 'all' && category(row) !== state.category) return false;
    var query = state.query.trim().toLowerCase();
    if (!query) return true;
    return [row.name, row.slug, category(row), chains(row).join(' ')].join(' ').toLowerCase().indexOf(query) >= 0;
  }
  function visibleRows() { return data.rows.filter(matches); }
  function valueFor(row, key) {
    if (key === 'name') return row.name.toLowerCase();
    if (key === 'tvl') return row.tvl_usd;
    if (key === 'growth') return row.change_7d === null ? -Infinity : row.change_7d;
    if (key === 'age') return row.age_days === null ? Infinity : row.age_days;
    if (key === 'signal') return row.signal_score;
    return row.implied_value_usd;
  }
  function sortedRows() {
    return visibleRows().slice().sort(function (left, right) {
      var a = valueFor(left, state.sort), b = valueFor(right, state.sort);
      if (a < b) return -1 * state.direction;
      if (a > b) return state.direction;
      return left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0;
    });
  }

  function readLocation() {
    var raw = window.location.hash.replace(/^#/, '');
    if (!raw) return;
    var params = new URLSearchParams(raw);
    if (params.get('q')) state.query = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeLocation() {
    var params = new URLSearchParams();
    if (state.query) params.set('q', state.query);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.selected) params.set('p', state.selected);
    var hash = params.toString();
    window.history.replaceState(null, '', hash ? '#' + hash : window.location.pathname + window.location.search);
  }
  function toggleSort(key) {
    if (state.sort === key) state.direction *= -1;
    else { state.sort = key; state.direction = -1; }
    render();
  }
  function sortButton(key, label) {
    var marker = state.sort === key ? (state.direction < 0 ? ' ↓' : ' ↑') : '';
    return node('th', { scope: 'col' }, node('button', { type: 'button', 'aria-label': 'Sort by ' + label, onclick: function () { toggleSort(key); } }, label + marker));
  }

  function masthead() {
    return node('header', { class: 'masthead' },
      node('a', { class: 'wordmark', href: '#top', content: 'TOKEN / RADAR' }),
      node('div', { class: 'mast-meta' },
        node('span', { class: 'chip', content: data.model_version }),
        node('span', { content: 'Snapshot ' + data.as_of }),
        node('span', { content: 'offline evidence board' })
      )
    );
  }
  function summary() {
    var facts = [
      ['Watchlist', data.watchlist_size + ' / ' + data.watchlist_size, 'floor coverage'],
      ['Ranked', String(data.board_size), 'pre-token rows'],
      ['Early radar', String(data.early_size), 'below TVL floor'],
      ['Set aside', String(data.live_size), 'live-token rows']
    ];
    return node('section', { class: 'summary', id: 'top' },
      node('div', { class: 'summary-copy' },
        node('p', { class: 'eyebrow', content: '01 / THE BOARD' }),
        node('h1', { content: 'Find the next protocol before the ticker.' }),
        node('p', { class: 'dek', content: 'A sealed snapshot of pre-token protocols, ranked by an explicit implied-value model. The watchlist is the floor; the early radar looks below it. Every row includes evidence, caveats and a concrete activity plan.' })
      ),
      node('dl', { class: 'facts' }, facts.map(function (fact) {
        return node('div', { class: 'fact' }, node('dt', { content: fact[0] }), node('dd', { content: fact[1] }), node('small', { content: fact[2] }));
      }))
    );
  }
  function controls() {
    var categories = Array.from(new Set(data.rows.map(category))).sort();
    var search = node('input', { id: 'search', type: 'search', value: state.query, placeholder: 'Name, slug or chain…', 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.query = search.value; writeLocation(); render(); });
    var select = node('select', { id: 'category', 'aria-label': 'Filter by category' }, node('option', { value: 'all', content: 'All categories' }));
    categories.forEach(function (item) { select.appendChild(node('option', { value: item, content: item, selected: item === state.category ? 'selected' : null })); });
    select.value = state.category;
    select.addEventListener('change', function () { state.category = select.value; writeLocation(); render(); });
    var pre = node('button', { type: 'button', class: state.tab === 'pre-token' ? 'active' : '', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', content: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = node('button', { type: 'button', class: state.tab === 'live' ? 'active' : '', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', content: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return node('section', { class: 'toolbar', 'aria-label': 'Board controls' },
      node('label', { class: 'control search-control' }, node('span', { content: 'Search' }), search),
      node('label', { class: 'control' }, node('span', { content: 'Category' }), select),
      node('div', { class: 'control' }, node('span', { content: 'View' }), node('div', { class: 'segmented' }, pre, live)),
      node('p', { class: 'result-count', content: state.tab === 'pre-token' ? sortedRows().length + ' matching rows' : data.live.length + ' live protocols' })
    );
  }

  function rankCell(row) {
    return node('td', { class: 'rank mono', content: String(row.rank).padStart(3, '0') });
  }
  function protocolCell(row) {
    return node('td', { class: 'protocol' }, node('strong', { content: row.name }), node('span', { content: category(row) + ' · ' + chains(row).slice(0, 3).join(', ') }));
  }
  function signalCell(row) {
    return node('td', { class: 'signal mono' }, node('b', { content: String(row.signal_score) }), node('span', { content: '/100' }));
  }
  function impliedCell(row, maximum) {
    var width = Math.max(4, Math.round(row.implied_value_usd / maximum * 100));
    return node('td', { class: 'implied' }, node('div', { class: 'value-track', 'aria-hidden': 'true' }, node('i', { style: 'width:' + width + '%' })), node('b', { class: 'mono', content: moneyText(row.implied_value_usd) }));
  }
  function openDetails(slug) {
    state.selected = slug;
    writeLocation();
    renderDetails(findRow(slug));
  }
  function boardTable() {
    var rows = sortedRows();
    if (!rows.length) return node('section', { class: 'empty panel' }, node('p', { class: 'eyebrow', content: 'NO MATCHES' }), node('h2', { content: 'The radar is quiet.' }), node('p', { content: 'Clear the query or choose another category.' }), node('button', { class: 'primary', type: 'button', content: 'Reset filters', onclick: function () { state.query = ''; state.category = 'all'; writeLocation(); render(); } }));
    var maximum = Math.max.apply(null, rows.map(function (row) { return row.implied_value_usd; })) || 1;
    var body = node('tbody');
    rows.forEach(function (row) {
      var growthClass = row.change_7d === null ? '' : row.change_7d >= 0 ? 'positive' : 'negative';
      body.appendChild(node('tr', { class: state.selected === row.slug ? 'chosen' : '', tabindex: '0', onclick: function () { openDetails(row.slug); }, onkeydown: function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetails(row.slug); } } },
        rankCell(row), protocolCell(row), node('td', { class: 'mono', content: moneyText(row.tvl_usd) }), node('td', { class: 'mono ' + growthClass, content: percent(row.change_7d) }), node('td', { class: 'mono', content: ageText(row.age_days) }), signalCell(row), impliedCell(row, maximum), node('td', { class: 'token-state', content: 'PRE-TOKEN' })
      ));
    });
    return node('section', { class: 'panel table-panel' }, node('div', { class: 'table-scroll' }, node('table', null,
      node('caption', { content: 'Select a row to inspect evidence, model recomputation and a farm plan.' }),
      node('thead', null, node('tr', null, sortButton('implied', 'Rank'), sortButton('name', 'Protocol'), sortButton('tvl', 'TVL'), sortButton('growth', '7d'), sortButton('age', 'Age'), sortButton('signal', 'Signal'), sortButton('implied', 'Implied'), node('th', { content: 'Status' }))), body
    )));
  }
  function liveTable() {
    var body = node('tbody');
    data.live.forEach(function (row) {
      body.appendChild(node('tr', null, node('td', { class: 'rank mono', content: 'LIVE' }), node('td', { class: 'protocol' }, node('strong', { content: row.name }), node('span', { content: category(row) + ' · ' + chains(row).slice(0, 3).join(', ') })), node('td', { class: 'mono', content: moneyText(row.tvl_usd) }), node('td', { class: 'mono ' + (row.change_7d >= 0 ? 'positive' : 'negative'), content: percent(row.change_7d) }), node('td', { class: 'mono', content: moneyText(row.mcap_usd) }), node('td', { class: 'token-state live-state', content: 'TRADES' })));
    });
    return node('section', { class: 'panel table-panel' }, node('div', { class: 'table-scroll' }, node('table', null, node('caption', { content: 'Live-token protocols are shown for context and excluded from the implied-value ranking.' }), node('thead', null, node('tr', null, node('th', { content: 'Status' }), node('th', { content: 'Protocol' }), node('th', { content: 'TVL' }), node('th', { content: '7d' }), node('th', { content: 'Market cap' }), node('th', { content: 'Token' }))), body)));
  }
  function modelNote() {
    return node('section', { class: 'model-note panel' }, node('div', null, node('p', { class: 'eyebrow', content: '02 / MODEL' }), node('h2', { content: 'One formula. No name-based exceptions.' }), node('p', { class: 'muted', content: 'The page recomputes each row from the same snapshot fields used to build board.json. If the numbers diverge, the data is stale.' })), node('code', { content: 'round(tvl × ' + model.base_multiple + ' × growth × maturity × chains)' }), node('p', { class: 'muted', content: 'Growth is clamped to ' + model.growth_floor + '%…' + model.growth_cap + '%. Age is capped at ' + model.maturity_days + ' days; missing age uses ' + model.unknown_age_days + ' days. The estimate is not a price.' }));
  }

  function findRow(slug) { return data.rows.filter(function (row) { return row.slug === slug; })[0] || null; }
  function farmPlan(row) {
    var chain = chains(row)[0];
    var capital = row.tvl_usd >= 5e9 ? 250 : row.tvl_usd >= 1e9 ? 150 : row.tvl_usd >= 1e8 ? 100 : 50;
    var hold = row.age_days === null ? 30 : row.age_days < 180 ? 60 : row.age_days < 365 ? 45 : 30;
    var kind = category(row).toLowerCase();
    var action = kind.indexOf('lend') >= 0 || kind.indexOf('cdp') >= 0 ? 'Supply $' + capital + ' of USDC to ' + row.name + ' on ' + chain + '.' : kind.indexOf('dex') >= 0 || kind.indexOf('yield') >= 0 ? 'Provide $' + capital + ' of liquidity to ' + row.name + ' on ' + chain + '.' : kind.indexOf('bridge') >= 0 ? 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + row.name + '.' : kind.indexOf('staking') >= 0 || kind.indexOf('restak') >= 0 ? 'Stake $' + capital + ' of the chain asset through ' + row.name + '.' : 'Deposit $' + capital + ' of USDC into ' + row.name + ' on ' + chain + '.';
    return [
      ['Prepare', 'Use a fresh wallet, keep its seed phrase offline.', 'under $3 gas · 5 minutes'],
      ['Qualify', action, '$' + capital + ' capital · about $' + (capital >= 150 ? 8 : 4) + ' gas · 15 minutes'],
      ['Repeat', 'Make one qualifying deposit, swap, vote or borrow each week.', 'about $2 gas per week · 10 minutes'],
      ['Hold', 'Keep the position open for at least ' + hold + ' days so activity spans multiple snapshots.', '$' + capital + ' remains deployed · ' + hold + ' days'],
      ['Verify', "Use only the protocol's published rewards page before claiming; never pay to claim.", 'no claim fee · 10 minutes'],
      ['Log', 'Record wallet, dates and transaction hashes so the position can be repeated or unwound.', 'free · 5 minutes']
    ];
  }
  function renderDetails(row) {
    var panel = document.getElementById('details');
    if (!row) { panel.hidden = true; panel.removeAttribute('open'); return; }
    clear(panel);
    var calc = recompute(row);
    var same = calc.implied === row.implied_value_usd;
    panel.appendChild(node('div', { class: 'detail-top' }, node('div', null, node('p', { class: 'eyebrow', content: 'ROW ' + String(row.rank).padStart(3, '0') + ' / ' + row.cohort }), node('h2', { content: row.name }), node('p', { class: 'muted', content: category(row) + ' · ' + chains(row).join(', ') })), node('button', { class: 'close', type: 'button', 'aria-label': 'Close details', content: '×', onclick: closeDetails })));
    panel.appendChild(node('section', { class: 'detail-section' }, node('h3', { content: 'Signal and recomputation' }), node('dl', { class: 'metrics' }, [['TVL', moneyText(row.tvl_usd)], ['7d momentum', percent(row.change_7d)], ['No-token age', ageText(row.age_days)], ['Signal score', row.signal_score + ' / 100'], ['Implied value', moneyText(row.implied_value_usd)]].map(function (pair) { return node('div', null, node('dt', { content: pair[0] }), node('dd', { class: 'mono', content: pair[1] })); })), node('div', { class: 'evidence' }, node('b', { content: row.cohort === 'watchlist' ? 'Watchlist evidence' : 'Early-radar evidence' }), node('ul', null, (row.evidence || []).map(function (item) { return node('li', { content: item }); })), node('p', { class: row.risk_flags && row.risk_flags.length ? 'caveat' : 'muted', content: row.risk_flags && row.risk_flags.length ? 'Caveats: ' + row.risk_flags.join(' · ') : 'No missing-field caveats in the sealed snapshot.' }))));
    panel.appendChild(node('p', { class: 'recompute ' + (same ? 'verified' : 'warning'), content: 'Recomputed ' + moneyText(calc.implied) + (same ? ' — matches board.json.' : ' — differs from board.json; data is stale.') + ' Multipliers: growth ' + calc.growthMultiplier.toFixed(3) + ', maturity ' + calc.maturity.toFixed(3) + ', chains ' + calc.breadth.toFixed(3) + '.' }));
    var steps = farmPlan(row);
    panel.appendChild(node('section', { class: 'detail-section' }, node('h3', { content: 'Concrete farm plan' }), node('ol', { class: 'farm-plan' }, steps.map(function (step) { return node('li', null, node('strong', { content: step[0] }), node('span', { content: step[1] }), node('small', { content: step[2] })); }))));
    panel.hidden = false;
    panel.setAttribute('open', '');
  }
  function closeDetails() { state.selected = null; writeLocation(); renderDetails(null); render(); }

  function render() {
    clear(mount);
    mount.appendChild(node('div', { class: 'shell' }, masthead(), summary(), controls(), state.tab === 'pre-token' ? boardTable() : liveTable(), state.tab === 'pre-token' ? modelNote() : null));
    mount.appendChild(node('dialog', { id: 'details', class: 'details', 'aria-label': 'Protocol details' }));
    if (state.selected) renderDetails(findRow(state.selected));
    mount.setAttribute('aria-busy', 'false');
  }

  readLocation();
  render();
  window.addEventListener('keydown', function (event) { if (event.key === 'Escape' && state.selected) closeDetails(); });
})();
