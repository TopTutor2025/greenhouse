// Dashboard User — async Supabase version

let currentUser    = null;
let currentPropId  = null;
let currentFilter  = 'tutti';
let editingPropId  = null;
let confirmCb      = null;

// ── INIT ──────────────────────────────────────────────
(async function init() {
  const auth = await Auth.requireAuth('user');
  if (!auth) return;

  // Supabase non restituisce email nel profilo: la prendiamo dalla session
  currentUser = auth.profile;
  currentUser.email = auth.session?.user?.email ?? currentUser.email;

  renderUserInfo();
  await renderHome();
  setupUploadArea();
  setupProfileForm();

  window.addEventListener('click', e => {
    const menu   = document.getElementById('user-menu');
    const avatar = document.getElementById('user-avatar');
    if (menu && avatar && !menu.contains(e.target) && !avatar.contains(e.target))
      menu.classList.remove('open');
  });
})();

function renderUserInfo() {
  const initial = (currentUser.companyName || currentUser.nome || '?')[0].toUpperCase();
  document.getElementById('user-avatar').textContent    = initial;
  document.getElementById('menu-company').textContent   = currentUser.companyName || '—';
  document.getElementById('menu-email').textContent     = currentUser.email || '—';
}

// ── NAVIGATION ────────────────────────────────────────
async function showPage(page) {
  if (window.innerWidth <= 900) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
  }
  document.querySelectorAll('.dash-page-view').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.dash-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  const titles = { home: 'Dashboard', sedi: 'Le mie Sedi', piano: 'Piano', profilo: 'Profilo' };
  document.getElementById('page-title').textContent = titles[page] || 'Dashboard';
  document.getElementById('user-menu').classList.remove('open');
  if (page === 'home')    await renderHome();
  if (page === 'sedi')    await renderSedi();
  if (page === 'piano')   await renderPiano();
  if (page === 'profilo') renderProfilo();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('active');
}
function toggleUserMenu() { document.getElementById('user-menu').classList.toggle('open'); }
async function doLogout() { await Auth.logout(); window.location.href = 'login.html'; }
function assistenza()     { openModal('modal-assistenza'); }

