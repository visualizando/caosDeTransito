/* Caos de Tránsito CABA — Dashboard D3 v2
   Fixes: filtro por categoría del top, % de participación correcto,
   campos motivo_norm, rejillas, leyendas, fuentes y notación de ejes. */
const B = {
  home: location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? '' : '/caosDeTransito'
};

const COLORS = {
  velocidad: '#2563eb', estacionamiento: '#d97706', peajes: '#dc2626',
  carrera: '#7c3aed', documentacion: '#94a3b8', alcohol: '#dc2626',
  alcohol_otros: '#f87171', otras: '#cbd5e1'
};
const CAT_LABEL = {
  velocidad: 'Velocidad', estacionamiento: 'Estacionamiento', peajes: 'Peaje / Autopista',
  carriles: 'Carriles / Zonas', documentacion: 'Documentación', alcohol: 'Alcohol',
  alcohol_otros: 'Alcohol / Otros', otras: 'Otras'
};
const CAT_ORDER = ['velocidad', 'estacionamiento', 'peajes', 'carriles', 'alcohol', 'alcohol_otros', 'documentacion', 'otras'];

const fmt = n => n.toLocaleString('es-AR');
const fmtShort = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 10e6 ? 0 : 1) + ' M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 100e3 ? 0 : 1) + ' k' : String(n);
const pct = n => (n * 100).toFixed(1) + '%';
const MOIS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad2 = n => String(n).padStart(2, '0');

const tipEl = d3.select('#tip');
function showTip(html, x, y) {
  tipEl.html(html).style('opacity', 1).style('left', (x + 14) + 'px').style('top', (y + 14) + 'px');
}
function hideTip() { tipEl.style('opacity', 0); }
function attachTip(sel, fmtf) {
  sel.on('mousemove', function (event, d) {
    const t = Array.isArray(d) ? d[d.length - 1] : (d.target || d);
    showTip(fmtf(t), event.clientX, event.clientY);
  }).on('mouseleave', hideTip);
}

const MARGIN = { top: 18, right: 96, bottom: 46, left: 82 };
function chartSize(id) {
  const el = document.getElementById(id);
  return { w: Math.max(el.clientWidth, 300), h: 400 };
}

function baseChart(id) {
  d3.select('#' + id).selectAll('*').remove();
  const { w, h } = chartSize(id);
  const svg = d3.select('#' + id).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%');
  const inner = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
  const iw = w - MARGIN.left - MARGIN.right, ih = h - MARGIN.top - MARGIN.bottom;
  return { svg, inner, iw, ih };
}

function gridX(inner, y, iw) {
  inner.append('g').call(d3.axisLeft(y).ticks(6).tickSize(-iw)).attr('class', 'grid');
}
function gridY(inner, x, ih) {
  inner.append('g').call(d3.axisBottom(x).ticks(6).tickSize(-ih)).attr('class', 'grid').attr('transform', `translate(0,${ih})`);
}
function axisLabel(inner, text, iw, ih) {
  inner.append('text').attr('class', 'axislabel').attr('text-anchor', 'middle')
    .attr('transform', `translate(${-MARGIN.left + 8},${ih / 2}) rotate(-90)`)
    .text(text);
}

let DATA;
d3.json(B.home + '/data/data.json').then(d => { DATA = d; init(); })
  .catch(e => {
    document.getElementById('meta-info').textContent = 'Error al cargar datos: ' + e.message;
    console.error(e);
  });

function init() {
  const meta = DATA.metadata;
  document.getElementById('meta-info').textContent =
    `Generado: ${new Date(meta.generated_at).toLocaleDateString('es-AR')} · Período ${meta.period} · Acarreos ${meta.acarreos_period}`;
  renderKpis();
  bindTotales();
  bindCategoria();
  bindTop();
  bindAlcohol();
  bindAcarreos();
  bindExplorador();
}

