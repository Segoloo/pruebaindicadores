'use strict';

let IND_RAW = null;
let IND_CHARTS = {};

const IND_COLORS = [
  '#B0F2AE', '#99D1FC', '#DFFF61', '#00825A',
  '#00825A', '#99D1FC', '#B0F2AE', '#DFFF61',
  '#B0F2AE', '#99D1FC', '#B0F2AE', '#DFFF61',
];

// --- VARIABLES DE FILTRADO Y PAGINACIÓN (SLICERS) ---
let IND_FILTERS = {
  depto: '',
  red: '',
  estado: '',
  sla: '',
  tecnico: ''
};

let IND_SEARCH_TERMS = {
  cierres: '',
  papeleria: '',
  'otras-oc': '',
  implementacion: '',
  incidentes: ''
};

let IND_PAGES = {
  cierres: 1,
  papeleria: 1,
  'otras-oc': 1,
  implementacion: 1,
  incidentes: 1
};

const IND_PAGE_SIZE = 50;

// --- VARIABLES DE CONTROL PARA EL MODAL WIZARD ---
let WIZARD_ACTIVE_TAB = '';
let WIZARD_ACTIVE_LABEL = '';
let WIZARD_ROWS = [];
let WIZARD_SEARCH = '';
let WIZARD_PAGE = 1;
const WIZARD_PAGE_SIZE = 50;

async function loadIndicadoresData() {
  if (IND_RAW) return;
  const dot = document.getElementById('dl-dot-indicadores');
  const sub = document.getElementById('dl-sub-indicadores');
  if (dot) dot.className = 'dl-item-dot loading';
  try {
    const res = await fetch('indicadores_wompi.json.gz?t=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    const ds = new DecompressionStream('gzip');
    const w = ds.writable.getWriter();
    w.write(new Uint8Array(buf)); w.close();
    const out = await new Response(ds.readable).arrayBuffer();
    IND_RAW = JSON.parse(new TextDecoder().decode(out));

    // Etiquetar registros con _is_abierto para unificación genérica
    if (IND_RAW.implementacion) {
      if (Array.isArray(IND_RAW.implementacion.bd)) IND_RAW.implementacion.bd.forEach(r => r._is_abierto = false);
      if (Array.isArray(IND_RAW.implementacion.abiertos)) IND_RAW.implementacion.abiertos.forEach(r => r._is_abierto = true);
    }
    if (IND_RAW.incidentes) {
      if (Array.isArray(IND_RAW.incidentes.cerrados)) IND_RAW.incidentes.cerrados.forEach(r => r._is_abierto = false);
      if (Array.isArray(IND_RAW.incidentes.abiertos)) IND_RAW.incidentes.abiertos.forEach(r => r._is_abierto = true);
    }
    if (IND_RAW.oc_wompi) {
      if (Array.isArray(IND_RAW.oc_wompi.cierres)) IND_RAW.oc_wompi.cierres.forEach(r => r._is_abierto = false);
      if (Array.isArray(IND_RAW.oc_wompi.cierres_abiertos)) IND_RAW.oc_wompi.cierres_abiertos.forEach(r => r._is_abierto = true);

      if (Array.isArray(IND_RAW.oc_wompi.papeleria)) IND_RAW.oc_wompi.papeleria.forEach(r => r._is_abierto = false);
      if (Array.isArray(IND_RAW.oc_wompi.papeleria_abiertos)) IND_RAW.oc_wompi.papeleria_abiertos.forEach(r => r._is_abierto = true);

      if (Array.isArray(IND_RAW.oc_wompi.otras_oc)) IND_RAW.oc_wompi.otras_oc.forEach(r => r._is_abierto = false);
      if (Array.isArray(IND_RAW.oc_wompi.otras_oc_abiertos)) IND_RAW.oc_wompi.otras_oc_abiertos.forEach(r => r._is_abierto = true);
    }

    window.IND_RAW = IND_RAW;
    initIndicadoresFilters();
    if (dot) dot.className = 'dl-item-dot done';
    const total = _indTotalRows();
    if (sub) sub.textContent = total.toLocaleString('es-CO') + ' filas ✓';
    console.log('[IndicadoresCB] cargado', total, 'filas');
  } catch (e) {
    console.error('[IndicadoresCB]', e);
    IND_RAW = {};
    if (dot) dot.className = 'dl-item-dot done';
    if (sub) sub.textContent = 'sin datos';
  }
  if (typeof window._setIndicadoresLoaded === 'function') window._setIndicadoresLoaded();
}

function _indTotalRows() {
  if (!IND_RAW) return 0;
  let t = 0;
  ['implementacion', 'incidentes', 'oc_wompi'].forEach(s => {
    const sec = IND_RAW[s];
    if (!sec) return;
    Object.values(sec).forEach(arr => { if (Array.isArray(arr)) t += arr.length; });
  });
  return t;
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════
function _indFmt(n) { return (n || 0).toLocaleString('es-CO'); }
function _indPct(a, b) { return b ? ((a / b) * 100).toFixed(1) + '%' : '0%'; }

function _parseDate(v) {
  if (!v) return null;
  if (typeof v === 'number') {
    // Serial de Excel → UTC midnight. Math.floor descarta la fracción de hora
    const ms = Math.floor(v - 25569) * 86400000;
    const d = new Date(ms);
    return isNaN(d) ? null : d;
  }
  const s = String(v).trim();
  // Formato DD/MM/AAAA (con o sin hora HH:MM al final, que se descarta)
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
    // Usar UTC para que la aritmética de días sea exacta (sin desfases por zona horaria)
    return new Date(Date.UTC(y, parseInt(m[2]) - 1, parseInt(m[1])));
  }
  return null; // No parsear formatos ambiguos como MM/DD/YYYY del fallback de Date()
}

// Formatea un valor de celda: si la columna es de fecha y el valor es un serial de Excel, lo convierte
function _formatCellValue(key, val) {
  if (val === null || val === undefined || val === '') return '—';
  // Detectar si es un campo de fecha por el nombre de la columna
  const k = (key || '').toUpperCase();
  const isDateCol = k.includes('FECHA') || k.includes('LIMITE') || k.includes('VENCIMIENTO');
  if (isDateCol && typeof val === 'number' && val > 30000 && val < 60000) {
    const d = new Date((val - 25569) * 86400000);
    if (!isNaN(d)) {
      return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    }
  }
  // Detectar seriales de Excel que vienen como string numérico
  if (isDateCol && typeof val === 'string') {
    const n = parseFloat(val);
    if (!isNaN(n) && n > 30000 && n < 60000 && /^\d+(\.\d+)?$/.test(val.trim())) {
      const d = new Date((n - 25569) * 86400000);
      if (!isNaN(d)) {
        return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
      }
    }
  }
  return val.toString();
}

// ──────────────────────────────────────────────────────────────────
// Calcula días transcurridos desde el vencimiento del SLA.
// Positivo  → incumplimiento (días de retraso)
// Negativo/0 → dentro del plazo
// Retorna null si no se pueden determinar las fechas.
// ──────────────────────────────────────────────────────────────────
function _getDiasPostVencimiento(r, tab) {
  // --- Fecha de vencimiento (deadline) ---
  let deadlineVal = null;
  if (tab === 'cierres' || tab === 'papeleria' || tab === 'otras-oc') {
    deadlineVal = r['FECHA DE VENCIMIENTO (DD/MM/AAAA)'];
  } else if (tab === 'implementacion') {
    deadlineVal = r['FECHA LIMITE EXTRAORDINARIA'] || r['FECHA LIMITE'];
  } else if (tab === 'incidentes') {
    deadlineVal = r['FECHA VENCIMIENTO DEL INCIDENTE'];
  }
  const deadline = _parseDate(deadlineVal);
  if (!deadline) return null;

  // --- Fecha de cierre / solución ---
  let refDate;
  // Para registros abiertos, normalizar "hoy" a medianoche UTC también
  if (r._is_abierto) {
    const now = new Date();
    refDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  } else {
    let closeVal = null;
    if (tab === 'cierres' || tab === 'papeleria' || tab === 'otras-oc') {
      // Usar FECHA DE CIERRE primero: es cuando se completó la gestión real.
      // FECHA DE SOLUCIÓN puede ser anterior al cierre, produciendo falsos 'al día'.
      closeVal = r['FECHA DE CIERRE (DD/MM/AAAA)']
        || r['FECHA DE CIERRE (DD/MM/AAAA)"']   // papelería tiene comilla extra
        || r['FECHA DE SOLUCIÓN (DD/MM/AAAA)']
    } else if (tab === 'implementacion') {
      closeVal = r['FECHA DE CIERRE'] || r['FECHA DE FIN'];
    } else if (tab === 'incidentes') {
      closeVal = r['FECHA SOLUCIÓN DEL INCIDENTE (DD/MM/AAAA)']
        || r['FECHA CIERRE DEL TICKET (DD/MM/AAAA HH:MM)'];
    }
    refDate = _parseDate(closeVal);
    if (!refDate) refDate = new Date();
  }

  let dias = Math.round((refDate - deadline) / 86400000);

  // Si el cálculo da 0 (cerrado el mismo día del vencimiento) pero el campo
  // DENTRO DE LOS SLA dice explícitamente NO, respetar el dato fuente: mínimo 1 día.
  if (dias === 0) {
    const sla = (r['DENTRO DE LOS SLA'] || r['CUMPLE SLA'] || '').toString().toUpperCase().trim();
    if (sla === 'NO') dias = 1;
  }

  return dias;
}

function _renderDiasPill(dias) {
  if (dias === null) return `<span style="color:#64748b;font-size:11px;">—</span>`;
  if (dias <= 0) {
    return `<span style="color:#00825A;background:rgba(0,130,90,.1);border:1px solid rgba(0,130,90,.3);padding:3px 8px;border-radius:6px;font-weight:700;font-family:'JetBrains Mono',monospace;font-size:11px;white-space:nowrap;">0 días</span>`;
  }
  const color = dias <= 7 ? '#99D1FC' : '#00825A';
  const bg = dias <= 7 ? 'rgba(153,209,252,.1)' : 'rgba(0,130,90,.1)';
  const bord = dias <= 7 ? 'rgba(153,209,252,.3)' : 'rgba(0,130,90,.3)';
  return `<span style="color:${color};background:${bg};border:1px solid ${bord};padding:3px 8px;border-radius:6px;font-weight:700;font-family:'JetBrains Mono',monospace;font-size:11px;white-space:nowrap;">⚠ ${dias}d retraso</span>`;
}

function _monthKey(d) {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function _countBy(rows, field) {
  const map = {};
  rows.forEach(r => {
    const k = r[field] || '(Sin dato)';
    map[k] = (map[k] || 0) + 1;
  });
  return map;
}

function _topN(map, n = 10) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function _isTrueVal(v) {
  if (v === null || v === undefined) return false;
  const s = v.toString().toUpperCase().trim();
  return s !== 'NO APLICA' && s !== '0' && s !== '';
}

function _destroyChart(id) {
  if (IND_CHARTS[id]) {
    IND_CHARTS[id].destroy();
    delete IND_CHARTS[id];
  }
  const canvas = document.getElementById(id);
  if (canvas) {
    const existing = Chart.getChart(canvas);
    if (existing) {
      existing.destroy();
    }
  }
}

function _mkChart(id, type, labels, datasets, opts = {}) {
  _destroyChart(id);
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const config = {
    type,
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#CBD5E1', font: { size: 11 } } },
        tooltip: { backgroundColor: 'rgba(24,23,21,.95)', titleColor: '#B0F2AE', bodyColor: '#FAFAFA', borderColor: 'rgba(176,242,174,.2)', borderWidth: 1, padding: 10 },
        ...opts.plugins
      },
      ...opts
    }
  };
  if (type === 'bar' || type === 'line') {
    config.options.scales = {
      x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
      y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.08)' } },
      ...opts.scales
    };
  }
  IND_CHARTS[id] = new Chart(canvas, config);
}

