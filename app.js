/* Caos de Tránsito CABA — Dashboard D3 */
const B = { // basepath para github pages (/caosDeTransito/) o raiz
  home: location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? '' : '/caosDeTransito'
};

const COLORS = {
  velocidad: '#2563eb', estacionamiento: '#d97706', peajes: '#dc2626',
  carrera: '#7c3aed', documentacion: '#94a3b8', alcohol: '#dc2626',
  alcohol_otros: '#f87171', otras: '#cbd5e1'
};
const CAT_LABEL = {
  velocidad: 'Velocidad', estacionamiento: 'Estacionamiento', peajes: 'Peaje / Autopista',
  carriles: 'Carriles / Zonas', documentacion: 'Documentación', alcohol: 'Alcohol', alcohol_otros: 'Alcohol / Otros', otras: 'Otras'
};
const CAT_ORDER = ['velocidad', 'estacionamiento', 'peajes', 'carriles', 'alcohol', 'alcohol_otros', 'documentacion', 'otras'];

const M = d3.format(',').format || (x => x.toLocaleString('es-AR'));
const fmt = n => n.toLocaleString('es-AR');
const pct = n => (n * 100).toFixed(1) + '%';

const tipEl = d3.select('#tip');
function showTip(html, x, y) {
  tipEl.html(html)
    .style('opacity', 1)
    .style('left', (x + 14) + 'px')
    .style('top', (y + 14) + 'px');
}
function hideTip() { tipEl.style('opacity', 0); }

// Aspecto del gráfico
const MARGIN = { top: 20, right: 90, bottom: 40, left: 70 };
function chartSize(id) {
  const el = document.getElementById(id);
  const w = Math.max(el.clientWidth, 300);
  return { w: w - 0, h: 380 };
}

let DATA;
d3.json(B.home + '/data/data.json').then(d => {
  DATA = d;
  init();
}).catch(e => {
  document.getElementById('meta-info').textContent = 'Error al cargar datos: ' + e.message;
  console.error(e);
});

async function init() {
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

  const delta = (lastVal, prevVal, invert) => {
    const c = lastVal - prevVal;
    const sign = c >= 0 ? '+' : '';
    const cls = invert ? (c > 0 ? 'down' : c < 0 ? 'up' : 'flat') : (c > 0 ? 'up' : c < 0 ? 'down' : 'flat');
    return `<div class="delta ${cls}">${sign}${fmt(c)} vs ${prev.anio}</div>`;
  };

  const kpis = [
    { label: 'Actas 2025', val: fmt(last.infracciones_total), d: delta(last.infracciones_total, prev.infracciones_total, false) },
    { label: 'Procesadas', val: fmt(last.actas_procesadas), d: delta(last.actas_procesadas, prev.actas_procesadas, false) },
    { label: 'Resueltas', val: last.actas_resueltas ? fmt(last.actas_resueltas) : 'n/d', d: last.actas_resueltas && prev.actas_resueltas ? delta(last.actas_resueltas, prev.actas_resueltas, false) : '' },
    { label: 'Alcohol (infr.)', val: fmt(last.infracciones_alcohol), d: delta(last.infracciones_alcohol, prev.infracciones_alcohol, true) },
    { label: 'Velocidad', val: fmt(last.infracciones_velocidad), d: pct(last.infracciones_velocidad / last.infracciones_total) + ' del total' },
    { label: 'Evasión de peaje', val: fmt(last.infracciones_peaje), d: delta(last.infracciones_peaje, prev.infracciones_peaje, false) },
    { label: 'Acarreos 2025', val: fmt(last.acarreos), d: delta(last.acarreos, prev.acarreos, false) },
    { label: 'Tasa resolución', val: pct(last.actas_resueltas / last.actas_procesadas), d: `${fmt(last.actas_procesadas - last.actas_resueltas)} sin resolver` },
  ];

  d3.select('#kpis').selectAll('.kpi')
    .data(kpis).join('div').attr('class', 'kpi')
    .html(d => `<div class="label">${d.label}</div><div class="val">${d.val}</div>${d.d}`);
}

