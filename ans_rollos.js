/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ans_rollos.js — Sección ANS en tab "Detalles TAs"             ║
 * ║                                                                  ║
 * ║  Fuente: rollos_detalles.json.gz (compartido con DT module)    ║
 * ║                                                                  ║
 * ║  Funcionalidades:                                                ║
 * ║  · KPIs clickeables: A tiempo / Tarde / Próximos a vencer /    ║
 * ║    Vencidos / Pendientes / Total                                ║
 * ║  · Gráfica de dona: distribución ANS                            ║
 * ║  · Gráfica de barras: % cumplimiento por plantilla             ║
 * ║  · Filtro por PLANTILLA y PROYECTO                              ║
 * ║  · Modal / tabla detalle al hacer clic en cualquier KPI        ║
 * ║  · Se renderiza ENCIMA de la tabla del DT module               ║
 * ║  · Reutiliza DT.raw (no recarga el JSON)                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
'use strict';

// ──────────────────────────────────────────────────────────────────
//  ESTADO
// ──────────────────────────────────────────────────────────────────
const ANS = {
  filtPlantilla: '__ALL__',
  filtProyecto:  '__ALL__',
  activeKpi:     null,   // null | 'a_tiempo' | 'tarde' | 'vencido' | 'proximo' | 'pendiente'
  detailPage:    1,
  detailPageSize: 30,
  chartDona:     null,
  chartBarras:   null,
  injected:      false,
};

// ──────────────────────────────────────────────────────────────────
//  CLASIFICADOR ANS
//  Retorna: 'a_tiempo' | 'tarde' | 'vencido' | 'proximo' | 'pendiente' | null
//
//  Lógica:
//    · Si tiene FECHA DE ENTREGA:
//        → a_tiempo si entregada ≤ planeada
//        → tarde    si entregada >  planeada
//    · Si NO tiene FECHA DE ENTREGA y tiene FECHA PLANEADA ENTREGA:
//        → vencido  si planeada < hoy
//        → proximo  si planeada está entre hoy y hoy+3 días  ← zona roja inminente
//        → pendiente si planeada > hoy+3
//    · Si no tiene ninguna fecha: null (excluir)
// ──────────────────────────────────────────────────────────────────
function _ansParseDate(s) {
  if (!s) return null;
  // "DD/MM/YYYY"
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    return new Date(+y, +m - 1, +d);
  }
  // "YYYY-MM-DD..." (ISO-like, puede tener hora)
  const iso = new Date(s.slice(0, 10));
  return isNaN(iso) ? null : iso;
}

function _ansClassify(row, today) {
  const fp = _ansParseDate(row['FECHA PLANEADA ENTREGA']);
  if (!fp) return null;

  const fe = _ansParseDate(row['FECHA DE ENTREGA']);
  if (fe) {
    return fe <= fp ? 'a_tiempo' : 'tarde';
  }

  // Sin FECHA DE ENTREGA: si el estado es "Completada" se considera entregada.
  // Al no tener fecha real de entrega, se usa la planeada como referencia
  // → a_tiempo (no se puede determinar tardanza sin fecha real).
  const estado = String(row['ESTADO'] || '').trim().toUpperCase();
  if (estado === 'COMPLETADA') {
    return 'a_tiempo';
  }

  // Sin fecha de entrega y no completada
  const diffDays = Math.floor((fp - today) / 86400000);
  if (diffDays < 0)  return 'vencido';
  if (diffDays <= 3) return 'proximo';
  return 'pendiente';
}

// ──────────────────────────────────────────────────────────────────
//  FUENTE DE DATOS (reutiliza DT.raw del módulo rollos_detalles_tas)
// ──────────────────────────────────────────────────────────────────
function _ansGetRaw() {
  return (typeof DT !== 'undefined' && Array.isArray(DT.raw)) ? DT.raw : [];
}

function _ansFiltered() {
  let rows = _ansGetRaw();
  if (ANS.filtPlantilla !== '__ALL__')
    rows = rows.filter(r => (r['PLANTILLA'] || '') === ANS.filtPlantilla);
  if (ANS.filtProyecto !== '__ALL__')
    rows = rows.filter(r => (r['PROYECTO'] || '') === ANS.filtProyecto);
  return rows;
}

function _ansCompute() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rows  = _ansFiltered();
  const groups = { a_tiempo: [], tarde: [], vencido: [], proximo: [], pendiente: [] };

  for (const r of rows) {
    const cls = _ansClassify(r, today);
    if (cls) groups[cls].push(r);
  }

  const total     = Object.values(groups).reduce((s, a) => s + a.length, 0);
  const entregadas = groups.a_tiempo.length + groups.tarde.length;
  const pctCumple = entregadas > 0
    ? Math.round((groups.a_tiempo.length / entregadas) * 100)
    : 0;

  return { groups, total, entregadas, pctCumple };
}