/* ================= KPIs ================= */
function renderKpis() {
  const k = DATA.kpis_anuales;
  const last = k[k.length - 1];
  const prev = k[k.length - 2];
  const delta = (c) => {
    const sign = c >= 0 ? '+' : '';
    const cls = c > 0 ? 'up' : c < 0 ? 'down' : 'flat';
    return `<div class="delta ${cls}">${sign}${fmt(c)} vs ${prev.anio}</div>`;
  };
  const kpis = [
    { label: 'Actas 2025', val: fmt(last.infracciones_total), d: delta(last.infracciones_total - prev.infracciones_total) },
    { label: 'Procesadas', val: fmt(last.actas_procesadas), d: delta(last.actas_procesadas - prev.actas_procesadas) },
    { label: 'Resueltas', val: last.actas_resueltas != null ? fmt(last.actas_resueltas) : 'n/d', d: (last.actas_resueltas != null && prev.actas_resueltas != null) ? delta(last.actas_resueltas - prev.actas_resueltas) : '' },
    { label: 'Alcohol (infr.)', val: fmt(last.infracciones_alcohol), d: delta(last.infracciones_alcohol - prev.infracciones_alcohol) },
    { label: 'Velocidad', val: fmt(last.infracciones_velocidad), d: pct(last.infracciones_velocidad / last.infracciones_total) + ' del total' },
    { label: 'Evasión de peaje', val: fmt(last.infracciones_peaje), d: pct(last.infracciones_peaje / last.infracciones_total) + ' del total' },
    { label: 'Acarreos 2025', val: fmt(last.acarreos), d: delta(last.acarreos - prev.acarreos) },
    { label: 'Tasa resolución', val: pct(last.actas_resueltas / last.actas_procesadas), d: `${fmt(last.actas_procesadas - last.actas_resueltas)} sin resolver` },
  ];
  d3.select('#kpis').selectAll('.kpi').data(kpis).join('div').attr('class', 'kpi')
    .html(d => `<div class="label">${d.label}</div><div class="val">${d.val}</div>${d.d}`);
}

function setLegend(id, items) {
  d3.select('#' + id).html('');
  d3.select('#' + id).selectAll('.item').data(items).join('div').attr('class', 'item')
    .html(d => `<span class="sw" style="background:${d.c}"></span>${d.l}`);
}