// ── HOME ──────────────────────────────────────────────
async function renderHome() {
  // Refresh user data
  const fresh = await DB.getUserById(currentUser.id);
  if (fresh) { currentUser = { ...fresh, email: currentUser.email }; }

  const props   = await DB.getPropertiesByUser(currentUser.id);
  const allRecs = (await Promise.all(props.map(p => DB.getRecordsByProperty(p.id)))).flat();
  const futuri  = allRecs.filter(r => r.status === 'futuro');
  const completati = allRecs.filter(r => r.status === 'completato');

  // Stats
  document.getElementById('stats-row').innerHTML = `
    <div class="stat-card" id="stat-sedi"><div class="stat-icon">🏢</div><div class="stat-label">Sedi registrate</div><div class="stat-value">${props.length}</div><div class="stat-sub">proprietà</div></div>
    <div class="stat-card" id="stat-interventi"><div class="stat-icon">📋</div><div class="stat-label">Interventi totali</div><div class="stat-value">${allRecs.length}</div><div class="stat-sub">registrati</div></div>
    <div class="stat-card" id="stat-futuri"><div class="stat-icon">🔮</div><div class="stat-label">Interventi futuri</div><div class="stat-value">${futuri.length}</div><div class="stat-sub">pianificati</div></div>
    <div class="stat-card" id="stat-completati"><div class="stat-icon">✅</div><div class="stat-label">Completati</div><div class="stat-value">${completati.length}</div><div class="stat-sub">interventi</div></div>`;

  // Plan banner
  const planCfg = {
    attivo:   { cls: 'plan-banner-attivo',   icon: '✅', title: 'Piano Attivo',     msg: 'Il tuo piano di cura e manutenzione è attivo.' },
    inattivo: { cls: 'plan-banner-inattivo', icon: '⏸️', title: 'Piano Non Attivo', msg: 'Il piano non è ancora attivo. Contatta Greenhouse.' },
    scaduto:  { cls: 'plan-banner-scaduto',  icon: '⚠️', title: 'Piano Scaduto',    msg: 'Il piano è scaduto. Rinnova per continuare il servizio.' }
  };
  const pc = planCfg[currentUser.planStatus] || planCfg.inattivo;
  document.getElementById('plan-banner-wrap').innerHTML = `
    <div class="plan-banner ${pc.cls}" id="plan-banner">
      <div class="plan-banner-info">
        <div class="plan-banner-icon">${pc.icon}</div>
        <div><h3>${pc.title}</h3><p>${pc.msg}</p></div>
      </div>
      <button class="btn btn-sm btn-outline" onclick="showPage('piano')">Dettagli</button>
    </div>`;

  // Recent sedi
  const sediHtml = props.length === 0
    ? `<div class="empty-state"><div class="empty-icon">🏢</div><h3>Nessuna sede</h3><p>Aggiungi la tua prima sede.</p><button class="btn btn-primary btn-sm" onclick="showPage('sedi')">Aggiungi Sede</button></div>`
    : props.slice(0, 3).map(p => `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--g100);cursor:pointer" onclick="openProperty('${p.id}')">
          <div style="width:38px;height:38px;background:var(--primary-pale);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🏢</div>
          <div><div style="font-size:14px;font-weight:600">${escHtml(p.address)}</div><div style="font-size:12px;color:var(--g500)">${escHtml(p.city)}, ${escHtml(p.province)}</div></div>
          <span style="margin-left:auto;font-size:12px;color:var(--g400)">›</span>
        </div>`).join('');
  document.getElementById('home-sedi-list').innerHTML = sediHtml;

  // Upcoming
  const upHtml = futuri.length === 0
    ? `<div class="empty-state"><div class="empty-icon">📅</div><h3>Nessun intervento futuro</h3><p>Gli interventi pianificati appariranno qui.</p></div>`
    : await (async () => {
        const propMap = Object.fromEntries(props.map(p => [p.id, p]));
        return futuri.slice(0, 5).map(r => `
          <div style="padding:10px 0;border-bottom:1px solid var(--g100)">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <div style="font-size:14px;font-weight:600">${escHtml(r.workType)}</div>
              ${recordStatusBadge(r.status)}
            </div>
            <div style="font-size:12px;color:var(--g500);margin-top:3px">${formatDate(r.date)} — ${propMap[r.propertyId] ? escHtml(propMap[r.propertyId].address) : '—'}</div>
          </div>`).join('');
      })();
  document.getElementById('home-records-list').innerHTML = upHtml;
}

// ── SEDI ──────────────────────────────────────────────
async function renderSedi() {
  const props = await DB.getPropertiesByUser(currentUser.id);
  const recCounts = await Promise.all(props.map(async p => {
    const recs = await DB.getRecordsByProperty(p.id);
    const docs = await DB.getDocumentsByProperty(p.id);
    return { id: p.id, recs, docs };
  }));
  const dataMap = Object.fromEntries(recCounts.map(d => [d.id, d]));

  let html = props.map(p => {
    const d = dataMap[p.id] || { recs: [], docs: [] };
    return `
      <div class="property-card" onclick="openProperty('${p.id}')">
        <div class="property-card-header">
          <h3>${escHtml(p.address)}</h3>
          <p>${escHtml(p.city)}, ${escHtml(p.province)}</p>
        </div>
        <div class="property-card-body">
          <div class="property-meta">
            <div class="property-meta-item">📁 <span>${d.docs.length} doc</span></div>
            <div class="property-meta-item">📋 <span>${d.recs.length} interventi</span></div>
            <div class="property-meta-item">🔮 <span>${d.recs.filter(r=>r.status==='futuro').length} futuri</span></div>
          </div>
        </div>
        <div class="property-card-footer" onclick="event.stopPropagation()">
          <button class="btn btn-sm btn-outline" onclick="openProperty('${p.id}')">Apri</button>
          <button class="btn btn-sm btn-ghost" onclick="openEditPropById('${p.id}')">✏️</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="confirmDeleteProp('${p.id}')">🗑</button>
        </div>
      </div>`;
  }).join('');
  html += `<div class="add-property-card" onclick="openAddProp()" id="add-prop-card">
    <div class="add-icon">+</div><span>Aggiungi Sede</span></div>`;
  document.getElementById('sedi-grid').innerHTML = html;
}