/* Util: tooltip global */
function attachTip(sel, fmt) {
  sel.on('mousemove', function (event, d) {
    const t = Array.isArray(d) ? d[d.length - 1] : (d.target || d);
    showTip(fmt(t), event.clientX, event.clientY);
  }).on('mouseleave', hideTip);
}

/* ================= Gráfico 1: Totales ================= */
function bindTotales() {
  const mode = { v: 'total' };
  d3.select('#tab-totales').selectAll('.tab')
    .on('click', function () {
      d3.select('#tab-totales').selectAll('.tab').classed('active', false);
      d3.select(this).classed('active', true);
      mode.v = d3.select(this).attr('data-mode');
      renderTotales(mode.v);
    });
  window._renderTotales = m => renderTotales(m || mode.v);
  renderTotales('total');

  function renderTotales(m) {
    const id = 'viz-totales';
    d3.select('#' + id).selectAll('*').remove();
    const { w, h } = chartSize(id);
    const svg = d3.select('#' + id).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%');
    const inner = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
    const iw = w - MARGIN.left - MARGIN.right, ih = h - MARGIN.top - MARGIN.bottom;

    const kp = DATA.kpis_anuales;
    const x = d3.scaleBand().domain(kp.map(d => d.anio)).range([0, iw]).padding(0.35);
    const y = d3.scaleLinear().domain([0, d3.max(kp, d => Math.max(d.infracciones_total, d.actas_procesadas, d.actas_resueltas || 0)) * 1.05]).range([ih, 0]);

    inner.append('g').call(d3.axisBottom(x).tickFormat(d => d)).attr('transform', `translate(0,${ih})`).attr('class', 'axis');
    inner.append('g').call(d3.axisLeft(y).ticks(6).tickFormat(d => d >= 1e6 ? (d/1e6) + 'M' : d3.format('~s')(d))).attr('class', 'axis');

    if (m === 'total') {
      inner.selectAll('.bar')
        .data(kp).join('rect')
        .attr('x', d => x(d.anio)).attr('width', x.bandwidth())
        .attr('y', d => y(d.infracciones_total)).attr('height', d => ih - y(d.infracciones_total))
        .attr('fill', 'url(#g-total)').attr('rx', 3)
        .call(attachTip, d => `<div class="t-title">${d.anio}</div><div class="t-row">Infracciones: <span class="t-val">${fmt(d.infracciones_total)}</span></div>`);
    } else if (m === 'proc') {
      inner.selectAll('.bar-p')
        .data(kp).join('rect')
        .attr('x', d => x(d.anio)).attr('width', x.bandwidth() * 0.46)
        .attr('y', d => y(d.actas_procesadas)).attr('height', d => ih - y(d.actas_procesadas))
        .attr('fill', '#2563eb').attr('rx', 3)
        .call(attachTip, d => `<div class="t-title">${d.anio}</div><div class="t-row">Procesadas: <span class="t-val">${fmt(d.actas_procesadas)}</span></div>`);
      inner.selectAll('.bar-r')
        .data(kp.filter(d => d.actas_resueltas)).join('rect')
        .attr('x', d => x(d.anio) + x.bandwidth() * 0.54).attr('width', x.bandwidth() * 0.46)
        .attr('y', d => y(d.actas_resueltas)).attr('height', d => ih - y(d.actas_resueltas))
        .attr('fill', '#059669').attr('rx', 3)
        .call(attachTip, d => `<div class="t-title">${d.anio}</div><div class="t-row">Resueltas: <span class="t-val">${fmt(d.actas_resueltas)}</span></div>`);
    } else {
      const ap = DATA.actas_procesadas_anual;
      const max = d3.max(ap, d => d.total);
      const y2 = d3.scaleLinear().domain([0, max * 1.05]).range([ih, 0]);
      inner.append('g').call(d3.axisLeft(y2).ticks(6).tickFormat(d3.format('~s'))).attr('class', 'axis');
      inner.selectAll('.bar-f')
        .data(ap).join('rect')
        .attr('x', d => x(d.anio)).attr('width', x.bandwidth() * 0.46)
        .attr('y', d => y2(d.fotos)).attr('height', d => ih - y2(d.fotos))
        .attr('fill', '#2563eb').attr('rx', 3)
        .call(attachTip, d => `<div class="t-title">${d.anio}</div><div class="t-row">Fotos: <span class="t-val">${fmt(d.fotos)}</span></div>`);
      inner.selectAll('.bar-m')
        .data(ap).join('rect')
        .attr('x', d => x(d.anio) + x.bandwidth() * 0.54).attr('width', x.bandwidth() * 0.46)
        .attr('y', d => y2(d.manuales)).attr('height', d => ih - y2(d.manuales))
        .attr('fill', '#0f766e').attr('rx', 3)
        .call(attachTip, d => `<div class="t-title">${d.anio}</div><div class="t-row">Manuales: <span class="t-val">${fmt(d.manuales)}</span></div>`);
    }

    const defs = svg.append('defs');
    const gr = defs.append('linearGradient').attr('id', 'g-total').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
    gr.append('stop').attr('offset', '0%').attr('stop-color', '#0f766e');
    gr.append('stop').attr('offset', '100%').attr('stop-color', '#ff5e3a');
  }
}