function _kpiCard(label, value, sub = '', color = '#B0F2AE', icon = '', tabKey = '') {
  const cleanLabel = label.replace(/'/g, "\\'");
  let infoHtml = '';
  if (label === 'Facturables') {
    infoHtml = `<div class="kpi-info-icon" title="Registros con cobro asociado (valores distintos de 'NO APLICA' y '0')">ⓘ</div>`;
  } else if (label === 'Atribuibles') {
    infoHtml = `<div class="kpi-info-icon" title="Registros con responsabilidad de retraso o falla asignada (valores distintos de 'NO APLICA' y '0')">ⓘ</div>`;
  }

  return `<div class="ind-kpi-card ind-kpi-clickable" onclick="openKpiWizard('${tabKey}', '${cleanLabel}')" style="cursor:pointer; position:relative;">
    ${infoHtml}
    <div class="ind-kpi-icon">${icon}</div>
    <div class="ind-kpi-value" style="color:${color}">${value}</div>
    <div class="ind-kpi-label">${label}</div>
    ${sub ? `<div class="ind-kpi-sub">${sub}</div>` : ''}
  </div>`;
}

function _trendChart(id, rows, dateField, label, color) {
  const byMonth = {};
  rows.forEach(r => {
    const d = _parseDate(r[dateField]);
    const k = _monthKey(d);
    if (k) byMonth[k] = (byMonth[k] || 0) + 1;
  });
  const months = Object.keys(byMonth).sort().slice(-18);
  _mkChart(id, 'line', months,
    [{
      label, data: months.map(m => byMonth[m] || 0),
      borderColor: color, backgroundColor: color.replace(')', ',0.1)').replace('rgb', 'rgba'),
      tension: 0.3, fill: true, pointRadius: 4
    }]
  );
}

function _deptoChart(id, rows, label, color) {
  const byDepto = _countBy(rows, 'DEPARTAMENTO');
  const top = _topN(byDepto, 10);
  _mkChart(id, 'bar', top.map(x => x[0]),
    [{ label, data: top.map(x => x[1]), backgroundColor: color }],
    { plugins: { legend: { display: false } }, indexAxis: 'y' }
  );
}


// ─────────────────────────────────────────────────────────────────
// Gráfica: Visita Técnica vs Soporte Telefónico (y otros)
// Usa un bar chart horizontal con colores semánticos por tipo.
// ─────────────────────────────────────────────────────────────────
function _formaAtencionChart(id, rows, col) {
  col = col || 'FORMA DE ATENCIÓN';
  const raw = _countBy(rows.filter(r => r[col] && r[col].toString().trim() !== '0' && r[col].toString().trim() !== ''), col);
  const entries = _topN(raw, 8);
  if (!entries.length) return;

  // Colores semánticos por tipo de forma
  const COLOR_MAP = {
    'VISITA_TÉCNICA': '#99D1FC',
    'VISITA_TECNICA': '#99D1FC',
    'VISITA TÉCNICA': '#99D1FC',
    'VISITA TECNICA': '#99D1FC',
    'SOPORTE_TELEFÓNICO': '#DFFF61',
    'SOPORTE_TELEFONICO': '#DFFF61',
    'SOPORTE TELEFÓNICO': '#DFFF61',
    'SOPORTE TELEFONICO': '#DFFF61',
    'SOPORTE_REMOTO': '#B0F2AE',
    'SOPORTE REMOTO': '#B0F2AE',
    'ENVIO_GUIA': '#99D1FC',
    'ENVIO GUIA': '#99D1FC',
    'GUIA': '#99D1FC',
  };
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const bgColors = entries.map(([k]) =>
    COLOR_MAP[k.toUpperCase().trim()] || '#B0F2AE'
  );

  _mkChart(id, 'bar',
    entries.map(([k]) => k),
    [{
      label: 'Gestiones',
      data: entries.map(([, n]) => n),
      backgroundColor: bgColors,
      borderRadius: 6,
      borderSkipped: false,
    }],
    {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              const val = ctx.raw || 0;
              const pct = total ? ((val / total) * 100).toFixed(1) + '%' : '0%';
              return ` ${val.toLocaleString('es-CO')} gestiones (${pct})`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          ticks: { color: '#FAFAFA', font: { size: 11, weight: '600' } },
          grid: { display: false }
        }
      }
    }
  );
}

function _slaRow(rows, field) {
  const si = rows.filter(r => (r[field] || '').toString().toUpperCase() === 'SI').length;
  const no = rows.filter(r => (r[field] || '').toString().toUpperCase() === 'NO').length;
  return { si, no };
}

function _indSlaChart(id, rows, field) {
  const data = _slaRow(rows, field);
  const total = data.si + data.no;

  _mkChart(id, 'doughnut', ['Dentro SLA', 'Fuera SLA'], [
    {
      data: [data.si, data.no],
      backgroundColor: ['#00825A', '#00825A'],
      borderColor: 'rgba(13,12,11,0.8)',
      borderWidth: 2
    }
  ], {
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#CBD5E1',
          font: { size: 10 }
        }
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            const val = context.raw || 0;
            const pct = total ? ((val / total) * 100).toFixed(1) + '%' : '0%';
            return ` ${context.label}: ${val.toLocaleString('es-CO')} (${pct})`;
          }
        }
      }
    },
    cutout: '65%'
  });
}

function _simpleTable(elId, entries, col1, total) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = `<table class="ind-table">
    <thead><tr><th>${col1}</th><th>Cantidad</th><th>%</th></tr></thead>
    <tbody>${entries.map(([k, n]) => `
      <tr><td>${k}</td><td>${_indFmt(n)}</td><td>${_indPct(n, total)}</td></tr>`).join('')}
    </tbody></table>`;
}

// ══════════════════════════════════════════════════════════════════
//  MOTOR DE FILTRADO DINÁMICO (SLICERS)
// ══════════════════════════════════════════════════════════════════
function _getTabDataset(tab) {
  if (!IND_RAW) return [];
  if (tab === 'cierres') {
    const oc = IND_RAW.oc_wompi || {};
    return [...(oc.cierres || []), ...(oc.cierres_abiertos || [])];
  }
  if (tab === 'papeleria') {
    const oc = IND_RAW.oc_wompi || {};
    return [...(oc.papeleria || []), ...(oc.papeleria_abiertos || [])];
  }
  if (tab === 'otras-oc') {
    const oc = IND_RAW.oc_wompi || {};
    return [...(oc.otras_oc || []), ...(oc.otras_oc_abiertos || [])];
  }
  if (tab === 'implementacion') {
    const impl = IND_RAW.implementacion || {};
    return [...(impl.bd || []), ...(impl.abiertos || [])];
  }
  if (tab === 'incidentes') {
    const inc = IND_RAW.incidentes || {};
    return [...(inc.cerrados || []), ...(inc.abiertos || [])];
  }
  return [];
}

// --- INICIALIZACIÓN DE FILTROS GLOBALES MULTISELECCIÓN ---
function initIndicadoresFilters() {
  if (!IND_RAW) return;

  const deptos = new Set();
  const ciudades = new Set();
  const redes = new Set();
  const estados = new Set();
  const tecnicos = new Set();
  const tipoActs = new Set();
  const responsables = new Set();
  const formatos = new Set();
  const anios = new Set();
  const meses = new Set();

  const tabs = ['cierres', 'papeleria', 'otras-oc', 'implementacion', 'incidentes'];
  tabs.forEach(tab => {
    const data = _getTabDataset(tab);
    data.forEach(r => {
      if (r['DEPARTAMENTO']) deptos.add(r['DEPARTAMENTO'].toString().trim());
      if (r['CIUDAD']) ciudades.add(r['CIUDAD'].toString().trim());

      const redVal = r['RED'] || r['RED ASOCIADA AL PUNTO'];
      if (redVal) redes.add(redVal.toString().trim());

      if (r['ESTADO']) estados.add(r['ESTADO'].toString().trim());

      const tecVal = r['TÉCNICO DE CAMPO'] || r['TÉCNICO'];
      if (tecVal) tecnicos.add(tecVal.toString().trim());

      const actVal = r['TIPO DE ACTIVIDAD'] || r['TIPO DE SOLICITUD'] || r['SOLICITUD'] || r['TIPO ACTIVIDAD'];
      if (actVal) tipoActs.add(actVal.toString().trim());

      const respVal = r['RESPONSABLE INCUMPLIMIENTO'] || r['RESPONSABLE DE INCUMPLIMIENTO'];
      if (respVal && respVal.toString().trim() !== '' && respVal.toString().toUpperCase().trim() !== 'NULL') {
        responsables.add(respVal.toString().trim());
      }

      if (r['FORMATO']) formatos.add(r['FORMATO'].toString().trim());

      const dateVal = r['FECHA DE APERTURA (DD/MM/AAAA)'] ||
        r['FECHA DE INICIO'] ||
        r['FECHA APERTURA DEL INCIDENTE (DD/MM/AAAA)'] ||
        r['FECHA DE SOLUCIÓN (DD/MM/AAAA)'] ||
        r['FECHA DE CIERRE (DD/MM/AAAA)'] ||
        r['FECHA DE FIN'];
      const d = _parseDate(dateVal);
      if (d) {
        anios.add(String(d.getFullYear()));
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        meses.add(monthNames[d.getMonth()]);
      }
    });
  });

  const sortAlpha = (set) => Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

  window._setupMS('ind-f-depto', sortAlpha(deptos));
  window._setupMS('ind-f-ciudad', sortAlpha(ciudades));
  window._setupMS('ind-f-red', sortAlpha(redes));
  window._setupMS('ind-f-estado', sortAlpha(estados));
  window._setupMS('ind-f-sla', ['SI', 'NO']);
  window._setupMS('ind-f-tecnico', sortAlpha(tecnicos));
  window._setupMS('ind-f-tipo-act', sortAlpha(tipoActs));
  window._setupMS('ind-f-responsable', sortAlpha(responsables));
  window._setupMS('ind-f-formato', sortAlpha(formatos));

  const sortedAnios = Array.from(anios).sort((a, b) => b - a);
  window._setupMS('ind-f-anio', sortedAnios);

  const monthOrder = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const sortedMeses = monthOrder.filter(m => meses.has(m));
  window._setupMS('ind-f-mes', sortedMeses);

  console.log('[IndicadoresCB] Filtros multiselección inicializados.');
}

function getFilteredIndData(tab) {
  const data = _getTabDataset(tab);

  const deptoSels = window._msGetSels('ind-f-depto');
  const ciudadSels = window._msGetSels('ind-f-ciudad');
  const redSels = window._msGetSels('ind-f-red');
  const estadoSels = window._msGetSels('ind-f-estado');
  const slaSels = window._msGetSels('ind-f-sla');
  const tecnicoSels = window._msGetSels('ind-f-tecnico');
  const tipoActSels = window._msGetSels('ind-f-tipo-act');
  const responsableSels = window._msGetSels('ind-f-responsable');
  const formatoSels = window._msGetSels('ind-f-formato');
  const anioSels = window._msGetSels('ind-f-anio');
  const mesSels = window._msGetSels('ind-f-mes');

  // Nuevos filtros de texto globales
  const globalCb = (document.getElementById('ind-f-cod-punto')?.value || '').toLowerCase().trim();
  const globalTicket = (document.getElementById('ind-f-ticket')?.value || '').toLowerCase().trim();

  return data.filter(r => {
    // 1. Departamento
    if (deptoSels) {
      const v = (r['DEPARTAMENTO'] || '').toString().trim().toUpperCase();
      if (!deptoSels.includes(v)) return false;
    }
    // 2. Ciudad
    if (ciudadSels) {
      const v = (r['CIUDAD'] || '').toString().trim().toUpperCase();
      if (!ciudadSels.includes(v)) return false;
    }
    // 3. Red
    if (redSels) {
      const v = (r['RED'] || r['RED ASOCIADA AL PUNTO'] || '').toString().trim().toUpperCase();
      if (!redSels.includes(v)) return false;
    }
    // 4. Estado
    if (estadoSels) {
      const v = (r['ESTADO'] || '').toString().trim().toUpperCase();
      if (!estadoSels.includes(v)) return false;
    }
    // 5. Cumple SLA
    if (slaSels) {
      const slaCol = tab === 'implementacion' ? 'CUMPLE SLA' : (tab === 'incidentes' ? 'DENTRO DE LOS SLAS' : 'DENTRO DE LOS SLA');
      const v = (r[slaCol] || '').toString().trim().toUpperCase();
      if (!slaSels.includes(v)) return false;
    }
    // 6. Técnico
    if (tecnicoSels) {
      const tecCol = tab === 'implementacion' ? 'TÉCNICO' : 'TÉCNICO DE CAMPO';
      const v = (r[tecCol] || '').toString().trim().toUpperCase();
      if (!tecnicoSels.includes(v)) return false;
    }
    // 7. Tipo de Actividad
    if (tipoActSels) {
      const actCol = tab === 'implementacion' ? 'TIPO DE SOLICITUD' : (tab === 'incidentes' ? 'TIPO ACTIVIDAD' : 'TIPO DE ACTIVIDAD');
      const v = (r[actCol] || r['SOLICITUD'] || '').toString().trim().toUpperCase();
      if (!tipoActSels.includes(v)) return false;
    }
    // 8. Responsable Incumplimiento
    if (responsableSels) {
      const respCol = tab === 'incidentes' ? 'RESPONSABLE DE INCUMPLIMIENTO' : 'RESPONSABLE INCUMPLIMIENTO';
      const v = (r[respCol] || '').toString().trim().toUpperCase();
      if (!responsableSels.includes(v)) return false;
    }
    // 9. Formato
    if (formatoSels) {
      const v = (r['FORMATO'] || '').toString().trim().toUpperCase();
      if (!formatoSels.includes(v)) return false;
    }
    // 10 y 11. Año y Mes
    if (anioSels || mesSels) {
      const dateVal = r['FECHA DE APERTURA (DD/MM/AAAA)'] ||
        r['FECHA DE INICIO'] ||
        r['FECHA APERTURA DEL INCIDENTE (DD/MM/AAAA)'] ||
        r['FECHA DE SOLUCIÓN (DD/MM/AAAA)'] ||
        r['FECHA DE CIERRE (DD/MM/AAAA)'] ||
        r['FECHA DE FIN'];
      const d = _parseDate(dateVal);
      if (d) {
        if (anioSels) {
          const yr = String(d.getFullYear()).toUpperCase();
          if (!anioSels.includes(yr)) return false;
        }
        if (mesSels) {
          const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
          const m = monthNames[d.getMonth()].toUpperCase();
          if (!mesSels.includes(m)) return false;
        }
      } else {
        return false;
      }
    }

    // Global Código de Punto (CB)
    if (globalCb) {
      const cbKeys = ['CB', 'CÓDIGO CB', 'CODIGO CB', 'CÓDIGO PUNTO', 'CODIGO PUNTO', 'CDIGO CB', 'CDIGO PUNTO'];
      const cbMatch = cbKeys.some(key => {
        const v = r[key];
        return v && v.toString().toLowerCase().includes(globalCb);
      });
      if (!cbMatch) return false;
    }

    // Global Número de Ticket (OC / Incident / OT)
    if (globalTicket) {
      const ticketKeys = ['OC', 'INCIDENTE', 'ORDEN DE TRABAJO', 'FORMULARIO'];
      const ticketMatch = ticketKeys.some(key => {
        const v = r[key];
        return v && v.toString().toLowerCase().includes(globalTicket);
      });
      if (!ticketMatch) return false;
    }

    return true;
  });
}