/* ================= Gráfico 1: Totales ================= */
function bindTotales() {
  const TITLES = { total: 'Infracciones totales por año', proc: 'Actas procesadas vs resueltas por año', fotos: 'Actas por fotomultas vs manuales por año' };
  const SUBT = { total: 'Todo tipo de acta registrada', proc: 'Diferencia por fecha de registro', fotos: 'Radarización creciente desde 2021' };
  const mode = { v: 'total' };
  d3.select('#tab-totales').selectAll('.tab').on('click', function () {
    d3.select('#tab-totales').selectAll('.tab').classed('active', false);
    d3.select(this).classed('active', true);
    mode.v = d3.select(this).attr('data-mode');
    renderTotales(mode.v);
  });
  window._renderTotales = m => renderTotales(m || mode.v);
  renderTotales('total');

  function renderTotales(m) {
    const { svg, inner, iw, ih } = baseChart('viz-totales');
    const d3_tool = inner;
    d3.select('#t-totales').text(TITLES[m]);
    d3.select('#sub-totales').text(SUBT[m]);
    setLegend('legend-totales', []);

    const kp = DATA.kpis_anuales;
    const x = d3.scaleBand().domain(kp.map(d => d.anio)).range([0, iw]).padding(0.32);

    if (m === 'total') {
      setLegend('legend-totales', [{ c: '#0f766e', l: 'Infracciones' }]);
      const y = d3.scaleLinear().domain([0, d3.max(kp, d => d.infracciones_total) * 1.08]).range([ih, 0]);
      gridX(inner, y, iw);
      inner.append('g').call(d3.axisBottom(x).tickFormat(d => d)).attr('transform', `translate(0,${ih})`).attr('class', 'axis');
      inner.append('g').call(d3.axisLeft(y).ticks(6).tickFormat(fmtShort)).attr('class', 'axis');
      axisLabel(inner, 'Actas', iw, ih);
      inner.selectAll('.bar').data(kp).join('rect')
        .attr('x', d => x(d.anio)).attr('width', x.bandwidth())
        .attr('y', d => y(d.infracciones_total)).attr('height', d => ih - y(d.infracciones_total))
        .attr('fill', 'url(#g-total)').attr('rx', 3)
        .call(attachTip, d => `<div class="t-title">${d.anio}</div><div class="t-row">Infracciones: <span class="t-val">${fmt(d.infracciones_total)}</span></div>`);
      inner.selectAll('.vl')
        .data(kp).join('text')
        .attr('x', d => x(d.anio) + x.bandwidth() / 2).attr('y', d => y(d.infracciones_total) - 6)
        .attr('text-anchor', 'middle').attr('class', 'barlabel')
        .text(d => fmtShort(d.infracciones_total));
    } else if (m === 'proc') {
      setLegend('legend-totales', [{ c: '#2563eb', l: 'Procesadas' }, { c: '#059669', l: 'Resueltas' }]);
      const y = d3.scaleLinear().domain([0, d3.max(kp, d => Math.max(d.actas_procesadas, d.actas_resueltas || 0)) * 1.08]).range([ih, 0]);
      gridX(inner, y, iw);
      inner.append('g').call(d3.axisBottom(x).tickFormat(d => d)).attr('transform', `translate(0,${ih})`).attr('class', 'axis');
      inner.append('g').call(d3.axisLeft(y).ticks(6).tickFormat(fmtShort)).attr('class', 'axis');
      axisLabel(inner, 'Actas', iw, ih);
      inner.selectAll('.bar-p').data(kp).join('rect')
        .attr('x', d => x(d.anio)).attr('width', x.bandwidth() * 0.46)
        .attr('y', d => y(d.actas_procesadas)).attr('height', d => ih - y(d.actas_procesadas))
        .attr('fill', '#2563eb').attr('rx', 3)
        .call(attachTip, d => `<div class="t-title">${d.anio}</div><div class="t-row">Procesadas: <span class="t-val">${fmt(d.actas_procesadas)}</span></div>`);
      inner.selectAll('.bar-r').data(kp.filter(d => d.actas_resueltas != null)).join('rect')
        .attr('x', d => x(d.anio) + x.bandwidth() * 0.54).attr('width', x.bandwidth() * 0.46)
        .attr('y', d => y(d.actas_resueltas)).attr('height', d => ih - y(d.actas_resueltas))
        .attr('fill', '#059669').attr('rx', 3)
        .call(attachTip, d => `<div class="t-title">${d.anio}</div><div class="t-row">Resueltas: <span class="t-val">${fmt(d.actas_resueltas)}</span></div>`);
    } else {
      setLegend('legend-totales', [{ c: '#2563eb', l: 'Fotos' }, { c: '#0f766e', l: 'Manuales' }]);
      const ap = DATA.actas_procesadas_anual;
      const y = d3.scaleLinear().domain([0, d3.max(ap, d => d.total) * 1.08]).range([ih, 0]);
      gridX(inner, y, iw);
      inner.append('g').call(d3.axisBottom(x).tickFormat(d => d)).attr('transform', `translate(0,${ih})`).attr('class', 'axis');
      inner.append('g').call(d3.axisLeft(y).ticks(6).tickFormat(fmtShort)).attr('class', 'axis');
      axisLabel(inner, 'Actas', iw, ih);
      inner.selectAll('.bar-f').data(ap).join('rect')
        .attr('x', d => x(d.anio)).attr('width', x.bandwidth() * 0.46)
        .attr('y', d => y(d.fotos)).attr('height', d => ih - y(d.fotos))
        .attr('fill', '#2563eb').attr('rx', 3)
        .call(attachTip, d => `<div class="t-title">${d.anio}</div><div class="t-row">Fotos: <span class="t-val">${fmt(d.fotos)} · ${pct(d.fotos / d.total)}</span></div>`);
      inner.selectAll('.bar-m').data(ap).join('rect')
        .attr('x', d => x(d.anio) + x.bandwidth() * 0.54).attr('width', x.bandwidth() * 0.46)
        .attr('y', d => y(d.manuales)).attr('height', d => ih - y(d.manuales))
        .attr('fill', '#0f766e').attr('rx', 3)
        .call(attachTip, d => `<div class="t-title">${d.anio}</div><div class="t-row">Manuales: <span class="t-val">${fmt(d.manuales)} · ${pct(d.manuales / d.total)}</span></div>`);
    }
    void d3_tool;
    const defs = svg.append('defs');
    const gr = defs.append('linearGradient').attr('id', 'g-total').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
    gr.append('stop').attr('offset', '0%').attr('stop-color', '#0f766e');
    gr.append('stop').attr('offset', '100%').attr('stop-color', '#14b8a6');
  }
}