// ──────────────────────────────────────────────────────────────────
//  OPCIONES DE FILTRO
// ──────────────────────────────────────────────────────────────────
function _ansGetOptions(col) {
  const raw = _ansGetRaw();
  return ['__ALL__', ...Array.from(new Set(raw.map(r => r[col] || '').filter(Boolean))).sort()];
}

// ──────────────────────────────────────────────────────────────────
//  INYECCIÓN DE ESTILOS (una sola vez)
// ──────────────────────────────────────────────────────────────────
function _ansInjectStyles() {
  if (document.getElementById('ans-styles')) return;
  const s = document.createElement('style');
  s.id = 'ans-styles';
  s.textContent = `
    /* ── Sección ANS wrapper ── */
    #ans-section {
      width: 100%;
      margin-bottom: 40px;
      animation: ans-fadein .35s ease both;
    }
    @keyframes ans-fadein {
      from { opacity:0; transform:translateY(10px); }
      to   { opacity:1; transform:translateY(0); }
    }

    /* ── Barra de filtros ANS ── */
    #ans-filters {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 24px;
      padding: 14px 18px;
      background: rgba(255,255,255,.025);
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 14px;
    }
    #ans-filters label {
      font-size: 11px;
      font-weight: 600;
      color: #7A7674;
      text-transform: uppercase;
      letter-spacing: .8px;
      white-space: nowrap;
    }
    #ans-filters select {
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 8px;
      color: #e2e8f0;
      font-family: 'Outfit', sans-serif;
      font-size: 12px;
      padding: 6px 10px;
      cursor: pointer;
      outline: none;
      min-width: 180px;
      max-width: 260px;
      transition: border-color .2s;
    }
    #ans-filters select:focus { border-color: #B0F2AE; }

    /* ── KPI grid ANS ── */
    #ans-kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 14px;
      margin-bottom: 28px;
    }
    .ans-kpi {
      position: relative;
      background: rgba(10,18,24,.95);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 14px;
      padding: 18px 18px 16px;
      cursor: pointer;
      transition: transform .18s, border-color .2s, box-shadow .2s;
      overflow: hidden;
      user-select: none;
    }
    .ans-kpi::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      transition: opacity .2s;
    }
    .ans-kpi:hover { transform: translateY(-4px); }
    .ans-kpi.active { transform: translateY(-4px); }

    .ans-kpi.kpi-green::before  { background: linear-gradient(90deg,#B0F2AE,transparent); }
    .ans-kpi.kpi-red::before    { background: linear-gradient(90deg,#FF5C5C,transparent); }
    .ans-kpi.kpi-warn::before   { background: linear-gradient(90deg,#FFC04D,transparent); }
    .ans-kpi.kpi-orange::before { background: linear-gradient(90deg,#FF8C42,transparent); }
    .ans-kpi.kpi-blue::before   { background: linear-gradient(90deg,#99D1FC,transparent); }
    .ans-kpi.kpi-lime::before   { background: linear-gradient(90deg,#DFFF61,transparent); }

    .ans-kpi.kpi-green:hover,  .ans-kpi.kpi-green.active  { border-color: rgba(176,242,174,.3); box-shadow: 0 0 20px rgba(176,242,174,.12); }
    .ans-kpi.kpi-red:hover,    .ans-kpi.kpi-red.active    { border-color: rgba(255,92,92,.3);   box-shadow: 0 0 20px rgba(255,92,92,.12); }
    .ans-kpi.kpi-warn:hover,   .ans-kpi.kpi-warn.active   { border-color: rgba(255,192,77,.3);  box-shadow: 0 0 20px rgba(255,192,77,.12); }
    .ans-kpi.kpi-orange:hover, .ans-kpi.kpi-orange.active { border-color: rgba(255,140,66,.3);  box-shadow: 0 0 20px rgba(255,140,66,.12); }
    .ans-kpi.kpi-blue:hover,   .ans-kpi.kpi-blue.active   { border-color: rgba(153,209,252,.3); box-shadow: 0 0 20px rgba(153,209,252,.12); }
    .ans-kpi.kpi-lime:hover,   .ans-kpi.kpi-lime.active   { border-color: rgba(223,255,97,.3);  box-shadow: 0 0 20px rgba(223,255,97,.1); }

    .ans-kpi-icon   { font-size: 20px; margin-bottom: 10px; }
    .ans-kpi-label  { font-size: 10px; font-weight: 700; color: #7A7674; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; line-height: 1.3; }
    .ans-kpi-value  { font-family: 'JetBrains Mono', monospace; font-size: 32px; font-weight: 700; line-height: 1; letter-spacing: -1px; }
    .ans-kpi-sub    { font-size: 11px; color: #475569; margin-top: 6px; font-family: 'Outfit', sans-serif; }
    .ans-kpi-hint   { font-size: 10px; color: #334155; margin-top: 4px; font-family: 'Outfit', sans-serif; }

    .ans-kpi-value.green  { color: #B0F2AE; text-shadow: 0 0 20px rgba(176,242,174,.4); }
    .ans-kpi-value.red    { color: #FF5C5C; text-shadow: 0 0 20px rgba(255,92,92,.35); }
    .ans-kpi-value.warn   { color: #FFC04D; text-shadow: 0 0 20px rgba(255,192,77,.3); }
    .ans-kpi-value.orange { color: #FF8C42; text-shadow: 0 0 20px rgba(255,140,66,.3); }
    .ans-kpi-value.blue   { color: #99D1FC; text-shadow: 0 0 20px rgba(153,209,252,.3); }
    .ans-kpi-value.lime   { color: #DFFF61; text-shadow: 0 0 20px rgba(223,255,97,.25); }

    /* ── Charts row ── */
    #ans-charts-row {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 16px;
      margin-bottom: 32px;
    }
    @media (max-width: 900px) {
      #ans-charts-row { grid-template-columns: 1fr; }
    }
    .ans-chart-card {
      background: rgba(10,18,24,.95);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 16px;
      padding: 20px;
    }
    .ans-chart-title {
      font-family: 'Syne', sans-serif;
      font-size: 12px;
      font-weight: 700;
      color: #e2e8f0;
      letter-spacing: .3px;
      margin-bottom: 4px;
    }
    .ans-chart-sub {
      font-size: 11px;
      color: #475569;
      font-family: 'Outfit', sans-serif;
      margin-bottom: 16px;
    }
    .ans-chart-wrap {
      position: relative;
      height: 220px;
    }

    /* ── Tabla detalle ANS (expandible) ── */
    #ans-detail-section {
      background: rgba(10,18,24,.95);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 32px;
      animation: ans-fadein .3s ease both;
    }
    #ans-detail-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    #ans-detail-title {
      font-family: 'Syne', sans-serif;
      font-size: 13px;
      font-weight: 700;
      color: #f1f5f9;
    }
    #ans-detail-count {
      font-size: 11px;
      color: #475569;
      font-family: 'JetBrains Mono', monospace;
    }
    #ans-detail-close {
      margin-left: auto;
      padding: 4px 14px;
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 20px;
      color: #7A7674;
      font-size: 11px;
      cursor: pointer;
      font-family: 'Outfit', sans-serif;
      transition: border-color .2s, color .2s;
    }
    #ans-detail-close:hover { border-color: #FF5C5C; color: #FF5C5C; }

    /* Tabla interior */
    #ans-detail-table-wrap {
      overflow-x: auto;
      max-height: 420px;
      overflow-y: auto;
      border-radius: 10px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,.15) rgba(255,255,255,.04);
    }
    #ans-detail-table-wrap::-webkit-scrollbar { width: 5px; height: 5px; }
    #ans-detail-table-wrap::-webkit-scrollbar-track { background: rgba(255,255,255,.04); }
    #ans-detail-table-wrap::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 3px; }

    #ans-det-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    #ans-det-table thead th {
      position: sticky;
      top: 0;
      background: rgba(8,16,22,1);
      color: #94a3b8;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .8px;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255,255,255,.07);
      white-space: nowrap;
      text-align: left;
    }
    #ans-det-table tbody tr {
      border-bottom: 1px solid rgba(255,255,255,.04);
      transition: background .15s;
    }
    #ans-det-table tbody tr:hover { background: rgba(255,255,255,.03); }
    #ans-det-table tbody td {
      padding: 9px 12px;
      color: #cbd5e1;
      white-space: nowrap;
      font-family: 'Outfit', sans-serif;
    }
    .ans-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 20px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .5px;
    }
    .ans-badge.a_tiempo  { background: rgba(176,242,174,.1); color: #B0F2AE; border: 1px solid rgba(176,242,174,.25); }
    .ans-badge.tarde     { background: rgba(255,92,92,.1);   color: #FF5C5C; border: 1px solid rgba(255,92,92,.25); }
    .ans-badge.vencido   { background: rgba(255,140,66,.1);  color: #FF8C42; border: 1px solid rgba(255,140,66,.25); }
    .ans-badge.proximo   { background: rgba(255,192,77,.1);  color: #FFC04D; border: 1px solid rgba(255,192,77,.25); }
    .ans-badge.pendiente { background: rgba(153,209,252,.1); color: #99D1FC; border: 1px solid rgba(153,209,252,.25); }

    /* ── Paginación detalle ── */
    #ans-det-pagination {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 14px;
      align-items: center;
    }
    .ans-pg-btn {
      padding: 4px 12px;
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 7px;
      color: #7A7674;
      font-size: 11px;
      cursor: pointer;
      font-family: 'JetBrains Mono', monospace;
      transition: border-color .15s, color .15s;
    }
    .ans-pg-btn:hover  { border-color: #B0F2AE; color: #B0F2AE; }
    .ans-pg-btn.active { background: rgba(176,242,174,.1); border-color: rgba(176,242,174,.4); color: #B0F2AE; }
    .ans-pg-btn:disabled { opacity: .35; cursor: default; }

    /* ── Separador entre ANS y tabla DT ── */
    #ans-dt-divider {
      width: 100%;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(176,242,174,.2), rgba(153,209,252,.2), transparent);
      margin: 8px 0 36px;
    }
  `;
  document.head.appendChild(s);
}

