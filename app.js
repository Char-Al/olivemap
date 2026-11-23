/* Olivemap — application (vanilla JS + Leaflet + Supabase) */
const DEFAULT_VIEW = { center: [43.8619, 3.9047], zoom: 16 };
const OWNER_COLORS = { mairie: '#4a8fc7', particulier: '#7fb069' };
const OWNER_LABELS = { mairie: 'Mairie', particulier: 'Particulier' };
const POI = {
  eau: { emoji: '💧', label: "Point d'eau" },
  wc: { emoji: '🚻', label: 'WC' },
  parking: { emoji: '🎫', label: 'Parking' },
  accueil: { emoji: '🏠', label: 'Accueil / consignes' },
  pesee: { emoji: '⚖️', label: 'Pesée' },
};
const ADMIN_EMAIL_DOMAIN = '@olivemap.claret';
const ZONE = { lat: DEFAULT_VIEW.center[0], lng: DEFAULT_VIEW.center[1], km: 3 };
const SUPABASE_URL = 'https://xubbwsvgvtmzrqnkdhug.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_kYKGqGknRPqJyJemHVVNLw_jYRT_N4R';
let sb = null;
try {
  if (typeof supabase !== 'undefined') sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
} catch (e) { sb = null; }

const map = L.map('map', { zoomControl: false }).setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
const zoneCircle = L.circle([ZONE.lat, ZONE.lng], {
  radius: ZONE.km * 1000,
  color: '#ffb020', weight: 3, dashArray: '10 8', fillOpacity: 0.05,
}).addTo(map);

const stateLabels = { 'bon': 'Bon état', 'moyen': 'Moyen', 'mauvais': 'Mauvais état' };
let markers = [];
let addMode = false;
let didFitView = false;

function oliveGlyphs(prod) {
  const S = 12;
  if (prod >= 3) {
    return `<text x="10.5" y="16.5" text-anchor="middle" font-size="${S}">🫒</text>
      <text x="23.5" y="16.5" text-anchor="middle" font-size="${S}">🫒</text>
      <text x="17" y="27" text-anchor="middle" font-size="${S}">🫒</text>`;
  }
  if (prod === 2) {
    return `<text x="10.5" y="21" text-anchor="middle" font-size="${S}">🫒</text>
      <text x="23.5" y="21" text-anchor="middle" font-size="${S}">🫒</text>`;
  }
  return `<text x="17" y="21" text-anchor="middle" font-size="${S}">🫒</text>`;
}

function markerIcon(props) {
  const color = OWNER_COLORS[props.type] || '#7fb069';
  const pending = props.statut === 'attente';
  const prod = Math.min(Math.max(parseInt(props.production, 10) || 1, 1), 3);
  return L.divIcon({
    className: 'tree-marker',
    html: `<div class="tree-icon${pending ? ' pending' : ''}${props.ramasse ? ' done' : ''}"><svg viewBox="0 0 34 46" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 2C9.8 2 4 7.8 4 15c0 5.5 3.2 9.4 6.5 12.8L17 44l6.5-16.2C26.8 24.4 30 20.5 30 15 30 7.8 24.2 2 17 2z" fill="#2e3b31" stroke="${color}" stroke-width="2"/>
      <circle cx="17" cy="38" r="2.4" fill="${color}"/>
      ${oliveGlyphs(prod)}
    </svg></div>`,
    iconSize: [34, 46],
    iconAnchor: [17, 44],
    popupAnchor: [0, -44],
  });
}

function productionDots(n) {
  const v = Math.min(Math.max(parseInt(n, 10) || 0, 1), 3);
  return `<span class="prod-dots" title="Rendement : ${v}/3">${'\u25CF'.repeat(v)}${'\u25CB'.repeat(3 - v)}</span>`;
}

function ownerBadge(type) {
  const key = type === 'mairie' ? 'mairie' : 'particulier';
  return `<span class="state-badge owner-${key}">${OWNER_LABELS[key]}</span>`;
}

function popupHtml(props, coords) {
  const rows = [];
  const actPending = props.statut === 'attente' && isAdminUser;
  const adminRow = (isAdminUser && props.id) ? `<div class="popup-actions"><button class="mini edit" data-act="edit">✏️ Modifier</button>${props.statut === 'valide' ? `<button class="mini edit" data-act="done">${props.ramasse ? '↩️ À faire' : '✔️ Ramassé'}</button><button class="mini edit" data-act="unval">⏳ Dévalider</button><button class="mini no" data-act="del">🗑 Supprimer</button>` : ''}</div>` : '';
  const geoLink = coords
    ? `<a class="mini edit" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}">🧭 Itinéraire</a>`
    : '';
  const shareRow = props.id && props.statut === 'valide'
    ? `<div class="popup-actions"><button class="mini edit" data-share>🔗 Partager l'arbre</button>${geoLink}</div>`
    : '';
  if (props.statut === 'attente') rows.push(['Validation', '\u23f3 En attente \u2014 visible des admins uniquement']);
  if (props.type || props.production) {
    rows.push([
      'Statut',
      `${props.type ? ownerBadge(props.type) : ''}` +
      `${props.type && props.production ? ' ' : ''}` +
      `${props.production ? productionDots(props.production) : ''}`,
    ]);
  }
  if (props.hauteur_m) rows.push(['Hauteur', `${props.hauteur_m} m`]);
  if (props.circonference_cm) rows.push(['Circonférence', `${props.circonference_cm} cm`]);
  if (props.annee_plantation) rows.push(['Planté en', props.annee_plantation]);
  if (props.etat) {
    const key = String(props.etat).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    rows.push(['État', `<span class="state-badge state-${key}">${stateLabels[key] || esc(props.etat)}</span>`]);
  }
  if (props.ramasse) rows.push(['Cueillette', '✅ Ramassé']);
  if (props.jour) rows.push([
    'Jour',
    `${dayEmoji(props.jour)} Jour ${props.jour}${dayDateTxt(props.jour)}`,
  ]);
  const mat = [
    props.besoin_echelle ? '🪜 Échelle' : null,
    props.besoin_caisses ? '🧺 Caisses' : null,
    props.besoin_rateau ? '🪮 Râteau' : null,
    props.besoin_bache ? '🥅 Bâche ou filet' : null,
  ].filter(Boolean);
  if (mat.length) rows.push(['Matériel', mat.join(' · ')]);
  if (props.kids_friendly) rows.push(['Famille', '👶 Adapté aux enfants']);
  if (props.acces_pieton) rows.push(['Accès', '🚶 🚷 Piéton uniquement']);
  for (const [k, v] of Object.entries(props)) {
    if (!['nom', 'espece', 'hauteur_m', 'circonference_cm', 'annee_plantation', 'etat', 'notes', 'photo', 'emoji', 'type', 'production', 'kids_friendly', 'acces_pieton', 'statut', 'id', 'jour', 'besoin_echelle', 'besoin_caisses', 'besoin_rateau', 'besoin_bache'].includes(k) && v != null && v !== '') {
      rows.push([esc(k), esc(String(v))]);
    }
  }
  return `<div class="popup">
    <h3>${props.emoji ? esc(props.emoji) : (actPending ? '⏳' : '🫒')} ${esc(props.nom || 'Sans nom')}${actPending ? ' <span class="badge-wait">En attente</span>' : ''}</h3>
    ${props.espece ? `<div class="species">${esc(props.espece)}</div>` : ''}
    ${props.photo ? `<img src="${esc(props.photo)}" alt="${esc(props.nom || '')}" onerror="this.style.display='none'"/>` : ''}
    ${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}
    ${props.notes ? `<div class="notes">${esc(props.notes)}</div>` : ''}
    ${props.id && props.statut !== 'attente' && props.jour ? '<div class="part-zone" data-part></div>' : ''}
    ${actPending ? `
      <div class="popup-actions"><button class="mini ok" data-act="ok">\u2705 Valider</button><button class="mini no" data-act="no">\u{1F5D1} Rejeter</button></div>` : ''}
    ${adminRow}
    ${shareRow}
  </div>`;
}