/* ================= Gráfico 2: Categorías ================= */
function bindCategoria() {
  const mode = { v: 'stack' };
  const cats = [...new Set(DATA.infracciones_anual_categoria.map(d => d.categoria))]
    .filter(c => CAT_ORDER.includes(c)).sort((a, b) => CAT_ORDER.indexOf(a) - CAT_ORDER.indexOf(b));

  d3.select('#tab-cat').selectAll('.tab').on('click', function () {
    d3.select('#tab-cat').selectAll('.tab').classed('active', false);
    d3.select(this).classed('active', true);
    mode.v = d3.select(this).attr('data-mode');
    renderCat(mode.v);
  });
  renderCat('stack');

  function renderCat(m) {
    const { inner, iw, ih } = baseChart('viz-cat');
    d3.select('#sub-cat').text(m === 'stack' ? 'Millones de actas por año' : 'Participación de cada categoría sobre el total del año');

    const años = [...new Set(DATA.infracciones_anual_categoria.map(d => d.anio))].sort();
    const stack = {};
    años.forEach(a => { stack[a] = {}; CAT_ORDER.forEach(c => stack[a][c] = 0); });
    DATA.infracciones_anual_categoria.forEach(d => { if (stack[d.anio]) stack[d.anio][d.categoria] = d.total; });
    const rows = años.map(a => ({ anio: a, total: CAT_ORDER.reduce((s, c) => s + stack[a][c], 0), ...stack[a] }));

    const x = d3.scaleBand().domain(años).range([0, iw]).padding(0.3);
    const y = m === 'stack'
      ? d3.scaleLinear().domain([0, d3.max(rows, r => r.total) * 1.08]).range([ih, 0])
      : d3.scaleLinear().domain([0, 1]).range([ih, 0]);

    gridX(inner, y, iw);
    gridY(inner, x, ih);
    inner.append('g').call(d3.axisBottom(x).tickFormat(d => d)).attr('transform', `translate(0,${ih})`).attr('class', 'axis');
    inner.append('g').call(d3.axisLeft(y).ticks(6).tickFormat(m === 'stack' ? fmtShort : d => pct(d))).attr('class', 'axis');
    axisLabel(inner, m === 'stack' ? 'Actas' : '% del total', iw, ih);

    const visible = cats.filter(c => rows.some(r => r[c] > 0));
    let prevLayer = rows.map(() => 0);
    visible.forEach(cat => {
      inner.selectAll('.bar-' + cat).data(rows).join('rect')
        .attr('x', d => x(d.anio)).attr('width', x.bandwidth())
        .attr('y', (d, i) => y(prevLayer[i] + (m === 'stack' ? d[cat] : d[cat] / d.total)))
        .attr('height', (d, i) => m === 'stack' ? ih - y(d[cat]) : (d[cat] / d.total) * ih)
        .attr('fill', COLORS[cat] || '#888').attr('opacity', 0.92)
        .call(attachTip, d => `<div class="t-title">${d.anio} · ${CAT_LABEL[cat]}</div><div class="t-row">${fmt(d[cat])}</div><div class="t-row">${pct(d[cat] / d.total)} del total</div>`);
      prevLayer = rows.map((d, i) => prevLayer[i] + (m === 'stack' ? d[cat] : d[cat] / d.total));
    });
  }
}

/* ================= Gráfico 3: Top códigos ================= */
function bindTop() {
  const VAR_FILTER = {
    total: { label: 'Total', cats: null },
    alcohol: { label: 'Alcohol', cats: ['alcohol', 'alcohol_otros'] },
    velocidad: { label: 'Velocidad', cats: ['velocidad'] },
    peaje: { label: 'Peaje', cats: ['peajes'] }
  };
  const state = { year: 2025, var: 'total' };

  const yearSlider = document.getElementById('top-year');
  yearSlider.value = 2025;
  yearSlider.addEventListener('input', () => {
    state.year = +yearSlider.value;
    document.getElementById('top-year-val').textContent = state.year;
    renderTop();
  });

  d3.select('#top-var').selectAll('.vbtn').data(Object.entries(VAR_FILTER)).join('button')
    .attr('class', d => 'vbtn' + (d[0] === 'total' ? ' active' : ''))
    .text(d => d[1].label)
    .on('click', function (e, d) {
      d3.select('#top-var').selectAll('.vbtn').classed('active', false);
      d3.select(this).classed('active', true);
      state.var = d[0];
      renderTop();
    });

  const rowsByYear = {};
  DATA.serie_por_codigo.forEach(r => {
    const y = +r.anio;
    if (!rowsByYear[y]) rowsByYear[y] = [];
    rowsByYear[y].push({ codigo: r.codigo, descripcion: r.descripcion, categoria: r.categoria, total: +r.total });
  });

  renderTop();

  function renderTop() {
    const vf = VAR_FILTER[state.var];
    let rows = (rowsByYear[state.year] || []).slice();
    if (vf.cats) rows = rows.filter(r => vf.cats.includes(r.categoria));
    rows.sort((a, b) => b.total - a.total);
    const n = Math.min(20, rows.length);
    document.getElementById('t-top').textContent = `Top ${n} código${n === 1 ? '' : 's'} · ${vf.label} · ${state.year}`;
    renderTopFrom(rows, n);
  }
}