/* ================= Gráfico 2: Categorías ================= */
function bindCategoria() {
  const mode = { v: 'stack' };
  d3.select('#tab-cat').selectAll('.tab')
    .on('click', function () {
      d3.select('#tab-cat').selectAll('.tab').classed('active', false);
      d3.select(this).classed('active', true);
      mode.v = d3.select(this).attr('data-mode');
      renderCat(mode.v);
    });

  // leyenda
  const cats = [...new Set(DATA.infracciones_anual_categoria.map(d => d.categoria))]
    .filter(c => CAT_ORDER.includes(c)).sort((a, b) => CAT_ORDER.indexOf(a) - CAT_ORDER.indexOf(b));
  d3.select('#legend-cat').selectAll('.item').data(cats).join('div').attr('class', 'item')
    .html(d => `<span class="sw" style="background:${COLORS[d]||'#888'}"></span>${CAT_LABEL[d]}`);

  renderCat('stack');

  function renderCat(m) {
    const id = 'viz-cat';
    d3.select('#' + id).selectAll('*').remove();
    const { w, h } = chartSize(id);
    const svg = d3.select('#' + id).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%');
    const inner = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
    const iw = w - MARGIN.left - MARGIN.right, ih = h - MARGIN.top - MARGIN.bottom;

    const años = [...new Set(DATA.infracciones_anual_categoria.map(d => d.anio))].sort();
    const stack = {};
    años.forEach(a => {
      stack[a] = {};
      CAT_ORDER.forEach(c => stack[a][c] = 0);
    });
    DATA.infracciones_anual_categoria.forEach(d => { if (stack[d.anio]) stack[d.anio][d.categoria] = d.total; });
    const rows = años.map(a => ({ anio: a, ...stack[a] }));

    const x = d3.scaleBand().domain(años).range([0, iw]).padding(0.3);
    const maxTotal = d3.max(rows, r => CAT_ORDER.reduce((s, c) => s + r[c], 0));
    let y;
    if (m === 'stack') {
      y = d3.scaleLinear().domain([0, maxTotal * 1.05]).range([ih, 0]);
    } else {
      y = d3.scaleLinear().domain([0, 1]).range([ih, 0]);
    }

    inner.append('g').call(d3.axisBottom(x).tickFormat(d => d)).attr('transform', `translate(0,${ih})`).attr('class', 'axis');
    inner.append('g').call(d3.axisLeft(y).ticks(6).tickFormat(m === 'stack' ? d3.format('~s') : d => pct(d))).attr('class', 'axis');

    // capas
    const visible = cats.filter(c => rows.some(r => r[c] > 0));
    let prevLayer = rows.map(() => 0);
    visible.forEach(cat => {
      inner.selectAll('.bar-' + cat)
        .data(rows).join('rect')
        .attr('x', d => x(d.anio)).attr('width', x.bandwidth())
        .attr('y', (d, i) => { const b = prevLayer[i]; if (m === 'stack') return y(b + d[cat]); return y(b + (d[cat] / maxTotal)); })
        .attr('height', (d, i) => { const b = prevLayer[i]; if (m === 'stack') return ih - y(d[cat]); return ih - y(d[cat] / maxTotal); })
        .attr('fill', COLORS[cat] || '#888')
        .attr('opacity', 0.92)
        .call(attachTip, (d, i) => `<div class="t-title">${d.anio} · ${CAT_LABEL[cat]}</div><div class="t-row">${fmt(d[cat])} ${m === 'stack' ? '' : '(' + pct(d[cat] / maxTotal) + ')'}</div>`);
      // acumular
      prevLayer = rows.map((d, i) => prevLayer[i] + d[cat]);
    });
  }
}