function visibleFeatures() {
  const showM = document.getElementById('legend-mairie').classList.contains('active');
  const showP = document.getElementById('legend-particulier').classList.contains('active');
  const op = document.getElementById('btn-filter-open').classList.contains('active');
  return allFeatures.filter((f) => {
    const p = f.properties || {};
    if (p.type === 'mairie' && !showM) return false;
    if (p.type === 'particulier' && !showP) return false;
    if (dayFilter && p.jour !== dayFilter) return false;
    if (op) {
      if (p.statut === 'attente') return false;
      if (p.ramasse) return false;
    }
    return true;
  });
}

function render() {
  markers.forEach(({ marker }) => map.removeLayer(marker));
  markers = [];
  const feats = visibleFeatures();
  feats.forEach((f) => {
    const marker = L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]], { icon: markerIcon(f.properties || {}) });
    marker.bindPopup(() => popupHtml(f.properties, f.geometry.coordinates), { maxWidth: 280 });
    if (f.properties && f.properties.id) {
      marker.on('popupopen', () => {
        const el = marker.getPopup().getElement();
        if (!el) return;
        const act = async (kind) => {
          const id = f.properties.id;
          if (kind === 'ok') {
            const { error } = await sb.from('arbres').update({ statut: 'valide' }).eq('id', id);
            if (error) { toast('\u26a0\ufe0f ' + error.message, false); return; }
            toast(`\u2705 \u00ab ${esc(f.properties.nom)} \u00bb valid\u00e9 \u2014 il appara\u00eet d\u00e9sormais pour tout le monde.`);
          } else {
            const { error } = await sb.from('arbres').delete().eq('id', id);
            if (error) { toast('\u26a0\ufe0f ' + error.message, false); return; }
            toast(`\u{1F5D1} Proposition \u00ab ${esc(f.properties.nom)} \u00bb rejet\u00e9e.`);
          }
          marker.closePopup();
          if (typeof loadAdminPanel === 'function' && isAdminUser) loadAdminPanel();
          await load();
        };
        const ok = el.querySelector('[data-act="ok"]');
        const no = el.querySelector('[data-act="no"]');
        if (ok) ok.addEventListener('click', () => act('ok'));
        if (no) no.addEventListener('click', () => act('no'));
        const btnEdit = el.querySelector('[data-act="edit"]');
        if (btnEdit) btnEdit.addEventListener('click', () => { marker.closePopup(); startEdit(f.properties, f.geometry.coordinates); });
        const btnUnval = el.querySelector('[data-act="unval"]');
        if (btnUnval) btnUnval.addEventListener('click', async () => {
          const { error } = await sb.from('arbres').update({ statut: 'attente' }).eq('id', f.properties.id);
          if (error) { toast('⚠️ ' + error.message, false); return; }
          marker.closePopup();
          toast(`⏳ « ${esc(f.properties.nom)} » remis en attente — visible des admins uniquement.`);
          await load();
        });
        const btnDone = el.querySelector('[data-act="done"]');
        if (btnDone) btnDone.addEventListener('click', async () => {
          const v = !f.properties.ramasse;
          const { error } = await sb.from('arbres').update({ ramasse: v }).eq('id', f.properties.id);
          if (error) { toast('⚠️ ' + error.message, false); return; }
          marker.closePopup();
          toast(v ? `✅ « ${esc(f.properties.nom)} » marqué ramassé.` : `↩️ « ${esc(f.properties.nom)} » à nouveau à faire.`);
          if (isAdminUser) loadAdminPanel();
          await load();
        });
        const btnDel = el.querySelector('[data-act="del"]');
        if (btnDel) btnDel.addEventListener('click', async () => {
          const { error } = await sb.from('arbres').delete().eq('id', f.properties.id);
          if (error) { toast('⚠️ ' + error.message, false); return; }
          marker.closePopup();
          toast(`🗑 « ${esc(f.properties.nom)} » supprimé.`);
          await load();
        });
        const pz = el.querySelector('[data-part]');
        if (pz) loadParticipations(f.properties.id, pz, f.properties.jour);
        const sh = el.querySelector('[data-share]');
        if (sh) sh.addEventListener('click', () => {
          const link = `${location.origin}${location.pathname}?arbre=${f.properties.id}`;
          navigator.clipboard.writeText(link)
            .then(() => toast('🔗 Lien copi\u00e9 \u2014 colle-le pour partager cet arbre.'))
            .catch(() => toast(link, false));
        });
      });
    }
    marker.bindTooltip(`${((f.properties || {}).statut === 'attente' ? '⏳ ' : '')}${esc(f.properties.nom || 'Arbre')} ${(f.properties || {}).production ? productionDots(f.properties.production) : ''}`, { direction: 'top', offset: [0, -44] });
    markers.push({ marker, f });
    marker.addTo(map);
  });
  document.getElementById('counter').innerHTML =
    `<b>${feats.length}</b>/${allFeatures.length}`;
  renderJourFilters();
}

function toast(html, autohide = true) {
  const el = document.getElementById('toast');
  el.innerHTML = html + '<button type="button" class="toast-close" title="Fermer" aria-label="Fermer">\u2715</button>';
  el.classList.add('visible');
  el.querySelector('.toast-close').addEventListener('click', () => el.classList.remove('visible'));
  if (toast._t) { clearTimeout(toast._t); toast._t = null; }
  if (autohide) toast._t = setTimeout(() => el.classList.remove('visible'), 6000);
}

function rowToFeature(r) {
  const p = {};
  const props = ['id', 'nom', 'type', 'production', 'espece', 'hauteur_m', 'circonference_cm', 'annee_plantation', 'etat', 'photo', 'notes', 'kids_friendly', 'acces_pieton', 'statut', 'jour', 'besoin_echelle', 'besoin_caisses', 'besoin_rateau', 'besoin_bache'];
  props.forEach((k) => {
    if (r[k] !== null && r[k] !== undefined && r[k] !== '' && r[k] !== false) {
      p[k] = (k === 'hauteur_m' || k === 'circonference_cm') ? Number(r[k]) : r[k];
    }
  });
  return { type: 'Feature', properties: p, geometry: { type: 'Point', coordinates: [Number(r.lng), Number(r.lat)] } };
}

async function load() {
  const features = [];
  let baseOk = false;
  if (sb) {
    try {
      const { data: rows, error } = await sb.from('arbres').select('*');
      if (!error && Array.isArray(rows)) {
        rows.forEach((r) => features.push(rowToFeature(r)));
        baseOk = true;
      }
    } catch (e) { /* base inaccessible */ }
  }
  if (!baseOk) {
    try {
      const res = await fetch('arbres.geojson');
      const data = await res.json();
      features.push(...(data.features || []).filter((f) => f.geometry && f.geometry.type === 'Point'));
      if (sb) toast('⚠️ Base injoignable — affichage de la copie de sauvegarde (lecture seule).', false);
    } catch (e) { /* aucune source disponible */ }
  }

  allFeatures = features;

  if (!didFitView) {
    if (allFeatures.length === 1) {
      map.setView([allFeatures[0].geometry.coordinates[1], allFeatures[0].geometry.coordinates[0]], 16);
    } else if (allFeatures.length > 1) {
      map.fitBounds(L.latLngBounds(allFeatures.map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]])).pad(0.25));
    }
    didFitView = true;
  }

  render();
}