function renderTopFrom(rows, n) {
  const { inner, iw, ih } = baseChart('viz-top');
  const data = rows.slice(0, n);
  const y = d3.scaleBand().domain(data.map(d => d.descripcion)).range([0, ih]).padding(0.28);
  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.total) * 1.08]).range([0, iw]);

  inner.append('g').call(d3.axisBottom(x).ticks(6).tickFormat(fmtShort)).attr('class', 'axis').attr('transform', `translate(0,${ih})`);
  inner.selectAll('.hbar').data(data).join('rect')
    .attr('y', d => y(d.descripcion)).attr('height', y.bandwidth())
    .attr('x', 0).attr('width', d => x(d.total))
    .attr('fill', d => COLORS[d.categoria] || '#cbd5e1').attr('rx', 2)
    .call(attachTip, d => `<div class="t-title">Código ${d.codigo}</div><div class="t-row">${d.descripcion}</div><div class="t-row">Categoría: ${CAT_LABEL[d.categoria] || d.categoria}</div><div class="t-row">Total: <span class="t-val">${fmt(d.total)}</span></div>`);
  inner.selectAll('.lbl').data(data).join('text')
    .attr('x', d => x(d.total) + 6).attr('y', d => y(d.descripcion) + y.bandwidth() / 2 + 4)
    .attr('class', 'barlabel')
    .text(d => d.total >= 1e6 ? (d.total / 1e6).toFixed(1) + ' M' : fmt(d.total));
}

/* ================= Alcohol ================= */
function bindAlcohol() {
  const kp = DATA.kpis_anuales;
  {
    const { inner, iw, ih } = baseChart('viz-alcohol');
    const x = d3.scaleBand().domain(kp.map(d => d.anio)).range([0, iw]).padding(0.3);
    const y = d3.scaleLinear().domain([0, d3.max(kp, d => d.infracciones_alcohol) * 1.15]).range([ih, 0]);
    gridX(inner, y, iw);
    inner.append('g').call(d3.axisBottom(x).tickFormat(d => d)).attr('transform', `translate(0,${ih})`).attr('class', 'axis');
    inner.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(fmtShort)).attr('class', 'axis');
    axisLabel(inner, 'Actas', iw, ih);
    inner.selectAll('.alcbar').data(kp).join('rect')
      .attr('x', d => x(d.anio)).attr('width', x.bandwidth())
      .attr('y', d => y(d.infracciones_alcohol)).attr('height', d => ih - y(d.infracciones_alcohol))
      .attr('fill', d => d.anio >= 2022 ? '#dc2626' : '#94a3b8').attr('rx', 3)
      .attr('data-y', d => d.anio)
      .call(attachTip, d => `<div class="t-title">${d.anio}</div><div class="t-row">Infracciones de alcohol: <span class="t-val">${fmt(d.infracciones_alcohol)}</span></div>`);
    inner.selectAll('.vl-alc').data(kp).join('text')
      .attr('x', d => x(d.anio) + x.bandwidth() / 2).attr('y', d => y(d.infracciones_alcohol) - 6)
      .attr('text-anchor', 'middle').attr('class', 'barlabel').text(d => fmtShort(d.infracciones_alcohol));
  }

  const rows = (DATA.alcohol_por_anio || []).map(r => ({ codigo: r.codigo, descripcion: r.descripcion || '', anio: +r.anio, total: +r.total }));
  const codeByName = (codes) => {
    const map = {};
    codes.forEach(c => { if (!map[c.codigo]) map[c.codigo] = c; });
    return Object.values(map);
  };
  const uniq = codeByName(rows).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const pal = { '7462': '#dc2626', '7463': '#0f766e', '7464': '#7c3aed', '9771': '#94a3b8', '9772': '#94a3b8', '7062': '#2563eb' };
  const shortDesc = c => {
    const d = (c.descripcion || '').replace(/^Conducir con nivel alcohol /, '');
    if (c.codigo === '7062') return 'Negarse al control';
    if (/0\.5/.test(d)) return 'Autos 0,5–1 g/L';
    if (/Moto/.test(d)) return 'Motos 0,2–1 g/L';
    if (/Tte Pasajeros|Carga/.test(d)) return 'Transporte >0 g/L';
    return d.slice(0, 38) || c.codigo;
  };
  setLegend('legend-alcohol', uniq.map(c => ({ c: pal[c.codigo] || '#888', l: `${c.codigo} · ${shortDesc(c)}` })));

  renderCodeDetail(rows);

  function renderCodeDetail(rows) {
    const { inner, iw, ih } = baseChart('viz-alcohol-det');
    const años = [...new Set(rows.map(d => d.anio))].sort();
    if (!años.length) return;
    const x = d3.scaleLinear().domain(d3.extent(años)).range([0, iw]);
    const y = d3.scaleLinear().domain([0, d3.max(rows, d => d.total) * 1.15]).range([ih, 0]);
    gridX(inner, y, iw);
    gridY(inner, x, ih);
    inner.append('g').call(d3.axisBottom(x).ticks(10).tickFormat(d => d)).attr('transform', `translate(0,${ih})`).attr('class', 'axis');
    inner.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(fmtShort)).attr('class', 'axis');
    axisLabel(inner, 'Actas', iw, ih);
    const codes = [...new Set(rows.map(d => d.codigo))];
    codes.forEach(c => {
      const cd = rows.filter(r => r.codigo === c).sort((a, b) => a.anio - b.anio);
      inner.append('path').datum(cd)
        .attr('d', d3.line().x(d => x(d.anio)).y(d => y(d.total)).defined(d => d.total !== null).curve(d3.curveMonotoneX))
        .attr('class', 'line').attr('stroke', pal[c] || '#888')
        .attr('stroke-width', 2.5);
      inner.selectAll('.dot-' + c).data(cd).join('circle')
        .attr('cx', d => x(d.anio)).attr('cy', d => y(d.total)).attr('r', 4.5)
        .attr('fill', pal[c] || '#888').attr('stroke', '#fff').attr('stroke-width', 1.5)
        .call(attachTip, d => `<div class="t-title">Código ${c}</div><div class="t-row">${d.anio}: <span class="t-val">${fmt(d.total)}</span></div>`);
    });
  }
}