function populateIndFilters(tab) {
  // Obsoleto: los filtros son multiselección y se inicializan una vez al cargar datos
}

window.indApplyFilters = function () {
  Object.keys(IND_PAGES).forEach(k => IND_PAGES[k] = 1);
  const activeTab = window.currentActiveIndTab || 'cierres';
  _indRender(activeTab);
  _renderDetailTableOnly(activeTab);
};

window.indResetFilters = function () {
  const ids = [
    'ind-f-depto', 'ind-f-ciudad', 'ind-f-red', 'ind-f-estado',
    'ind-f-sla', 'ind-f-tecnico', 'ind-f-tipo-act', 'ind-f-responsable',
    'ind-f-formato', 'ind-f-anio', 'ind-f-mes'
  ];
  ids.forEach(id => {
    if (typeof window._msAction === 'function') {
      window._msAction(id, 'clear');
    }
  });

  // Limpiar filtros de texto globales
  const txtIds = ['ind-f-cod-punto', 'ind-f-ticket'];
  txtIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  Object.keys(IND_PAGES).forEach(k => IND_PAGES[k] = 1);

  const activeTab = window.currentActiveIndTab || 'cierres';
  _indRender(activeTab);
  _renderDetailTableOnly(activeTab);
};

// ══════════════════════════════════════════════════════════════════
//  DETALLE Y PAGINACIÓN DE TABLAS
// ══════════════════════════════════════════════════════════════════
window.indSearchTable = function (tab, val) {
  IND_SEARCH_TERMS[tab] = val || '';
  IND_PAGES[tab] = 1;
  _renderDetailTableOnly(tab);
};

window.indApplyTableFilters = function (tab) {
  IND_PAGES[tab] = 1;
  _renderDetailTableOnly(tab);
};

window.indGoPage = function (tab, page) {
  IND_PAGES[tab] = page;
  _renderDetailTableOnly(tab);
};

function indStatusClass(v) {
  if (typeof window.statusClass === 'function') return window.statusClass(v);
  const s = (v || '').toUpperCase();
  if (s === 'ENTREGADO' || s === 'CERRADO' || s === 'COMPLETADA' || s === 'EXITOSO') return 'status-entregado';
  if (s.includes('TRANSITO') || s.includes('TRÁNSITO') || s.includes('PROCESO') || s.includes('APERTURA')) return 'status-transito';
  if (s.includes('ALISTAMIENTO') || s.includes('ASIGNADO') || s.includes('PROGRAMADO')) return 'status-alistamiento';
  if (s.includes('DEVOLU') || s.includes('REMIT') || s.includes('REPROGRAMADO')) return 'status-devolucion';
  if (s === 'CANCELADO' || s === 'INCUMPLIMIENTO' || s === 'FALLIDA') return 'status-cancelado';
  return 'status-default';
}

function _getDetailTableColumns(tab) {
  const dataset = _getTabDataset(tab);
  if (!dataset || dataset.length === 0) return [];

  // Columna calculada: siempre primera
  const diasCol = {
    label: '⏱ Días Tras Vencimiento',
    key: '_dias_post_gestion',
    isCalculated: true,
    tabRef: tab
  };

  // Extraer todas las columnas del primer registro disponible
  const firstRow = dataset[0];
  const keys = Object.keys(firstRow).filter(k => k !== '_is_abierto' && k !== 'col_0' && k.trim() !== '');

  const rawCols = keys.map(k => {
    const isSLA = k.toUpperCase().includes('SLA') || k.toUpperCase().includes('SLAS') || k.toUpperCase() === 'CUMPLE SLA';
    return {
      label: k,
      key: k,
      isSLA: isSLA
    };
  });

  return [diasCol, ...rawCols];
}