document.getElementById('legend-particulier').addEventListener('click', () => {
  document.getElementById('legend-particulier').classList.toggle('active');
  render();
});
document.getElementById('legend-mairie').addEventListener('click', () => {
  document.getElementById('legend-mairie').classList.toggle('active');
  render();
});
document.getElementById('btn-filter-open').addEventListener('click', () => {
  document.getElementById('btn-filter-open').classList.toggle('active');
  render();
});

document.getElementById('btn-locate').addEventListener('click', () => {
  map.locate({ setView: true, maxZoom: 16 });
});
map.on('locationfound', () => toast('📍 Position trouvée.'));
map.on('locationerror', () => toast('⚠️ Localisation impossible (autorisation refusée ?).'));

const addBadge = document.getElementById('add-badge');
function toggleAdd(on) {
  addMode = on === undefined ? !addMode : on;
  addBadge.classList.toggle('visible', addMode);
  document.getElementById('map').style.cursor = addMode ? 'crosshair' : '';
}
let addModeTarget = 'propose';
const btnPropose = document.getElementById('btn-propose');
btnPropose.addEventListener('click', () => { addModeTarget = 'propose'; addBadge.textContent = "Cliquez sur la carte pour choisir l'emplacement \u2014 annuler"; toggleAdd(); });
addBadge.addEventListener('click', () => {
  if (placingPoi) {
    placingPoi = false;
    addBadge.classList.remove('visible');
    document.getElementById('map').style.cursor = '';
    return;
  }
  toggleAdd(false);
});

let poiMarkers = [];
let placingPoi = false;
let poiType = 'eau';

function fillPoiType() {
  const sel = document.getElementById('poi-type');
  if (!sel || sel.options.length) return;
  sel.innerHTML = Object.entries(POI).map(([k, v]) => `<option value="${k}">${v.emoji} ${esc(v.label)}</option>`).join('');
}