/* ================= Acarreos ================= */
function bindAcarreos() {
  const mode = { v: 'mensual' };
  const motivos = [...new Set(DATA.acarreos_anual_motivo.map(d => d.motivo))].sort();
  const MCOL = d3.scaleOrdinal(d3.schemeTableau10).domain(motivos);

  d3.select('#tab-acarreos').selectAll('.tab').on('click', function () {
    d3.select('#tab-acarreos').selectAll('.tab').classed('active', false);
    d3.select(this).classed('active', true);
    mode.v = d3.select(this).attr('data-mode');
    renderA(mode.v);
  });
  renderA('mensual');

  function setLegendA() {
    d3.select('#legend-acarreos').html('');
    d3.select('#legend-acarreos').selectAll('.item').data(motivos).join('div').attr('class', 'item')
      .html(d => `<span class="sw" style="background:${MCOL(d)}"></span>${d}`);
  }

  function renderA(m) {
    const { inner, iw, ih } = baseChart('viz-acarreos');
    d3.select('#sub-acarreos').text(m === 'mensual' ? 'Jul 2024 → actualidad' : m === 'tipo' ? 'Por tipo de vehículo' : 'Por playa de depósito');
    setLegendA();

    if (m === 'mensual') {
      const rows = DATA.acarreos_mensual_motivo.map(r => ({ p: `${r.anio}-${pad2(r.mes)}`, motivo: r.motivo_norm, count: +r.count }));
      const periods = [...new Set(rows.map(r => r.p))].sort();
      const stacked = {};
      periods.forEach(p => { stacked[p] = {}; motivos.forEach(mo => stacked[p][mo] = 0); });
      rows.forEach(r => { if (stacked[r.p]) stacked[r.p][r.motivo] = r.count; });
      const barRows = periods.map(p => ({ p, ...stacked[p] }));
      const x = d3.scaleBand().domain(periods).range([0, iw]).padding(0.22);
      const y = d3.scaleLinear().domain([0, d3.max(barRows, r => motivos.reduce((s, m) => s + (r[m] || 0), 0)) * 1.1]).range([ih, 0]);
      gridX(inner, y, iw);
      inner.append('g').call(d3.axisBottom(x).tickFormat(d => { const [a, mm] = d.split('-'); const m = MOIS[+mm - 1]; return +mm === 1 ? a + ' · ' + m : m; }))
        .attr('transform', `translate(0,${ih})`).attr('class', 'axis').selectAll('text').attr('dx', '-14px').attr('transform', 'rotate(-42)');
      inner.append('g').call(d3.axisLeft(y).ticks(6)).attr('class', 'axis');
      axisLabel(inner, 'Acarreos', iw, ih);
      let prev = barRows.map(() => 0);
      motivos.forEach(mo => {
        inner.selectAll('.ac' + mo.replace(/\s/g, '')).data(barRows).join('rect')
          .attr('x', d => x(d.p)).attr('width', x.bandwidth())
          .attr('y', (d, i) => y(prev[i] + (d[mo] || 0)))
          .attr('height', (d, i) => ih - y(d[mo] || 0))
          .attr('fill', MCOL(mo)).attr('opacity', 0.92)
          .call(attachTip, d => {
            const [a, mm] = d.p.split('-');
            return `<div class="t-title">${mm}/${a}</div><div class="t-row">${mo}: <span class="t-val">${fmt(d[mo] || 0)}</span></div><div class="t-row">Mes total: <span class="t-val">${fmt(motivos.reduce((s, x) => s + (d[x] || 0), 0))}</span></div>`;
          });
        prev = barRows.map((d, i) => prev[i] + (d[mo] || 0));
      });
    } else if (m === 'tipo') {
      const rows = DATA.acarreos_tipo_motivo.map(r => ({ tipo: r.tipo_vehic, motivo: r.motivo_norm, count: +r.count }));
      const tipos = [...new Set(rows.map(d => d.tipo))].sort();
      const x = d3.scaleBand().domain(motivos).range([0, iw]).padding(0.28);
      const y = d3.scaleLinear().domain([0, d3.max(rows, d => d.count) * 1.2]).range([ih, 0]);
      gridX(inner, y, iw);
      inner.append('g').call(d3.axisBottom(x).tickFormat(d => d.length > 9 ? d.slice(0, 9) + '…' : d)).attr('transform', `translate(0,${ih})`).attr('class', 'axis');
      inner.append('g').call(d3.axisLeft(y).ticks(6)).attr('class', 'axis');
      axisLabel(inner, 'Acarreos', iw, ih);
      setLegend('legend-acarreos', tipos.map((t, ti) => ({ c: ['#2563eb', '#0f766e', '#d97706', '#7c3aed', '#dc2626', '#3b82f6'][ti % 6], l: t })));
      tipos.forEach((t, ti) => {
        inner.selectAll('.tp-' + t).data(motivos.map(mo => rows.find(r => r.tipo === t && r.motivo === mo) || { tipo: t, motivo: mo, count: 0 })).join('rect')
          .attr('x', d => x(d.motivo) + x.bandwidth() * ti / tipos.length).attr('width', x.bandwidth() / tipos.length)
          .attr('y', d => y(d.count)).attr('height', d => ih - y(d.count))
          .attr('fill', ['#2563eb', '#0f766e', '#d97706', '#7c3aed', '#dc2626', '#3b82f6'][ti % 6]).attr('rx', 2)
          .call(attachTip, d => `<div class="t-title">${d.motivo}</div><div class="t-row">${t}: <span class="t-val">${fmt(d.count)}</span></div>`);
      });
    } else {
      const rows = DATA.acarreos_playa_motivo.map(r => ({ playa: r.playa, motivo: r.motivo_norm, count: +r.count }));
      const playas = [...new Set(rows.map(d => d.playa))];
      const x = d3.scaleBand().domain(playas).range([0, iw]).padding(0.3);
      const y = d3.scaleLinear().domain([0, d3.max(rows, d => d.count) * 1.2]).range([ih, 0]);
      gridX(inner, y, iw);
      inner.append('g').call(d3.axisBottom(x).tickFormat(d => d.length > 11 ? d.slice(0, 11) + '…' : d)).attr('transform', `translate(0,${ih})`).attr('class', 'axis');
      inner.append('g').call(d3.axisLeft(y).ticks(6)).attr('class', 'axis');
      axisLabel(inner, 'Acarreos', iw, ih);
      setLegend('legend-acarreos', []);
      let prev = playas.map(() => 0);
      motivos.forEach(mo => {
        inner.selectAll('.pl-' + mo.replace(/\s/g, '')).data(playas.map(p => rows.find(r => r.playa === p && r.motivo === mo) || { playa: p, motivo: mo, count: 0 })).join('rect')
          .attr('x', d => x(d.playa)).attr('width', x.bandwidth())
          .attr('y', (d, i) => y(prev[i] + d.count)).attr('height', (d, i) => ih - y(d.count))
          .attr('fill', MCOL(mo)).attr('opacity', 0.92).attr('rx', 2)
          .call(attachTip, d => `<div class="t-title">${d.playa}</div><div class="t-row">${mo}: <span class="t-val">${fmt(d.count)}</span></div>`);
        prev = playas.map((p, i) => prev[i] + (rows.find(r => r.playa === p && r.motivo === mo) || { count: 0 }).count);
      });
    }
  }
}