async function openProperty(propId) {
  currentPropId = propId;
  const prop = await DB.getPropertyById(propId);
  if (!prop) return;
  document.getElementById('prop-title').textContent    = prop.address;
  document.getElementById('prop-subtitle').textContent = `${prop.city} (${prop.province})`;
  document.getElementById('page-title').textContent    = 'Dettaglio Sede';
  document.querySelectorAll('.dash-page-view').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.dash-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-property').classList.add('active');
  switchTab('documenti');
  await renderDocuments();
  await renderRecords('tutti');
}

// ── PROPERTY FORMS ────────────────────────────────────
function openAddProp() {
  editingPropId = null;
  document.getElementById('modal-sede-title').textContent  = 'Aggiungi Sede';
  document.getElementById('sede-submit-btn').textContent   = 'Aggiungi Sede';
  ['sede-address','sede-city','sede-province'].forEach(id => document.getElementById(id).value = '');
  openModal('modal-sede');
}

function openEditPropById(id) {
  DB.getPropertyById(id).then(prop => {
    if (!prop) return;
    editingPropId = id;
    document.getElementById('modal-sede-title').textContent = 'Modifica Sede';
    document.getElementById('sede-submit-btn').textContent  = 'Salva modifiche';
    document.getElementById('sede-address').value  = prop.address;
    document.getElementById('sede-city').value     = prop.city;
    document.getElementById('sede-province').value = prop.province;
    openModal('modal-sede');
  });
}
function openEditProperty() { if (currentPropId) openEditPropById(currentPropId); }

document.getElementById('form-sede').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('sede-submit-btn');
  try {
    if (btn) btn.disabled = true;
    if (!currentUser) throw new Error('Sessione scaduta, ricarica la pagina');
    const data = {
      userId:   currentUser.id,
      address:  document.getElementById('sede-address').value.trim(),
      city:     document.getElementById('sede-city').value.trim(),
      province: document.getElementById('sede-province').value.trim().toUpperCase()
    };
    if (editingPropId) {
      await DB.updateProperty(editingPropId, data);
      showToast('Sede aggiornata', 'success');
      if (currentPropId === editingPropId) {
        document.getElementById('prop-title').textContent    = data.address;
        document.getElementById('prop-subtitle').textContent = `${data.city} (${data.province})`;
      }
    } else {
      await DB.createProperty(data);
      showToast('Sede aggiunta', 'success');
    }
    closeModal('modal-sede');
    await renderSedi();
  } catch (err) {
    showToast(err.message || 'Errore durante il salvataggio', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
});