function poiIcon(p) {
  const info = POI[p.type] || { emoji: '📍' };
  return L.divIcon({
    className: 'tree-marker',
    html: `<div class="poi-pin">${info.emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function poiPopupHtml(p) {
  const info = POI[p.type] || { emoji: '📍', label: p.type };
  return `<div class="popup">
    <h3>${info.emoji} ${esc(info.label)}</h3>
    <dl><dt>Type</dt><dd>Point logistique</dd></dl>
    ${isAdminUser && p.id ? `<div class="popup-actions"><button class="mini no" data-pdel="${p.id}">🗑 Supprimer</button></div>` : ''}
  </div>`;
}

async function loadPois() {
  if (!sb) return;
  let rows = null;
  try {
    const { data, error } = await sb.from('pois').select('*').order('cree_le');
    if (!error) rows = data || [];
  } catch (e) { rows = null; }
  if (!rows) return;
  poiMarkers.forEach((m) => map.removeLayer(m));
  poiMarkers = [];
  rows.forEach((p) => {
    const m = L.marker([Number(p.lat), Number(p.lng)], { icon: poiIcon(p) });
    m.bindPopup(() => poiPopupHtml(p), { maxWidth: 260 });
    m.on('popupopen', () => {
      const el = m.getPopup().getElement();
      if (!el) return;
      const del = el.querySelector('[data-pdel]');
      if (del) del.addEventListener('click', async () => {
        const { error } = await sb.from('pois').delete().eq('id', p.id);
        if (error) { toast('\u26a0\ufe0f ' + error.message, false); return; }
        m.closePopup();
        toast(`🗑 ${esc((POI[p.type] || {}).label || 'Point')} supprim\u00e9.`);
        loadPois();
        loadPoisAdmin();
      });
    });
    m.addTo(map);
    poiMarkers.push(m);
  });
}

async function loadPoisAdmin() {
  if (!isAdminUser || !sb) return;
  const list = document.getElementById('poi-list');
  if (!list) return;
  const { data, error } = await sb.from('pois').select('id, type').order('cree_le');
  if (error) { list.innerHTML = '<div class="hint">\u26a0\ufe0f ' + error.message + '</div>'; return; }
  if (!data || !data.length) {
    list.innerHTML = '<div class="hint">Aucun point logistique. Choisis un type et place-le sur la carte.</div>';
    return;
  }
  list.innerHTML = data.map((p) => {
    const info = POI[p.type] || { emoji: '📍', label: p.type };
    return `<div class="poi-row">${info.emoji} ${esc(info.label)} <button type="button" class="mini no" data-pdel="${p.id}">🗑</button></div>`;
  }).join('');
  list.querySelectorAll('[data-pdel]').forEach((b) => {
    b.addEventListener('click', async () => {
      const { error: err } = await sb.from('pois').delete().eq('id', b.dataset.pdel);
      if (err) { toast('\u26a0\ufe0f ' + err.message, false); return; }
      toast('🗑 Point logistique supprim\u00e9.');
      loadPoisAdmin();
      loadPois();
    });
  });
}

document.getElementById('btn-poi-add').addEventListener('click', () => {
  placingPoi = !placingPoi;
  poiType = document.getElementById('poi-type').value;
  addBadge.classList.toggle('visible', placingPoi);
  document.getElementById('map').style.cursor = placingPoi ? 'crosshair' : '';
  if (placingPoi) {
    addBadge.textContent = `📍 Cliquez sur la carte pour placer \u00ab ${(POI[poiType] || {}).label || poiType} \u00bb \u2014 annuler`;
    toast('📍 Clique sur la carte pour placer ce point logistique.', false);
  }
});

function setFormMode(target) {
  document.getElementById('modal-title').textContent = target === 'edit' ? '✏️ Modifier l’arbre' : '🙋 Proposer un arbre';
  document.getElementById('btn-submit-form').textContent = target === 'edit' ? 'Enregistrer' : 'Envoyer la proposition';
  document.getElementById('admin-fields').style.display = target === 'propose' ? 'none' : '';
  const pb = document.getElementById('btn-photo');
  pb.textContent = '📷 Prendre / choisir une photo';
  pb.disabled = false;
  document.getElementById('f-photo-file').value = '';
}

function showStep(name) {
  ['form', 'login', 'admin'].forEach((s) => {
    document.getElementById(`step-${s}`).classList.toggle('visible', s === name);
  });
  document.getElementById('modal-overlay').classList.add('visible');
}

function hideModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
}

function collectFormValues() {
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? undefined : n; };
  const val = (id) => document.getElementById(id).value.trim();
  const props = { nom: val('f-nom'), type: document.getElementById('f-type').value };
  props.production = parseInt(document.getElementById('f-production').value, 10) || 2;
  props.etat = document.getElementById('f-etat').value;
  if (val('f-espece')) props.espece = val('f-espece');
  const h = num(val('f-hauteur')); if (h !== undefined) props.hauteur_m = h;
  const c = num(val('f-circonf')); if (c !== undefined) props.circonference_cm = c;
  const a = num(val('f-annee')); if (a !== undefined) props.annee_plantation = a;
  if (val('f-photo')) props.photo = val('f-photo');
  if (val('f-notes')) props.notes = val('f-notes');
  if (document.getElementById('f-kids').checked) props.kids_friendly = true;
  if (document.getElementById('f-pieton').checked) props.acces_pieton = true;
  if (addModeTarget !== 'propose') {
    props.besoin_echelle = document.getElementById('f-echelle').checked;
    props.besoin_caisses = document.getElementById('f-caisses').checked;
    props.besoin_rateau = document.getElementById('f-rateau').checked;
    props.besoin_bache = document.getElementById('f-bache').checked;
  }
  if (addModeTarget !== 'propose') {
    const j = parseInt(document.getElementById('f-jour').value, 10);
    if (j === 1 || j === 2) props.jour = j;
  }
  return props;
}

let editTreeId = null;

function fillForm(props) {
  document.getElementById('f-nom').value = props.nom || '';
  document.getElementById('f-type').value = props.type === 'mairie' ? 'mairie' : 'particulier';
  document.getElementById('f-production').value = String(props.production || 2);
  document.getElementById('f-espece').value = props.espece || '';
  document.getElementById('f-hauteur').value = props.hauteur_m ?? '';
  document.getElementById('f-circonf').value = props.circonference_cm ?? '';
  document.getElementById('f-annee').value = props.annee_plantation ?? '';
  const etat = String(props.etat || 'bon').toLowerCase();
  document.getElementById('f-etat').value = ['bon', 'moyen', 'mauvais'].includes(etat) ? etat : 'bon';
  document.getElementById('f-photo').value = props.photo || '';
  document.getElementById('f-notes').value = props.notes || '';
  document.getElementById('f-kids').checked = !!props.kids_friendly;
  document.getElementById('f-pieton').checked = !!props.acces_pieton;
  document.getElementById('f-echelle').checked = !!props.besoin_echelle;
  document.getElementById('f-caisses').checked = !!props.besoin_caisses;
  document.getElementById('f-rateau').checked = !!props.besoin_rateau;
  document.getElementById('f-bache').checked = !!props.besoin_bache;
  document.getElementById('f-jour').value = props.jour ? String(props.jour) : '';
}

function startEdit(props, coords) {
  if (!sb || !props.id) return;
  addModeTarget = 'edit';
  editTreeId = props.id;
  fillForm(props);
  toggleAdd(false);
  document.getElementById('coords').textContent = coords ? `[${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}]` : '';
  document.getElementById('form-err').classList.remove('visible');
  setFormMode('edit');
  showStep('form');
}

async function updateFeature(id) {
  const props = collectFormValues();
  if (!props.nom) return;
  editTreeId = id;
  const { error } = await sb.from('arbres').update({
    nom: props.nom,
    type: props.type,
    production: props.production,
    etat: props.etat,
    espece: props.espece || null,
    hauteur_m: props.hauteur_m || null,
    circonference_cm: props.circonference_cm || null,
    annee_plantation: props.annee_plantation || null,
    photo: props.photo || null,
    notes: props.notes || null,
    kids_friendly: !!props.kids_friendly,
    acces_pieton: !!props.acces_pieton,
    besoin_echelle: !!props.besoin_echelle,
    besoin_caisses: !!props.besoin_caisses,
    besoin_rateau: !!props.besoin_rateau,
    besoin_bache: !!props.besoin_bache,
    jour: props.jour || null,
  }).eq('id', id);
  editTreeId = null;
  hideModal();
  if (error) { toast('⚠️ ' + error.message, false); return; }
  toast('✅ Modifications enregistrées.');
  if (isAdminUser) loadAdminPanel();
  await load();
}

async function proposeFeature(props) {
  if (!sb) {
    toast('⚠️ Base de données injoignable — proposition impossible pour le moment.', false);
    return;
  }
  const p = props;
  const [lng, lat] = pendingCoords;
  const { error } = await sb.from('arbres').insert({
    nom: p.nom,
    type: p.type,
    production: p.production,
    etat: p.etat,
    espece: p.espece || null,
    hauteur_m: p.hauteur_m || null,
    circonference_cm: p.circonference_cm || null,
    annee_plantation: p.annee_plantation || null,
    photo: p.photo || null,
    notes: p.notes || null,
    kids_friendly: !!p.kids_friendly,
    acces_pieton: !!p.acces_pieton,
    lng,
    lat,
    statut: 'attente',
  });
  if (error) {
    hideModal();
    const missing = /PGRST205|does not exist|relation/i.test(error.message || '');
    toast(missing
      ? '⚠️ Table non créée : exécute <code>supabase.sql</code> dans le SQL Editor du projet Supabase.'
      : `Échec de l'envoi : ${error.message}`, false);
    return;
  }
  hideModal();
  if (isAdminUser) {
    map.panTo([lat, lng]);
    await load();
    if (typeof loadAdminPanel === 'function') loadAdminPanel();
    toast(`🫒 Proposition « <b>${esc(p.nom)}</b> » enregistrée — visible sur la carte (en pointillés) jusqu'à validation.`, false);
  } else {
    toast(`🙏 Merci ! La proposition « <b>${esc(p.nom)}</b> » attend la validation.`, false);
  }
}

let pendingCoords = null;

map.on('click', async (e) => {
  if (placingPoi) {
    if (map.distance(e.latlng, L.latLng(ZONE.lat, ZONE.lng)) > ZONE.km * 1000) {
      toast(`\u26a0\ufe0f Trop loin du village \u2014 limit\u00e9 \u00e0 ${ZONE.km} km autour de Claret.`, false);
      return;
    }
    placingPoi = false;
    addBadge.classList.remove('visible');
    document.getElementById('map').style.cursor = '';
    const info = POI[poiType] || {};
    const { error } = await sb.from('pois').insert({ type: poiType, lng: e.latlng.lng, lat: e.latlng.lat });
    if (error) { toast('\u26a0\ufe0f ' + error.message, false); return; }
    toast(`📍 ${esc(info.label || poiType)} ajout\u00e9 \u00e0 la carte.`);
    loadPois();
    return;
  }
  if (!addMode) return;
  if (map.distance(e.latlng, L.latLng(ZONE.lat, ZONE.lng)) > ZONE.km * 1000) {
    toggleAdd(false);
    toast(`⚠️ Trop loin du village — les propositions sont limitées à ${ZONE.km} km autour de Claret.`, false);
    return;
  }
  toggleAdd(false);
  pendingCoords = [e.latlng.lng, e.latlng.lat];
  setFormMode(addModeTarget);
  document.getElementById('coords').textContent = `[${e.latlng.lng.toFixed(6)}, ${e.latlng.lat.toFixed(6)}]`;
  document.getElementById('form-err').classList.remove('visible');
  showStep('form');
});

document.getElementById('tree-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const props = collectFormValues();
  if (!props.nom) {
    const err = document.getElementById('form-err');
    err.textContent = 'Le nom est obligatoire.';
    err.classList.add('visible');
    return;
  }
  if (addModeTarget === 'edit') {
    if (editTreeId) updateFeature(editTreeId);
    return;
  }
  proposeFeature(props);
});

async function photoToBlob(file) {
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const max = 1024;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return await new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.82));
}

document.getElementById('btn-photo').addEventListener('click', () => {
  if (addModeTarget === 'propose') { toast('\u26a0\ufe0f Pour une proposition, colle simplement une URL de photo (l\'envoi de fichier est r\u00e9serv\u00e9 aux admins).', false); return; }
  document.getElementById('f-photo-file').click();
});