/* ================= Gráfico 3: Top códigos ================= */
function bindTop() {
  const state = { year: 2025 };
  const yearSlider = document.getElementById('top-year');
  yearSlider.value = 2025;
  yearSlider.addEventListener('input', () => {
    state.year = +yearSlider.value;
    document.getElementById('top-year-val').textContent = state.year;
    renderTop();
  });

  // botones de variable: total, alcohol, velocidad, peaje
  const vars = [
    { k: 'total', l: 'Total' }, { k: 'alcohol', l: 'Alcohol' },
    { k: 'velocidad', l: 'Velocidad' }, { k: 'peaje', l: 'Peaje' }
  ];
  state.var = 'total';
  d3.select('#top-var').selectAll('.vbtn').data(vars).join('button')
    .attr('class', d => 'vbtn ' + (d.k === 'total' ? 'active' : ''))
    .text(d => d.l)
    .on('click', function (e, d) {
      d3.select('#top-var').selectAll('.vbtn').classed('active', false);
      d3.select(this).classed('active', true);
      state.var = d.k;
      renderTop();
    });

  renderTop();

  function renderTop() {
    const rows = DATA.top_por_anio.filter(r => +r.anio === state.year)
      .map(r => ({ codigo: r.codigo, descripcion: r.descripcion, categoria: r.categoria, total: +r.total }))
      .sort((a, b) => b.total - a.total);
    renderTopFrom(rows);
  }
}

function renderTopFrom(rows) {
  const id = 'viz-top';
  d3.select('#' + id).selectAll('*').remove();
  const { w, h } = chartSize(id);
  const svg = d3.select('#' + id).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%');
  const left = 20, right = 20, top = 10, bottom = 30;
  const iw = w - left - right, ih = h - top - bottom;
  const inner = svg.append('g').attr('transform', `translate(${left},${top})`);

  const data = rows.slice(0, 20);
  const y = d3.scaleBand().domain(data.map(d => d.descripcion)).range([0, ih]).padding(0.25);
  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.total) * 1.05]).range([0, iw]);

  inner.append('g').call(d3.axisLeft(y).tickFormat(d => d.length > 42 ? d.slice(0, 42) + '…' : d))
    .attr('class', 'axis').selectAll('text').style('font-size', '11px');

  inner.selectAll('.hbar')
    .data(data).join('rect')
    .attr('y', d => y(d.descripcion)).attr('height', y.bandwidth())
    .attr('x', 0).attr('width', d => x(d.total))
    .attr('fill', d => COLORS[d.categoria] || '#cbd5e1').attr('rx', 2)
    .call(attachTip, d => `<div class="t-title">${d.codigo}</div><div class="t-row">${d.descripcion}</div><div class="t-row">Total: <span class="t-val">${fmt(d.total)}</span></div>`);

  inner.selectAll('.lbl')
    .data(data).join('text')
    .attr('x', d => x(d.total) + 6).attr('y', d => y(d.descripcion) + y.bandwidth() / 2 + 4)
    .attr('class', 'barlabel').text(d => fmt(d.total));
}