// ──────────────────────────────────────────────────────────────────
//  RENDER PRINCIPAL
// ──────────────────────────────────────────────────────────────────
function _ansRender() {
  const root = document.getElementById('dt-root');
  if (!root) return;

  // Si dt-root tiene contenido del DT module, insertar ANS ANTES
  let ansSection = document.getElementById('ans-section');
  if (!ansSection) {
    ansSection = document.createElement('div');
    ansSection.id = 'ans-section';
    root.insertBefore(ansSection, root.firstChild);
  }

  const { groups, total, entregadas, pctCumple } = _ansCompute();
  const plantillas = _ansGetOptions('PLANTILLA');
  const proyectos  = _ansGetOptions('PROYECTO');

  // ── Opciones select ──
  const optsPlan = plantillas.map(p =>
    `<option value="${p}" ${ANS.filtPlantilla === p ? 'selected' : ''}>${p === '__ALL__' ? 'Todas las plantillas' : p}</option>`
  ).join('');
  const optsProy = proyectos.map(p =>
    `<option value="${p}" ${ANS.filtProyecto === p ? 'selected' : ''}>${p === '__ALL__' ? 'Todos los proyectos' : p}</option>`
  ).join('');

  // ── Porcentaje total ANS ──
  const pctTotal = total > 0 ? Math.round((groups.a_tiempo.length / total) * 100) : 0;

  ansSection.innerHTML = `
    <!-- Título sección -->
    <div class="section-label" style="margin-bottom:20px;">Análisis de Nivel de Servicio (ANS)</div>

    <!-- Filtros -->
    <div id="ans-filters">
      <label>🔖 Plantilla</label>
      <select onchange="window._ansSetFiltPlantilla(this.value)">${optsPlan}</select>
      <label style="margin-left:8px;">📁 Proyecto</label>
      <select onchange="window._ansSetFiltProyecto(this.value)">${optsProy}</select>
      <button onclick="window._ansResetFiltros()" style="
        margin-left:auto; padding:6px 16px;
        background: rgba(176,242,174,.06);
        border: 1px solid rgba(176,242,174,.18);
        border-radius: 20px; color: #B0F2AE; font-size: 11px;
        font-family: 'Outfit',sans-serif; cursor: pointer;
        transition: background .2s;"
        onmouseover="this.style.background='rgba(176,242,174,.14)'"
        onmouseout="this.style.background='rgba(176,242,174,.06)'">
        ↺ Limpiar filtros
      </button>
    </div>

    <!-- KPIs -->
    <div id="ans-kpi-grid">

      <div class="ans-kpi kpi-green ${ANS.activeKpi === 'a_tiempo' ? 'active' : ''}"
           onclick="window._ansKpiClick('a_tiempo')" title="Ver registros entregados a tiempo">
        <div class="ans-kpi-icon">✅</div>
        <div class="ans-kpi-label">Entregadas a Tiempo</div>
        <div class="ans-kpi-value green">${groups.a_tiempo.length.toLocaleString('es-CO')}</div>
        <div class="ans-kpi-sub">${entregadas > 0 ? Math.round(groups.a_tiempo.length/entregadas*100) : 0}% de las entregadas</div>
        <div class="ans-kpi-hint">Clic para ver registros →</div>
      </div>

      <div class="ans-kpi kpi-red ${ANS.activeKpi === 'tarde' ? 'active' : ''}"
           onclick="window._ansKpiClick('tarde')" title="Ver registros entregados tarde">
        <div class="ans-kpi-icon">❌</div>
        <div class="ans-kpi-label">Entregadas Tarde</div>
        <div class="ans-kpi-value red">${groups.tarde.length.toLocaleString('es-CO')}</div>
        <div class="ans-kpi-sub">${entregadas > 0 ? Math.round(groups.tarde.length/entregadas*100) : 0}% de las entregadas</div>
        <div class="ans-kpi-hint">Clic para ver registros →</div>
      </div>

      <div class="ans-kpi kpi-warn ${ANS.activeKpi === 'proximo' ? 'active' : ''}"
           onclick="window._ansKpiClick('proximo')" title="Próximas a vencer (≤3 días)">
        <div class="ans-kpi-icon">⚠️</div>
        <div class="ans-kpi-label">Próximas a Vencer</div>
        <div class="ans-kpi-value warn">${groups.proximo.length.toLocaleString('es-CO')}</div>
        <div class="ans-kpi-sub">Vencen en ≤3 días</div>
        <div class="ans-kpi-hint">Clic para ver registros →</div>
      </div>

      <div class="ans-kpi kpi-orange ${ANS.activeKpi === 'vencido' ? 'active' : ''}"
           onclick="window._ansKpiClick('vencido')" title="Sin entregar y fecha ya vencida">
        <div class="ans-kpi-icon">🔥</div>
        <div class="ans-kpi-label">Vencidas sin Entregar</div>
        <div class="ans-kpi-value orange">${groups.vencido.length.toLocaleString('es-CO')}</div>
        <div class="ans-kpi-sub">ANS incumplido</div>
        <div class="ans-kpi-hint">Clic para ver registros →</div>
      </div>

      <div class="ans-kpi kpi-blue ${ANS.activeKpi === 'pendiente' ? 'active' : ''}"
           onclick="window._ansKpiClick('pendiente')" title="Pendientes con tiempo disponible">
        <div class="ans-kpi-icon">🕐</div>
        <div class="ans-kpi-label">Pendientes en Tiempo</div>
        <div class="ans-kpi-value blue">${groups.pendiente.length.toLocaleString('es-CO')}</div>
        <div class="ans-kpi-sub">Más de 3 días restantes</div>
        <div class="ans-kpi-hint">Clic para ver registros →</div>
      </div>

      <div class="ans-kpi kpi-lime" style="cursor:default;"
           title="Cumplimiento ANS global del periodo">
        <div class="ans-kpi-icon">📊</div>
        <div class="ans-kpi-label">Cumplimiento ANS</div>
        <div class="ans-kpi-value lime">${pctTotal}%</div>
        <div class="ans-kpi-sub">${total.toLocaleString('es-CO')} registros totales</div>
        <div class="ans-kpi-hint">${entregadas.toLocaleString('es-CO')} entregadas</div>
      </div>

    </div><!-- /ans-kpi-grid -->

    <!-- Gráficas -->
    <div id="ans-charts-row">
      <div class="ans-chart-card">
        <div class="ans-chart-title">Distribución ANS</div>
        <div class="ans-chart-sub">Proporción por estado de cumplimiento</div>
        <div class="ans-chart-wrap">
          <canvas id="ans-chart-dona"></canvas>
        </div>
      </div>
      <div class="ans-chart-card">
        <div class="ans-chart-title">Cumplimiento por Plantilla</div>
        <div class="ans-chart-sub">% entregadas a tiempo vs tarde (del total entregadas por plantilla)</div>
        <div class="ans-chart-wrap">
          <canvas id="ans-chart-barras"></canvas>
        </div>
      </div>
    </div><!-- /ans-charts-row -->

    <!-- Tabla detalle (se inyecta por JS) -->
    <div id="ans-detail-section" style="display:none;"></div>

    <!-- Separador visual -->
    <div id="ans-dt-divider"></div>
  `;

  _ansRenderCharts(groups);
  if (ANS.activeKpi) _ansRenderDetail(groups);
}