/* ================= Explorador de códigos ================= */
function bindExplorador() {
  const select = document.getElementById('code-select');
  const map = {};
  DATA.serie_por_codigo.forEach(r => {
    const c = r.codigo;
    if (!map[c]) map[c] = { codigo: c, descripcion: '', total: 0, rows: [] };
    map[c].total += +r.total;
    map[c].rows.push({ anio: +r.anio, total: +r.total });
  });
  const descMap = {};
  const catMap = {};
  DATA.serie_por_codigo.forEach(r => {
    descMap[r.codigo] = r.descripcion;
    if (!catMap[r.codigo]) catMap[r.codigo] = r.categoria;
  });
  Object.keys(map).forEach(c => { map[c].descripcion = descMap[c] || ''; });
  const allCodes = Object.values(map).sort((a, b) => b.total - a.total);

  allCodes.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.codigo;
    opt.textContent = `${c.codigo} · ${(c.descripcion || '').slice(0, 62)}  (${fmt(c.total)})`;
    select.appendChild(opt);
  });
  renderCode(select.value || allCodes[0].codigo);
  select.addEventListener('change', () => renderCode(select.value));

  function renderCode(cod) {
    const c = allCodes.find(x => x.codigo === cod);
    if (!c) return;
    const cat = catMap[cod] || '—';
    document.getElementById('code-info').textContent =
      `Código ${c.codigo} · ${c.descripcion} · Categoría: ${CAT_LABEL[cat] || cat} · Total 2016-2025: ${fmt(c.total)}`;

    const { inner, iw, ih } = baseChart('viz-code');
    const rows = c.rows.sort((a, b) => a.anio - b.anio);
    const x = d3.scaleLinear().domain([d3.min(rows, d => d.anio), d3.max(rows, d => d.anio)]).range([0, iw]);
    const y = d3.scaleLinear().domain([0, d3.max(rows, d => d.total) * 1.18]).range([ih, 0]);
    gridX(inner, y, iw);
    gridY(inner, x, ih);
    inner.append('g').call(d3.axisBottom(x).ticks(10).tickFormat(d => d)).attr('transform', `translate(0,${ih})`).attr('class', 'axis');
    inner.append('g').call(d3.axisLeft(y).ticks(6).tickFormat(fmtShort)).attr('class', 'axis');
    axisLabel(inner, 'Actas', iw, ih);

    inner.append('path').datum(rows)
      .attr('d', d3.line().x(d => x(d.anio)).y(d => y(d.total)).curve(d3.curveMonotoneX))
      .attr('class', 'line').attr('stroke', '#0f766e').attr('stroke-width', 3);

    inner.selectAll('.dot').data(rows).join('circle')
      .attr('cx', d => x(d.anio)).attr('cy', d => y(d.total)).attr('r', 5)
      .attr('fill', '#0f766e').attr('stroke', '#ffffff').attr('stroke-width', 2)
      .call(attachTip, d => `<div class="t-title">${d.anio}</div><div class="t-row">Código ${c.codigo}: <span class="t-val">${fmt(d.total)}</span></div>`);

    inner.selectAll('.vl').data(rows).join('text')
      .attr('x', d => x(d.anio)).attr('y', d => y(d.total) - 10)
      .attr('text-anchor', 'middle').attr('class', 'barlabel').text(d => fmtShort(d.total));
  }
}

let resizeTimer;
window.addEventListener('resize', () => {
  if (!DATA) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderKpis();
    window._renderTotales && window._renderTotales();
  }, 200);
});