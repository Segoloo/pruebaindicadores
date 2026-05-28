'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  avisos.js — Avisos Importantes en panel-home                   ║
 * ║  Firebase path: dashboard_avisos/{id}                           ║
 * ║  Mismo patrón de Firebase que notas_reorden.js                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const Avisos = (() => {

  // ════════════════════════════════════════════════════════
  //  FIREBASE CONFIG — igual que login_tracker.js / notas_reorden.js
  // ════════════════════════════════════════════════════════
  const FIREBASE_CONFIG = {
    apiKey:            'AIzaSyAvG6kJ8arHJbybxSyeB4zMHza6nxhzVcg',
    authDomain:        'tableroswompi.firebaseapp.com',
    databaseURL:       'https://tableroswompi-default-rtdb.firebaseio.com',
    projectId:         'tableroswompi',
    storageBucket:     'tableroswompi.firebasestorage.app',
    messagingSenderId: '675251150612',
    appId:             '1:675251150612:web:be9b9473fd2293152eec01',
    measurementId:     'G-S1YC8WDC55'
  };

  const DB_PATH = 'dashboard_avisos';

  let _db = null, _fbRef = null, _fbGet = null, _fbSet = null, _fbRemove = null;
  let _initPromise = null; // evita inicializaciones paralelas

  // ── Inicializar Firebase ──────────────────────────────────────────
  // Estrategia: primero intenta reutilizar la instancia que ya montó
  // LoginTracker (comparten la misma app Firebase en la página).
  // Si no existe, la inicializa de cero con dynamic import().
  function _initFirebase() {
    if (_db) return Promise.resolve(true);
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
      try {
        // ── Opción 1: reutilizar instancia ya cargada por LoginTracker ──
        if (window._firebaseShared) {
          const s   = window._firebaseShared;
          _db       = s.db;
          _fbRef    = s.ref;
          _fbGet    = s.get;
          _fbSet    = s.set;
          _fbRemove = s.remove;
          console.log('[Avisos] ✅ Firebase reutilizado desde LoginTracker');
          return true;
        }

        // ── Opción 2: inicializar de cero con dynamic import ──
        const { initializeApp, getApps, getApp } = await import(
          'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
        );
        const { getDatabase, ref, get, set, remove } = await import(
          'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js'
        );
        const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
        _db       = getDatabase(app);
        _fbRef    = ref;
        _fbGet    = get;
        _fbSet    = set;
        _fbRemove = remove;
        console.log('[Avisos] ✅ Firebase inicializado');
        return true;
      } catch (e) {
        console.error('[Avisos] ❌ Firebase init error:', e);
        _initPromise = null; // permite reintentar en el próximo intento
        return false;
      }
    })();

    return _initPromise;
  }

  // ── Usuario activo ────────────────────────────────────────────────
  function _isAdmin() {
    return !!(window._msUserProfile && window._msUserProfile.email);
  }

  function _currentUser() {
    const p = window._msUserProfile || {};
    return p.nombre || p.email || 'Admin';
  }

  // ── Timestamp legible ─────────────────────────────────────────────
  function _nowLabel() {
    const d = new Date();
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
         + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  // ── Toast ──────────────────────────────────────────────────────────
  function _toast(msg, type) {
    let t = document.getElementById('avisos-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'avisos-toast';
      t.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);' +
        'padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;' +
        'opacity:0;transition:opacity .3s;pointer-events:none;font-family:Outfit,sans-serif;' +
        'background:#0f1623;white-space:nowrap;';
      document.body.appendChild(t);
    }
    const colors = { success: '#B0F2AE', error: '#FF5C5C', warning: '#FFC04D', info: '#99D1FC' };
    t.style.border = `1px solid ${(colors[type] || colors.info)}55`;
    t.style.color  = colors[type] || colors.info;
    t.textContent  = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2800);
  }

  // ── Render ────────────────────────────────────────────────────────
  async function render() {
    const container = document.getElementById('avisos-container');
    if (!container) return;

    const ok    = await _initFirebase();
    const admin = _isAdmin();
    let items   = [];

    if (ok) {
      try {
        const snap = await _fbGet(_fbRef(_db, DB_PATH));
        if (snap.exists()) {
          items = Object.entries(snap.val() || {})
            .map(([id, v]) => ({ id, ...v }))
            .filter(v => v && v.texto)
            .sort((a, b) => (b.ts || 0) - (a.ts || 0));
        }
      } catch (e) {
        console.warn('[Avisos] Error cargando:', e.message);
      }
    }

    const activos  = items.filter(i => i.activo !== false);
    const visibles = admin ? items : activos;

    if (!visibles.length && !admin) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';

    const listaHTML = visibles.length ? visibles.map(av => {
      const oculto = av.activo === false;
      return `
        <div class="av-item${oculto ? ' av-item-oculto' : ''}">
          <div class="av-item-body">
            <span class="av-bullet">●</span>
            <span class="av-texto">${av.texto}</span>
          </div>
          <div class="av-item-meta">
            ${av.autor ? `<span class="av-autor">${av.autor}</span>` : ''}
            ${av.fecha  ? `<span class="av-fecha">${av.fecha}</span>` : ''}
            ${oculto    ? '<span class="av-oculto-badge">oculto</span>' : ''}
          </div>
          ${admin ? `
          <div class="av-item-actions">
            <button class="av-btn av-btn-toggle" onclick="Avisos._toggle('${av.id}',${!oculto})">
              ${oculto ? '👁 Mostrar' : '🙈 Ocultar'}
            </button>
            <button class="av-btn av-btn-del" onclick="Avisos._delete('${av.id}')">🗑 Eliminar</button>
          </div>` : ''}
        </div>`;
    }).join('') : '<div class="av-empty">Sin avisos activos</div>';

    const formHTML = admin ? `
      <div class="av-form">
        <textarea id="av-input" class="av-input" placeholder="Nuevo aviso para todos los usuarios..." rows="2"></textarea>
        <button class="av-btn-publish" onclick="Avisos._add()">📢 Publicar aviso</button>
      </div>` : '';

    container.innerHTML = `
      <div class="av-header">
        <span class="av-header-icon">🚨</span>
        <span class="av-header-title">Avisos Importantes</span>
        ${admin ? '<span class="av-admin-badge">Admin</span>' : ''}
      </div>
      <div class="av-list">${listaHTML}</div>
      ${formHTML}
    `;
  }

  // ── Agregar ───────────────────────────────────────────────────────
  async function _add() {
    const input = document.getElementById('av-input');
    const texto = (input?.value || '').trim();
    if (!texto) { _toast('Escribe un aviso primero', 'warning'); return; }
    const btn = document.querySelector('.av-btn-publish');
    if (btn) btn.disabled = true;
    try {
      const ok = await _initFirebase();
      if (!ok) throw new Error('Firebase no disponible');
      const ts = Date.now();
      await _fbSet(_fbRef(_db, `${DB_PATH}/av_${ts}`), {
        texto,
        activo: true,
        ts,
        fecha:  _nowLabel(),
        autor:  _currentUser()
      });
      if (input) input.value = '';
      _toast('Aviso publicado ✓', 'success');
      await render();
    } catch (e) {
      _toast('Error: ' + e.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── Eliminar ──────────────────────────────────────────────────────
  async function _delete(id) {
    if (!confirm('¿Eliminar este aviso permanentemente?')) return;
    try {
      const ok = await _initFirebase();
      if (!ok) throw new Error('Firebase no disponible');
      await _fbRemove(_fbRef(_db, `${DB_PATH}/${id}`));
      _toast('Aviso eliminado', 'info');
      await render();
    } catch (e) { _toast('Error: ' + e.message, 'error'); }
  }

  // ── Ocultar / Mostrar ─────────────────────────────────────────────
  async function _toggle(id, nuevoEstado) {
    try {
      const ok = await _initFirebase();
      if (!ok) throw new Error('Firebase no disponible');
      await _fbSet(_fbRef(_db, `${DB_PATH}/${id}/activo`), nuevoEstado);
      await render();
    } catch (e) { _toast('Error: ' + e.message, 'error'); }
  }

  // ── Estilos ───────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('av-styles')) return;
    const s = document.createElement('style');
    s.id = 'av-styles';
    s.textContent = `
      #avisos-container {
        display: none;
        width: 100%; max-width: 760px;
        font-family: 'Outfit', 'Inter', sans-serif;
        border-radius: 16px; overflow: hidden;
        border: 1.5px solid rgba(239,68,68,.35);
        background: linear-gradient(135deg,rgba(239,68,68,.08),rgba(245,158,11,.04));
        margin-bottom: 4px;
      }
      .av-header {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 16px;
        background: rgba(239,68,68,.15);
        border-bottom: 1px solid rgba(239,68,68,.22);
      }
      .av-header-icon { font-size: 15px; }
      .av-header-title {
        font-size: 11px; font-weight: 800;
        letter-spacing: .1em; text-transform: uppercase;
        color: #F87171; flex: 1;
      }
      .av-admin-badge {
        font-size: 9px; font-weight: 700;
        padding: 2px 8px; border-radius: 20px;
        background: rgba(245,158,11,.12); color: #FCD34D;
        border: 1px solid rgba(245,158,11,.28);
        text-transform: uppercase; letter-spacing: .05em;
      }
      .av-list { padding: 6px 14px 4px; display: flex; flex-direction: column; gap: 1px; }
      .av-empty { font-size: 12px; color: #475569; text-align: center; padding: 10px 0 6px; }
      .av-item { padding: 7px 4px; border-radius: 8px; transition: background .15s; }
      .av-item:hover { background: rgba(255,255,255,.03); }
      .av-item-oculto { opacity: .4; }
      .av-item-body { display: flex; align-items: flex-start; gap: 8px; }
      .av-bullet { color: #F87171; font-size: 9px; margin-top: 4px; flex-shrink: 0; }
      .av-texto { font-size: 13px; color: #FCA5A5; line-height: 1.55; flex: 1; }
      .av-item-meta {
        display: flex; align-items: center; gap: 8px;
        margin: 2px 0 0 17px; flex-wrap: wrap;
      }
      .av-autor { font-size: 10px; color: #475569; font-weight: 600; }
      .av-fecha { font-size: 10px; color: #334155; }
      .av-oculto-badge {
        font-size: 9px; padding: 1px 6px; border-radius: 10px;
        background: rgba(100,116,139,.12); color: #64748b;
        border: 1px solid rgba(100,116,139,.18);
      }
      .av-item-actions { display: flex; gap: 6px; margin: 5px 0 2px 17px; }
      .av-btn {
        font-size: 11px; font-weight: 600; padding: 3px 10px;
        border-radius: 7px; border: none; cursor: pointer;
        font-family: inherit; transition: opacity .15s;
      }
      .av-btn:hover { opacity: .75; }
      .av-btn-toggle {
        background: rgba(245,158,11,.1); color: #FCD34D;
        border: 1px solid rgba(245,158,11,.22);
      }
      .av-btn-del {
        background: rgba(239,68,68,.08); color: #F87171;
        border: 1px solid rgba(239,68,68,.18);
      }
      .av-form {
        display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap;
        padding: 10px 14px 12px;
        border-top: 1px solid rgba(239,68,68,.12);
        background: rgba(0,0,0,.12);
      }
      .av-input {
        flex: 1; min-width: 180px;
        background: rgba(15,22,35,.85);
        border: 1px solid rgba(239,68,68,.22); border-radius: 9px;
        padding: 8px 12px; color: #f1f5f9;
        font-size: 13px; font-family: 'Outfit','Inter',sans-serif;
        resize: vertical; outline: none; line-height: 1.5;
        transition: border-color .2s;
      }
      .av-input:focus { border-color: rgba(239,68,68,.5); }
      .av-btn-publish {
        flex-shrink: 0; padding: 8px 16px;
        background: linear-gradient(135deg,#EF4444,#DC2626);
        border: none; border-radius: 9px; color: #fff;
        font-size: 13px; font-weight: 700;
        font-family: 'Outfit','Inter',sans-serif;
        cursor: pointer; white-space: nowrap;
        transition: opacity .2s, transform .15s;
      }
      .av-btn-publish:hover { opacity: .85; transform: translateY(-1px); }
      .av-btn-publish:disabled { opacity: .45; cursor: not-allowed; transform: none; }
      @media (max-width: 600px) {
        #avisos-container { border-radius: 12px; }
        .av-texto { font-size: 12px; }
        .av-form { flex-direction: column; }
        .av-btn-publish { width: 100%; }
      }
    `;
    document.head.appendChild(s);
  }

  // ── Init: insertar contenedor en panel-home y renderizar ──────────
  function init() {
    _injectStyles();
    const home = document.getElementById('panel-home');
    if (!home) return;
    if (!document.getElementById('avisos-container')) {
      const wrap = document.createElement('div');
      wrap.id = 'avisos-container';
      const second = home.children[1];
      if (second) home.insertBefore(wrap, second);
      else home.appendChild(wrap);
    }
    render();
  }

  return { init, render, _add, _delete, _toggle };

})();

window.Avisos = Avisos;