// ──────────────────────────────────────────────────────────────────
//  GRÁFICAS (Chart.js — ya cargado por el dashboard principal)
// ──────────────────────────────────────────────────────────────────
function _ansRenderCharts(groups) {
  if (typeof Chart === 'undefined') return;

  // Destruir anteriores
  if (ANS.chartDona)   { ANS.chartDona.destroy();   ANS.chartDona   = null; }
  if (ANS.chartBarras) { ANS.chartBarras.destroy();  ANS.chartBarras = null; }

  const LABELS = {
    a_tiempo:  'A tiempo',
    tarde:     'Tarde',
    vencido:   'Vencido sin entrega',
    proximo:   'Próximo a vencer',
    pendiente: 'Pendiente en tiempo',
  };
  const COLORS = {
    a_tiempo:  '#B0F2AE',
    tarde:     '#FF5C5C',
    vencido:   '#FF8C42',
    proximo:   '#FFC04D',
    pendiente: '#99D1FC',
  };

  // ── Dona ──
  const donaCvs = document.getElementById('ans-chart-dona');
  if (donaCvs) {
    const keys = Object.keys(groups);
    ANS.chartDona = new Chart(donaCvs, {
      type: 'doughnut',
      data: {
        labels: keys.map(k => LABELS[k]),
        datasets: [{
          data:            keys.map(k => groups[k].length),
          backgroundColor: keys.map(k => COLORS[k] + '33'),
          borderColor:     keys.map(k => COLORS[k]),
          borderWidth:     2,
          hoverOffset:     8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#94a3b8',
              font: { family: "'Outfit',sans-serif", size: 11 },
              boxWidth: 12,
              padding: 10,
            },
          },
          tooltip: {
            callbacks: {
              label: ctx => {
                const tot = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = tot > 0 ? Math.round(ctx.raw / tot * 100) : 0;
                return ` ${ctx.label}: ${ctx.raw.toLocaleString('es-CO')} (${pct}%)`;
              },
            },
            backgroundColor: 'rgba(8,16,22,.97)',
            borderColor: 'rgba(255,255,255,.1)',
            borderWidth: 1,
            titleColor: '#f1f5f9',
            bodyColor: '#94a3b8',
          },
        },
      },
    });
  }

  // ── Barras: % cumplimiento por plantilla ──
  const barCvs = document.getElementById('ans-chart-barras');
  if (barCvs) {
    const today    = new Date(); today.setHours(0,0,0,0);
    const raw      = _ansFiltered();
    // Agrupar por plantilla
    const byPlant  = {};
    for (const r of raw) {
      const pla = r['PLANTILLA'] || '(sin plantilla)';
      if (!byPlant[pla]) byPlant[pla] = { a_tiempo: 0, tarde: 0 };
      const cls = _ansClassify(r, today);
      if (cls === 'a_tiempo') byPlant[pla].a_tiempo++;
      else if (cls === 'tarde') byPlant[pla].tarde++;
    }
    const plantas  = Object.keys(byPlant);
    const pctAT    = plantas.map(p => {
      const tot = byPlant[p].a_tiempo + byPlant[p].tarde;
      return tot > 0 ? Math.round(byPlant[p].a_tiempo / tot * 100) : 0;
    });
    const pctTarde = plantas.map((p, i) => 100 - pctAT[i]);

    // Acortar etiquetas largas
    const shortLabels = plantas.map(p => p.length > 30 ? p.slice(0, 28) + '…' : p);

    ANS.chartBarras = new Chart(barCvs, {
      type: 'bar',
      data: {
        labels: shortLabels,
        datasets: [
          {
            label: 'A tiempo (%)',
            data: pctAT,
            backgroundColor: 'rgba(176,242,174,.25)',
            borderColor: '#B0F2AE',
            borderWidth: 1.5,
            borderRadius: 6,
            borderSkipped: false,
          },
          {
            label: 'Tarde (%)',
            data: pctTarde,
            backgroundColor: 'rgba(255,92,92,.2)',
            borderColor: '#FF5C5C',
            borderWidth: 1.5,
            borderRadius: 6,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: false,
            ticks: { color: '#64748b', font: { family: "'Outfit',sans-serif", size: 10 }, maxRotation: 30 },
            grid: { color: 'rgba(255,255,255,.04)' },
          },
          y: {
            max: 100,
            ticks: { color: '#64748b', font: { size: 10 }, callback: v => v + '%' },
            grid: { color: 'rgba(255,255,255,.05)' },
          },
        },
        plugins: {
          legend: {
            labels: { color: '#94a3b8', font: { family: "'Outfit',sans-serif", size: 11 }, boxWidth: 12 },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.raw}%`,
            },
            backgroundColor: 'rgba(8,16,22,.97)',
            borderColor: 'rgba(255,255,255,.1)',
            borderWidth: 1,
            titleColor: '#f1f5f9',
            bodyColor: '#94a3b8',
          },
        },
      },
    });
  }
}

// ──────────────────────────────────────────────────────────────────
//  TABLA DETALLE
// ──────────────────────────────────────────────────────────────────
const KPI_LABELS = {
  a_tiempo:  '✅ Entregadas a Tiempo',
  tarde:     '❌ Entregadas Tarde',
  proximo:   '⚠️ Próximas a Vencer',
  vencido:   '🔥 Vencidas sin Entregar',
  pendiente: '🕐 Pendientes en Tiempo',
};
const KPI_COLORS = {
  a_tiempo:  '#B0F2AE',
  tarde:     '#FF5C5C',
  proximo:   '#FFC04D',
  vencido:   '#FF8C42',
  pendiente: '#99D1FC',
};

function _ansRenderDetail(groups) {
  const sec = document.getElementById('ans-detail-section');
  if (!sec) return;

  const kpi   = ANS.activeKpi;
  const rows  = groups[kpi] || [];
  const color = KPI_COLORS[kpi] || '#e2e8f0';
  const label = KPI_LABELS[kpi] || kpi;

  const ps    = ANS.detailPageSize;
  const tp    = Math.max(1, Math.ceil(rows.length / ps));
  ANS.detailPage = Math.max(1, Math.min(ANS.detailPage, tp));
  const slice = rows.slice((ANS.detailPage - 1) * ps, ANS.detailPage * ps);

  const COLS = [
    'CODIGO DE TAREA', 'COD. SITIO', 'PLANTILLA', 'PROYECTO',
    'FECHA PLANEADA ENTREGA', 'FECHA DE ENTREGA',
    'TRANSPORTADORA', 'GUIA', 'CIUDAD DESTINO',
    'NOMBRE DESTINATARIO', 'ESTADO', 'ESTADO TRANSPORTADORA',
  ];

  const thead = COLS.map(c => `<th>${c}</th>`).join('');
  const tbody = slice.length === 0
    ? `<tr><td colspan="${COLS.length}" style="text-align:center;padding:32px;color:#475569;">Sin registros.</td></tr>`
    : slice.map(r => {
        const cls = kpi;
        const badgeText = {
          a_tiempo: 'A TIEMPO', tarde: 'TARDE', vencido: 'VENCIDO',
          proximo: 'PRÓXIMO', pendiente: 'PENDIENTE',
        }[cls] || cls;
        return `<tr>
          ${COLS.map((c, i) => {
            let val = r[c] ?? '—';
            // Primera columna: mostrar badge ANS
            if (i === 0) {
              return `<td>
                <span class="ans-badge ${cls}">${badgeText}</span>
                <span style="margin-left:8px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#94a3b8;">${val}</span>
              </td>`;
            }
            // Columnas fecha: color según estado
            if (c === 'FECHA DE ENTREGA' && val !== '—') {
              return `<td style="color:${cls === 'a_tiempo' ? '#B0F2AE' : '#FF5C5C'}">${val}</td>`;
            }
            if (c === 'FECHA PLANEADA ENTREGA' && val !== '—') {
              return `<td style="color:#99D1FC">${val}</td>`;
            }
            return `<td>${val}</td>`;
          }).join('')}
        </tr>`;
      }).join('');

  // Paginación
  const pgBtns = _ansPaginationHTML(tp);

  sec.style.display = 'block';
  sec.innerHTML = `
    <div id="ans-detail-header">
      <div style="width:3px;height:18px;border-radius:2px;background:${color};flex-shrink:0;"></div>
      <div id="ans-detail-title">${label}</div>
      <div id="ans-detail-count">${rows.length.toLocaleString('es-CO')} registros · página ${ANS.detailPage}/${tp}</div>
      <button id="ans-export-btn" onclick="window._ansExportDetail()" title="Exportar todos los registros de este KPI a Excel"
        style="margin-left:auto;padding:5px 14px;
               background:rgba(176,242,174,.1);border:1px solid rgba(176,242,174,.3);
               border-radius:20px;color:#B0F2AE;font-size:11px;font-weight:600;
               font-family:'Outfit',sans-serif;cursor:pointer;
               transition:background .2s,border-color .2s;display:flex;align-items:center;gap:6px;"
        onmouseover="this.style.background='rgba(176,242,174,.2)';this.style.borderColor='rgba(176,242,174,.55)'"
        onmouseout="this.style.background='rgba(176,242,174,.1)';this.style.borderColor='rgba(176,242,174,.3)'">
        ⬇ Exportar Excel
      </button>
      <button id="ans-detail-close" onclick="window._ansCloseDetail()">✕ Cerrar</button>
    </div>
    <div id="ans-detail-table-wrap">
      <table id="ans-det-table">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
    <div id="ans-det-pagination">${pgBtns}</div>
  `;
}

// ──────────────────────────────────────────────────────────────────
//  EXPORT EXCEL DEL KPI ACTIVO (todos los registros, no solo la página)
// ──────────────────────────────────────────────────────────────────
window._ansExportDetail = function() {
  if (!window.XLSX) {
    alert('La librería XLSX no está disponible. Recarga la página.');
    return;
  }

  const kpi   = ANS.activeKpi;
  if (!kpi) return;

  const { groups } = _ansCompute();
  const rows  = groups[kpi] || [];
  const label = KPI_LABELS[kpi] || kpi;

  const COLS = [
    'ANS', // columna extra con el estado ANS
    'CODIGO DE TAREA', 'COD. SITIO', 'PLANTILLA', 'PROYECTO',
    'FECHA PLANEADA ENTREGA', 'FECHA DE ENTREGA',
    'TRANSPORTADORA', 'GUIA', 'CIUDAD DESTINO',
    'NOMBRE DESTINATARIO', 'ESTADO', 'ESTADO TRANSPORTADORA',
  ];

  const badgeText = {
    a_tiempo: 'A TIEMPO', tarde: 'TARDE', vencido: 'VENCIDO',
    proximo: 'PRÓXIMO', pendiente: 'PENDIENTE',
  }[kpi] || kpi.toUpperCase();

  const data = [
    COLS,
    ...rows.map(r => COLS.map(c => {
      if (c === 'ANS') return badgeText;
      const v = r[c];
      return (v == null || v === '') ? '' : String(v);
    })),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = COLS.map(c => ({ wch: Math.max(c.length + 2, 18) }));

  // Estilo de cabecera (negrita) — soportado por xlsx-style, ignorado por xlsx básico
  const wb = XLSX.utils.book_new();
  const sheetName = label.replace(/[^\w\s]/g, '').trim().slice(0, 31) || 'ANS';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `ANS_${kpi}_${fecha}.xlsx`);
};


function _ansPaginationHTML(tp) {
  if (tp <= 1) return '';
  const p = ANS.detailPage;
  const btns = [];

  btns.push(`<button class="ans-pg-btn" onclick="window._ansDetPage(${p-1})" ${p===1?'disabled':''}>← Ant</button>`);

  const range = [];
  for (let i = 1; i <= tp; i++) {
    if (i === 1 || i === tp || (i >= p-2 && i <= p+2)) range.push(i);
    else if (range[range.length-1] !== '…') range.push('…');
  }
  for (const r of range) {
    if (r === '…') btns.push(`<span style="color:#475569;padding:4px 6px;font-size:11px;">…</span>`);
    else btns.push(`<button class="ans-pg-btn ${r===p?'active':''}" onclick="window._ansDetPage(${r})">${r}</button>`);
  }

  btns.push(`<button class="ans-pg-btn" onclick="window._ansDetPage(${p+1})" ${p===tp?'disabled':''}>Sig →</button>`);
  return btns.join('');
}

// ──────────────────────────────────────────────────────────────────
//  HANDLERS PÚBLICOS (window.*)
// ──────────────────────────────────────────────────────────────────
window._ansSetFiltPlantilla = function(v) {
  ANS.filtPlantilla = v;
  ANS.activeKpi     = null;
  ANS.detailPage    = 1;
  _ansRender();
};

window._ansSetFiltProyecto = function(v) {
  ANS.filtProyecto = v;
  ANS.activeKpi    = null;
  ANS.detailPage   = 1;
  _ansRender();
};

window._ansResetFiltros = function() {
  ANS.filtPlantilla = '__ALL__';
  ANS.filtProyecto  = '__ALL__';
  ANS.activeKpi     = null;
  ANS.detailPage    = 1;
  _ansRender();
};

window._ansKpiClick = function(kpi) {
  if (ANS.activeKpi === kpi) {
    // Toggle: cerrar si ya está abierto
    ANS.activeKpi = null;
    const sec = document.getElementById('ans-detail-section');
    if (sec) sec.style.display = 'none';
    // Quitar clase active de todos los KPI
    document.querySelectorAll('.ans-kpi').forEach(el => el.classList.remove('active'));
  } else {
    ANS.activeKpi  = kpi;
    ANS.detailPage = 1;
    document.querySelectorAll('.ans-kpi').forEach(el => el.classList.remove('active'));
    const cards = document.querySelectorAll('.ans-kpi');
    const kpiOrder = ['a_tiempo','tarde','proximo','vencido','pendiente'];
    const idx = kpiOrder.indexOf(kpi);
    if (idx >= 0 && cards[idx]) cards[idx].classList.add('active');
    const { groups } = _ansCompute();
    _ansRenderDetail(groups);
    // Scroll suave hasta la tabla detalle
    const sec = document.getElementById('ans-detail-section');
    if (sec) setTimeout(() => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
};

window._ansCloseDetail = function() {
  ANS.activeKpi = null;
  const sec = document.getElementById('ans-detail-section');
  if (sec) sec.style.display = 'none';
  document.querySelectorAll('.ans-kpi').forEach(el => el.classList.remove('active'));
};

window._ansDetPage = function(p) {
  ANS.detailPage = p;
  const { groups } = _ansCompute();
  _ansRenderDetail(groups);
};

// ──────────────────────────────────────────────────────────────────
//  PUNTO DE ENTRADA PÚBLICO
//  Llamar DESPUÉS de que DT.raw esté cargado (en renderDetallesTas)
// ──────────────────────────────────────────────────────────────────
window.renderANS = function() {
  _ansInjectStyles();
  _ansRender();
};