document.getElementById('f-photo-file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const phErr = document.getElementById('form-err');
  phErr.classList.remove('visible');
  if (!sb) { phErr.textContent = 'Supabase indisponible : colle une URL de photo.'; phErr.classList.add('visible'); return; }
  const btn = document.getElementById('btn-photo');
  btn.textContent = '\u23f3 Traitement\u2026';
  btn.disabled = true;
  try {
    const blob = await photoToBlob(file);
    if (!blob) throw new Error('format de fichier non reconnu');
    const path = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
    const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
    if (error) throw error;
    const { data: pub } = sb.storage.from('photos').getPublicUrl(path);
    document.getElementById('f-photo').value = pub.publicUrl;
    btn.textContent = '\u{0001F4F7} Photo \u2713';
  } catch (err) {
    btn.textContent = '\u{0001F4F7} Prendre / choisir une photo';
    btn.disabled = false;
    phErr.textContent = 'Envoi de la photo impossible : ' + (err.message || err);
    phErr.classList.add('visible');
    return;
  }
});

document.getElementById('modal-close').addEventListener('click', hideModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) hideModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideModal();
});

let isAdminUser = false;
let currentEmail = null;

async function refreshAdminState() {
  isAdminUser = false;
  currentEmail = null;
  try {
    const { data } = await sb.auth.getUser();
    currentEmail = (data && data.user && data.user.email) || null;
    if (currentEmail) {
      const { data: ok, error } = await sb.rpc('is_admin');
      if (!error && ok === true) isAdminUser = true;
    }
  } catch (e) { isAdminUser = false; }
  const b = document.getElementById('btn-admin');
  b.classList.toggle('active', isAdminUser);
  b.title = isAdminUser ? `Espace admin (${pseudoOf(currentEmail)})` : 'Espace admin';
  const lp = document.getElementById('legend-pending');
  if (lp) lp.style.display = isAdminUser ? 'flex' : 'none';
  return isAdminUser;
}

function adminsRow(email, removable) {
  const row = document.createElement('div');
  row.className = 'admin-row';
  row.innerHTML = `<span>\u{1F451} ${pseudoOf(email)}${removable ? '' : ' (toi)'}</span>${removable ? `<button class="mini no" data-e="${email}">\u{1F5D1} Effacer</button>` : ''}`;
  if (removable) {
    row.querySelector('button').addEventListener('click', async () => {
      const { error } = await sb.from('admins').delete().eq('email', email);
      if (error) { toast('\u26a0\ufe0f ' + error.message, false); return; }
      toast(`\u{1F451} ${pseudoOf(email)} n'est plus administrateur.`);
      loadAdminPanel();
    });
  }
  return row;
}

const esc = (t) => String(t).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const APPORT_LABELS = { echelle: '🪜 échelle', caisses: '🧺 caisses', rateau: '🪮 râteau', bache: '🥅 bâche ou filet', filet: '🥅 bâche ou filet', deux: '🪜 🧺' };

async function loadParticipations(id, zone, jour) {
  if (!sb) return;
  zone.innerHTML = '<div class="hint">⏳ Chargement…</div>';
  const { data, error } = await sb.from('participations').select('id, pseudo, nb_personnes, apporte').eq('arbre_id', id).order('cree_le');
  if (error) { zone.innerHTML = '<div class="hint">⚠️ ' + error.message + '</div>'; return; }
  const total = (data || []).reduce((a, r) => a + (r.nb_personnes || 1), 0);
  const jourTxt = jour ? ` 🚚 ${dayEmoji(jour)} Jour ${jour}${dayDateTxt(jour)}` : '';
  const list = (data || []).map((r) => {
    const del = isAdminUser
      ? ` <button type="button" class="mini no part-del" data-pid="${r.id}" title="Retirer ce volontaire">✕</button>`
      : '';
    const ap = String(r.apporte || '').split(',').map((t) => t.trim()).filter(Boolean)
      .map((t) => APPORT_LABELS[t] || esc(t)).join(' + ');
    return `<div class="part-row">· <b>${esc(r.pseudo)}</b> (${r.nb_personnes})${ap ? ` — ${ap}` : ''}${del}</div>`;
  }).join('');
  const me = localStorage.getItem('olivemap_pseudo') || '';
  zone.innerHTML = `
    <div class="part-head">👥 ${total} participant${total > 1 ? 's' : ''}${jourTxt}</div>
    ${list ? `<div class="part-list">${list}</div>` : ''}
    <div class="part-form">
      <input data-part-pseudo placeholder="ton pseudo" value="${esc(me)}" />
      <input data-part-nb type="number" min="1" max="50" value="1" />
      <button type="button" class="mini ok" data-part-go>🙋 Je viens</button>
    </div>
    <div class="part-apports">
      <span>J'apporte :</span>
      <label><input type="checkbox" data-ap value="echelle" />🪜</label>
      <label><input type="checkbox" data-ap value="caisses" />🧺</label>
      <label><input type="checkbox" data-ap value="rateau" />🪮</label>
      <label><input type="checkbox" data-ap value="bache" title="bâche ou filet" />🥅</label>
    </div>`;
  zone.querySelectorAll('[data-pid]').forEach((b) => {
    b.addEventListener('click', async () => {
      const { error: err } = await sb.from('participations').delete().eq('id', b.dataset.pid);
      if (err) { toast('⚠️ ' + err.message, false); return; }
      toast('❌ Volontaire retiré.');
      loadParticipations(id, zone, jour);
    });
  });
  const go = zone.querySelector('[data-part-go]');
  go.addEventListener('click', async () => {
    const pseudo = zone.querySelector('[data-part-pseudo]').value.trim().toLowerCase();
    const nb = parseInt(zone.querySelector('[data-part-nb]').value, 10) || 1;
    const ap = Array.from(zone.querySelectorAll('[data-ap]:checked')).map((c) => c.value).join(',');
    if (!pseudo) { toast('⚠️ Indique un pseudo.', false); return; }
    const { error: err } = await sb.from('participations').insert({ arbre_id: id, pseudo, nb_personnes: nb, apporte: ap || null });
    if (err) { toast('⚠️ ' + err.message, false); return; }
    localStorage.setItem('olivemap_pseudo', pseudo);
    toast(`🙋 ${pseudo} · ${nb} inscrit${nb > 1 ? 's' : ''} pour la cueillette !`);
    loadParticipations(id, zone, jour);
  });
}

function wmoIcon(c) {
  if (c === 0) return '☀️';
  if (c <= 2) return '🌤️';
  if (c === 3) return '☁️';
  if (c === 45 || c === 48) return '🌫️';
  if (c >= 51 && c <= 67) return '🌦️';
  if (c >= 71 && c <= 77) return '🌨️';
  if (c >= 80 && c <= 82) return '🌧️';
  if (c >= 95) return '⛈️';
  return '☁️';
}