function confirmDeleteProp(id) {
  DB.getPropertyById(id).then(prop => {
    if (!prop) return;
    showConfirm('Elimina sede', `Vuoi eliminare "${prop.address}"? Documenti e interventi associati saranno eliminati.`, async () => {
      try {
        // Delete docs from storage first
        const docs = await DB.getDocumentsByProperty(id);
        await Promise.all(docs.map(d => DB.deleteDocument(d.id, d.file_path)));
        await DB.deleteProperty(id);
        showToast('Sede eliminata', 'success');
        if (currentPropId === id) showPage('sedi'); else await renderSedi();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
}
function confirmDeleteProperty() { if (currentPropId) confirmDeleteProp(currentPropId); }

// ── DOCUMENTS ─────────────────────────────────────────
function setupUploadArea() {
  const area  = document.getElementById('upload-area');
  const input = document.getElementById('file-input');
  if (!area) return;
  area.addEventListener('click', () => input.click());
  area.addEventListener('dragover',  e => { e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave', ()  => area.classList.remove('drag-over'));
  area.addEventListener('drop', e => { e.preventDefault(); area.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });
  input.addEventListener('change', () => handleFiles(input.files));
}

async function handleFiles(files) {
  if (!currentPropId) return;
  const toUpload = Array.from(files).filter(f => {
    if (f.size > 10 * 1024 * 1024) { showToast(`${f.name}: max 10MB`, 'error'); return false; }
    return true;
  });
  if (!toUpload.length) return;
  const area = document.getElementById('upload-area');
  area.style.pointerEvents = 'none'; area.style.opacity = '.6';
  try {
    for (const file of toUpload) {
      await DB.uploadDocument(file, currentPropId, currentUser.id);
      showToast(`${file.name} caricato`, 'success');
    }
  } catch (err) {
    showToast('Errore upload: ' + err.message, 'error');
  } finally {
    area.style.pointerEvents = ''; area.style.opacity = '';
    document.getElementById('file-input').value = '';
    await renderDocuments();
  }
}

async function renderDocuments() {
  const grid = document.getElementById('docs-grid');
  showLoading(grid);
  const docs = await DB.getDocumentsByProperty(currentPropId);
  if (docs.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--g400);font-size:14px">Nessun documento caricato</div>`;
    return;
  }
  // Build cards with signed URLs for images
  const cards = await Promise.all(docs.map(async doc => {
    const isImg = (doc.file_type || '').startsWith('image/');
    let thumb = '';
    if (isImg) {
      const url = await DB.getDocumentUrl(doc.file_path);
      thumb = url ? `<img src="${url}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:6px" onerror="this.style.display='none'">` : `<div class="doc-icon">🖼️</div>`;
    } else {
      thumb = `<div class="doc-icon">📄</div>`;
    }
    const sizeKb = Math.round((doc.file_size || 0) / 1024);
    return `<div class="doc-card" onclick="previewDoc('${doc.id}','${doc.file_path}','${escHtml(doc.name)}','${doc.file_type||''}')">
      ${thumb}
      <div class="doc-name">${escHtml(doc.name)}</div>
      <div class="doc-size">${sizeKb} KB</div>
      <button class="doc-delete" onclick="event.stopPropagation();deleteDoc('${doc.id}','${doc.file_path}')">✕</button>
    </div>`;
  }));
  grid.innerHTML = cards.join('');
}

async function previewDoc(docId, filePath, name, fileType) {
  document.getElementById('doc-modal-title').textContent = decodeURIComponent(name);
  const url = await DB.getDocumentUrl(filePath);
  const isImg = fileType.startsWith('image/');
  document.getElementById('doc-preview-content').innerHTML = url
    ? (isImg
        ? `<img src="${url}" style="max-width:100%;max-height:70vh;border-radius:var(--r)">`
        : `<div style="padding:30px"><div style="font-size:60px;margin-bottom:14px">📄</div><p style="font-size:16px;font-weight:600">${escHtml(name)}</p><a href="${url}" target="_blank" class="btn btn-primary mt-4" style="display:inline-flex">⬇ Apri / Scarica</a></div>`)
    : `<p class="text-muted" style="padding:30px">Impossibile caricare l'anteprima.</p>`;
  openModal('modal-doc');
}

async function deleteDoc(docId, filePath) {
  try {
    await DB.deleteDocument(docId, filePath);
    showToast('Documento eliminato', 'success');
    await renderDocuments();
  } catch (err) { showToast(err.message, 'error'); }
}

// ── RECORDS ──────────────────────────────────────────
async function renderRecords(filter) {
  currentFilter = filter;
  const allRecs = await DB.getRecordsByProperty(currentPropId);
  const filtered = filter === 'tutti' ? allRecs : allRecs.filter(r => r.status === filter);
  const tbody = document.getElementById('records-tbody');
  const empty = document.getElementById('records-empty');
  const table = document.getElementById('records-table');

  if (filtered.length === 0) {
    tbody.innerHTML = ''; table.style.display = 'none'; empty.classList.remove('hidden');
  } else {
    table.style.display = ''; empty.classList.add('hidden');
    tbody.innerHTML = filtered.map(r => `
      <tr>
        <td>${formatDate(r.date)}</td>
        <td><span class="badge ${r.maintenanceType === 'ordinaria' ? 'badge-info' : 'badge-warning'}">${r.maintenanceType === 'ordinaria' ? 'Ordinaria' : 'Straordinaria'}</span></td>
        <td>${escHtml(r.workType)}</td>
        <td>${recordStatusBadge(r.status)}</td>
        <td><button class="btn btn-sm btn-ghost action-btn" onclick="viewRecord('${r.id}')">Dettagli</button></td>
      </tr>`).join('');
  }
}

async function filterRecords(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  await renderRecords(filter);
}

async function viewRecord(recId) {
  const recs = await DB.getRecordsByProperty(currentPropId);
  const rec  = recs.find(r => r.id === recId);
  if (!rec) return;
  document.getElementById('modal-record-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div><div class="form-label">Data intervento</div><div style="font-size:15px;font-weight:600">${formatDate(rec.date)}</div></div>
      <div><div class="form-label">Stato</div>${recordStatusBadge(rec.status)}</div>
      <div><div class="form-label">Tipo manutenzione</div><span class="badge ${rec.maintenanceType==='ordinaria'?'badge-info':'badge-warning'}">${rec.maintenanceType==='ordinaria'?'Manutenzione Ordinaria':'Manutenzione Straordinaria'}</span></div>
      <div><div class="form-label">Tipo di lavoro</div><div style="font-size:15px;font-weight:600">${escHtml(rec.workType)}</div></div>
    </div>
    ${rec.notes ? `<div style="margin-top:16px"><div class="form-label">Note</div><div style="font-size:14px;color:var(--g600);background:var(--g50);padding:12px;border-radius:var(--r-sm)">${escHtml(rec.notes)}</div></div>` : ''}
    <div style="margin-top:20px;font-size:12px;color:var(--g400)">Registrato il ${formatDate(rec.createdAt)}</div>`;
  openModal('modal-record');
}

function switchTab(tabName) {
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabName));
  if (tabName === 'interventi') renderRecords(currentFilter);
}

// ── PIANO ─────────────────────────────────────────────
async function renderPiano() {
  const fresh = await DB.getUserById(currentUser.id);
  if (fresh) currentUser = { ...fresh, email: currentUser.email };
  const status = currentUser.planStatus;
  const cfg = {
    attivo:   { color:'var(--success)', bg:'#d1fae5', icon:'✅', title:'Piano Attivo',     desc:'Il tuo piano di manutenzione è attivo. Ricevi regolarmente gli interventi pianificati.' },
    inattivo: { color:'var(--g500)',    bg:'var(--g100)', icon:'⏸️', title:'Piano Non Attivo', desc:'Il piano non è ancora attivo. Contatta Greenhouse per attivarlo.' },
    scaduto:  { color:'var(--danger)',  bg:'#fee2e2', icon:'⚠️', title:'Piano Scaduto',     desc:'Il piano è scaduto. Contatta Greenhouse per rinnovarlo.' }
  };
  const c = cfg[status] || cfg.inattivo;
  const props   = await DB.getPropertiesByUser(currentUser.id);
  const allRecs = (await Promise.all(props.map(p => DB.getRecordsByProperty(p.id)))).flat();

  document.getElementById('piano-content').innerHTML = `
    <div style="background:${c.bg};border-radius:var(--r-lg);padding:32px;text-align:center;margin-bottom:28px" id="piano-status-card">
      <div style="font-size:56px;margin-bottom:14px">${c.icon}</div>
      <h2 style="font-size:24px;font-weight:800;color:${c.color};margin-bottom:10px">${c.title}</h2>
      <p style="color:var(--g600);max-width:460px;margin:0 auto 22px">${c.desc}</p>
      <button class="btn btn-primary" onclick="assistenza()">Contatta Greenhouse</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:28px">
      <div class="stat-card"><div class="stat-icon">🏢</div><div class="stat-label">Sedi monitorate</div><div class="stat-value">${props.length}</div></div>
      <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-label">Interventi totali</div><div class="stat-value">${allRecs.length}</div></div>
      <div class="stat-card"><div class="stat-icon">🔮</div><div class="stat-label">Futuri</div><div class="stat-value">${allRecs.filter(r=>r.status==='futuro').length}</div></div>
      <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-label">Completati</div><div class="stat-value">${allRecs.filter(r=>r.status==='completato').length}</div></div>
    </div>
    <div class="card" id="piano-info-card">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:16px">Cosa include il tuo piano</h3>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${['Interventi di manutenzione ordinaria programmati','Accesso alla piattaforma digitale Greenhouse','Tracciamento completo degli interventi','Gestione documentazione per sede','Assistenza 7/7 chat e telefonica'].map(item => `
          <div style="display:flex;align-items:center;gap:10px;font-size:14px"><span style="color:${c.color};font-size:16px">✓</span><span>${item}</span></div>`).join('')}
      </div>
    </div>`;
}

// ── PROFILO ───────────────────────────────────────────
function renderProfilo() {
  const initial    = (currentUser.companyName || currentUser.nome || '?')[0].toUpperCase();
  const typeLabel  = currentUser.type === 'azienda' ? 'Azienda' : 'Organizzazione';
  document.getElementById('profile-header-wrap').innerHTML = `
    <div class="profile-avatar-lg">${initial}</div>
    <div>
      <div style="font-size:18px;font-weight:800">${escHtml(currentUser.companyName || '—')}</div>
      <div style="font-size:14px;color:var(--g500);margin-top:4px">${typeLabel} · ${escHtml(currentUser.email)}</div>
      <div style="margin-top:8px">${planBadge(currentUser.planStatus)}</div>
    </div>`;
  document.getElementById('p-nome').value    = currentUser.nome    || '';
  document.getElementById('p-cognome').value = currentUser.cognome || '';
  document.getElementById('p-company').value = currentUser.companyName || '';
  document.getElementById('p-email').value   = currentUser.email   || '';
  document.getElementById('p-phone').value   = currentUser.phone   || '';
  document.getElementById('p-company-label').textContent = currentUser.type === 'azienda' ? 'Ragione sociale' : 'Nome organizzazione';
}

function setupProfileForm() {
  document.getElementById('profile-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = this.querySelector('[type=submit]');
    try {
      if (btn) btn.disabled = true;
      const updated = await DB.updateUser(currentUser.id, {
        nome:        document.getElementById('p-nome').value.trim(),
        cognome:     document.getElementById('p-cognome').value.trim(),
        companyName: document.getElementById('p-company').value.trim(),
        phone:       document.getElementById('p-phone').value.trim()
      });
      currentUser = { ...updated, email: currentUser.email };
      renderUserInfo();
      showToast('Profilo aggiornato', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally { btn.disabled = false; }
  });
}

// ── MODALS ────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('active'); });
});

// ── CONFIRM ───────────────────────────────────────────
function showConfirm(title, msg, onOk) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent   = msg;
  confirmCb = onOk;
  document.getElementById('confirm-overlay').classList.add('active');
}
function closeConfirm() { document.getElementById('confirm-overlay').classList.remove('active'); confirmCb = null; }
document.getElementById('confirm-ok-btn').addEventListener('click', () => { if (confirmCb) confirmCb(); closeConfirm(); });
document.getElementById('confirm-overlay').addEventListener('click', e => { if (e.target === document.getElementById('confirm-overlay')) closeConfirm(); });

// ── TUTORIAL ──────────────────────────────────────────
const tutorialSteps = [
  { target: '#stat-sedi',        title: 'Le tue Sedi',            content: 'Numero di sedi/proprietà registrate nel sistema.' },
  { target: '#stat-futuri',      title: 'Interventi Futuri',       content: 'Interventi pianificati dal team Greenhouse per le tue proprietà.' },
  { target: '#plan-banner',      title: 'Piano di Manutenzione',   content: 'Stato del tuo piano: Attivo, Non Attivo o Scaduto. Clicca "Dettagli" per approfondire.' },
  { target: '#recent-sedi-card', title: 'Le mie Sedi',             content: 'Accedi rapidamente alle tue sedi. Clicca per vedere documenti e interventi.' },
  { target: '#upcoming-card',    title: 'Prossimi Interventi',     content: 'Visualizza i prossimi interventi pianificati su tutte le proprietà.' },
  { target: '#nav-sedi',         title: 'Gestione Sedi',           content: 'Aggiungi, modifica ed elimina le tue proprietà.' },
  { target: '#nav-piano',        title: 'Piano di Manutenzione',   content: 'Dettagli del contratto e stato del piano di cura.' },
  { target: '#nav-profilo',      title: 'Profilo',                 content: 'Modifica i tuoi dati aziendali, email e telefono.' },
];

async function startTutorial() {
  if (!document.getElementById('page-home').classList.contains('active')) await showPage('home');
  setTimeout(() => new Tutorial(tutorialSteps).start(), 150);
}