function _renderDetailTableOnly(tab) {
  const filteredData = getFilteredIndData(tab);

  const search = (document.getElementById(`ind-search-${tab}`)?.value || '').toLowerCase().trim();
  const cbFilter = (document.getElementById(`ind-col-f-cb-${tab}`)?.value || '').toLowerCase().trim();
  const ticketFilter = (document.getElementById(`ind-col-f-ticket-${tab}`)?.value || '').toLowerCase().trim();

  const cols = _getDetailTableColumns(tab);
  const searchedData = filteredData.filter(r => {
    // 1. Filtro general de búsqueda
    if (search) {
      const matchSearch = cols.some(c => {
        const v = r[c.key];
        return v && v.toString().toLowerCase().includes(search);
      });
      if (!matchSearch) return false;
    }

    // 2. Filtro de Código de Punto (CB)
    if (cbFilter) {
      const cbKeys = ['CB', 'CÓDIGO CB', 'CODIGO CB', 'CÓDIGO PUNTO', 'CODIGO PUNTO', 'CDIGO CB', 'CDIGO PUNTO'];
      const cbMatch = cbKeys.some(key => {
        const v = r[key];
        return v && v.toString().toLowerCase().includes(cbFilter);
      });
      if (!cbMatch) return false;
    }

    // 3. Filtro de Ticket / OC / OT
    if (ticketFilter) {
      const ticketKeys = ['OC', 'INCIDENTE', 'ORDEN DE TRABAJO', 'FORMULARIO'];
      const ticketMatch = ticketKeys.some(key => {
        const v = r[key];
        return v && v.toString().toLowerCase().includes(ticketFilter);
      });
      if (!ticketMatch) return false;
    }

    return true;
  });

  const total = searchedData.length;
  const pages = Math.max(1, Math.ceil(total / IND_PAGE_SIZE));
  let curPage = IND_PAGES[tab] || 1;
  if (curPage > pages) curPage = pages;
  IND_PAGES[tab] = curPage;

  const start = (curPage - 1) * IND_PAGE_SIZE;
  const slice = searchedData.slice(start, start + IND_PAGE_SIZE);

  const tableWrap = document.getElementById(`ind-table-wrap-${tab}`);
  if (tableWrap) {
    if (slice.length === 0) {
      tableWrap.innerHTML = `<div style="padding:40px;text-align:center;color:#64748b;font-family:'Outfit',sans-serif;">Sin resultados para la búsqueda.</div>`;
    } else {
      // Guardar rows en window para poder abrirlas con doble clic
      window._currentDetailRows = window._currentDetailRows || {};
      window._currentDetailRows[tab] = searchedData;

      tableWrap.innerHTML = `<table class="ind-table">
        <thead>
          <tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${slice.map((r, i) => `
            <tr style="cursor: pointer;" 
                onclick="window.openRowDetailModal('${tab}', ${start + i})"
                title="⚡ Clic para ver gestión detallada">
              ${cols.map(c => {
        if (c.isCalculated) {
          const dias = _getDiasPostVencimiento(r, tab);
          return `<td style="text-align:center;">${_renderDiasPill(dias)}</td>`;
        }
        let v = _formatCellValue(c.key, r[c.key]);
        if (c.isSLA) {
          const upperVal = v.toString().toUpperCase().trim();
          const isOk = upperVal === 'SI' || upperVal === 'CUMPLE';
          const color = isOk ? '#00825A' : '#00825A';
          const bg = isOk ? 'rgba(0,130,90,.08)' : 'rgba(0,130,90,.08)';
          return `<td><span class="status-pill" style="color:${color};background:${bg};border:1px solid ${color}33;padding:3px 8px;border-radius:6px;font-weight:700;font-family:'JetBrains Mono',monospace;">${v}</span></td>`;
        }
        if (c.key === 'ESTADO') {
          return `<td><span class="status-pill ${indStatusClass(v)}">${v}</span></td>`;
        }
        return `<td>${v}</td>`;
      }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>`;
    }
  }

  const countEl = document.getElementById(`ind-count-${tab}`);
  if (countEl) countEl.textContent = `${total.toLocaleString('es-CO')} registros`;

  const pagEl = document.getElementById(`ind-pag-${tab}`);
  if (pagEl) {
    let html = `<button class="page-btn" onclick="indGoPage('${tab}', ${curPage - 1})" ${curPage === 1 ? 'disabled' : ''}>‹</button>`;
    const range = [];
    for (let i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - curPage) <= 2) range.push(i);
      else if (range[range.length - 1] !== '…') range.push('…');
    }
    range.forEach(p => {
      if (p === '…') html += `<span style="padding:4px 6px;color:#64748b;display:inline-flex;align-items:center">…</span>`;
      else html += `<button class="page-btn ${p === curPage ? 'active' : ''}" onclick="indGoPage('${tab}', ${p})">${p}</button>`;
    });
    html += `<button class="page-btn" onclick="indGoPage('${tab}', ${curPage + 1})" ${curPage === pages ? 'disabled' : ''}>›</button>`;
    pagEl.innerHTML = html;
  }
}

// ══════════════════════════════════════════════════════════════════
//  EXPORTAR A EXCEL (SHEETJS)
// ══════════════════════════════════════════════════════════════════
window.exportIndToExcel = function (tab) {
  const filteredData = getFilteredIndData(tab);
  if (!filteredData.length) {
    alert('Sin datos para exportar.');
    return;
  }

  const cols = _getDetailTableColumns(tab);

  const detailsSheetData = filteredData.map(r => {
    const obj = {};
    cols.forEach(c => {
      if (c.isCalculated) {
        const dias = _getDiasPostVencimiento(r, tab);
        obj[c.label] = dias === null ? '' : (dias <= 0 ? 'Al día' : dias + 'd retraso');
      } else {
        obj[c.label] = r[c.key] || '';
      }
    });
    return obj;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(detailsSheetData);

  ws['!cols'] = Object.keys(detailsSheetData[0] || {}).map(k => ({
    wch: Math.max(k.length, ...detailsSheetData.slice(0, 100).map(r => String(r[k] || '').length))
  }));

  XLSX.utils.book_append_sheet(wb, ws, 'Detalle Registros');

  let summaryData = [];
  if (tab === 'cierres') {
    const total = filteredData.length;
    const cerrados = filteredData.filter(r => !r._is_abierto);
    const abiertos = filteredData.filter(r => r._is_abierto);
    const sla = _slaRow(filteredData, 'DENTRO DE LOS SLA');
    const fact = filteredData.filter(r => _isTrueVal(r['FACTURABLE'])).length;
    const atrib = filteredData.filter(r => _isTrueVal(r['ATRIBUIBLE'])).length;
    summaryData = [
      { Indicador: 'Total Cierres', Valor: total },
      { Indicador: 'Cerrados', Valor: `${cerrados.length} (${_indPct(cerrados.length, total)})` },
      { Indicador: 'Abiertos', Valor: `${abiertos.length} (${_indPct(abiertos.length, total)})` },
      { Indicador: 'Dentro SLA', Valor: `${sla.si} (${_indPct(sla.si, total)})` },
      { Indicador: 'Fuera SLA', Valor: `${sla.no} (${_indPct(sla.no, total)})` },
      { Indicador: 'Facturables', Valor: `${fact} (${_indPct(fact, total)})` },
      { Indicador: 'Atribuibles', Valor: `${atrib} (${_indPct(atrib, total)})` }
    ];
  } else if (tab === 'papeleria') {
    const total = filteredData.length;
    const cerrados = filteredData.filter(r => !r._is_abierto);
    const abiertos = filteredData.filter(r => r._is_abierto);
    const sla = _slaRow(filteredData, 'DENTRO DE LOS SLA');
    const fact = filteredData.filter(r => _isTrueVal(r['FACTURABLE'])).length;
    const atrib = filteredData.filter(r => _isTrueVal(r['ATRIBUIBLE'])).length;
    summaryData = [
      { Indicador: 'Total Papelería', Valor: total },
      { Indicador: 'Cerradas', Valor: `${cerrados.length} (${_indPct(cerrados.length, total)})` },
      { Indicador: 'Abiertas', Valor: `${abiertos.length} (${_indPct(abiertos.length, total)})` },
      { Indicador: 'Dentro SLA', Valor: `${sla.si} (${_indPct(sla.si, total)})` },
      { Indicador: 'Fuera SLA', Valor: `${sla.no} (${_indPct(sla.no, total)})` },
      { Indicador: 'Facturables', Valor: `${fact} (${_indPct(fact, total)})` },
      { Indicador: 'Atribuibles', Valor: `${atrib} (${_indPct(atrib, total)})` }
    ];
  } else if (tab === 'otras-oc') {
    const total = filteredData.length;
    const cerrados = filteredData.filter(r => !r._is_abierto);
    const abiertos = filteredData.filter(r => r._is_abierto);
    const sla = _slaRow(filteredData, 'DENTRO DE LOS SLA');
    const fact = filteredData.filter(r => _isTrueVal(r['FACTURABLE'])).length;
    const atrib = filteredData.filter(r => _isTrueVal(r['ATRIBUIBLE'])).length;
    summaryData = [
      { Indicador: 'Total Otras OC', Valor: total },
      { Indicador: 'Cerradas', Valor: `${cerrados.length} (${_indPct(cerrados.length, total)})` },
      { Indicador: 'Abiertas', Valor: `${abiertos.length} (${_indPct(abiertos.length, total)})` },
      { Indicador: 'Dentro SLA', Valor: `${sla.si} (${_indPct(sla.si, total)})` },
      { Indicador: 'Fuera SLA', Valor: `${sla.no} (${_indPct(sla.no, total)})` },
      { Indicador: 'Facturables', Valor: `${fact} (${_indPct(fact, total)})` },
      { Indicador: 'Atribuibles', Valor: `${atrib} (${_indPct(atrib, total)})` }
    ];
  } else if (tab === 'implementacion') {
    const total = filteredData.length;
    const bd = filteredData.filter(r => !r._is_abierto);
    const abiertos = filteredData.filter(r => r._is_abierto);
    const cumpleSLA = filteredData.filter(r => (r['CUMPLE SLA'] || '').toString().toUpperCase() === 'SI').length;
    const noSLA = total - cumpleSLA;
    summaryData = [
      { Indicador: 'Total Actividades', Valor: total },
      { Indicador: 'Cerradas', Valor: `${bd.length} (${_indPct(bd.length, total)})` },
      { Indicador: 'Abiertas', Valor: `${abiertos.length} (${_indPct(abiertos.length, total)})` },
      { Indicador: 'Cumple SLA', Valor: `${cumpleSLA} (${_indPct(cumpleSLA, total)})` },
      { Indicador: 'Incumple SLA', Valor: `${noSLA} (${_indPct(noSLA, total)})` }
    ];
  } else if (tab === 'incidentes') {
    const total = filteredData.length;
    const cerrados = filteredData.filter(r => !r._is_abierto);
    const abiertos = filteredData.filter(r => r._is_abierto);
    const sla = _slaRow(filteredData, 'DENTRO DE LOS SLAS');
    const fact = filteredData.filter(r => _isTrueVal(r['FACTURABLE'])).length;
    const atrib = filteredData.filter(r => _isTrueVal(r['ATRIBUIBLE'])).length;
    summaryData = [
      { Indicador: 'Total Incidentes', Valor: total },
      { Indicador: 'Cerrados', Valor: `${cerrados.length} (${_indPct(cerrados.length, total)})` },
      { Indicador: 'Abiertos', Valor: `${abiertos.length} (${_indPct(abiertos.length, total)})` },
      { Indicador: 'Dentro SLA', Valor: `${sla.si} (${_indPct(sla.si, total)})` },
      { Indicador: 'Fuera SLA', Valor: `${sla.no} (${_indPct(sla.no, total)})` },
      { Indicador: 'Facturables', Valor: `${fact} (${_indPct(fact, total)})` },
      { Indicador: 'Atribuibles', Valor: `${atrib} (${_indPct(atrib, total)})` }
    ];
  }

  const ws2 = XLSX.utils.json_to_sheet(summaryData);
  ws2['!cols'] = [{ wch: 25 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumen KPIs');

  XLSX.writeFile(wb, `Reporte_Wompi_Indicadores_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

// ══════════════════════════════════════════════════════════════════
//  INTERACTIVE MODAL WIZARD PARA KPIs CLICKABLES
// ══════════════════════════════════════════════════════════════════
function _createKpiWizardModal() {
  let modal = document.getElementById('ind-kpi-wizard-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'ind-kpi-wizard-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(8, 8, 8, 0.85);
    backdrop-filter: blur(12px);
    z-index: 99999;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
    font-family: 'Outfit', sans-serif;
  `;

  modal.innerHTML = `
    <div style="
      background: linear-gradient(145deg, #161514, #0D0C0B);
      border: 1px solid rgba(223, 255, 97, 0.2);
      border-radius: 20px;
      width: 90%;
      max-width: 1200px;
      height: 85vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 50px rgba(0,0,0,0.8);
      overflow: hidden;
      position: relative;
      animation: indModalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    ">
      <!-- Header -->
      <div style="
        padding: 20px 24px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(0,0,0,0.2);
      ">
        <div>
          <h2 id="ind-wizard-title" style="margin: 0; font-family: 'Syne', sans-serif; font-size: 20px; color: #DFFF61; font-weight: 800; letter-spacing: -0.5px;">Detalle KPI</h2>
          <p id="ind-wizard-subtitle" style="margin: 4px 0 0; font-size: 12px; color: #64748b;">Registros detallados que componen este indicador</p>
        </div>
        <div style="display: flex; gap: 12px; align-items: center;">
          <input type="text" id="ind-wizard-search" placeholder="🔍 Buscar en este KPI..." 
            style="
              background: rgba(255,255,255,.05);
              border: 1px solid rgba(223, 255, 97, 0.2);
              border-radius: 8px;
              padding: 8px 16px;
              color: #fff;
              font-size: 13px;
              width: 250px;
              outline: none;
              box-sizing: border-box;
            ">
          <button id="ind-wizard-export" style="
            background: rgba(223, 255, 97, 0.1);
            border: 1px solid rgba(223, 255, 97, 0.3);
            color: #DFFF61;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s;
          " onmouseover="this.style.background='rgba(223, 255, 97, 0.2)'" onmouseout="this.style.background='rgba(223, 255, 97, 0.1)'">
            ⬇ Exportar Excel
          </button>
          <button onclick="closeKpiWizard()" style="
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #94a3b8;
            padding: 8px 14px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s;
          " onmouseover="this.style.color='#fff';this.style.background='rgba(255, 255, 255, 0.1)'" onmouseout="this.style.color='#94a3b8';this.style.background='rgba(255, 255, 255, 0.05)'">
            Cerrar ✕
          </button>
        </div>
      </div>

      <!-- Body -->
      <div id="ind-wizard-body" style="
        flex: 1;
        overflow: auto;
        padding: 20px 24px;
        background: rgba(0,0,0,0.1);
      ">
        <div id="ind-wizard-breakdown"></div>
        <div id="ind-wizard-table-wrap">
          <div class="loading"><div class="spinner"></div></div>
        </div>
      </div>

      <!-- Footer -->
      <div style="
        padding: 14px 24px;
        border-top: 1px solid rgba(255,255,255,0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(0,0,0,0.2);
      ">
        <span id="ind-wizard-count" style="font-size: 12px; color: #94a3b8; font-family: 'Outfit', sans-serif;">0 registros</span>
        <div id="ind-wizard-pagination" style="display: flex; gap: 4px; align-items: center;"></div>
      </div>
    </div>
    
    <style>
      @keyframes indModalSlideUp {
        from { transform: translateY(30px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .ind-kpi-card.ind-kpi-clickable:hover {
        transform: translateY(-3px);
        border-color: rgba(223,255,97,0.4)!important;
        box-shadow: 0 8px 24px rgba(223,255,97,0.12)!important;
        background: rgba(255,255,255,0.06)!important;
      }
      .kpi-info-icon {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 15px;
        height: 15px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 50%;
        color: rgba(255,255,255,0.35);
        font-size: 9px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: help;
        transition: all 0.2s;
        z-index: 10;
      }
      .kpi-info-icon:hover {
        background: rgba(223, 255, 97, 0.15);
        border-color: rgba(223, 255, 97, 0.4);
        color: #DFFF61;
      }
    </style>
  `;

  document.body.appendChild(modal);
  return modal;
}

function _getKpiBreakdownHtml(rows, field, label) {
  const counts = {};
  let total = 0;
  rows.forEach(r => {
    let v = r[field];
    if (v === null || v === undefined || v === '') v = '(Sin dato)';
    else v = v.toString().trim().toUpperCase();
    counts[v] = (counts[v] || 0) + 1;
    total++;
  });

  if (total === 0) return '';

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  const desc = field === 'FACTURABLE'
    ? 'Este indicador agrupa todos los registros que poseen un cobro asociado (valores distintos de <strong>"NO APLICA"</strong> y <strong>"0"</strong>). A continuación, se detalla a qué entidad o actor se le factura el costo de la actividad:'
    : 'Este indicador agrupa los registros donde se ha identificado y asignado la responsabilidad o el motivo de la falla/incumplimiento (valores distintos de <strong>"NO APLICA"</strong> y <strong>"0"</strong>). A continuación, se muestra a quién es atribuible dicho retraso o incumplimiento:';

  return `
    <div style="
      background: rgba(223, 255, 97, 0.03);
      border: 1px solid rgba(223, 255, 97, 0.15);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
      font-family: 'Outfit', sans-serif;
    ">
      <div style="font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 700; color: #DFFF61; margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
        💡 Explicación del KPI: ${label}
      </div>
      <div style="font-size: 11.5px; color: #94a3b8; line-height: 1.5; margin-bottom: 16px;">
        ${desc}
      </div>
      <div style="font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 700; color: #fff; margin-bottom: 10px;">
        Desglose de Distribución:
      </div>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${sorted.map(([name, count]) => {
    const pct = ((count / total) * 100).toFixed(1);
    return `
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: #CBD5E1; margin-bottom: 4px;">
                <span>${name}</span>
                <span style="font-weight: 700; color: #B0F2AE;">${count.toLocaleString('es-CO')} (${pct}%)</span>
              </div>
              <div style="height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden;">
                <div style="height: 100%; width: ${pct}%; background: linear-gradient(90deg, #DFFF61, #00825A); border-radius: 3px;"></div>
              </div>
            </div>
          `;
  }).join('')}
      </div>
    </div>
  `;
}

window.openKpiWizard = function (tab, label) {
  WIZARD_ACTIVE_TAB = tab;
  WIZARD_ACTIVE_LABEL = label;
  WIZARD_SEARCH = '';
  WIZARD_PAGE = 1;

  const todos = getFilteredIndData(tab);
  let kpiRows = [];
  const normLabel = label.toUpperCase().trim();

  // Mapear el KPI a su respectivo subconjunto de filas filtradas
  if (tab === 'cierres') {
    if (normLabel.includes('TOTAL')) kpiRows = todos;
    else if (normLabel.includes('CERRADO')) kpiRows = todos.filter(r => !r._is_abierto);
    else if (normLabel.includes('ABIERTO')) kpiRows = todos.filter(r => r._is_abierto);
    else if (normLabel.includes('DENTRO') || normLabel.includes('CUMPLE')) kpiRows = todos.filter(r => (r['DENTRO DE LOS SLA'] || '').toString().toUpperCase() === 'SI');
    else if (normLabel.includes('FUERA') || normLabel.includes('INCUMPLE')) kpiRows = todos.filter(r => (r['DENTRO DE LOS SLA'] || '').toString().toUpperCase() === 'NO');
    else if (normLabel.includes('FACTURABLE')) kpiRows = todos.filter(r => _isTrueVal(r['FACTURABLE']));
    else if (normLabel.includes('ATRIBUIBLE')) kpiRows = todos.filter(r => _isTrueVal(r['ATRIBUIBLE']));
    else if (normLabel.includes('EXITOS')) kpiRows = todos.filter(r => {
      const s = (r['ESTADO'] || '').toString().toUpperCase().trim();
      return s === 'EJECUTADO_EXITOSO' || s === 'EXITOSO';
    });
    else if (normLabel.includes('LOCALIZA')) kpiRows = todos.filter(r => {
      const s = (r['ESTADO'] || '').toString().toUpperCase().trim();
      return s === 'ILOCALIZADO' || s === 'NO_LOCALIZADO' || s === 'NO LOCALIZADO';
    });
    else kpiRows = todos;
  }
  else if (tab === 'papeleria') {
    if (normLabel.includes('TOTAL')) kpiRows = todos;
    else if (normLabel.includes('CERRADO') || normLabel.includes('CERRADA')) kpiRows = todos.filter(r => !r._is_abierto);
    else if (normLabel.includes('ABIERTO') || normLabel.includes('ABIERTA')) kpiRows = todos.filter(r => r._is_abierto);
    else if (normLabel.includes('DENTRO') || normLabel.includes('CUMPLE')) kpiRows = todos.filter(r => (r['DENTRO DE LOS SLA'] || '').toString().toUpperCase() === 'SI');
    else if (normLabel.includes('FUERA') || normLabel.includes('INCUMPLE')) kpiRows = todos.filter(r => (r['DENTRO DE LOS SLA'] || '').toString().toUpperCase() === 'NO');
    else if (normLabel.includes('FACTURABLE')) kpiRows = todos.filter(r => _isTrueVal(r['FACTURABLE']));
    else if (normLabel.includes('ATRIBUIBLE')) kpiRows = todos.filter(r => _isTrueVal(r['ATRIBUIBLE']));
    else if (normLabel.includes('EXITOS')) kpiRows = todos.filter(r => {
      const s = (r['ESTADO'] || '').toString().toUpperCase().trim();
      return s === 'EJECUTADO_EXITOSO' || s === 'EXITOSO';
    });
    else if (normLabel.includes('LOCALIZA')) kpiRows = todos.filter(r => {
      const s = (r['ESTADO'] || '').toString().toUpperCase().trim();
      return s === 'ILOCALIZADO' || s === 'NO_LOCALIZADO' || s === 'NO LOCALIZADO';
    });
    else kpiRows = todos;
  }
  else if (tab === 'otras-oc') {
    if (normLabel.includes('TOTAL')) kpiRows = todos;
    else if (normLabel.includes('CERRADO') || normLabel.includes('CERRADA')) kpiRows = todos.filter(r => !r._is_abierto);
    else if (normLabel.includes('ABIERTO') || normLabel.includes('ABIERTA')) kpiRows = todos.filter(r => r._is_abierto);
    else if (normLabel.includes('TRASLADO')) kpiRows = todos.filter(r => (r['SOLICITUD'] || '').toString().toUpperCase() === 'TRASLADO');
    else if (normLabel.includes('PUBLICIDAD')) kpiRows = todos.filter(r => (r['SOLICITUD'] || '').toString().toUpperCase() === 'PUBLICIDAD');
    else if (normLabel.includes('PINPAD')) kpiRows = todos.filter(r => (r['SOLICITUD'] || '').toString().toUpperCase() === 'PINPAD');
    else if (normLabel.includes('DENTRO') || normLabel.includes('CUMPLE')) kpiRows = todos.filter(r => (r['DENTRO DE LOS SLA'] || '').toString().toUpperCase() === 'SI');
    else if (normLabel.includes('FUERA') || normLabel.includes('INCUMPLE')) kpiRows = todos.filter(r => (r['DENTRO DE LOS SLA'] || '').toString().toUpperCase() === 'NO');
    else if (normLabel.includes('FACTURABLE')) kpiRows = todos.filter(r => _isTrueVal(r['FACTURABLE']));
    else if (normLabel.includes('ATRIBUIBLE')) kpiRows = todos.filter(r => _isTrueVal(r['ATRIBUIBLE']));
    else if (normLabel.includes('EXITOS')) kpiRows = todos.filter(r => {
      const s = (r['ESTADO'] || '').toString().toUpperCase().trim();
      return s === 'EJECUTADO_EXITOSO' || s === 'EXITOSO';
    });
    else if (normLabel.includes('LOCALIZA')) kpiRows = todos.filter(r => {
      const s = (r['ESTADO'] || '').toString().toUpperCase().trim();
      return s === 'ILOCALIZADO' || s === 'NO_LOCALIZADO' || s === 'NO LOCALIZADO';
    });
    else kpiRows = todos;
  }
  else if (tab === 'implementacion') {
    if (normLabel.includes('TOTAL')) kpiRows = todos;
    else if (normLabel.includes('CERRADO') || normLabel.includes('CERRADA')) kpiRows = todos.filter(r => !r._is_abierto);
    else if (normLabel.includes('ABIERTO') || normLabel.includes('ABIERTA')) kpiRows = todos.filter(r => r._is_abierto);
    else if (normLabel.includes('CUMPLE') || normLabel.includes('DENTRO')) kpiRows = todos.filter(r => (r['CUMPLE SLA'] || '').toString().toUpperCase() === 'SI');
    else if (normLabel.includes('INCUMPLE') || normLabel.includes('FUERA')) kpiRows = todos.filter(r => (r['CUMPLE SLA'] || '').toString().toUpperCase() === 'NO');
    else if (normLabel.includes('EXITOS')) kpiRows = todos.filter(r => {
      const s = (r['ESTADO'] || '').toString().toUpperCase().trim();
      return s === 'EJECUTADO_EXITOSO' || s === 'EXITOSO' || s === 'IMPLEMENTADO';
    });
    else if (normLabel.includes('LOCALIZA')) kpiRows = todos.filter(r => {
      const s = (r['ESTADO'] || '').toString().toUpperCase().trim();
      return s === 'ILOCALIZADO' || s === 'NO_LOCALIZADO' || s === 'NO LOCALIZADO';
    });
    else kpiRows = todos;
  }
  else if (tab === 'incidentes') {
    if (normLabel.includes('TOTAL')) kpiRows = todos;
    else if (normLabel.includes('CERRADO') || normLabel.includes('CERRADA')) kpiRows = todos.filter(r => !r._is_abierto);
    else if (normLabel.includes('ABIERTO') || normLabel.includes('ABIERTA')) kpiRows = todos.filter(r => r._is_abierto);
    else if (normLabel.includes('DENTRO') || normLabel.includes('CUMPLE')) kpiRows = todos.filter(r => (r['DENTRO DE LOS SLAS'] || '').toString().toUpperCase() === 'SI');
    else if (normLabel.includes('FUERA') || normLabel.includes('INCUMPLE')) kpiRows = todos.filter(r => (r['DENTRO DE LOS SLAS'] || '').toString().toUpperCase() === 'NO');
    else if (normLabel.includes('FACTURABLE')) kpiRows = todos.filter(r => _isTrueVal(r['FACTURABLE']));
    else if (normLabel.includes('ATRIBUIBLE')) kpiRows = todos.filter(r => _isTrueVal(r['ATRIBUIBLE']));
    else if (normLabel.includes('EXITOS')) kpiRows = todos.filter(r => {
      const s = (r['ESTADO'] || '').toString().toUpperCase().trim();
      return s === 'EJECUTADO_EXITOSO' || s === 'EXITOSO' || s === 'CERRADO';
    });
    else if (normLabel.includes('LOCALIZA')) kpiRows = todos.filter(r => {
      const s = (r['ESTADO'] || '').toString().toUpperCase().trim();
      return s === 'ILOCALIZADO' || s === 'NO_LOCALIZADO' || s === 'NO LOCALIZADO';
    });
    else kpiRows = todos;
  }

  WIZARD_ROWS = kpiRows;

  const modal = _createKpiWizardModal();
  modal.style.display = 'flex';

  const tLabel = tab.toUpperCase().replace('-', ' ');
  document.getElementById('ind-wizard-title').textContent = `${label} (${tLabel})`;
  document.getElementById('ind-wizard-subtitle').textContent = `Total de registros filtrados bajo este KPI: ${kpiRows.length}`;

  const searchInput = document.getElementById('ind-wizard-search');
  if (searchInput) {
    searchInput.value = '';
    searchInput.oninput = function (e) {
      WIZARD_SEARCH = e.target.value || '';
      WIZARD_PAGE = 1;
      _renderWizardTableOnly();
    };
  }

  const exportBtn = document.getElementById('ind-wizard-export');
  if (exportBtn) {
    exportBtn.onclick = function () {
      exportWizardToExcel();
    };
  }

  const breakdownEl = document.getElementById('ind-wizard-breakdown');
  if (breakdownEl) {
    if (normLabel.includes('FACTURABLE')) {
      breakdownEl.innerHTML = _getKpiBreakdownHtml(kpiRows, 'FACTURABLE', 'Facturables (Cobro Asociado)');
    } else if (normLabel.includes('ATRIBUIBLE')) {
      const field = tab === 'incidentes' ? 'RESPONSABLE DE INCUMPLIMIENTO' : 'RESPONSABLE INCUMPLIMIENTO';
      breakdownEl.innerHTML = _getKpiBreakdownHtml(kpiRows, field, 'Atribuibles (Responsables de Retraso)');
    } else {
      breakdownEl.innerHTML = '';
    }
  }

  _renderWizardTableOnly();
};

window.closeKpiWizard = function () {
  const modal = document.getElementById('ind-kpi-wizard-modal');
  if (modal) modal.style.display = 'none';
};

window.wizardGoPage = function (p) {
  WIZARD_PAGE = p;
  _renderWizardTableOnly();
};

function _renderWizardTableOnly() {
  const tab = WIZARD_ACTIVE_TAB;
  const cols = _getDetailTableColumns(tab);

  const search = WIZARD_SEARCH.toLowerCase();
  const searchedData = WIZARD_ROWS.filter(r => {
    if (!search) return true;
    return cols.some(c => {
      const v = r[c.key];
      return v && v.toString().toLowerCase().includes(search);
    });
  });

  const total = searchedData.length;
  const pages = Math.max(1, Math.ceil(total / WIZARD_PAGE_SIZE));
  let curPage = WIZARD_PAGE || 1;
  if (curPage > pages) curPage = pages;
  WIZARD_PAGE = curPage;

  const start = (curPage - 1) * WIZARD_PAGE_SIZE;
  const slice = searchedData.slice(start, start + WIZARD_PAGE_SIZE);

  const tableWrap = document.getElementById('ind-wizard-table-wrap');
  if (tableWrap) {
    if (slice.length === 0) {
      tableWrap.innerHTML = `<div style="padding:40px;text-align:center;color:#64748b;font-family:'Outfit',sans-serif;">Sin resultados para la búsqueda.</div>`;
    } else {
      // Guardar rows en window para poder abrirlas con doble clic
      window._currentWizardRows = searchedData;

      tableWrap.innerHTML = `<table class="ind-table">
        <thead>
          <tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${slice.map((r, i) => `
            <tr style="cursor: pointer;" 
                onclick="window.openWizardRowDetailModal(${start + i})"
                title="⚡ Clic para ver gestión detallada">
              ${cols.map(c => {
        if (c.isCalculated) {
          const dias = _getDiasPostVencimiento(r, WIZARD_ACTIVE_TAB);
          return `<td style="text-align:center;">${_renderDiasPill(dias)}</td>`;
        }
        let v = _formatCellValue(c.key, r[c.key]);
        if (c.isSLA) {
          const upperVal = v.toString().toUpperCase().trim();
          const isOk = upperVal === 'SI' || upperVal === 'CUMPLE';
          const color = isOk ? '#00825A' : '#00825A';
          const bg = isOk ? 'rgba(0,130,90,.08)' : 'rgba(0,130,90,.08)';
          return `<td><span class="status-pill" style="color:${color};background:${bg};border:1px solid ${color}33;padding:3px 8px;border-radius:6px;font-weight:700;font-family:'JetBrains Mono',monospace;">${v}</span></td>`;
        }
        if (c.key === 'ESTADO') {
          return `<td><span class="status-pill ${indStatusClass(v)}">${v}</span></td>`;
        }
        return `<td>${v}</td>`;
      }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>`;
    }
  }

  const countEl = document.getElementById('ind-wizard-count');
  if (countEl) countEl.textContent = `${total.toLocaleString('es-CO')} registros`;

  const pagEl = document.getElementById('ind-wizard-pagination');
  if (pagEl) {
    let html = `<button class="page-btn" onclick="wizardGoPage(${curPage - 1})" ${curPage === 1 ? 'disabled' : ''}>‹</button>`;
    const range = [];
    for (let i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - curPage) <= 2) range.push(i);
      else if (range[range.length - 1] !== '…') range.push('…');
    }
    range.forEach(p => {
      if (p === '…') html += `<span style="padding:4px 6px;color:#64748b;display:inline-flex;align-items:center">…</span>`;
      else html += `<button class="page-btn ${p === curPage ? 'active' : ''}" onclick="wizardGoPage(${p})">${p}</button>`;
    });
    html += `<button class="page-btn" onclick="wizardGoPage(${curPage + 1})" ${curPage === pages ? 'disabled' : ''}>›</button>`;
    pagEl.innerHTML = html;
  }
}

function exportWizardToExcel() {
  const search = WIZARD_SEARCH.toLowerCase();
  const cols = _getDetailTableColumns(WIZARD_ACTIVE_TAB);
  const searchedData = WIZARD_ROWS.filter(r => {
    if (!search) return true;
    return cols.some(c => {
      const v = r[c.key];
      return v && v.toString().toLowerCase().includes(search);
    });
  });

  if (!searchedData.length) {
    alert('Sin datos para exportar.');
    return;
  }

  const detailsSheetData = searchedData.map(r => {
    const obj = {};
    cols.forEach(c => {
      if (c.isCalculated) {
        const dias = _getDiasPostVencimiento(r, WIZARD_ACTIVE_TAB);
        obj[c.label] = dias === null ? '' : (dias <= 0 ? 'Al día' : dias + 'd retraso');
      } else {
        obj[c.label] = r[c.key] || '';
      }
    });
    return obj;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(detailsSheetData);

  ws['!cols'] = Object.keys(detailsSheetData[0] || {}).map(k => ({
    wch: Math.max(k.length, ...detailsSheetData.slice(0, 100).map(r => String(r[k] || '').length))
  }));

  XLSX.utils.book_append_sheet(wb, ws, 'Detalle KPI');

  const summaryData = [
    { Detalle: 'Tablero Origen', Valor: WIZARD_ACTIVE_TAB.toUpperCase() },
    { Detalle: 'KPI Seleccionado', Valor: WIZARD_ACTIVE_LABEL },
    { Detalle: 'Total de Registros', Valor: searchedData.length },
    { Detalle: 'Filtro de búsqueda utilizado', Valor: WIZARD_SEARCH || '(Ninguno)' },
    { Detalle: 'Fecha de Exportación', Valor: new Date().toLocaleString('es-CO') }
  ];
  const ws2 = XLSX.utils.json_to_sheet(summaryData);
  ws2['!cols'] = [{ wch: 30 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Info Exportación');

  const cleanLabel = WIZARD_ACTIVE_LABEL.replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(wb, `Reporte_KPI_${WIZARD_ACTIVE_TAB}_${cleanLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ══════════════════════════════════════════════════════════════════
//  TAB: CIERRES CB
// ══════════════════════════════════════════════════════════════════
function renderIndCierres() {
  if (!IND_RAW) return;
  const todos = getFilteredIndData('cierres');
  const cerrados = todos.filter(r => !r._is_abierto);
  const abiertos = todos.filter(r => r._is_abierto);
  const total = todos.length;

  const sla = _slaRow(todos, 'DENTRO DE LOS SLA');
  const fact = todos.filter(r => _isTrueVal(r['FACTURABLE'])).length;
  const atrib = todos.filter(r => _isTrueVal(r['ATRIBUIBLE'])).length;

  const kpisEl = document.getElementById('ind-cierres-kpis');
  if (kpisEl) {
    const exitosos = todos.filter(r => {
      const s = (r['ESTADO'] || '').toString().toUpperCase().trim();
      return s === 'EJECUTADO_EXITOSO' || s === 'EXITOSO';
    }).length;
    const ilocalizados = todos.filter(r => {
      const s = (r['ESTADO'] || '').toString().toUpperCase().trim();
      return s === 'ILOCALIZADO' || s === 'NO_LOCALIZADO' || s === 'NO LOCALIZADO';
    }).length;

    kpisEl.innerHTML =
      _kpiCard('Total Cierres', _indFmt(total), '', '#DFFF61', '🔒', 'cierres') +
      _kpiCard('Cerrados', _indFmt(cerrados.length), _indPct(cerrados.length, total), '#B0F2AE', '✅', 'cierres') +
      _kpiCard('Abiertos', _indFmt(abiertos.length), _indPct(abiertos.length, total), '#99D1FC', '🔓', 'cierres') +
      _kpiCard('Exitosos', _indFmt(exitosos), _indPct(exitosos, total), '#00825A', '🏆', 'cierres') +
      _kpiCard('No Localizados', _indFmt(ilocalizados), _indPct(ilocalizados, total), '#99D1FC', '📍', 'cierres') +
      _kpiCard('Dentro SLA', _indFmt(sla.si), _indPct(sla.si, total), '#00825A', '🎯', 'cierres') +
      _kpiCard('Fuera SLA', _indFmt(sla.no), _indPct(sla.no, total), '#00825A', '⚠️', 'cierres') +
      _kpiCard('Facturables', _indFmt(fact), _indPct(fact, total), '#99D1FC', '💰', 'cierres');
  }

  // Causal top (horizontal) - filtrar éxitos y agendados para ver causales de retraso reales
  const byCausal = _countBy(todos.filter(r => {
    const c = (r['CAUSAL'] || '').toString().toUpperCase().trim();
    return c && c !== 'CIERRE EXITOSO' && c !== 'EJECUTADO EXITOSO' && c !== 'AGENDADO' && c !== 'N/A' && c !== '0';
  }), 'CAUSAL');
  const causalTop = _topN(byCausal, 8);
  _mkChart('ind-cierres-chart-causal', 'bar', causalTop.map(x => x[0]),
    [{ label: 'Cierres', data: causalTop.map(x => x[1]), backgroundColor: '#99D1FC' }],
    { plugins: { legend: { display: false } }, indexAxis: 'y' }
  );

  // Estado doughnut
  const byEstado = _countBy(todos, 'ESTADO');
  const estEntries = Object.entries(byEstado);
  _mkChart('ind-cierres-chart-estado', 'doughnut',
    estEntries.map(x => x[0]),
    [{ data: estEntries.map(x => x[1]), backgroundColor: IND_COLORS }],
    { plugins: { legend: { position: 'right', labels: { color: '#CBD5E1', font: { size: 10 } } } } }
  );

  // SLA Doughnut
  _indSlaChart('ind-cierres-chart-sla', todos, 'DENTRO DE LOS SLA');

  // Tendencia mensual
  _trendChart('ind-cierres-chart-trend', todos,
    'FECHA DE APERTURA (DD/MM/AAAA)', 'Cierres / mes', '#99D1FC');

  // Top departamentos
  _deptoChart('ind-cierres-chart-depto', todos, 'Cierres', '#DFFF61');

  // Tabla tipo actividad
  const byAct = _countBy(todos.filter(r => r['TIPO DE ACTIVIDAD']), 'TIPO DE ACTIVIDAD');
  _simpleTable('ind-cierres-table-act', _topN(byAct, 8), 'Tipo Actividad', total);

  // Tabla técnico
  const byTec = _countBy(todos.filter(r => r['TÉCNICO DE CAMPO']), 'TÉCNICO DE CAMPO');
  _simpleTable('ind-cierres-table-tec', _topN(byTec, 8), 'Técnico de Campo', total);

  // Forma de Atención: Visita Técnica vs Soporte Telefónico
  _formaAtencionChart('ind-cierres-chart-forma', todos, 'FORMA DE ATENCIÓN');
}

// ══════════════════════════════════════════════════════════════════
//  TAB: PAPELERÍA
// ══════════════════════════════════════════════════════════════════
function renderIndPapeleria() {
  if (!IND_RAW) return;
  const todos = getFilteredIndData('papeleria');
  const cerrados = todos.filter(r => !r._is_abierto);
  const abiertos = todos.filter(r => r._is_abierto);
  const total = todos.length;

  const sla = _slaRow(todos, 'DENTRO DE LOS SLA');
  const fact = todos.filter(r => _isTrueVal(r['FACTURABLE'])).length;
  const atrib = todos.filter(r => _isTrueVal(r['ATRIBUIBLE'])).length;

  const kpisEl = document.getElementById('ind-pp-kpis');
  if (kpisEl) {
    const exitosos = todos.filter(r => {
      const s = (r['ESTADO'] || '').toString().toUpperCase().trim();
      return s === 'EJECUTADO_EXITOSO' || s === 'EXITOSO';
    }).length;
    const ilocalizados = todos.filter(r => {
      const s = (r['ESTADO'] || '').toString().toUpperCase().trim();
      return s === 'ILOCALIZADO' || s === 'NO_LOCALIZADO' || s === 'NO LOCALIZADO';
    }).length;

    kpisEl.innerHTML =
      _kpiCard('Total Papelería', _indFmt(total), '', '#DFFF61', '📦', 'papeleria') +
      _kpiCard('Cerradas', _indFmt(cerrados.length), _indPct(cerrados.length, total), '#B0F2AE', '✅', 'papeleria') +
      _kpiCard('Abiertas', _indFmt(abiertos.length), _indPct(abiertos.length, total), '#99D1FC', '🔓', 'papeleria') +
      _kpiCard('Exitosas', _indFmt(exitosos), _indPct(exitosos, total), '#00825A', '🏆', 'papeleria') +
      _kpiCard('No Localizadas', _indFmt(ilocalizados), _indPct(ilocalizados, total), '#99D1FC', '📍', 'papeleria') +
      _kpiCard('Dentro SLA', _indFmt(sla.si), _indPct(sla.si, total), '#00825A', '🎯', 'papeleria') +
      _kpiCard('Fuera SLA', _indFmt(sla.no), _indPct(sla.no, total), '#00825A', '⚠️', 'papeleria') +
      _kpiCard('Facturables', _indFmt(fact), _indPct(fact, total), '#99D1FC', '💰', 'papeleria');
  }

  // Tipo de actividad
  const byAct = _countBy(todos.filter(r => r['TIPO DE ACTIVIDAD']), 'TIPO DE ACTIVIDAD');
  const actTop = _topN(byAct, 8);
  _mkChart('ind-pp-chart-act', 'bar', actTop.map(x => x[0]),
    [{ label: 'OC', data: actTop.map(x => x[1]), backgroundColor: IND_COLORS.slice(0, actTop.length) }],
    { plugins: { legend: { display: false } } }
  );

  // Estado
  const byEstado = _countBy(todos, 'ESTADO');
  const estEntries = Object.entries(byEstado);
  _mkChart('ind-pp-chart-estado', 'doughnut',
    estEntries.map(x => x[0]),
    [{ data: estEntries.map(x => x[1]), backgroundColor: IND_COLORS }],
    { plugins: { legend: { position: 'right', labels: { color: '#CBD5E1', font: { size: 10 } } } } }
  );

  // SLA Doughnut
  _indSlaChart('ind-pp-chart-sla', todos, 'DENTRO DE LOS SLA');

  // Tendencia mensual
  _trendChart('ind-pp-chart-trend', todos,
    'FECHA DE APERTURA (DD/MM/AAAA)', 'Papelería / mes', '#B0F2AE');

  // Top departamentos
  _deptoChart('ind-pp-chart-depto', todos, 'Papelería', '#B0F2AE');

  // Tabla causal
  const byCausal = _countBy(todos.filter(r => {
    const c = (r['CAUSAL'] || '').toString().toUpperCase().trim();
    return c && c !== 'CIERRE EXITOSO' && c !== 'EJECUTADO EXITOSO' && c !== 'AGENDADO' && c !== 'N/A' && c !== '0';
  }), 'CAUSAL');
  _simpleTable('ind-pp-table-causal', _topN(byCausal, 8), 'Causal', total);

  // Causal Top 8 Bar Chart - de retraso real
  const causalTop = _topN(byCausal, 8);
  _mkChart('ind-pp-chart-causal', 'bar', causalTop.map(x => x[0]),
    [{ label: 'Papelería', data: causalTop.map(x => x[1]), backgroundColor: '#B0F2AE' }],
    { plugins: { legend: { display: false } }, indexAxis: 'y' }
  );

  // Tabla operador logístico
  const byOp = _countBy(todos.filter(r => r['OPERADOR LOGÍSTICO'] || r['OPERADOR LOGISTICO']), 'OPERADOR LOGÍSTICO');
  _simpleTable('ind-pp-table-op', _topN(byOp, 6), 'Operador Logístico', total);

  // Forma de Atención: Visita Técnica vs Soporte Telefónico
  _formaAtencionChart('ind-pp-chart-forma', todos, 'FORMA DE ATENCIÓN');
}

// ══════════════════════════════════════════════════════════════════
//  TAB: OTRAS OC (Traslados, Publicidad, Pinpad)
// ══════════════════════════════════════════════════════════════════
function renderIndOtrasOC() {
  if (!IND_RAW) return;
  const todos = getFilteredIndData('otras-oc');
  const cerrados = todos.filter(r => !r._is_abierto);
  const abiertos = todos.filter(r => r._is_abierto);
  const total = todos.length;

  const sla = _slaRow(todos, 'DENTRO DE LOS SLA');
  const fact = todos.filter(r => _isTrueVal(r['FACTURABLE'])).length;
  const atrib = todos.filter(r => _isTrueVal(r['ATRIBUIBLE'])).length;

  const traslados = todos.filter(r => (r['SOLICITUD'] || '').toString().toUpperCase() === 'TRASLADO');
  const trasladoSla = _slaRow(traslados, 'DENTRO DE LOS SLA');
  const trasladoSlaPct = _indPct(trasladoSla.si, traslados.length);

  const publicidad = todos.filter(r => (r['SOLICITUD'] || '').toString().toUpperCase() === 'PUBLICIDAD');
  const publicidadSla = _slaRow(publicidad, 'DENTRO DE LOS SLA');
  const publicidadSlaPct = _indPct(publicidadSla.si, publicidad.length);

  const pinpad = todos.filter(r => (r['SOLICITUD'] || '').toString().toUpperCase() === 'PINPAD');
  const pinpadSla = _slaRow(pinpad, 'DENTRO DE LOS SLA');
  const pinpadSlaPct = _indPct(pinpadSla.si, pinpad.length);

  const kpisEl = document.getElementById('ind-otras-kpis');
  if (kpisEl) {
    const exitosos = todos.filter(r => {
      const s = (r['ESTADO'] || '').toString().toUpperCase().trim();
      return s === 'EJECUTADO_EXITOSO' || s === 'EXITOSO';
    }).length;
    const ilocalizados = todos.filter(r => {
      const s = (r['ESTADO'] || '').toString().toUpperCase().trim();
      return s === 'ILOCALIZADO' || s === 'NO_LOCALIZADO' || s === 'NO LOCALIZADO';
    }).length;

    kpisEl.innerHTML =
      _kpiCard('Total Otras OC', _indFmt(total), '', '#DFFF61', '📋', 'otras-oc') +
      _kpiCard('Cerradas', _indFmt(cerrados.length), _indPct(cerrados.length, total), '#B0F2AE', '✅', 'otras-oc') +
      _kpiCard('Abiertas', _indFmt(abiertos.length), _indPct(abiertos.length, total), '#99D1FC', '🔓', 'otras-oc') +
      _kpiCard('Traslados', _indFmt(traslados.length), `SLA: ${trasladoSlaPct}`, '#99D1FC', '🚚', 'otras-oc') +
      _kpiCard('Publicidad', _indFmt(publicidad.length), `SLA: ${publicidadSlaPct}`, '#DFFF61', '📣', 'otras-oc') +
      _kpiCard('Pinpad', _indFmt(pinpad.length), `SLA: ${pinpadSlaPct}`, '#99D1FC', '💳', 'otras-oc') +
      _kpiCard('Exitosas', _indFmt(exitosos), _indPct(exitosos, total), '#00825A', '🏆', 'otras-oc') +
      _kpiCard('No Localizadas', _indFmt(ilocalizados), _indPct(ilocalizados, total), '#99D1FC', '📍', 'otras-oc') +
      _kpiCard('Dentro SLA', _indFmt(sla.si), _indPct(sla.si, total), '#00825A', '🎯', 'otras-oc') +
      _kpiCard('Fuera SLA', _indFmt(sla.no), _indPct(sla.no, total), '#00825A', '⚠️', 'otras-oc') +
      _kpiCard('Facturables', _indFmt(fact), _indPct(fact, total), '#99D1FC', '💰', 'otras-oc');
  }

  // Actividad (Traslado, Publicidad, Pinpad) como distribución principal en la rosca
  const byAct = _countBy(todos.filter(r => r['SOLICITUD']), 'SOLICITUD');
  const actEntries = Object.entries(byAct);
  _mkChart('ind-otras-chart-act', 'doughnut',
    actEntries.map(x => x[0]),
    [{ data: actEntries.map(x => x[1]), backgroundColor: IND_COLORS }],
    { plugins: { legend: { position: 'right', labels: { color: '#CBD5E1', font: { size: 10 } } } } }
  );

  // Distribución por Formato (Top 8)
  const byFormato = _countBy(todos.filter(r => r['FORMATO']), 'FORMATO');
  const formatoTop = _topN(byFormato, 8);
  _mkChart('ind-otras-chart-sol', 'bar', formatoTop.map(x => x[0]),
    [{ label: 'OC', data: formatoTop.map(x => x[1]), backgroundColor: IND_COLORS.slice(0, formatoTop.length) }],
    { plugins: { legend: { display: false } }, indexAxis: 'y' }
  );

  // SLA Doughnut
  _indSlaChart('ind-otras-chart-sla', todos, 'DENTRO DE LOS SLA');

  // Tendencia mensual
  _trendChart('ind-otras-chart-trend', todos,
    'FECHA DE APERTURA (DD/MM/AAAA)', 'Otras OC / mes', '#99D1FC');

  // Top departamentos
  _deptoChart('ind-otras-chart-depto', todos, 'Otras OC', '#B0F2AE');

  // Tabla causal
  const byCausal = _countBy(todos.filter(r => {
    const c = (r['CAUSAL'] || '').toString().toUpperCase().trim();
    return c && c !== 'CIERRE EXITOSO' && c !== 'EJECUTADO EXITOSO' && c !== 'AGENDADO' && c !== 'N/A' && c !== '0';
  }), 'CAUSAL');
  _simpleTable('ind-otras-table-causal', _topN(byCausal, 8), 'Causal', total);

  // Causal Top 8 Bar Chart - de retraso real
  const causalTop = _topN(byCausal, 8);
  _mkChart('ind-otras-chart-causal', 'bar', causalTop.map(x => x[0]),
    [{ label: 'Otras OC', data: causalTop.map(x => x[1]), backgroundColor: '#B0F2AE' }],
    { plugins: { legend: { display: false } }, indexAxis: 'y' }
  );

  // Tabla técnico
  const byTec = _countBy(todos.filter(r => r['TÉCNICO DE CAMPO']), 'TÉCNICO DE CAMPO');
  _simpleTable('ind-otras-table-tec', _topN(byTec, 8), 'Técnico de Campo', total);

  // Forma de Atención: Visita Técnica vs Soporte Telefónico
  _formaAtencionChart('ind-otras-chart-forma', todos, 'FORMA DE ATENCIÓN');
}

// ══════════════════════════════════════════════════════════════════
//  TAB: IMPLEMENTACIÓN
// ══════════════════════════════════════════════════════════════════
function renderIndImplementacion() {
  if (!IND_RAW) return;
  const todos = getFilteredIndData('implementacion');
  const bd = todos.filter(r => !r._is_abierto);
  const abiertos = todos.filter(r => r._is_abierto);
  const total = todos.length;

  const cumpleSLA = todos.filter(r => (r['CUMPLE SLA'] || '').toString().toUpperCase() === 'SI').length;
  const noSLA = todos.filter(r => (r['CUMPLE SLA'] || '').toString().toUpperCase() === 'NO').length;

  const kpisEl = document.getElementById('ind-impl-kpis');
  if (kpisEl) kpisEl.innerHTML =
    _kpiCard('Total Actividades', _indFmt(total), '', '#DFFF61', '📋', 'implementacion') +
    _kpiCard('Cerradas', _indFmt(bd.length), _indPct(bd.length, total), '#B0F2AE', '✅', 'implementacion') +
    _kpiCard('Abiertas', _indFmt(abiertos.length), _indPct(abiertos.length, total), '#99D1FC', '🔓', 'implementacion') +
    _kpiCard('Cumple SLA', _indFmt(cumpleSLA), _indPct(cumpleSLA, total), '#00825A', '🎯', 'implementacion') +
    _kpiCard('Incumple SLA', _indFmt(noSLA), _indPct(noSLA, total), '#00825A', '⚠️', 'implementacion');

  // Por Tipo de Solicitud
  const byTipo = _countBy(todos, 'TIPO DE SOLICITUD');
  const tipoTop = _topN(byTipo, 8);
  _mkChart('ind-impl-chart-tipo', 'bar', tipoTop.map(x => x[0]),
    [{ label: 'Actividades', data: tipoTop.map(x => x[1]), backgroundColor: IND_COLORS.slice(0, tipoTop.length) }]
  );

  // Por Estado
  const byEstado = _countBy(todos, 'ESTADO');
  const estEntries = Object.entries(byEstado);
  _mkChart('ind-impl-chart-estado', 'doughnut',
    estEntries.map(x => x[0]),
    [{ data: estEntries.map(x => x[1]), backgroundColor: IND_COLORS }],
    { plugins: { legend: { position: 'right', labels: { color: '#CBD5E1', font: { size: 10 } } } } }
  );

  // SLA Doughnut
  _indSlaChart('ind-impl-chart-sla', todos, 'CUMPLE SLA');

  // Tendencia mensual
  _trendChart('ind-impl-chart-trend', todos,
    'FECHA DE INICIO', 'Actividades / mes', '#B0F2AE');

  // Top Departamentos
  _deptoChart('ind-impl-chart-depto', todos, 'Actividades', '#99D1FC');

  // Tabla causales - filtrar N/A y éxitos para ver causales de retraso reales
  const byCausal = _countBy(todos.filter(r => {
    const c = (r['CAUSAL'] || '').toString().toUpperCase().trim();
    return c && c !== 'N/A' && c !== 'CIERRE EXITOSO' && c !== 'EJECUTADO EXITOSO' && c !== 'AGENDADO' && c !== '0';
  }), 'CAUSAL');
  _simpleTable('ind-impl-table-causal', _topN(byCausal, 8), 'Causal', total);

  // Tabla técnicos
  const byTec = _countBy(todos.filter(r => r['TÉCNICO']), 'TÉCNICO');
  _simpleTable('ind-impl-table-tec', _topN(byTec, 8), 'Técnico', total);

  // Forma de Atención: Visita Técnica vs Soporte Telefónico
  _formaAtencionChart('ind-impl-chart-forma', todos, 'TIPO DE ATENCIÓN');
}

// ══════════════════════════════════════════════════════════════════
//  TAB: INCIDENTES
// ══════════════════════════════════════════════════════════════════
function renderIndIncidentes() {
  if (!IND_RAW) return;
  const todos = getFilteredIndData('incidentes');
  const cerrados = todos.filter(r => !r._is_abierto);
  const abiertos = todos.filter(r => r._is_abierto);
  const total = todos.length;

  const sla = _slaRow(todos, 'DENTRO DE LOS SLAS');
  const fact = todos.filter(r => _isTrueVal(r['FACTURABLE'])).length;
  const atrib = todos.filter(r => _isTrueVal(r['ATRIBUIBLE'])).length;

  const kpisEl = document.getElementById('ind-inc-kpis');
  if (kpisEl) kpisEl.innerHTML =
    _kpiCard('Total Incidentes', _indFmt(total), '', '#DFFF61', '🔔', 'incidentes') +
    _kpiCard('Cerrados', _indFmt(cerrados.length), _indPct(cerrados.length, total), '#B0F2AE', '✅', 'incidentes') +
    _kpiCard('Abiertos', _indFmt(abiertos.length), _indPct(abiertos.length, total), '#99D1FC', '🔓', 'incidentes') +
    _kpiCard('Dentro SLA', _indFmt(sla.si), _indPct(sla.si, total), '#00825A', '🎯', 'incidentes') +
    _kpiCard('Fuera SLA', _indFmt(sla.no), _indPct(sla.no, total), '#00825A', '⚠️', 'incidentes') +
    _kpiCard('Facturables', _indFmt(fact), _indPct(fact, total), '#99D1FC', '💰', 'incidentes');

  // Por Grupo Falla
  const byGrupo = _countBy(todos.filter(r => r['GRUPO_FALLA']), 'GRUPO_FALLA');
  const grupoTop = _topN(byGrupo, 8);
  _mkChart('ind-inc-chart-grupo', 'bar', grupoTop.map(x => x[0]),
    [{ label: 'Incidentes', data: grupoTop.map(x => x[1]), backgroundColor: IND_COLORS.slice(0, grupoTop.length) }],
    { plugins: { legend: { display: false } } }
  );

  // Por Categoría
  const byCat = _countBy(todos.filter(r => r['CATEGORÍA'] || r['CATEGORIA']), 'CATEGORÍA');
  const catEntries = _topN(byCat, 8);
  _mkChart('ind-inc-chart-cat', 'doughnut',
    catEntries.map(x => x[0]),
    [{ data: catEntries.map(x => x[1]), backgroundColor: IND_COLORS }],
    { plugins: { legend: { position: 'right', labels: { color: '#CBD5E1', font: { size: 10 } } } } }
  );

  // SLA Doughnut
  _indSlaChart('ind-inc-chart-sla', todos, 'DENTRO DE LOS SLAS');

  // Tendencia mensual
  _trendChart('ind-inc-chart-trend', todos,
    'FECHA APERTURA DEL INCIDENTE (DD/MM/AAAA)', 'Incidentes / mes', '#99D1FC');

  // Urgencia
  const byUrg = _countBy(todos.filter(r => r['URGENCIA']), 'URGENCIA');
  const urgEntries = Object.entries(byUrg);
  _mkChart('ind-inc-chart-urg', 'bar',
    urgEntries.map(x => x[0]),
    [{ label: 'Urgencia', data: urgEntries.map(x => x[1]), backgroundColor: '#DFFF61' }],
    { plugins: { legend: { display: false } } }
  );

  // Tabla fallas
  const byFalla = _countBy(todos.filter(r => r['FALLA']), 'FALLA');
  _simpleTable('ind-inc-table-falla', _topN(byFalla, 8), 'Falla', total);

  // Top Fallas Horizontal Bar Chart
  const fallaTop = _topN(byFalla, 8);
  _mkChart('ind-inc-chart-falla-bar', 'bar', fallaTop.map(x => x[0]),
    [{ label: 'Incidentes', data: fallaTop.map(x => x[1]), backgroundColor: '#00825A' }],
    { plugins: { legend: { display: false } }, indexAxis: 'y' }
  );

  // Tabla técnicos
  const byTec = _countBy(todos.filter(r => r['TÉCNICO DE CAMPO']), 'TÉCNICO DE CAMPO');
  _simpleTable('ind-inc-table-tec', _topN(byTec, 8), 'Técnico de Campo', total);

  // Forma de Atención: Visita Técnica vs Soporte Telefónico
  _formaAtencionChart('ind-inc-chart-forma', todos, 'FORMA DE ATENCIÓN');
}

// ══════════════════════════════════════════════════════════════════
//  NAVEGACIÓN DE TABS
// ══════════════════════════════════════════════════════════════════
const _IND_TABS = ['cierres', 'papeleria', 'otras-oc', 'implementacion', 'incidentes'];

window.indSelectTab = function (tab) {
  window.currentActiveIndTab = tab;

  _IND_TABS.forEach(t => {
    const panel = document.getElementById('ind-panel-' + t);
    const btn = document.getElementById('ind-tab-' + t);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });

  if (!IND_RAW) {
    loadIndicadoresData().then(() => {
      populateIndFilters(tab);
      _indRender(tab);
      _renderDetailTableOnly(tab);
    });
    return;
  }

  populateIndFilters(tab);
  _indRender(tab);
  _renderDetailTableOnly(tab);
};

function _indRender(tab) {
  if (tab === 'cierres') renderIndCierres();
  if (tab === 'papeleria') renderIndPapeleria();
  if (tab === 'otras-oc') renderIndOtrasOC();
  if (tab === 'implementacion') renderIndImplementacion();
  if (tab === 'incidentes') renderIndIncidentes();
}

// ══════════════════════════════════════════════════════════════════
//  INIT — llamado desde dashboard.js
// ══════════════════════════════════════════════════════════════════
window.initIndicadoresCB = async function () {
  if (!IND_RAW) await loadIndicadoresData();
  window.indSelectTab('cierres');
};

// Pre-carga en background
(function () {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadIndicadoresData);
  } else {
    loadIndicadoresData();
  }
})();

// ══════════════════════════════════════════════════════════════════
//  DETAILED SINGLE-RECORD MODAL VIEWER (ON DOUBLE CLICK)
// ══════════════════════════════════════════════════════════════════
function _createRowDetailModal() {
  let modal = document.getElementById('ind-row-detail-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'ind-row-detail-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(8, 8, 8, 0.9);
    backdrop-filter: blur(16px);
    z-index: 100000;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
    font-family: 'Outfit', sans-serif;
  `;

  modal.innerHTML = `
    <div style="
      background: linear-gradient(145deg, #161514, #0D0C0B);
      border: 1px solid rgba(223, 255, 97, 0.25);
      border-radius: 20px;
      width: 90%;
      max-width: 750px;
      height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 30px 70px rgba(0,0,0,0.9);
      overflow: hidden;
      position: relative;
      animation: indModalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    ">
      <!-- Header -->
      <div style="
        padding: 20px 24px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(0,0,0,0.2);
      ">
        <div>
          <h2 style="margin: 0; font-family: 'Syne', sans-serif; font-size: 18px; color: #DFFF61; font-weight: 800; letter-spacing: -0.5px;">Gestión Detallada del Registro</h2>
          <p style="margin: 4px 0 0; font-size: 11px; color: #64748b;">Visualización completa y vertical de todos los campos del registro</p>
        </div>
        <button onclick="closeRowDetailModal()" style="
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #94a3b8;
          padding: 8px 14px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.2s;
        " onmouseover="this.style.color='#fff';this.style.background='rgba(255, 255, 255, 0.1)'" onmouseout="this.style.color='#94a3b8';this.style.background='rgba(255, 255, 255, 0.05)'">
          Cerrar ✕
        </button>
      </div>

      <!-- Search in fields -->
      <div style="padding: 12px 24px; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.1); display: flex; gap: 10px;">
        <input type="text" id="ind-detail-search" placeholder="🔍 Filtrar campos..." 
          style="
            flex: 1;
            background: rgba(255,255,255,.03);
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 8px;
            padding: 8px 14px;
            color: #fff;
            font-size: 13px;
            outline: none;
          ">
      </div>

      <!-- Body / Fields list -->
      <div id="ind-detail-fields-body" style="
        flex: 1;
        overflow: auto;
        padding: 24px;
        background: rgba(0,0,0,0.15);
      ">
        <!-- Contenido dinámico -->
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  return modal;
}

window.closeRowDetailModal = function () {
  const modal = document.getElementById('ind-row-detail-modal');
  if (modal) modal.style.display = 'none';
};

window.openRowDetailModal = function (tab, index) {
  const dataset = window._currentDetailRows && window._currentDetailRows[tab];
  if (!dataset || !dataset[index]) return;
  _showRowDetail(dataset[index]);
};

window.openWizardRowDetailModal = function (index) {
  const dataset = window._currentWizardRows;
  if (!dataset || !dataset[index]) return;
  _showRowDetail(dataset[index]);
};

function _showRowDetail(row) {
  const modal = _createRowDetailModal();
  modal.style.display = 'flex';

  const bodyEl = document.getElementById('ind-detail-fields-body');
  const searchInput = document.getElementById('ind-detail-search');

  // Detectar tab activo para cálculo de días transcurridos
  const _detailTab = window.currentActiveIndTab || WIZARD_ACTIVE_TAB || 'cierres';
  const _diasModal = _getDiasPostVencimiento(row, _detailTab);

  // Banner HTML para días transcurridos
  const _diasBannerHtml = _diasModal === null ? '' : (() => {
    const isOk = _diasModal <= 0;
    const color = isOk ? '#00825A' : (_diasModal <= 7 ? '#99D1FC' : '#00825A');
    const bg = isOk ? 'rgba(0,130,90,.08)' : (_diasModal <= 7 ? 'rgba(153,209,252,.08)' : 'rgba(0,130,90,.08)');
    const icon = isOk ? '✅' : '⚠️';
    const text = isOk ? 'Al día (dentro del SLA)' : `${_diasModal} día${_diasModal === 1 ? '' : 's'} de retraso tras vencimiento`;
    return `
      <div style="
        background: ${bg};
        border: 1px solid ${color}44;
        border-radius: 12px;
        padding: 14px 18px;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 12px;
      ">
        <span style="font-size:22px;line-height:1;">${icon}</span>
        <div>
          <div style="font-family:'Syne',sans-serif;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">⏱ Días Transcurridos después de Gestión</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:800;color:${color};">${text}</div>
        </div>
      </div>
    `;
  })();

  function renderFields(filterText = '') {
    const query = filterText.toLowerCase().trim();
    let entries = Object.entries(row).filter(([k]) => k !== '_is_abierto' && k !== 'col_0' && k.trim() !== '');

    if (query) {
      entries = entries.filter(([k, v]) =>
        k.toLowerCase().includes(query) ||
        (v !== null && v !== undefined && v.toString().toLowerCase().includes(query))
      );
    }

    if (entries.length === 0) {
      bodyEl.innerHTML = `<div style="text-align:center;color:#64748b;padding:40px;">No se encontraron campos coincidentes.</div>`;
      return;
    }

    bodyEl.innerHTML = `
      ${_diasBannerHtml}
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${entries.map(([k, v]) => {
      let valStr = _formatCellValue(k, v);
      const isSLA = k.toUpperCase().includes('SLA') || k.toUpperCase().includes('SLAS') || k.toUpperCase() === 'CUMPLE SLA';
      const isEstado = k.toUpperCase() === 'ESTADO';
      const isCausal = k.toUpperCase() === 'CAUSAL';

      let displayVal = valStr;

      if (isSLA) {
        const isOk = valStr.toUpperCase() === 'SI' || valStr.toUpperCase() === 'CUMPLE';
        const color = isOk ? '#00825A' : '#00825A';
        const bg = isOk ? 'rgba(0,130,90,.08)' : 'rgba(0,130,90,.08)';
        displayVal = `<span style="color:${color};background:${bg};border:1px solid ${color}33;padding:3px 8px;border-radius:6px;font-weight:700;font-family:'JetBrains Mono',monospace;">${valStr}</span>`;
      } else if (isEstado) {
        displayVal = `<span class="status-pill ${indStatusClass(valStr)}">${valStr}</span>`;
      } else if (isCausal) {
        const isExitoso = valStr.includes('EXITOSO');
        const isIlocalizado = valStr.includes('ILOCALIZADO') || valStr.includes('NO LOCALIZADO');
        const color = isExitoso ? '#00825A' : isIlocalizado ? '#99D1FC' : '#CBD5E1';
        displayVal = `<span style="color:${color};font-weight:600;">${valStr}</span>`;
      } else if (valStr !== '—') {
        // Utilizar mono para códigos, IDs, números telefónicos
        const isMono = k.toUpperCase().includes('TA') || k.toUpperCase().includes('FO') || k.toUpperCase().includes('OC') || k.toUpperCase().includes('FECHA') || k.toUpperCase().includes('TELEFONO') || k.toUpperCase().includes('CELULAR') || k.toUpperCase().includes('NIT') || k.toUpperCase().includes('DANE');
        if (isMono) {
          displayVal = `<span style="font-family:'JetBrains Mono',monospace;color:#B0F2AE;font-size:12px;">${valStr}</span>`;
        }
      }

      return `
            <div class="detail-field-row" style="
              display: flex;
              border-bottom: 1px solid rgba(255,255,255,0.03);
              padding-bottom: 10px;
              align-items: flex-start;
              gap: 16px;
            ">
              <div style="
                width: 230px;
                font-family: 'Syne', sans-serif;
                font-size: 11px;
                font-weight: 700;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                padding-top: 3px;
              ">${k}</div>
              <div style="
                flex: 1;
                font-size: 12.5px;
                color: #FAFAFA;
                line-height: 1.5;
                word-break: break-word;
              ">${displayVal}</div>
            </div>
          `;
    }).join('')}
      </div>
    `;
  }

  renderFields();

  if (searchInput) {
    searchInput.value = '';
    searchInput.oninput = (e) => {
      renderFields(e.target.value);
    };
  }
}