async function fetchWeather() {
  const el = document.getElementById('weather');
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${ZONE.lat}&longitude=${ZONE.lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FParis&forecast_days=3`);
    if (!r.ok) return;
    const j = await r.json();
    const d = j.daily;
    if (!d || !d.time || !d.time.length) return;
    el.innerHTML = d.time.map((t, i) => `
      <div class="wd">
        <span class="wl">${i === 0 ? 'Auj.' : new Date(t).toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
        <span class="wi">${wmoIcon(d.weather_code[i])}</span>
        <b>${Math.round(d.temperature_2m_max[i])}°<span class="wmin">/${Math.round(d.temperature_2m_min[i])}°</span></b>
        <span class="rain">💧 ${d.precipitation_probability_max[i] ?? 0}%</span>
      </div>`).join('<span class="wsep"></span>');
    el.style.display = 'flex';
  } catch (err) { /* widget caché si hors-ligne / API injoignable */ }
}

let joursRows = [];
let joursRemoved = [];
let dayFilter = null;

function dayEmoji(n) { return ['🟠', '🔵', '🟢', '🟣', '🔴'][(Number(n) - 1) % 5]; }

function dayDateTxt(n, long = false) {
  const j = joursRows.find((x) => x.numero === Number(n));
  if (!j || !j.date) return '';
  return ' — ' + new Date(j.date + 'T12:00:00').toLocaleDateString('fr-FR', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' });
}

function ordonneJours() {
  return [...joursRows].sort((a, b) => {
    if (a.date && b.date) return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.numero - b.numero;
  });
}

function jourPos(row) { return ordonneJours().indexOf(row) + 1; }

async function loadJours() {
  if (!sb) return;
  const keep = ({ numero, date }) => ({ numero, date });
  const saved = joursRows.map(keep);
  const { data, error } = await sb.from('jours').select('numero, date').order('numero');
  if (!error && Array.isArray(data) && data.length) {
    joursRows = data.map((r) => ({ numero: r.numero, date: r.date || null }));
  } else {
    const { data: infoRows } = await sb.from('infos').select('cle, valeur').in('cle', ['jour1', 'jour2']);
    const info = Object.fromEntries((infoRows || []).map((r) => [r.cle, r.valeur]));
    joursRows = [];
    if (info.jour1) joursRows.push({ numero: 1, date: info.jour1.slice(0, 10) });
    if (info.jour2) joursRows.push({ numero: 2, date: info.jour2.slice(0, 10) });
    if (saved.length && saved.some((j) => j.date)) joursRows = saved;
  }
}

function renderJourFilters() {
  const c = document.getElementById('jour-filters');
  if (!c) return;
  if (dayFilter && !joursRows.some((j) => j.numero === dayFilter)) dayFilter = null;
  c.innerHTML = '';
  joursRows.forEach((j) => {
    const lst = allFeatures.map((f) => f.properties || {}).filter((p) => p.jour === j.numero);
    const st = lst.length ? ` (${lst.filter((p) => p.ramasse).length}/${lst.length})` : '';
    const b = document.createElement('button');
    b.className = 'btn' + (dayFilter === j.numero ? ' active' : '');
    b.title = 'Ne montrer que les arbres du Jour ' + j.numero;
    b.textContent = `${dayEmoji(j.numero)} Jour ${j.numero}${st}`;
    b.addEventListener('click', () => {
      dayFilter = dayFilter === j.numero ? null : j.numero;
      render();
    });
    c.appendChild(b);
  });
}

function fillJourSelect() {
  const sel = document.getElementById('f-jour');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Peu importe</option>' +
    ordonneJours().map((j) => `<option value="${j.numero}">${dayEmoji(jourPos(j))} Jour ${jourPos(j)}${dayDateTxt(j.numero)}</option>`).join('');
  if ([...sel.options].some((o) => o.value === String(cur))) sel.value = String(cur);
}

function renderJoursAdmin() {
  const list = document.getElementById('jours-list');
  if (!list) return;
  list.innerHTML = '';
  ordonneJours().forEach((j) => {
    const pos = jourPos(j);
    const row = document.createElement('div');
    row.className = 'jour-row';
    row.innerHTML = `<span class="j-name">${dayEmoji(pos)} Jour ${pos}</span>` +
      `<input type="date" value="${j.date || ''}" data-jd="${j.numero}" />` +
      `<button type="button" class="mini no" data-jr="${j.numero}" title="Supprimer ce jour">🗑</button>`;
    row.querySelector('[data-jr]').addEventListener('click', () => {
      joursRows = joursRows.filter((x) => x.numero !== j.numero);
      if (!joursRemoved.includes(j.numero)) joursRemoved.push(j.numero);
      renderJoursAdmin();
      fillJourSelect();
    });
    list.appendChild(row);
  });
}

function renderSheetButtons() {
  const c = document.getElementById('sheet-jours');
  if (!c) return;
  c.innerHTML = '';
  if (!joursRows.length) { c.innerHTML = '<div class="hint">Aucun jour de cueillette créé.</div>'; return; }
  joursRows.forEach((j) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mini edit';
    b.textContent = `🖨️ Jour ${j.numero}`;
    b.addEventListener('click', () => printSheet(j.numero));
    c.appendChild(b);
  });
}

document.getElementById('btn-jour-add').addEventListener('click', () => {
  const n = joursRows.reduce((m, j) => Math.max(m, j.numero), 0) + 1;
  joursRows.push({ numero: n, date: null });
  renderJoursAdmin();
  fillJourSelect();
});


async function loadEventBanner() {
  const banner = document.getElementById('event-banner');
  await loadJours();
  renderJourFilters();
  fillJourSelect();
  if (!sb) { banner.style.display = 'none'; return; }
  const { data, error } = await sb.from('infos').select('cle, valeur').eq('cle', 'rdv');
  if (error) { banner.style.display = 'none'; return; }
  const info = Object.fromEntries((data || []).map((r) => [r.cle, r.valeur]));
  if (!info.rdv || sessionStorage.getItem('olivemap_banner_ok') === info.rdv) { banner.style.display = 'none'; return; }
  banner.innerHTML =
    '<span class="eb-text">📢 ' + esc(info.rdv).replace(/\n/g, '<br/>') + '</span>' +
    '<button class="eb-close" id="eb-close">✕</button>';
  banner.style.display = 'block';
  document.getElementById('eb-close').addEventListener('click', () => {
    banner.style.display = 'none';
    sessionStorage.setItem('olivemap_banner_ok', info.rdv);
  });
  const iso = new Date().toLocaleDateString('sv-SE');
  const tod = joursRows.find((j) => j.date === iso);
  if (tod && !dayFilter) {
    dayFilter = tod.numero;
    visibleFeatures();
    render();
    toast(`📢 C'est aujourd'hui : Jour ${tod.numero} — filtre activé.`);
  }
}

async function loadAdminPanel() {
  document.getElementById('admin-info').textContent =
    `Connect\u00e9 : ${currentEmail ? pseudoOf(currentEmail) : '\u2014'}${isAdminUser ? '' : " \u2014 ton compte n'est pas administrateur"}`;
  const evAdm = document.getElementById('event-admin');
  evAdm.style.display = isAdminUser ? '' : 'none';
  document.getElementById('sheet-admin').style.display = isAdminUser ? '' : 'none';
  document.getElementById('poi-admin').style.display = isAdminUser ? '' : 'none';
  fillPoiType();
  if (isAdminUser) {
    const et = document.getElementById('event-text');
    const { data: infoRows } = await sb.from('infos').select('cle, valeur').eq('cle', 'rdv');
    const info = Object.fromEntries((infoRows || []).map((r) => [r.cle, r.valeur]));
    if (document.activeElement !== et) et.value = info.rdv || '';
    await loadJours();
    renderJoursAdmin();
    fillJourSelect();
    renderJourFilters();
    renderSheetButtons();
    loadPoisAdmin();
  }
  const pl = document.getElementById('pending-list');
  const al = document.getElementById('admins-list');
  pl.innerHTML = '';
  al.innerHTML = '';
  if (!isAdminUser) {
    pl.innerHTML = '<div class="hint">Ton compte n\'est pas dans la liste des administrateurs. Demande \u00e0 un admin existant de l\'ajouter.</div>';
    return;
  }
  const { data: pend, error: pErr } = await sb.from('arbres').select('*').eq('statut', 'attente').order('cree_le');
  if (pErr) {
    pl.innerHTML = '<div class="hint">\u26a0\ufe0f Erreur de lecture des demandes : ' + pErr.message + '</div>';
    toast('\u26a0\ufe0f ' + pErr.message, false);
  } else if (!pend || !pend.length) {
    pl.innerHTML = '<div class="hint">Aucune demande en attente \u{1F389}</div>';
  } else {
    pend.forEach((t) => {
      const card = document.createElement('div');
      card.className = 'pending-card';
      card.innerHTML = `
        <div class="p-name">${esc(t.nom)}</div>
        <div class="p-meta">${OWNER_LABELS[t.type] || t.type} · rendement ${t.production ?? '\u2014'} · propos\u00e9 le ${t.cree_le ? new Date(t.cree_le).toLocaleDateString('fr-FR') : '\u2014'}</div>
        <div class="p-actions">
          <button class="mini ok" data-id="${t.id}">\u2705 Valider</button>
          <button class="mini no" data-id="${t.id}">\u{1F5D1} Rejeter</button>
        </div>`;
      card.querySelector('.ok').addEventListener('click', async () => {
        const { error } = await sb.from('arbres').update({ statut: 'valide' }).eq('id', t.id);
        if (error) { toast('\u26a0\ufe0f ' + error.message, false); return; }
        toast(`\u2705 \u00ab ${esc(t.nom)} \u00bb valid\u00e9 \u2014 il appara\u00eet d\u00e9sormais pour tout le monde..`, false);
        loadAdminPanel();
        load();
      });
      card.querySelector('.no').addEventListener('click', async () => {
        const { error } = await sb.from('arbres').delete().eq('id', t.id);
        if (error) { toast('\u26a0\ufe0f ' + error.message, false); return; }
        toast(`\u{1F5D1} Proposition \u00ab ${esc(t.nom)} \u00bb rejet\u00e9e.`);
        loadAdminPanel();
      });
      pl.appendChild(card);
    });
  }
  const at = document.getElementById('arbres-table');
  at.innerHTML = '<div class="hint">\u23f3 Chargement\u2026</div>';
  const { data: every, error: tErr } = await sb.from('arbres').select('id, nom, type, production, espece, statut, jour').order('nom');
  if (tErr) { at.innerHTML = '<div class="hint">\u26a0\ufe0f ' + tErr.message + '</div>'; }
  else if (!every || !every.length) { at.innerHTML = '<div class="hint">Aucun arbre en base.</div>'; }
  else {
    const tbl = document.createElement('table');
    tbl.className = 'admin-tbl';
    tbl.innerHTML = `<thead><tr><th>Nom</th><th>Prop.</th><th>Rdt</th><th>Esp\u00e8ce</th><th>Jour</th><th>Statut</th><th>Actions</th></tr></thead><tbody>` +
      every.map((t) => `<tr data-id="${t.id}">
        <td>${esc(t.nom)}</td>
        <td>${OWNER_LABELS[t.type] || t.type || '\u2014'}</td>
        <td>${t.production == null ? '\u2014' : t.production}</td>
        <td>${esc(t.espece || '\u2014')}</td>
        <td>${t.jour ? dayEmoji(t.jour) + ' Jour ' + t.jour : '\u2014'}</td>
        <td>${t.statut === 'valide' ? '\u2705' : '\u23f3'}</td>
        <td><button type="button" class="mini edit" data-td="toggle">${t.statut === 'valide' ? '\u23f3 D\u00e9valider' : '\u2705 Valider'}</button> <button type="button" class="mini no" data-td="del">\u{0001F5D1}</button></td>
      </tr>`).join('') + '</tbody>';
    at.innerHTML = '';
    at.appendChild(tbl);
    tbl.querySelectorAll('tr[data-id]').forEach((tr) => {
      const id = tr.dataset.id;
      const row = every.find((t) => String(t.id) === id);
      tr.querySelector('[data-td="toggle"]').addEventListener('click', async () => {
        const ns = row.statut === 'valide' ? 'attente' : 'valide';
        const { error } = await sb.from('arbres').update({ statut: ns }).eq('id', id);
        if (error) { toast('\u26a0\ufe0f ' + error.message, false); return; }
        toast(`${ns === 'valide' ? '\u2705' : '\u23f3'} \u00ab ${esc(row.nom)} \u00bb \u2192 ${ns}.`);
        loadAdminPanel();
        load();
      });
      tr.querySelector('[data-td="del"]').addEventListener('click', async () => {
        if (!confirm(`Supprimer \u00ab ${esc(row.nom)} \u00bb ?`)) return;
        const { error } = await sb.from('arbres').delete().eq('id', id);
        if (error) { toast('\u26a0\ufe0f ' + error.message, false); return; }
        toast(`\u{0001F5D1} \u00ab ${esc(row.nom)} \u00bb supprim\u00e9.`);
        loadAdminPanel();
        load();
      });
    });
  }
  const { data: adms, error: aErr } = await sb.from('admins').select('email').order('email');
  if (aErr) {
    al.innerHTML = '<div class="hint">\u26a0\ufe0f Erreur de lecture des admins : ' + aErr.message + '</div>';
  } else if (!adms || !adms.length) {
    al.innerHTML = '<div class="hint">Aucun admin en base (ajoute-toi via SQL le premier).</div>';
  } else {
    adms.forEach((a) => al.appendChild(adminsRow(a.email, a.email !== currentEmail)));
  }
}

function authErr(message) {
  if (/Invalid login/i.test(message)) return 'Identifiants incorrects.';
  if (/not confirmed/i.test(message)) return "Email non confirm\u00e9 : v\u00e9rifie ta bo\u00eete (ou d\u00e9sactive \u00ab Confirm email \u00bb dans Supabase).";
  if (/rate/i.test(message)) return "Trop d'essais \u2014 attends un instant.";
  return message;
}

function pseudoOf(email) {
  return (email || '').split('@')[0];
}

function readLogin() {
  const pseudo = document.getElementById('a-user').value.trim().toLowerCase();
  return {
    email: pseudo + ADMIN_EMAIL_DOMAIN,
    password: document.getElementById('a-pass').value,
  };
}

document.getElementById('btn-admin').addEventListener('click', async () => {
  if (!sb) { toast('\u26a0\ufe0f Supabase indisponible \u2014 recharges la page.', false); return; }
  await refreshAdminState();
  if (isAdminUser) { showStep('admin'); loadAdminPanel(); }
  else { showStep('login'); }
});

document.getElementById('btn-signin').addEventListener('click', async () => {
  const err = document.getElementById('login-err');
  const { error } = await sb.auth.signInWithPassword(readLogin());
  if (error) { err.textContent = authErr(error.message); err.classList.add('visible'); return; }
  err.classList.remove('visible');
  await refreshAdminState();
  showStep('admin');
  loadAdminPanel();
  await load();
});

document.getElementById('a-user').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('a-pass').focus();
});

document.getElementById('a-pass').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-signin').click();
});

document.getElementById('btn-add-admin').addEventListener('click', async () => {
  const raw = document.getElementById('new-admin-pseudo').value.trim().toLowerCase();
  const v = raw + ADMIN_EMAIL_DOMAIN;
  if (!raw) return;
  if (!/^[a-z0-9._-]+$/.test(raw)) { toast('\u26a0\ufe0f Pseudo invalide : lettres, chiffres, point, tiret.', false); return; }
  const { error } = await sb.from('admins').insert({ email: v });
  if (error) { toast('\u26a0\ufe0f ' + error.message, false); return; }
  document.getElementById('new-admin-pseudo').value = '';
  toast(`\u{1F451} ${raw} est maintenant administrateur (compte syst\u00e8me ${v}).`);
  loadAdminPanel();
});

document.getElementById('btn-signout').addEventListener('click', async () => {
  await sb.auth.signOut();
  await refreshAdminState();
  hideModal();
  toast('\u{1F451} D\u00e9connect\u00e9.');
  await load();
});

async function printSheet(day) {
  const trees = allFeatures.map((f) => f.properties || {}).filter((p) => p.id && p.statut === 'valide' && p.jour === day);
  const parts = {};
  if (sb && trees.length) {
    const { data } = await sb.from('participations').select('arbre_id, pseudo, nb_personnes, apporte');
    (data || []).forEach((r) => { (parts[r.arbre_id] = parts[r.arbre_id] || []).push(r); });
  }
  const matLbl = { besoin_echelle: '🪜 échelle', besoin_caisses: '🧺 caisses', besoin_rateau: '🪮 râteau', besoin_bache: '🥅 bâche ou filet' };
  const jd = joursRows.find((x) => x.numero === day);
  const dateTxt = jd && jd.date ? new Date(jd.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const el = document.getElementById('print-sheet');
  el.innerHTML =
    `<h1>🫒 Cueillette collective — Jour ${day}${dateTxt ? ` — ${dateTxt}` : ''}</h1>` +
    (!trees.length ? '<p>Aucun arbre associé à ce jour.</p>'
      : trees.map((p) => {
          const mats = Object.keys(matLbl).filter((k) => p[k]).map((k) => matLbl[k]).join(', ') || '—';
          const vols = (parts[p.id] || []).map((r) => {
            const ap = String(r.apporte || '').split(',').map((t) => APPORT_LABELS[t.trim()] || '').filter(Boolean).join('+');
            return `${esc(r.pseudo)} (${r.nb_personnes || 1}${ap ? ` — ${ap}` : ''})`;
          }).join(', ') || '—';
          return `<section class="ps-tree">
            <h2>${esc(p.nom)} <small>· ${OWNER_LABELS[p.type] || ''}${p.hauteur_m ? ` · ${p.hauteur_m} m` : ''}</small></h2>
            <p><b>Matériel à apporter :</b> ${mats}</p>
            <p><b>Volontaires :</b> ${vols}</p>
            <p class="ps-check">☐ présents    ☐ ramassé  —  notes : ______________________________</p>
          </section>`;
        }).join(''));
  el.style.display = 'block';
  window.print();
  el.style.display = 'none';
}

document.getElementById('btn-save-info').addEventListener('click', async () => {
  if (!isAdminUser) { toast('\u26D4 R\u00e9serv\u00e9 aux administrateurs.', false); return; }
  const v = document.getElementById('event-text').value.trim();
  const now = new Date().toISOString();
  const { error: eInf } = await sb.from('infos').upsert([{ cle: 'rdv', valeur: v, maj_le: now }], { onConflict: 'cle' });
  if (eInf) { toast('\u26A0\uFE0F ' + eInf.message, false); return; }
  document.querySelectorAll('#jours-list [data-jd]').forEach((inp) => {
    const j = joursRows.find((x) => x.numero === Number(inp.dataset.jd));
    if (j) j.date = inp.value || null;
  });

  const ordered = ordonneJours();
  const mapping = new Map();
  ordered.forEach((j, i) => mapping.set(j.numero, i + 1));

  for (const n of joursRemoved) {
    const { error: eU } = await sb.from('arbres').update({ jour: null }).eq('jour', n);
    if (eU) { toast('\u26A0\uFE0F ' + eU.message, false); return; }
    const { error: eJ } = await sb.from('jours').delete().eq('numero', n);
    if (eJ) { toast('\u26A0\uFE0F ' + eJ.message, false); return; }
  }
  joursRemoved = [];

  for (const [oldN, newN] of mapping) {
    if (oldN === newN) continue;
    const { error: e1 } = await sb.from('arbres').update({ jour: -oldN }).eq('jour', oldN);
    if (e1) { toast('\u26A0\uFE0F ' + e1.message, false); return; }
  }
  for (const [oldN, newN] of mapping) {
    if (oldN === newN) continue;
    const { error: e2 } = await sb.from('arbres').update({ jour: newN }).eq('jour', -oldN);
    if (e2) { toast('\u26A0\uFE0F ' + e2.message, false); return; }
  }

  const { data: dbJours, error: eR } = await sb.from('jours').select('numero').order('numero');
  if (eR) { toast('\u26A0\uFE0F ' + eR.message, false); return; }
  const existing = new Set((dbJours || []).map((r) => r.numero));
  for (const n of existing) {
    if (!mapping.has(n)) {
      const { error } = await sb.from('jours').delete().eq('numero', n);
      if (error) { toast('\u26A0\uFE0F ' + error.message, false); return; }
    }
  }
  for (const j of ordered) {
    const { error } = await sb.from('jours').upsert({ numero: mapping.get(j.numero), date: j.date });
    if (error) { toast('\u26A0\uFE0F ' + error.message, false); return; }
  }
  joursRows = ordered.map((j) => ({ numero: mapping.get(j.numero), date: j.date }));

  sessionStorage.removeItem('olivemap_banner_ok');
  renderJoursAdmin();
  fillJourSelect();
  renderJourFilters();
  renderSheetButtons();
  render();
  toast('📢 Annonce et jours enregistr\u00e9s.');
});

document.getElementById('btn-refresh-admin').addEventListener('click', loadAdminPanel);

const bootAdmin = sb ? refreshAdminState() : Promise.resolve();

function openTreeById(id) {
  const hit = markers.find((m) => m.f && m.f.properties && m.f.properties.id === id);
  if (!hit) { toast('\u26a0\ufe0f Arbre introuvable (ou pas encore valid\u00e9).', false); return; }
  const c = hit.f.geometry.coordinates;
  map.panTo([c[1], c[0]], { animate: false });
  hit.marker.openPopup();
}

bootAdmin.finally(() => {
  Promise.all([load(), loadEventBanner(), loadPois()]).then(() => {
    fetchWeather();
    const wantedId = new URLSearchParams(location.search).get('arbre');
    if (wantedId) openTreeById(wantedId);
  });
}).catch(() => {
  toast('⚠️ Impossible de charger <code>arbres.geojson</code>. Vérifie le fichier.', false);
});

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  if (!window.matchMedia('(display-mode: standalone)').matches) {
    document.getElementById('btn-install').style.display = '';
  }
});

document.getElementById('btn-install').addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  if (outcome === 'accepted') toast('📲 Olivemap installé !');
  deferredInstall = null;
  document.getElementById('btn-install').style.display = 'none';
});

window.addEventListener('appinstalled', () => {
  deferredInstall = null;
  document.getElementById('btn-install').style.display = 'none';
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}