/* ================= Alcohol ================= */
function bindAlcohol() {
  // serie anual
  const idA = 'viz-alcohol';
  d3.select('#' + idA).selectAll('*').remove();
  const { w, h } = chartSize(idA);
  const svg = d3.select('#' + idA).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%');
  const inner = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
  const iw = w - MARGIN.left - MARGIN.right, ih = h - MARGIN.top - MARGIN.bottom;

  const kp = DATA.kpis_anuales;
  const x = d3.scaleBand().domain(kp.map(d => d.anio)).range([0, iw]).padding(0.3);
  const y = d3.scaleLinear().domain([0, d3.max(kp, d => d.infracciones_alcohol) * 1.15]).range([ih, 0]);
  inner.append('g').call(d3.axisBottom(x).tickFormat(d => d)).attr('transform', `translate(0,${ih})`).attr('class', 'axis');
  inner.append('g').call(d3.axisLeft(y).ticks(5)).attr('class', 'axis');

  inner.selectAll('.alcbar')
    .data(kp).join('rect')
    .attr('x', d => x(d.anio)).attr('width', x.bandwidth())
    .attr('y', d => y(d.infracciones_alcohol)).attr('height', d => ih - y(d.infracciones_alcohol))
    .attr('fill', d => d.anio >= 2022 ? '#dc2626' : '#94a3b8').attr('rx', 3)
    .call(attachTip, d => `<div class="t-title">${d.anio}</div><div class="t-row">Infracciones alcohol: <span class="t-val">${fmt(d.infracciones_alcohol)}</span></div>`);

  // detalle por código
  const idD = 'viz-alcohol-det';
  d3.select('#' + idD).selectAll('*').remove();
  const rows = DATA.alcohol_por_anio ? DATA.alcohol_por_anio.map(r => ({
    codigo: r.codigo, anio: +r.anio, total: +r.total
  })) : [];
  if (DATA.alcohol_por_anio) {
    renderCodeDetail(rows);
  }

  function renderCodeDetail(rows) {
    const { w, h } = chartSize(idD);
    const svg = d3.select('#' + idD).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%');
    const inner = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
    const iw = w - MARGIN.left - MARGIN.right, ih = h - MARGIN.top - MARGIN.bottom;
    const años = [...new Set(rows.map(d => d.anio))].sort();
    const codes = [...new Set(rows.map(d => d.codigo))];
    const x = d3.scaleLinear().domain(d3.extent(años)).range([0, iw]);
    const y = d3.scaleLinear().domain([0, d3.max(rows, d => d.total) * 1.1]).range([ih, 0]);
    inner.append('g').call(d3.axisBottom(x).tickFormat(d => d)).attr('transform', `translate(0,${ih})`).attr('class', 'axis');
    inner.append('g').call(d3.axisLeft(y).ticks(5)).attr('class', 'axis');

    const pal = { '7462': '#dc2626', '7463': '#0f766e', '7464': '#7c3aed', '7062': '#2563eb', 'alcohol': '#dc2626' };
    codes.forEach(c => {
      const cd = rows.filter(r => r.codigo === c).sort((a, b) => a.anio - b.anio);
      inner.append('path').datum(cd)
        .attr('d', d3.line().x(d => x(d.anio)).y(d => y(d.total)).defined(d => d.total !== null && d.total !== undefined))
        .attr('class', 'line').attr('stroke', pal[c] || '#888')
        .call(attachTip, (e, d) => `<div class="t-title">Código ${c}</div><div class="t-row">${d.anio}: <span class="t-val">${fmt(d.total)}</span></div>`);
    });
  }
}

/* ================= Acarreos ================= */
function bindAcarreos() {
  const mode = { v: 'mensual' };
  d3.select('#tab-acarreos').selectAll('.tab')
    .on('click', function () {
      d3.select('#tab-acarreos').selectAll('.tab').classed('active', false);
      d3.select(this).classed('active', true);
      mode.v = d3.select(this).attr('data-mode');
      renderA(mode.v);
    });
  const motivos = [...new Set(DATA.acarreos_anual_motivo.map(d => d.motivo))];
  const MCOL = d3.scaleOrdinal(d3.schemeTableau10).domain(motivos);
  d3.select('#legend-acarreos').selectAll('.item').data(motivos).join('div').attr('class', 'item')
    .html(d => `<span class="sw" style="background:${MCOL(d)}"></span>${d}`);

  renderA('mensual');

  function renderA(m) {
    const id = 'viz-acarreos';
    d3.select('#' + id).selectAll('*').remove();
    const { w, h } = chartSize(id);
    const svg = d3.select('#' + id).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%');
    const inner = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
    const iw = w - MARGIN.left - MARGIN.right, ih = h - MARGIN.top - MARGIN.bottom;

    if (m === 'mensual') {
      const rows = DATA.acarreos_mensual_motivo;
      const periods = [...new Set(rows.map(r => r.anio + '-' + r.mes))].sort();
      const stacked = {};
      periods.forEach(p => stacked[p] = {});
      motivos.forEach(mo => periods.forEach(p => stacked[p][mo] = 0));
      rows.forEach(r => { const p = r.anio + '-' + r.mes; if (stacked[p]) stacked[p][r.motivo] = r.count; });
      const barRows = periods.map(p => ({ p, ...stacked[p] }));
      const x = d3.scaleBand().domain(periods).range([0, iw]).padding(0.2);
      const max = d3.max(barRows, r => motivos.reduce((s, m) => s + (r[m] || 0), 0));
      const y = d3.scaleLinear().domain([0, max * 1.1]).range([ih, 0]);
      inner.append('g').call(d3.axisBottom(x).tickFormat(d => {
        const [a, mm] = d.split('-'); return (mm === '01' ? a : '') + (['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][+mm - 1] || mm);
      })).attr('transform', `translate(0,${ih})`).attr('class', 'axis').selectAll('text').attr('dx', '-12px').attr('transform', 'rotate(-40)');
      inner.append('g').call(d3.axisLeft(y).ticks(6)).attr('class', 'axis');

      let prev = barRows.map(() => 0);
      motivos.forEach(mo => {
        inner.selectAll('.ac-' + mo)
          .data(barRows).join('rect')
          .attr('x', d => x(d.p)).attr('width', x.bandwidth())
          .attr('y', (d, i) => y(prev[i] + (d[mo] || 0)))
          .attr('height', (d, i) => ih - y(d[mo] || 0))
          .attr('fill', MCOL(mo)).attr('opacity', 0.9)
          .call(attachTip, (d, i) => {
            const [a, mm] = d.p.split('-');
            return `<div class="t-title">${mm}/${a}</div><div class="t-row">${mo}: <span class="t-val">${fmt(d[mo] || 0)}</span></div><div class="t-row">Total: <span class="t-val">${fmt(motivos.reduce((s, mm) => s + (d[mm] || 0), 0))}</span></div>`;
          });
        prev = barRows.map((d, i) => prev[i] + (d[mo] || 0));
      });
    } else if (m === 'tipo') {
      const rows = DATA.acarreos_tipo_motivo;
      const tipos = [...new Set(rows.map(d => d.tipo_vehic))];
      const x = d3.scaleBand().domain(motivos).range([0, iw]).padding(0.25);
      const y = d3.scaleLinear().domain([0, d3.max(rows, d => d.count) * 1.15]).range([ih, 0]);
      inner.append('g').call(d3.axisBottom(x).tickFormat(d => d.length > 10 ? d.slice(0, 10) + '…' : d)).attr('transform', `translate(0,${ih})`).attr('class', 'axis');
      inner.append('g').call(d3.axisLeft(y).ticks(6)).attr('class', 'axis');
      tipos.forEach((t, ti) => {
        inner.selectAll('.tp-' + t)
          .data(motivos.map(mo => rows.find(r => r.tipo_vehic === t && r.motivo === mo) || { tipo_vehic: t, motivo: mo, count: 0 })).join('rect')
          .attr('x', d => x(d.motivo) + x.bandwidth() * ti / tipos.length).attr('width', x.bandwidth() / tipos.length)
          .attr('y', d => y(d.count)).attr('height', d => ih - y(d.count))
          .attr('fill', t === 'AUTO' ? '#2563eb' : '#0f766e').attr('rx', 2)
          .call(attachTip, d => `<div class="t-title">${d.motivo}</div><div class="t-row">${t}: <span class="t-val">${fmt(d.count)}</span></div>`);
      });
    } else {
      const rows = DATA.acarreos_playa_motivo;
      const playas = [...new Set(rows.map(d => d.playa))];
      const x = d3.scaleBand().domain(playas).range([0, iw]).padding(0.3);
      const y = d3.scaleLinear().domain([0, d3.max(rows, d => d.count) * 1.15]).range([ih, 0]);
      inner.append('g').call(d3.axisBottom(x).tickFormat(d => d.length > 12 ? d.slice(0, 12) + '…' : d)).attr('transform', `translate(0,${ih})`).attr('class', 'axis');
      inner.append('g').call(d3.axisLeft(y).ticks(6)).attr('class', 'axis');
      let prev = playas.map(() => 0);
      motivos.forEach(mo => {
        inner.selectAll('.pl-' + mo)
          .data(playas.map(p => rows.find(r => r.playa === p && r.motivo === mo) || { playa: p, motivo: mo, count: 0 })).join('rect')
          .attr('x', d => x(d.playa)).attr('width', x.bandwidth())
          .attr('y', (d, i) => y(prev[i] + d.count)).attr('height', (d, i) => ih - y(d.count))
          .attr('fill', MCOL(mo)).attr('opacity', 0.9).attr('rx', 2)
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
  DATA.codigos.forEach(c => descMap[c.codigo] = c.descripcion);
  Object.keys(map).forEach(c => { map[c].descripcion = descMap[c] || ''; });
  const allCodes = Object.values(map).sort((a, b) => b.total - a.total);

  allCodes.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.codigo;
    opt.textContent = `${c.codigo} · ${(c.descripcion || '').slice(0, 60)}  (${fmt(c.total)})`;
    select.appendChild(opt);
  });
  renderCode(select.value || allCodes[0].codigo);

  select.addEventListener('change', () => renderCode(select.value));

  function renderCode(cod) {
    const id = 'viz-code';
    d3.select('#' + id).selectAll('*').remove();
    const c = allCodes.find(x => x.codigo === cod);
    if (!c) return;
    document.getElementById('code-info').textContent = `${c.codigo} · ${c.descripcion} · Total 2016-2025: ${fmt(c.total)}`;

    const { w, h } = chartSize(id);
    const svg = d3.select('#' + id).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%');
    const inner = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
    const iw = w - MARGIN.left - MARGIN.right, ih = h - MARGIN.top - MARGIN.bottom;

    const rows = c.rows.sort((a, b) => a.anio - b.anio);
    const x = d3.scaleLinear().domain([d3.min(rows, d => d.anio), d3.max(rows, d => d.anio)]).range([0, iw]);
    const y = d3.scaleLinear().domain([0, d3.max(rows, d => d.total) * 1.15]).range([ih, 0]);
    inner.append('g').call(d3.axisBottom(x).tickFormat(d => d).ticks(10)).attr('transform', `translate(0,${ih})`).attr('class', 'axis');
    inner.append('g').call(d3.axisLeft(y).ticks(6).tickFormat(d3.format('~s'))).attr('class', 'axis');

    inner.append('path').datum(rows)
      .attr('d', d3.line().x(d => x(d.anio)).y(d => y(d.total)).curve(d3.curveMonotoneX))
      .attr('class', 'line').attr('stroke', '#0f766e').attr('stroke-width', 3);

    inner.selectAll('.dot')
      .data(rows).join('circle')
      .attr('cx', d => x(d.anio)).attr('cy', d => y(d.total)).attr('r', 5)
      .attr('fill', '#0f766e').attr('stroke', '#ffffff').attr('stroke-width', 2)
      .call(attachTip, d => `<div class="t-title">${d.anio}</div><div class="t-row">Total: <span class="t-val">${fmt(d.total)}</span></div>`);

    inner.selectAll('.vl')
      .data(rows).join('text')
      .attr('x', d => x(d.anio)).attr('y', d => y(d.total) - 10)
      .attr('text-anchor', 'middle').attr('class', 'barlabel')
      .text(d => d.total >= 1e6 ? (d.total / 1e6) + 'M' : d.total >= 1e3 ? (d.total / 1e3) + 'k' : d.total);
  }
}

// Resize: re-render el gráfico actual
let resizeTimer;
window.addEventListener('resize', () => {
  if (!DATA) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderKpis();
    window._renderTotales && window._renderTotales();
  }, 200);
});