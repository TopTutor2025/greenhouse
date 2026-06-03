// Admin Dashboard — async Supabase version

let currentAdminUserId = null;
let adminUserType      = 'azienda';
let editingUserId      = null;
let editingAdminSedeId = null;
let editingRecordId    = null;
let adminRecordFilter  = 'tutti';
let _quotesMap         = {};
let confirmCb          = null;
let _editingPreventivoId = null;
let _preventivoVoci      = [];
let _listinoCache        = [];
let _allPreventivi       = [];
let _editingListinoId    = null;
let _allFatture = [], _editingFatturaId = null;
let _allAdminDocs = [], _editingDocId = null;

// ── INIT ──────────────────────────────────────────────
(async function init() {
  const auth = await Auth.requireAuth('admin');
  if (!auth) return;
  await renderAdminDashboard();
})();

// ── SECTIONS ──────────────────────────────────────────
async function showSection(sec) {
  if (window.innerWidth <= 900) closeAdminSidebar();
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('sec-' + sec)?.classList.add('active');
  document.querySelector(`[data-sec="${sec}"]`)?.classList.add('active');
  if (sec === 'dashboard') await renderAdminDashboard();
  if (sec === 'users')     { backToUsers(); await renderUsersList(); }
  if (sec === 'quotes')    await renderQuotes();
  if (sec === 'suppliers')       await renderSuppliers();
  if (sec === 'collaboratori')   await renderCollaboratori();
  if (sec === 'preventivatore')  await renderPreventivi();
  if (sec === 'contabilita')     await renderContabilita();
  if (sec === 'fatturazione')    await renderFatture();
  if (sec === 'documentazione')  await renderDocs();
  if (sec === 'calendario')      initCalendario();
}

async function doAdminLogout() { await Auth.logout(); window.location.href = 'login.html'; }

function toggleAdminSidebar() {
  document.getElementById('admin-sidebar').classList.toggle('open');
  document.getElementById('admin-sidebar-overlay').classList.toggle('active');
  document.getElementById('admin-hamburger').classList.toggle('open');
}
function closeAdminSidebar() {
  document.getElementById('admin-sidebar').classList.remove('open');
  document.getElementById('admin-sidebar-overlay').classList.remove('active');
  document.getElementById('admin-hamburger').classList.remove('open');
}

// ── ADMIN DASHBOARD ────────────────────────────────────
async function renderAdminDashboard() {
  const users  = await DB.getUsers();
  const props  = await DB.getAllProperties();
  const recs   = await DB.getAllRecords();
  const quotes = await DB.getQuotes();
  const attivi   = users.filter(u => u.planStatus === 'attivo').length;
  const aziende  = users.filter(u => u.type === 'azienda').length;
  const orgs     = users.filter(u => u.type === 'organizzazione').length;
  const scaduti  = users.filter(u => u.planStatus === 'scaduto').length;
  const inattivi = users.filter(u => u.planStatus === 'inattivo').length;
  const inAttesa = quotes.filter(q => q.status === 'in_attesa').length;

  updateQuoteNavBadge(inAttesa);

  document.getElementById('admin-stats-row').innerHTML = `
    <div class="admin-stat" id="stat-totali"><div class="s-icon">👥</div><div class="s-val">${users.length}</div><div class="s-label">Utenti totali</div></div>
    <div class="admin-stat" id="stat-aziende"><div class="s-icon">🏢</div><div class="s-val">${aziende}</div><div class="s-label">Aziende</div></div>
    <div class="admin-stat" id="stat-org"><div class="s-icon">🏛️</div><div class="s-val">${orgs}</div><div class="s-label">Organizzazioni</div></div>
    <div class="admin-stat" id="stat-piani"><div class="s-icon">✅</div><div class="s-val">${attivi}</div><div class="s-label">Piani attivi</div></div>
    <div class="admin-stat" id="stat-sedi-tot"><div class="s-icon">🏠</div><div class="s-val">${props.length}</div><div class="s-label">Sedi totali</div></div>
    <div class="admin-stat" id="stat-preventivi" style="cursor:pointer" onclick="showSection('quotes')"><div class="s-icon">📋</div><div class="s-val">${inAttesa}</div><div class="s-label">Preventivi in attesa</div></div>`;

  // Upcoming records
  const upcoming = recs
    .filter(r => r.status === 'futuro')
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const propMap = Object.fromEntries(props.map(p => [p.id, p]));
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  document.getElementById('upcoming-records-list').innerHTML = upcoming.length === 0
    ? `<p class="text-muted text-sm">Nessun intervento futuro programmato.</p>`
    : `<div style="overflow-x:auto">
        <table class="users-table">
          <thead><tr>
            <th>Data</th>
            <th>Cliente</th>
            <th>Sede</th>
            <th>Lavoro</th>
            <th>Tipo</th>
          </tr></thead>
          <tbody>
            ${upcoming.map(r => {
              const prop = propMap[r.propertyId];
              const user = userMap[r.userId];
              return `<tr>
                <td style="white-space:nowrap;font-weight:600">${formatDate(r.date)}</td>
                <td style="font-size:13.5px">${escHtml(user?.companyName || '—')}</td>
                <td style="font-size:13px;color:var(--g600)">${escHtml(prop ? prop.address + ', ' + prop.city : '—')}</td>
                <td style="font-size:13px">${escHtml(r.workType)}</td>
                <td><span class="badge ${r.maintenanceType === 'ordinaria' ? 'badge-info' : 'badge-warning'}">${r.maintenanceType}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

  // Recent users
  const recent = [...users].slice(0, 5);
  document.getElementById('recent-users-list').innerHTML = recent.length === 0
    ? `<p class="text-muted text-sm">Nessun utente registrato</p>`
    : recent.map(u => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--g100);cursor:pointer" onclick="openUserProfile('${u.id}')">
          <div style="width:34px;height:34px;background:var(--primary);border-radius:50%;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${(u.companyName||u.nome||'?')[0].toUpperCase()}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(u.companyName||'—')}</div>
            <div style="font-size:11.5px;color:var(--g400)">${u.type==='azienda'?'🏢':'🏛️'} ${u.type}</div>
          </div>
          ${planBadge(u.planStatus)}
        </div>`).join('');

  // Plans summary
  document.getElementById('plans-summary').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--g50);border-radius:var(--r-sm)">
        <div style="display:flex;align-items:center;gap:8px"><span>✅</span><span style="font-size:14px;font-weight:600">Attivi</span></div>
        <span class="badge badge-success">${attivi}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--g50);border-radius:var(--r-sm)">
        <div style="display:flex;align-items:center;gap:8px"><span>⏸️</span><span style="font-size:14px;font-weight:600">Non attivi</span></div>
        <span class="badge badge-gray">${inattivi}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--g50);border-radius:var(--r-sm)">
        <div style="display:flex;align-items:center;gap:8px"><span>⚠️</span><span style="font-size:14px;font-weight:600">Scaduti</span></div>
        <span class="badge badge-danger">${scaduti}</span>
      </div>
    </div>`;
}

// ── USERS LIST ─────────────────────────────────────────
async function renderUsersList() {
  const users  = await DB.getUsers();
  const search = document.getElementById('user-search')?.value.toLowerCase() || '';
  const typeF  = document.getElementById('type-filter')?.value || '';
  const planF  = document.getElementById('plan-filter')?.value || '';

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      (u.companyName||'').toLowerCase().includes(search) ||
      ((u.nome||'')+' '+(u.cognome||'')).toLowerCase().includes(search);
    return matchSearch && (!typeF || u.type === typeF) && (!planF || u.planStatus === planF);
  });

  const tbody = document.getElementById('users-tbody');
  const empty = document.getElementById('users-empty');
  const table = document.getElementById('users-table');
  const cards = document.getElementById('users-cards');

  if (filtered.length === 0) {
    tbody.innerHTML = ''; cards.innerHTML = ''; table.style.display = 'none'; empty.classList.remove('hidden'); return;
  }
  table.style.display = ''; empty.classList.add('hidden');

  // Fetch property counts for all users
  const propCounts = await Promise.all(filtered.map(u => DB.getPropertiesByUser(u.id)));

  tbody.innerHTML = filtered.map((u, i) => `
    <tr class="row-link" onclick="openUserProfile('${u.id}')">
      <td>
        <div class="user-row-name">${escHtml(u.companyName||'—')}</div>
        <div class="user-row-email">${escHtml(u.nome||'')} ${escHtml(u.cognome||'')} · <span id="email-${u.id}">—</span></div>
      </td>
      <td><span class="user-type-badge type-${u.type}">${u.type==='azienda'?'🏢 Azienda':'🏛️ Organizzazione'}</span></td>
      <td style="font-size:13.5px">${escHtml(u.phone||'—')}</td>
      <td>${planBadge(u.planStatus)}</td>
      <td style="font-size:14px;font-weight:600">${propCounts[i].length}</td>
      <td style="font-size:13px;color:var(--g500)">${formatDate(u.createdAt)}</td>
      <td onclick="event.stopPropagation()">
        <div class="table-actions">
          <button class="btn btn-sm btn-outline" onclick="openEditUser('${u.id}')">✏️</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="confirmDeleteUser('${u.id}')">🗑</button>
        </div>
      </td>
    </tr>`).join('');

  // Mobile cards
  cards.innerHTML = filtered.map((u, i) => `
    <div class="rec-card">
      <div class="rec-card-head" onclick="openUserProfile('${u.id}')" style="cursor:pointer">
        <span class="rec-card-address">${u.type==='azienda'?'🏢':'🏛️'} ${escHtml(u.companyName||'—')}</span>
        ${planBadge(u.planStatus)}
      </div>
      <div class="rec-card-info">
        <div class="rec-card-row">
          <span class="rec-card-label">Tipo</span>
          <span class="user-type-badge type-${u.type}" style="font-size:12px">${u.type==='azienda'?'Azienda':'Organizzazione'}</span>
        </div>
        <div class="rec-card-row">
          <span class="rec-card-label">Referente</span>
          <span class="rec-card-value">${escHtml((u.nome||'') + ' ' + (u.cognome||'')).trim() || '—'}</span>
        </div>
        <div class="rec-card-row">
          <span class="rec-card-label">Telefono</span>
          <span class="rec-card-value">${escHtml(u.phone||'—')}</span>
        </div>
        <div class="rec-card-row">
          <span class="rec-card-label">Sedi</span>
          <span class="rec-card-value">${propCounts[i].length}</span>
        </div>
        <div class="rec-card-row">
          <span class="rec-card-label">Registrato</span>
          <span class="rec-card-value">${formatDate(u.createdAt)}</span>
        </div>
      </div>
      <div class="rec-card-foot">
        <div class="rec-card-btns">
          <button class="btn btn-sm btn-outline rec-card-btn" onclick="openUserProfile('${u.id}')">👤 Profilo</button>
          <button class="btn btn-sm btn-ghost rec-card-btn" style="color:var(--danger)" onclick="confirmDeleteUser('${u.id}')">🗑 Elimina</button>
        </div>
      </div>
    </div>`).join('');

  filtered.forEach(u => {
    const el = document.getElementById('email-' + u.id);
    if (el) el.textContent = u.email || '—';
  });
}

async function filterUsers() { await renderUsersList(); }

// ── ADD / EDIT USER ────────────────────────────────────
function adminSelectType(type) {
  adminUserType = type;
  document.querySelectorAll('#admin-type-tabs .auth-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
  document.getElementById('u-company-label').textContent = type === 'azienda' ? 'Ragione sociale *' : 'Nome organizzazione *';
}

function openAddUser() {
  editingUserId = null; adminUserType = 'azienda';
  document.getElementById('modal-user-title').textContent = 'Aggiungi Utente';
  document.getElementById('user-submit-btn').textContent  = 'Aggiungi Utente';
  document.getElementById('u-pwd-hint').textContent       = 'Minimo 8 caratteri';
  document.getElementById('u-password').required = true;
  adminSelectType('azienda');
  ['u-nome','u-cognome','u-company','u-email','u-phone','u-password'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('u-plan').value = 'inattivo';
  openModal('modal-user');
}

async function openEditUser(userId) {
  const user = await DB.getUserById(userId);
  if (!user) return;
  editingUserId = userId; adminUserType = user.type;
  document.getElementById('modal-user-title').textContent = 'Modifica Utente';
  document.getElementById('user-submit-btn').textContent  = 'Salva modifiche';
  document.getElementById('u-pwd-hint').textContent       = 'Lascia vuoto per non cambiare la password';
  document.getElementById('u-password').required = false;
  adminSelectType(user.type);
  document.getElementById('u-nome').value    = user.nome    || '';
  document.getElementById('u-cognome').value = user.cognome || '';
  document.getElementById('u-company').value = user.companyName || '';
  document.getElementById('u-email').value   = user.email   || '';
  document.getElementById('u-phone').value   = user.phone   || '';
  document.getElementById('u-password').value = '';
  document.getElementById('u-plan').value    = user.planStatus || 'inattivo';
  openModal('modal-user');
}

document.getElementById('form-user').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('user-submit-btn'); btn.disabled = true;
  const pwd = document.getElementById('u-password').value;
  const data = {
    type:        adminUserType,
    nome:        document.getElementById('u-nome').value.trim(),
    cognome:     document.getElementById('u-cognome').value.trim(),
    companyName: document.getElementById('u-company').value.trim(),
    email:       document.getElementById('u-email').value.trim(),
    phone:       document.getElementById('u-phone').value.trim(),
    planStatus:  document.getElementById('u-plan').value,
    password:    pwd
  };
  try {
    if (editingUserId) {
      await DB.updateUser(editingUserId, data);
      showToast('Utente aggiornato', 'success');
      if (currentAdminUserId === editingUserId) await renderUserProfile(editingUserId);
    } else {
      if (!pwd) { showToast('Inserisci una password', 'error'); btn.disabled = false; return; }
      await DB.createUserByAdmin(data);
      showToast('Utente aggiunto', 'success');
    }
    closeModal('modal-user');
    await renderUsersList();
    await renderAdminDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  } finally { btn.disabled = false; }
});

function confirmDeleteUser(userId) {
  DB.getUserById(userId).then(user => {
    if (!user) return;
    showConfirm('Elimina utente', `Vuoi eliminare "${user.companyName||user.nome}"? Tutte le sedi e gli interventi verranno eliminati.`, async () => {
      try {
        await DB.deleteUser(userId);
        showToast('Utente eliminato', 'success');
        await renderUsersList();
        await renderAdminDashboard();
        if (currentAdminUserId === userId) backToUsers();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
}

// ── USER PROFILE ──────────────────────────────────────
async function openUserProfile(userId) {
  await showSection('users');
  currentAdminUserId = userId;  // ri-imposta DOPO showSection (che chiama backToUsers)
  document.getElementById('users-list-view').classList.add('hidden');
  document.getElementById('user-profile-view').classList.remove('hidden');
  await renderUserProfile(userId);
}

function backToUsers() {
  currentAdminUserId = null;
  document.getElementById('users-list-view').classList.remove('hidden');
  document.getElementById('user-profile-view').classList.add('hidden');
}

async function renderUserProfile(userId) {
  const user  = await DB.getUserById(userId);
  if (!user) return;
  const props   = await DB.getPropertiesByUser(userId);
  const allRecs = (await Promise.all(props.map(p => DB.getRecordsByProperty(p.id)))).flat();
  const initial = (user.companyName || user.nome || '?')[0].toUpperCase();

  document.getElementById('admin-profile-header').innerHTML = `
    <div class="admin-profile-avatar">${initial}</div>
    <div class="admin-profile-info">
      <h2>${escHtml(user.companyName||'—')}</h2>
      <p>${user.type==='azienda'?'🏢 Azienda':'🏛️ Organizzazione'} · ${escHtml(user.phone||'—')}</p>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        ${planBadge(user.planStatus)}
        <span class="badge badge-gray">${props.length} sedi</span>
        <span class="badge badge-gray">${allRecs.length} interventi</span>
      </div>
    </div>
    <div class="admin-profile-header-actions">
      <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border-color:rgba(255,255,255,.3)" onclick="openEditUser('${userId}')">✏️ Modifica</button>
      <button class="btn btn-sm" style="background:rgba(239,68,68,.7);color:#fff;border-color:transparent" onclick="confirmDeleteUser('${userId}')">🗑 Elimina</button>
    </div>`;

  document.getElementById('admin-user-info-display').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${[
        ['Referente',  `${user.nome||''} ${user.cognome||''}`],
        [user.type==='azienda'?'Ragione sociale':'Organizzazione', user.companyName||'—'],
        ['Telefono',   user.phone||'—'],
        ['Tipo account', user.type==='azienda'?'Azienda':'Organizzazione'],
        ['Registrato il', formatDate(user.createdAt)]
      ].map(([l,v]) => `
        <div style="display:flex;gap:10px">
          <span style="font-size:13px;color:var(--g500);min-width:130px;flex-shrink:0">${l}</span>
          <span style="font-size:13.5px;font-weight:600">${escHtml(v)}</span>
        </div>`).join('')}
    </div>`;

  const statuses = ['attivo','inattivo','scaduto'];
  document.getElementById('plan-selector').innerHTML = statuses.map(s => `
    <button type="button" class="plan-status-btn ${user.planStatus===s?'selected-'+s:''}" onclick="setPlanStatus('${s}')">
      ${s==='attivo'?'✅':s==='inattivo'?'⏸️':'⚠️'} ${s.charAt(0).toUpperCase()+s.slice(1)}
    </button>`).join('');

  switchAdminTab('info');
}

async function setPlanStatus(status) {
  if (!currentAdminUserId) return;
  try {
    await DB.updateUser(currentAdminUserId, { planStatus: status });
    showToast(`Piano impostato: ${status}`, 'success');
    await renderUserProfile(currentAdminUserId);
    await renderAdminDashboard();
  } catch (err) { showToast(err.message, 'error'); }
}

async function switchAdminTab(tab) {
  document.querySelectorAll('.admin-profile-tab').forEach(t => t.classList.toggle('active', t.dataset.atab === tab));
  document.querySelectorAll('.admin-tab-pane').forEach(p => p.classList.toggle('active', p.id === 'atab-' + tab));
  if (tab === 'sedi')       await renderAdminSedi();
  if (tab === 'interventi') await renderAdminRecords('tutti');
  if (tab === 'documenti')  await renderAdminDocs();
}

// ── ADMIN SEDI ────────────────────────────────────────
async function renderAdminSedi() {
  const props = await DB.getPropertiesByUser(currentAdminUserId);
  const el    = document.getElementById('admin-sedi-list');
  if (props.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏢</div><h3>Nessuna sede</h3><p>Aggiungi la prima sede per questo utente.</p></div>`; return;
  }
  const recCounts = await Promise.all(props.map(p => DB.getRecordsByProperty(p.id)));
  const docCounts = await Promise.all(props.map(p => DB.getDocumentsByProperty(p.id)));
  el.innerHTML = props.map((p, i) => `
    <div style="background:var(--g50);border:1px solid var(--g100);border-radius:var(--r);padding:16px;margin-bottom:12px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
        <div>
          <div style="font-size:15px;font-weight:700">${escHtml(p.address)}</div>
          <div style="font-size:13px;color:var(--g500);margin-top:3px">${escHtml(p.city)}, ${escHtml(p.province)}</div>
          <div style="display:flex;gap:10px;margin-top:8px">
            <span class="badge badge-gray">📋 ${recCounts[i].length} interventi</span>
            <span class="badge badge-gray">📁 ${docCounts[i].length} documenti</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-sm btn-outline" onclick="openAdminEditSede('${p.id}')">✏️</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="confirmAdminDeleteSede('${p.id}')">🗑</button>
        </div>
      </div>
    </div>`).join('');
}

function openAdminAddSede() {
  editingAdminSedeId = null;
  document.getElementById('modal-admin-sede-title').textContent = 'Aggiungi Sede';
  document.getElementById('as-submit-btn').textContent          = 'Aggiungi Sede';
  ['as-address','as-city','as-province'].forEach(id => document.getElementById(id).value = '');
  openModal('modal-admin-sede');
}

async function openAdminEditSede(sedeId) {
  const prop = await DB.getPropertyById(sedeId);
  if (!prop) return;
  editingAdminSedeId = sedeId;
  document.getElementById('modal-admin-sede-title').textContent = 'Modifica Sede';
  document.getElementById('as-submit-btn').textContent          = 'Salva modifiche';
  document.getElementById('as-address').value  = prop.address;
  document.getElementById('as-city').value     = prop.city;
  document.getElementById('as-province').value = prop.province;
  openModal('modal-admin-sede');
}

document.getElementById('form-admin-sede').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('as-submit-btn'); btn.disabled = true;
  const data = {
    userId:   currentAdminUserId,
    address:  document.getElementById('as-address').value.trim(),
    city:     document.getElementById('as-city').value.trim(),
    province: document.getElementById('as-province').value.trim().toUpperCase()
  };
  try {
    if (editingAdminSedeId) { await DB.updateProperty(editingAdminSedeId, data); showToast('Sede aggiornata','success'); }
    else                    { await DB.createProperty(data);                     showToast('Sede aggiunta','success'); }
    closeModal('modal-admin-sede');
    await renderAdminSedi();
  } catch (err) { showToast(err.message,'error'); } finally { btn.disabled = false; }
});

function confirmAdminDeleteSede(sedeId) {
  DB.getPropertyById(sedeId).then(prop => {
    if (!prop) return;
    showConfirm('Elimina sede', `Vuoi eliminare "${prop.address}"? Tutti i dati associati saranno persi.`, async () => {
      try {
        const docs = await DB.getDocumentsByProperty(sedeId);
        await Promise.all(docs.map(d => DB.deleteDocument(d.id, d.file_path)));
        await DB.deleteProperty(sedeId);
        showToast('Sede eliminata','success');
        await renderAdminSedi();
      } catch (err) { showToast(err.message,'error'); }
    });
  });
}

// ── ADMIN RECORDS ─────────────────────────────────────
async function renderAdminRecords(filter) {
  adminRecordFilter = filter;
  const props  = await DB.getPropertiesByUser(currentAdminUserId);
  const propMap = Object.fromEntries(props.map(p => [p.id, p]));
  let recs = (await Promise.all(props.map(p => DB.getRecordsByProperty(p.id)))).flat();
  if (filter !== 'tutti') recs = recs.filter(r => r.status === filter);
  recs.sort((a,b) => new Date(b.date) - new Date(a.date));

  const filterOpts = ['tutti','futuro','completato','annullato'].map(f =>
    `<button class="filter-btn ${adminRecordFilter===f?'active':''}" onclick="renderAdminRecords('${f}')">${f.charAt(0).toUpperCase()+f.slice(1)}</button>`
  );
  document.getElementById('admin-records-filter').innerHTML = filterOpts.join('');

  const tbody = document.getElementById('admin-records-tbody');
  const cards = document.getElementById('admin-records-cards');
  const empty = document.getElementById('admin-records-empty');
  const table = document.getElementById('admin-records-table');

  if (recs.length === 0) {
    tbody.innerHTML = ''; cards.innerHTML = '';
    table.style.display = 'none'; empty.classList.remove('hidden'); return;
  }
  table.style.display = ''; empty.classList.add('hidden');

  const statusOpts = (id, cur) => ['futuro','completato','annullato'].map(s =>
    `<option value="${s}" ${cur===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
  ).join('');

  // Tabella (desktop)
  tbody.innerHTML = recs.map(r => {
    const prop = propMap[r.propertyId];
    return `<tr>
      <td style="font-size:13px">${prop ? escHtml(prop.address) : '—'}</td>
      <td>${formatDate(r.date)}</td>
      <td><span class="badge ${r.maintenanceType==='ordinaria'?'badge-info':'badge-warning'}">${r.maintenanceType==='ordinaria'?'Ordinaria':'Straordinaria'}</span></td>
      <td>${escHtml(r.workType)}</td>
      <td>
        <select class="form-control" style="padding:4px 8px;font-size:12.5px;height:auto;width:auto" onchange="quickChangeStatus('${r.id}',this.value)">
          ${statusOpts(r.id, r.status)}
        </select>
      </td>
      <td>
        <div class="table-actions">
          <button class="btn btn-sm btn-outline" onclick="openEditRecord('${r.id}')">✏️</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="confirmDeleteRecord('${r.id}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // Card (mobile)
  cards.innerHTML = recs.map(r => {
    const prop = propMap[r.propertyId];
    const typeOrd = r.maintenanceType === 'ordinaria';
    return `
    <div class="rec-card">
      <div class="rec-card-head">
        <span class="rec-card-address">🏠 ${prop ? escHtml(prop.address) : '—'}</span>
        <span class="rec-card-date">📅 ${formatDate(r.date)}</span>
      </div>
      <div class="rec-card-info">
        <div class="rec-card-row">
          <span class="rec-card-label">Tipo</span>
          <span class="badge ${typeOrd?'badge-info':'badge-warning'}">${typeOrd?'Ordinaria':'Straordinaria'}</span>
        </div>
        <div class="rec-card-row">
          <span class="rec-card-label">Lavoro</span>
          <span class="rec-card-value">${escHtml(r.workType)}</span>
        </div>
      </div>
      <div class="rec-card-foot">
        <select class="rec-card-select" onchange="quickChangeStatus('${r.id}',this.value)">
          ${statusOpts(r.id, r.status)}
        </select>
        <div class="rec-card-btns">
          <button class="btn btn-sm btn-outline rec-card-btn" onclick="openEditRecord('${r.id}')">✏️ Modifica</button>
          <button class="btn btn-sm btn-ghost rec-card-btn" style="color:var(--danger)" onclick="confirmDeleteRecord('${r.id}')">🗑 Elimina</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function quickChangeStatus(recId, newStatus) {
  try {
    await DB.updateRecord(recId, { status: newStatus });
    showToast('Stato aggiornato', 'success');
  } catch (err) { showToast(err.message,'error'); }
}

async function openAddRecord() {
  editingRecordId = null;
  document.getElementById('modal-rec-title').textContent  = 'Nuovo Intervento';
  document.getElementById('rec-submit-btn').textContent   = 'Salva Intervento';
  await populateSedeSelect();
  document.getElementById('rec-date').value   = new Date().toISOString().split('T')[0];
  document.getElementById('rec-type').value   = 'ordinaria';
  document.getElementById('rec-work').value   = '';
  document.getElementById('rec-status').value = 'futuro';
  document.getElementById('rec-notes').value  = '';
  openModal('modal-record-admin');
}

async function openEditRecord(recId) {
  const props = await DB.getPropertiesByUser(currentAdminUserId);
  const recs  = (await Promise.all(props.map(p => DB.getRecordsByProperty(p.id)))).flat();
  const rec   = recs.find(r => r.id === recId);
  if (!rec) return;
  editingRecordId = recId;
  document.getElementById('modal-rec-title').textContent = 'Modifica Intervento';
  document.getElementById('rec-submit-btn').textContent  = 'Salva modifiche';
  await populateSedeSelect(rec.propertyId);
  document.getElementById('rec-date').value   = rec.date || '';
  document.getElementById('rec-type').value   = rec.maintenanceType || 'ordinaria';
  document.getElementById('rec-work').value   = rec.workType || '';
  document.getElementById('rec-status').value = rec.status || 'futuro';
  document.getElementById('rec-notes').value  = rec.notes || '';
  openModal('modal-record-admin');
}

async function populateSedeSelect(selectedId) {
  const props = await DB.getPropertiesByUser(currentAdminUserId);
  const sel   = document.getElementById('rec-property');
  sel.innerHTML = props.length === 0
    ? '<option>Nessuna sede disponibile</option>'
    : props.map(p => `<option value="${p.id}" ${p.id===selectedId?'selected':''}>${escHtml(p.address)} — ${escHtml(p.city)}</option>`).join('');
}

document.getElementById('form-record-admin').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('rec-submit-btn'); btn.disabled = true;
  const data = {
    userId:          currentAdminUserId,
    propertyId:      document.getElementById('rec-property').value,
    date:            document.getElementById('rec-date').value,
    maintenanceType: document.getElementById('rec-type').value,
    workType:        document.getElementById('rec-work').value.trim(),
    status:          document.getElementById('rec-status').value,
    notes:           document.getElementById('rec-notes').value.trim() || null
  };
  try {
    if (editingRecordId) { await DB.updateRecord(editingRecordId, data); showToast('Intervento aggiornato','success'); }
    else                 { await DB.createRecord(data);                  showToast('Intervento creato','success'); }
    closeModal('modal-record-admin');
    await renderAdminRecords(adminRecordFilter);
  } catch (err) { showToast(err.message,'error'); } finally { btn.disabled = false; }
});

function confirmDeleteRecord(recId) {
  showConfirm('Elimina intervento', 'Vuoi eliminare questo intervento?', async () => {
    try { await DB.deleteRecord(recId); showToast('Eliminato','success'); await renderAdminRecords(adminRecordFilter); }
    catch (err) { showToast(err.message,'error'); }
  });
}

// ── ADMIN DOCS ────────────────────────────────────────
async function renderAdminDocs() {
  const el    = document.getElementById('admin-docs-by-sede');
  const props = await DB.getPropertiesByUser(currentAdminUserId);
  if (props.length === 0) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">📁</div><h3>Nessuna sede</h3><p>Aggiungi prima una sede.</p></div>`; return; }

  const allDocs = await Promise.all(props.map(p => DB.getDocumentsByProperty(p.id)));
  const total   = allDocs.reduce((s, d) => s + d.length, 0);
  if (total === 0) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">📁</div><h3>Nessun documento</h3><p>L'utente non ha ancora caricato documenti.</p></div>`; return; }

  el.innerHTML = props.map((p, i) => {
    const docs = allDocs[i];
    if (docs.length === 0) return `<div class="admin-docs-section"><h4>🏢 ${escHtml(p.address)} — ${escHtml(p.city)}</h4><p class="text-muted text-sm" style="padding:8px 0">Nessun documento</p></div>`;
    return `<div class="admin-docs-section">
      <h4>🏢 ${escHtml(p.address)} — ${escHtml(p.city)}</h4>
      <div class="admin-docs-grid" id="doc-grid-${p.id}">
        ${docs.map(doc => `<div class="admin-doc-card" data-path="${doc.file_path}" data-name="${escHtml(doc.name)}" data-type="${doc.file_type||''}" onclick="adminPreviewDoc('${doc.file_path}','${escHtml(doc.name)}','${doc.file_type||''}')">
          <div style="font-size:30px;margin-bottom:6px">${(doc.file_type||'').startsWith('image/')? '🖼️':'📄'}</div>
          <div style="font-size:11px;font-weight:600;word-break:break-all">${escHtml(doc.name)}</div>
          <div style="font-size:10px;color:var(--g400)">${Math.round((doc.file_size||0)/1024)} KB</div>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

async function adminPreviewDoc(filePath, name, fileType) {
  document.getElementById('admin-doc-title').textContent = decodeURIComponent(name);
  const url   = await DB.getDocumentUrl(filePath);
  const isImg = fileType.startsWith('image/');
  document.getElementById('admin-doc-preview').innerHTML = url
    ? (isImg
        ? `<img src="${url}" style="max-width:100%;max-height:70vh;border-radius:var(--r)">`
        : `<div style="padding:30px"><div style="font-size:60px;margin-bottom:14px">📄</div><p style="font-size:16px;font-weight:600">${escHtml(name)}</p><a href="${url}" target="_blank" class="btn btn-primary mt-4" style="display:inline-flex">⬇ Apri / Scarica</a></div>`)
    : `<p class="text-muted" style="padding:30px">Impossibile caricare l'anteprima.</p>`;
  openModal('modal-admin-doc');
}

// ── MODALS ────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('active'); });
});

// ── COLLABORATORI ─────────────────────────────────────
let _editingCollabId  = null;
let _allCollaboratori = [];

async function renderCollaboratori() {
  _allCollaboratori = await DB.getCollaboratori();
  filterCollaboratori();
}

function filterCollaboratori() {
  const search = (document.getElementById('collab-search')?.value || '').toLowerCase();
  const roleF  = document.getElementById('collab-role-filter')?.value || '';
  const filtered = _allCollaboratori.filter(c => {
    const fullName = ((c.nome||'') + ' ' + (c.cognome||'')).toLowerCase();
    const matchSearch = !search || fullName.includes(search) || (c.citta||'').toLowerCase().includes(search);
    return matchSearch && (!roleF || c.ruolo === roleF);
  });

  const grid  = document.getElementById('collab-grid');
  const empty = document.getElementById('collab-empty');
  if (filtered.length === 0) {
    grid.innerHTML = ''; empty.classList.remove('hidden'); return;
  }
  empty.classList.add('hidden');
  grid.innerHTML = filtered.map(c => `
    <div class="supplier-card">
      <div class="supplier-card-head">
        <div style="min-width:0">
          <div class="supplier-name">${escHtml(c.nome)} ${escHtml(c.cognome)}</div>
          <span class="supplier-type-badge">${escHtml(c.ruolo||'—')}</span>
        </div>
        <div class="supplier-card-actions">
          <button class="btn btn-sm btn-ghost" onclick="openEditCollaboratore('${c.id}')" title="Modifica">✏️</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="confirmDeleteCollaboratore('${c.id}')" title="Elimina">🗑</button>
        </div>
      </div>
      <div class="supplier-card-body">
        ${c.email    ? `<div class="supplier-info-row"><span>📧</span><a href="mailto:${escHtml(c.email)}" style="color:var(--primary);text-decoration:none">${escHtml(c.email)}</a></div>` : ''}
        ${c.telefono ? `<div class="supplier-info-row"><span>📞</span><a href="tel:${escHtml(c.telefono)}" style="color:inherit;text-decoration:none">${escHtml(c.telefono)}</a></div>` : ''}
        ${(c.indirizzo||c.citta) ? `<div class="supplier-info-row"><span>📍</span><span>${escHtml([c.indirizzo,c.citta].filter(Boolean).join(', '))}</span></div>` : ''}
        ${c.note ? `<div class="supplier-note">${escHtml(c.note)}</div>` : ''}
      </div>
    </div>`).join('');
}

function openAddCollaboratore() {
  _editingCollabId = null;
  document.getElementById('collab-modal-title').textContent = 'Aggiungi Collaboratore';
  document.getElementById('form-collaboratore').reset();
  document.getElementById('modal-collaboratore').classList.add('active');
}

function openEditCollaboratore(id) {
  const c = _allCollaboratori.find(c => c.id === id);
  if (!c) return;
  _editingCollabId = id;
  document.getElementById('collab-modal-title').textContent = 'Modifica Collaboratore';
  document.getElementById('col-nome').value      = c.nome      || '';
  document.getElementById('col-cognome').value   = c.cognome   || '';
  document.getElementById('col-ruolo').value     = c.ruolo     || '';
  document.getElementById('col-email').value     = c.email     || '';
  document.getElementById('col-telefono').value  = c.telefono  || '';
  document.getElementById('col-indirizzo').value = c.indirizzo || '';
  document.getElementById('col-citta').value     = c.citta     || '';
  document.getElementById('col-note').value      = c.note      || '';
  document.getElementById('modal-collaboratore').classList.add('active');
}

document.getElementById('form-collaboratore')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('col-save-btn');
  btn.disabled = true;
  const data = {
    nome:      document.getElementById('col-nome').value.trim(),
    cognome:   document.getElementById('col-cognome').value.trim(),
    ruolo:     document.getElementById('col-ruolo').value,
    email:     document.getElementById('col-email').value.trim(),
    telefono:  document.getElementById('col-telefono').value.trim(),
    indirizzo: document.getElementById('col-indirizzo').value.trim(),
    citta:     document.getElementById('col-citta').value.trim(),
    note:      document.getElementById('col-note').value.trim(),
  };
  try {
    if (_editingCollabId) {
      await DB.updateCollaboratore(_editingCollabId, data);
      showToast('Collaboratore aggiornato', 'success');
    } else {
      await DB.createCollaboratore(data);
      showToast('Collaboratore aggiunto', 'success');
    }
    document.getElementById('modal-collaboratore').classList.remove('active');
    await renderCollaboratori();
  } catch(err) { showToast(err.message, 'error'); }
  finally { btn.disabled = false; }
});

function confirmDeleteCollaboratore(id) {
  const c = _allCollaboratori.find(c => c.id === id);
  const nome = c ? `${c.nome} ${c.cognome}` : 'questo collaboratore';
  showConfirm('Elimina collaboratore', `Vuoi eliminare "${nome}"?`, async () => {
    try { await DB.deleteCollaboratore(id); await renderCollaboratori(); showToast('Collaboratore eliminato', 'success'); }
    catch(err) { showToast(err.message, 'error'); }
  });
}

// ── SUPPLIERS ─────────────────────────────────────────
let _editingSupplierId = null;
let _allSuppliers      = [];

async function renderSuppliers() {
  _allSuppliers = await DB.getSuppliers();
  filterSuppliers();
}

function filterSuppliers() {
  const search = (document.getElementById('supplier-search')?.value || '').toLowerCase();
  const typeF  = document.getElementById('supplier-type-filter')?.value || '';
  const filtered = _allSuppliers.filter(s => {
    const matchSearch = !search ||
      (s.ragioneSociale||'').toLowerCase().includes(search) ||
      (s.citta||'').toLowerCase().includes(search);
    return matchSearch && (!typeF || s.tipo === typeF);
  });

  const grid  = document.getElementById('supplier-grid');
  const empty = document.getElementById('suppliers-empty');
  if (filtered.length === 0) {
    grid.innerHTML = ''; empty.classList.remove('hidden'); return;
  }
  empty.classList.add('hidden');
  grid.innerHTML = filtered.map(s => `
    <div class="supplier-card">
      <div class="supplier-card-head">
        <div style="min-width:0">
          <div class="supplier-name">${escHtml(s.ragioneSociale)}</div>
          <span class="supplier-type-badge">${escHtml(s.tipo||'—')}</span>
        </div>
        <div class="supplier-card-actions">
          <button class="btn btn-sm btn-ghost" onclick="openEditSupplier('${s.id}')" title="Modifica">✏️</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="confirmDeleteSupplier('${s.id}')" title="Elimina">🗑</button>
        </div>
      </div>
      <div class="supplier-card-body">
        ${s.email    ? `<div class="supplier-info-row"><span>📧</span><a href="mailto:${escHtml(s.email)}" style="color:var(--primary);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(s.email)}</a></div>` : ''}
        ${s.telefono ? `<div class="supplier-info-row"><span>📞</span><a href="tel:${escHtml(s.telefono)}" style="color:inherit;text-decoration:none">${escHtml(s.telefono)}</a></div>` : ''}
        ${(s.indirizzo||s.citta) ? `<div class="supplier-info-row"><span>📍</span><span>${escHtml([s.indirizzo,s.citta].filter(Boolean).join(', '))}</span></div>` : ''}
        ${s.sito ? `<div class="supplier-info-row"><span>🌐</span><a href="${escHtml(s.sito)}" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(s.sito.replace(/^https?:\/\//,''))}</a></div>` : ''}
        ${s.note ? `<div class="supplier-note">${escHtml(s.note)}</div>` : ''}
      </div>
    </div>`).join('');
}

function openAddSupplier() {
  _editingSupplierId = null;
  document.getElementById('supplier-modal-title').textContent = 'Aggiungi Fornitore';
  document.getElementById('form-supplier').reset();
  document.getElementById('modal-supplier').classList.add('active');
}

function openEditSupplier(id) {
  const s = _allSuppliers.find(s => s.id === id);
  if (!s) return;
  _editingSupplierId = id;
  document.getElementById('supplier-modal-title').textContent = 'Modifica Fornitore';
  document.getElementById('sup-ragione').value   = s.ragioneSociale || '';
  document.getElementById('sup-tipo').value      = s.tipo           || '';
  document.getElementById('sup-email').value     = s.email          || '';
  document.getElementById('sup-telefono').value  = s.telefono       || '';
  document.getElementById('sup-indirizzo').value = s.indirizzo      || '';
  document.getElementById('sup-citta').value     = s.citta          || '';
  document.getElementById('sup-sito').value      = s.sito           || '';
  document.getElementById('sup-note').value      = s.note           || '';
  document.getElementById('modal-supplier').classList.add('active');
}

document.getElementById('form-supplier')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('sup-save-btn');
  btn.disabled = true;
  const data = {
    ragioneSociale: document.getElementById('sup-ragione').value.trim(),
    tipo:           document.getElementById('sup-tipo').value,
    email:          document.getElementById('sup-email').value.trim(),
    telefono:       document.getElementById('sup-telefono').value.trim(),
    indirizzo:      document.getElementById('sup-indirizzo').value.trim(),
    citta:          document.getElementById('sup-citta').value.trim(),
    sito:           document.getElementById('sup-sito').value.trim(),
    note:           document.getElementById('sup-note').value.trim(),
  };
  try {
    if (_editingSupplierId) {
      await DB.updateSupplier(_editingSupplierId, data);
      showToast('Fornitore aggiornato', 'success');
    } else {
      await DB.createSupplier(data);
      showToast('Fornitore aggiunto', 'success');
    }
    document.getElementById('modal-supplier').classList.remove('active');
    await renderSuppliers();
  } catch(err) { showToast(err.message, 'error'); }
  finally { btn.disabled = false; }
});

function confirmDeleteSupplier(id) {
  const s = _allSuppliers.find(s => s.id === id);
  showConfirm('Elimina fornitore', `Vuoi eliminare "${s?.ragioneSociale || 'questo fornitore'}"?`, async () => {
    try { await DB.deleteSupplier(id); await renderSuppliers(); showToast('Fornitore eliminato', 'success'); }
    catch(err) { showToast(err.message, 'error'); }
  });
}

// ── QUOTES ────────────────────────────────────────────
async function renderQuotes() {
  const all     = await DB.getQuotes();
  const statusF = document.getElementById('quote-status-filter')?.value || '';
  const filtered = statusF ? all.filter(q => q.status === statusF) : all;

  const tbody = document.getElementById('quotes-tbody');
  const cards = document.getElementById('quotes-cards');
  const empty = document.getElementById('quotes-empty');
  const table = document.getElementById('quotes-table');

  const inAttesa = all.filter(q => q.status === 'in_attesa').length;
  updateQuoteNavBadge(inAttesa);
  filtered.forEach(q => { _quotesMap[q.id] = q; });

  if (filtered.length === 0) {
    tbody.innerHTML = ''; cards.innerHTML = '';
    table.style.display = 'none'; empty.classList.remove('hidden'); return;
  }
  table.style.display = ''; empty.classList.add('hidden');

  tbody.innerHTML = filtered.map(q => `
    <tr>
      <td>
        <div class="user-row-name">${escHtml(q.nome)} ${escHtml(q.cognome)}</div>
        <div class="user-row-email">${escHtml(q.email)}</div>
      </td>
      <td style="font-weight:600;font-size:13.5px">${escHtml(q.azienda)}</td>
      <td style="font-size:13px">${escHtml(q.telefono)}</td>
      <td style="font-size:13px">${escHtml(q.citta||'—')}</td>
      <td style="font-size:13px;color:var(--g500);white-space:nowrap">${formatDate(q.createdAt)}</td>
      <td>${quoteBadge(q.status)}</td>
      <td>
        <div class="table-actions">
          <button class="btn btn-sm btn-outline" onclick="openQuoteDetail(_quotesMap['${q.id}'])">👁 Dettagli</button>
          ${q.status === 'in_attesa'
            ? `<button class="btn btn-sm btn-primary" onclick="setQuoteStatus('${q.id}','completato')">✓ Completa</button>`
            : `<button class="btn btn-sm btn-ghost" onclick="setQuoteStatus('${q.id}','in_attesa')">↩ Riapri</button>`}
          <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="confirmDeleteQuote('${q.id}')">🗑</button>
        </div>
      </td>
    </tr>`).join('');

  cards.innerHTML = filtered.map(q => `
    <div class="rec-card">
      <div class="rec-card-head">
        <span class="rec-card-address">👤 ${escHtml(q.nome)} ${escHtml(q.cognome)}</span>
        ${quoteBadge(q.status)}
      </div>
      <div class="rec-card-info">
        <div class="rec-card-row">
          <span class="rec-card-label">Azienda</span>
          <span class="rec-card-value">${escHtml(q.azienda)}</span>
        </div>
        <div class="rec-card-row">
          <span class="rec-card-label">Email</span>
          <span class="rec-card-value" style="font-size:12.5px">${escHtml(q.email)}</span>
        </div>
        <div class="rec-card-row">
          <span class="rec-card-label">Telefono</span>
          <span class="rec-card-value">${escHtml(q.telefono)}</span>
        </div>
        ${q.citta ? `<div class="rec-card-row"><span class="rec-card-label">Città</span><span class="rec-card-value">${escHtml(q.citta)}</span></div>` : ''}
        ${q.note  ? `<div class="rec-card-row" style="align-items:flex-start"><span class="rec-card-label">Note</span><span class="rec-card-value" style="max-width:65%;white-space:normal;text-align:right">${escHtml(q.note)}</span></div>` : ''}
        <div class="rec-card-row">
          <span class="rec-card-label">Data</span>
          <span class="rec-card-value">${formatDate(q.createdAt)}</span>
        </div>
      </div>
      <div class="rec-card-foot">
        <button class="btn btn-sm btn-outline rec-card-btn" style="width:100%;justify-content:center" onclick="openQuoteDetail(_quotesMap['${q.id}'])">👁 Vedi dettagli completi</button>
        <div class="rec-card-btns">
          ${q.status === 'in_attesa'
            ? `<button class="btn btn-sm btn-primary rec-card-btn" onclick="setQuoteStatus('${q.id}','completato')">✓ Completa</button>`
            : `<button class="btn btn-sm btn-ghost rec-card-btn" onclick="setQuoteStatus('${q.id}','in_attesa')">↩ Riapri</button>`}
          <button class="btn btn-sm btn-ghost rec-card-btn" style="color:var(--danger)" onclick="confirmDeleteQuote('${q.id}')">🗑 Elimina</button>
        </div>
      </div>
    </div>`).join('');
}

async function filterQuotes() { await renderQuotes(); }

function openQuoteDetail(q) {
  document.getElementById('quote-detail-body').innerHTML = `
    <div class="admin-info-grid" style="margin-bottom:16px">
      <div>
        <div class="form-label">Nome</div>
        <div style="font-size:15px;font-weight:600">${escHtml(q.nome)} ${escHtml(q.cognome)}</div>
      </div>
      <div>
        <div class="form-label">Azienda</div>
        <div style="font-size:15px;font-weight:600">${escHtml(q.azienda)}</div>
      </div>
      <div>
        <div class="form-label">Email</div>
        <div style="font-size:14px">${escHtml(q.email)}</div>
      </div>
      <div>
        <div class="form-label">Telefono</div>
        <div style="font-size:14px">${escHtml(q.telefono)}</div>
      </div>
      <div>
        <div class="form-label">Città</div>
        <div style="font-size:14px">${escHtml(q.citta||'—')}</div>
      </div>
      <div>
        <div class="form-label">Data richiesta</div>
        <div style="font-size:14px">${formatDate(q.createdAt)}</div>
      </div>
    </div>
    <div class="form-label">Stato</div>
    <div style="margin-bottom:16px">${quoteBadge(q.status)}</div>
    <div class="form-label">Note</div>
    <div style="background:var(--g50);border:1px solid var(--g100);border-radius:var(--r-sm);padding:14px;font-size:14px;line-height:1.7;min-height:60px;white-space:pre-wrap">${escHtml(q.note||'Nessuna nota')}</div>`;

  document.getElementById('quote-detail-actions').innerHTML = q.status === 'in_attesa'
    ? `<button class="btn btn-primary" onclick="setQuoteStatus('${q.id}','completato');document.getElementById('modal-quote-detail').classList.remove('active')">✓ Segna come completato</button>`
    : `<button class="btn btn-ghost" onclick="setQuoteStatus('${q.id}','in_attesa');document.getElementById('modal-quote-detail').classList.remove('active')">↩ Riapri</button>`;

  document.getElementById('modal-quote-detail').classList.add('active');
}

async function setQuoteStatus(id, status) {
  try {
    await DB.updateQuoteStatus(id, status);
    await renderQuotes();
    showToast(status === 'completato' ? 'Richiesta segnata come completata' : 'Richiesta riaperta', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

function confirmDeleteQuote(id) {
  showConfirm('Elimina richiesta', 'Vuoi eliminare questa richiesta di preventivo?', async () => {
    try { await DB.deleteQuote(id); await renderQuotes(); showToast('Richiesta eliminata', 'success'); }
    catch (err) { showToast(err.message, 'error'); }
  });
}

function updateQuoteNavBadge(count) {
  const badge = document.getElementById('quotes-nav-badge');
  if (!badge) return;
  if (count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}

// ══════════════════════════════════════════════════════
//  PREVENTIVATORE
// ══════════════════════════════════════════════════════

function prevBadge(status) {
  const map = {
    bozza:     ['badge-gray',    '✏️ Bozza'],
    inviato:   ['badge-info',    '📨 Inviato'],
    accettato: ['badge-success', '✓ Accettato'],
    rifiutato: ['badge-danger',  '✕ Rifiutato'],
  };
  const [cls, label] = map[status] || ['badge-gray', status || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function fmtEur(n) {
  return '€ ' + Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── List view ────────────────────────────────────────
async function renderPreventivi() {
  await initNoteVoci();
  _listinoCache = await DB.getListino();
  const all = await DB.getPreventivi();
  _allPreventivi = all;
  filterPreventivi();
}

function _prevStatusSelect(id, current) {
  return `<select class="prev-status-select" onchange="quickUpdatePrevStatus('${id}',this.value)">
    <option value="bozza"     ${current==='bozza'    ?'selected':''}>✏️ Bozza</option>
    <option value="inviato"   ${current==='inviato'  ?'selected':''}>📨 Inviato</option>
    <option value="accettato" ${current==='accettato'?'selected':''}>✓ Accettato</option>
    <option value="rifiutato" ${current==='rifiutato'?'selected':''}>✕ Rifiutato</option>
  </select>`;
}

async function quickUpdatePrevStatus(id, status) {
  const p = _allPreventivi.find(x => x.id === id);
  if (!p) return;
  const oldStatus = p.status;
  p.status = status;       // aggiornamento ottimistico in memoria
  filterPreventivi();      // aggiorna subito la UI
  try {
    await DB.updatePreventivo(id, { status });
    showToast('Stato aggiornato', 'success');
  } catch(e) {
    console.warn('Errore aggiornamento stato:', e);
    p.status = oldStatus;  // ripristina in caso di errore
    filterPreventivi();
    showToast('Errore nel salvataggio dello stato', 'error');
  }
}

function filterPreventivi() {
  const statusF = document.getElementById('prev-status-filter')?.value || '';
  const list = _allPreventivi.filter(p => !statusF || p.status === statusF);
  const tbody = document.getElementById('prev-tbody');
  const cards = document.getElementById('prev-cards');
  const empty = document.getElementById('prev-empty');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = ''; cards.innerHTML = '';
    empty.classList.remove('hidden'); return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = list.map(p => `
    <tr>
      <td><strong>#${p.numero}</strong></td>
      <td>${escHtml(p.cliente?.nome || '—')}</td>
      <td>${escHtml(p.cliente?.azienda || '—')}</td>
      <td>${formatDate(p.createdAt)}</td>
      <td><strong>${fmtEur(p.totaleIvato)}</strong></td>
      <td>${_prevStatusSelect(p.id, p.status)}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="editPreventivo('${p.id}')">✏️</button>
        <button class="btn btn-sm btn-outline" onclick="printPreventivo('${p.id}')">🖨️</button>
        <button class="btn btn-sm btn-danger-outline" onclick="confirmDeletePreventivo('${p.id}','${p.numero}')">🗑️</button>
      </td>
    </tr>`).join('');

  cards.innerHTML = list.map(p => `
    <div class="pv-card">
      <div class="pv-card-head">
        <span class="pv-card-num">Preventivo #${p.numero}</span>
        <span class="pv-card-amount">${fmtEur(p.totaleIvato)}</span>
      </div>
      <div class="pv-card-body">
        <div class="pv-card-client">${escHtml(p.cliente?.azienda || p.cliente?.nome || '—')}</div>
        <div class="pv-card-meta">${escHtml(p.cliente?.nome || '')} · ${formatDate(p.createdAt)}</div>
      </div>
      <div class="pv-card-foot">
        <div class="pv-card-status">${_prevStatusSelect(p.id, p.status)}</div>
        <div class="pv-card-btns">
          <button class="btn btn-sm btn-outline" onclick="editPreventivo('${p.id}')">✏️ Modifica</button>
          <button class="btn btn-sm btn-outline" onclick="printPreventivo('${p.id}')">🖨️ Stampa</button>
          <button class="btn btn-sm btn-danger-outline" onclick="confirmDeletePreventivo('${p.id}','${p.numero}')">🗑️</button>
        </div>
      </div>
    </div>`).join('');
}

function confirmDeletePreventivo(id, numero) {
  showConfirm('Elimina preventivo', `Eliminare definitivamente il preventivo #${numero}?`, async () => {
    await DB.deletePreventivo(id);
    await renderPreventivi();
    showToast('Preventivo eliminato', 'success');
  });
}

// ── Create / Edit form ───────────────────────────────
function showPrevListView()  { document.getElementById('prev-list-view').classList.remove('hidden'); document.getElementById('prev-form-view').classList.add('hidden'); }
function showPrevFormView()  { document.getElementById('prev-list-view').classList.add('hidden');    document.getElementById('prev-form-view').classList.remove('hidden'); }

function backToPreventivi() {
  showPrevListView();
  _editingPreventivoId = null;
  _preventivoVoci = [];
}

async function openNewPreventivo() {
  _editingPreventivoId = null;
  _preventivoVoci = [];
  document.getElementById('prev-form-title').textContent = 'Nuovo Preventivo';
  if (!_noteVociCache.length) await initNoteVoci();
  if (!_listinoCache.length) _listinoCache = await DB.getListino();
  clearPrevForm();
  refreshVociTable();
  showPrevFormView();
}

async function editPreventivo(id) {
  const p = await DB.getPreventivoById(id);
  if (!p) return;
  _editingPreventivoId = id;
  _preventivoVoci = (p.voci || []).map(v => ({ ...v }));
  document.getElementById('prev-form-title').textContent = `Modifica Preventivo #${p.numero}`;
  document.getElementById('pv-nome').value      = p.cliente?.nome      || '';
  document.getElementById('pv-azienda').value   = p.cliente?.azienda   || '';
  document.getElementById('pv-email').value     = p.cliente?.email     || '';
  document.getElementById('pv-telefono').value  = p.cliente?.telefono  || '';
  document.getElementById('pv-indirizzo').value = p.cliente?.indirizzo || '';
  document.getElementById('pv-citta').value     = p.cliente?.citta     || '';
  document.getElementById('pv-provincia').value        = p.cliente?.provincia        || '';
  document.getElementById('pv-piva').value             = p.cliente?.piva             || '';
  document.getElementById('pv-cf').value               = p.cliente?.cf               || '';
  document.getElementById('pv-sdi').value              = p.cliente?.sdi              || '';
  document.getElementById('pv-sede-indirizzo').value   = p.sedeLavoro?.indirizzo     || '';
  document.getElementById('pv-sede-citta').value       = p.sedeLavoro?.citta         || '';
  document.getElementById('pv-sede-provincia').value   = p.sedeLavoro?.provincia     || '';
  document.getElementById('pv-status').value           = p.status                    || 'bozza';
  document.getElementById('pv-iva').value        = String(p.ivaPct === 'esclusa' ? 'esclusa' : (p.ivaPct ?? 22));
  document.getElementById('pv-magg').value       = String(p.maggiorazione ?? 0);
  document.getElementById('pv-sconto').value     = String(p.sconto       ?? 0);
  if (!_noteVociCache.length) await initNoteVoci();
  refreshVociTable();
  recalcTotali();
  renderNoteChecklist(p.noteVoci || (p.note ? [p.note] : []));
  showPrevFormView();
}

function clearPrevForm() {
  ['pv-nome','pv-azienda','pv-email','pv-telefono','pv-indirizzo','pv-citta','pv-provincia',
   'pv-piva','pv-cf','pv-sdi',
   'pv-sede-indirizzo','pv-sede-citta','pv-sede-provincia'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('pv-status').value = 'bozza';
  document.getElementById('pv-iva').value    = '22';
  document.getElementById('pv-magg').value   = '0';
  document.getElementById('pv-sconto').value = '0';
  recalcTotali();
  renderNoteChecklist([]);
}

// ── Voci (line items) ────────────────────────────────
function refreshVociTable() {
  const tbody = document.getElementById('prev-voci-tbody');
  const empty = document.getElementById('prev-voci-empty');
  // rebuild datalist
  const dl = document.getElementById('dl-listino');
  dl.innerHTML = _listinoCache.map(li => `<option value="${escHtml(li.descrizione)}" data-id="${li.id}">`).join('');

  if (!_preventivoVoci.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    recalcTotali();
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = _preventivoVoci.map((v, i) => `
    <tr>
      <td>
        <input class="form-control prev-voce-input" list="dl-listino"
          value="${escHtml(v.descrizione || '')}"
          oninput="onVoceDescrChange(${i}, this.value)"
          onchange="onVoceDescrChange(${i}, this.value)"
          placeholder="Descrizione lavorazione...">
      </td>
      <td><span class="prev-cat-pill">${escHtml(v.categoria || '—')}</span></td>
      <td><input class="form-control" style="width:65px;text-align:center" value="${escHtml(v.unita || '')}" oninput="setVoce(${i},'unita',this.value)"></td>
      <td><input class="form-control" style="width:75px;text-align:right" type="number" min="0" step="0.01" value="${v.quantita || 1}" oninput="setVoce(${i},'quantita',parseFloat(this.value)||0);recalcTotali()"></td>
      <td><input class="form-control" style="width:100px;text-align:right" type="number" min="0" step="0.01" value="${v.prezzoUnitario || 0}" oninput="setVoce(${i},'prezzoUnitario',parseFloat(this.value)||0);recalcTotali()"></td>
      <td style="text-align:right;font-weight:600;padding-right:8px">${fmtEur((v.quantita||1)*(v.prezzoUnitario||0))}</td>
      <td><button class="btn btn-sm btn-danger-outline" type="button" onclick="removeVoce(${i})">✕</button></td>
    </tr>`).join('');
  recalcTotali();
}

async function addVoce() {
  // Assicura che il listino sia caricato prima di aggiungere la voce
  if (!_listinoCache.length) _listinoCache = await DB.getListino();
  _preventivoVoci.push({ descrizione: '', categoria: '', unita: 'cad', quantita: 1, prezzoUnitario: 0 });
  refreshVociTable();
  // focus last description input
  const rows = document.querySelectorAll('.prev-voce-input');
  if (rows.length) rows[rows.length - 1].focus();
}

function removeVoce(i) {
  _preventivoVoci.splice(i, 1);
  refreshVociTable();
}

function setVoce(i, field, value) {
  if (_preventivoVoci[i]) _preventivoVoci[i][field] = value;
}

function onVoceDescrChange(i, value) {
  _preventivoVoci[i].descrizione = value;

  // 1) Cerca prima tramite data-id dell'<option> selezionata nella datalist
  //    (bypassa qualsiasi problema di encoding/whitespace nel testo)
  const dl = document.getElementById('dl-listino');
  const selectedOpt = dl ? [...dl.options].find(o => o.value === value) : null;
  let match = null;
  if (selectedOpt) {
    const dataId = selectedOpt.getAttribute('data-id');
    match = _listinoCache.find(li => String(li.id) === String(dataId));
  }
  // 2) Fallback: confronto testo per digitazione manuale o edge case
  if (!match) {
    const v = value.trim();
    match = _listinoCache.find(li => li.descrizione.trim() === v);
  }

  if (match) {
    _preventivoVoci[i].categoria      = match.categoria;
    _preventivoVoci[i].unita          = match.unita;
    _preventivoVoci[i].prezzoUnitario = match.prezzoUnitario;
    refreshVociTable();
  }
}

function recalcTotali() {
  const base      = _preventivoVoci.reduce((s, v) => s + (v.quantita||1) * (v.prezzoUnitario||0), 0);
  const maggPct   = parseFloat(document.getElementById('pv-magg')?.value   || '0') || 0;
  const scontoPct = parseFloat(document.getElementById('pv-sconto')?.value || '0') || 0;
  const ivaVal    = document.getElementById('pv-iva')?.value || '22';
  const ivaEsclusa = ivaVal === 'esclusa';
  const ivaPct    = ivaEsclusa ? 0 : (parseInt(ivaVal) || 0);

  const conMagg    = base * (1 + maggPct / 100);
  const scontoAmt  = conMagg * scontoPct / 100;
  const imponibile = conMagg - scontoAmt;
  const ivaAmt     = imponibile * ivaPct / 100;
  const totale     = imponibile + ivaAmt;

  const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  setEl('pv-subtotale', fmtEur(base));
  const maggRow = document.getElementById('pv-magg-row');
  if (maggRow) maggRow.style.display = maggPct > 0 ? 'flex' : 'none';
  setEl('pv-magg-amt', '+' + fmtEur(conMagg - base) + ' (' + maggPct + '%)');
  const scontoRow = document.getElementById('pv-sconto-row');
  if (scontoRow) scontoRow.style.display = scontoPct > 0 ? 'flex' : 'none';
  setEl('pv-sconto-amt', '-' + fmtEur(scontoAmt) + ' (' + scontoPct + '%)');
  const impRow = document.getElementById('pv-imponibile-row');
  if (impRow) impRow.style.display = (maggPct > 0 || scontoPct > 0) ? 'flex' : 'none';
  setEl('pv-imponibile', fmtEur(imponibile));
  // Riga IVA: nascosta se esclusa
  const ivaSelectRow = document.getElementById('pv-iva')?.closest('.prev-totali-row');
  // Totale: se IVA esclusa mostra imponibile = totale
  setEl('pv-totale', fmtEur(totale));
  document.querySelectorAll('#prev-voci-tbody tr').forEach((row, i) => {
    const v = _preventivoVoci[i];
    if (v) { const cell = row.cells[5]; if (cell) cell.textContent = fmtEur((v.quantita||1)*(v.prezzoUnitario||0)); }
  });
}

async function savePreventivo(andPrint) {
  const nome     = document.getElementById('pv-nome').value.trim();
  const azienda  = document.getElementById('pv-azienda').value.trim();
  if (!nome || !azienda) { showToast('Inserisci nome e azienda del cliente', 'error'); return; }

  const base        = _preventivoVoci.reduce((s, v) => s + (v.quantita||1)*(v.prezzoUnitario||0), 0);
  const maggPct     = parseFloat(document.getElementById('pv-magg').value || '0') || 0;
  const scontoPct   = parseFloat(document.getElementById('pv-sconto').value || '0') || 0;
  const ivaVal      = document.getElementById('pv-iva').value || '22';
  const ivaEsclusa  = ivaVal === 'esclusa';
  const ivaPct      = ivaEsclusa ? 0 : (parseInt(ivaVal) || 0);
  const conMagg     = base * (1 + maggPct / 100);
  const scontoAmt   = conMagg * scontoPct / 100;
  const imponibile  = conMagg - scontoAmt;
  const totaleIvato = imponibile * (1 + ivaPct / 100);

  const data = {
    cliente: {
      nome:      nome,
      azienda:   azienda,
      email:     document.getElementById('pv-email').value.trim(),
      telefono:  document.getElementById('pv-telefono').value.trim(),
      indirizzo: document.getElementById('pv-indirizzo').value.trim(),
      citta:     document.getElementById('pv-citta').value.trim(),
      provincia: document.getElementById('pv-provincia').value.trim(),
      piva:      document.getElementById('pv-piva').value.trim(),
      cf:        document.getElementById('pv-cf').value.trim(),
      sdi:       document.getElementById('pv-sdi').value.trim(),
    },
    sedeLavoro: {
      indirizzo: document.getElementById('pv-sede-indirizzo').value.trim(),
      citta:     document.getElementById('pv-sede-citta').value.trim(),
      provincia: document.getElementById('pv-sede-provincia').value.trim(),
    },
    voci:          _preventivoVoci.map(v => ({ ...v })),
    maggiorazione: maggPct,
    sconto:        scontoPct,
    totaleBase:    base,
    totaleNetto:   imponibile,
    ivaPct:        ivaEsclusa ? 'esclusa' : ivaPct,
    totaleIvato:   totaleIvato,
    noteVoci:      getSelectedNoteTexts(),
    status:        document.getElementById('pv-status').value,
  };

  let saved;
  if (_editingPreventivoId) {
    saved = await DB.updatePreventivo(_editingPreventivoId, data);
  } else {
    saved = await DB.createPreventivo(data);
  }
  showToast('Preventivo salvato', 'success');

  if (andPrint) {
    printPreventivo(saved.id);
  }

  _editingPreventivoId = saved.id;
  document.getElementById('prev-form-title').textContent = `Modifica Preventivo #${saved.numero}`;
  _allPreventivi = await DB.getPreventivi();
}

// ── PDF Print ────────────────────────────────────────
async function printPreventivo(id) {
  const p    = await DB.getPreventivoById(id);
  const conf = await DB.getSettings();
  if (!p) return;

  const today = new Date().toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' });
  const maggF = 1 + (p.maggiorazione||0) / 100; // invisible inflation factor

  const voceRows = (p.voci || []).map((v, i) => {
    const prezzoInflated = (v.prezzoUnitario||0) * maggF;
    const totaleInflated = (v.quantita||1) * prezzoInflated;
    return `<tr>
      <td>${i+1}</td>
      <td>${escHtml(v.descrizione || '')}</td>
      <td style="text-align:center">${escHtml(v.unita || '')}</td>
      <td style="text-align:right">${Number(v.quantita||1).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      <td style="text-align:right">€ ${prezzoInflated.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      <td style="text-align:right;font-weight:600">€ ${totaleInflated.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
    </tr>`;
  }).join('');

  // totals visible to client
  const subtotalePDF = (p.totaleBase||0) * maggF;
  const scontoPct    = p.sconto || 0;
  const scontoAmt    = subtotalePDF * scontoPct / 100;
  const imponibile   = subtotalePDF - scontoAmt;
  const ivaEsclusa   = p.ivaPct === 'esclusa';
  const ivaPct       = ivaEsclusa ? 0 : (p.ivaPct ?? 22);
  const ivaAmt       = imponibile * ivaPct / 100;
  const totalePDF    = imponibile + ivaAmt;

  const fmt = n => '€ ' + Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
  const scontoRow = scontoPct > 0
    ? `<div class="pv-totali-row" style="color:#e53e3e"><span>Sconto ${scontoPct}%</span><span>-${fmt(scontoAmt)}</span></div>
       <div class="pv-totali-row"><span>Imponibile</span><span>${fmt(imponibile)}</span></div>`
    : '';

  // company info block for header
  const ghNome   = escHtml(conf.ragioneSociale || 'Greenhouse');
  const ghInfo   = [
    conf.piva   ? `P.IVA ${escHtml(conf.piva)}`  : '',
    conf.sito   ? escHtml(conf.sito)              : '',
    conf.email  ? escHtml(conf.email)             : '',
    conf.tel    ? `Tel. ${escHtml(conf.tel)}${conf.assistenza ? ' · ' + escHtml(conf.assistenza) : ''}` : '',
  ].filter(Boolean).join(' · ');

  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
  <title>Preventivo Greenhouse</title>
  <style>
    @page{size:A4;margin:0}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11pt;color:#1a1a1a;margin:0}
    .pv-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:2.5px solid #5a9e6f;margin-bottom:24px}
    .pv-logo{font-size:22pt;font-weight:800;color:#5a9e6f;letter-spacing:-0.5px;line-height:1}
    .pv-logo span{color:#1a1a1a}
    .pv-logo-sub{font-size:8.5pt;color:#666;margin-top:3px}
    .pv-logo-info{font-size:8pt;color:#888;margin-top:8px;line-height:1.6}
    .pv-meta{text-align:right;font-size:9.5pt;color:#555;line-height:1.9}
    .pv-section{margin-bottom:22px}
    .pv-section-title{font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#5a9e6f;margin-bottom:8px}
    .pv-client-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:10.5pt}
    .pv-client-grid label{font-size:8.5pt;color:#888;display:block;margin-bottom:1px}
    table{width:100%;border-collapse:collapse;font-size:10pt;table-layout:fixed}
    thead tr{background:#5a9e6f;color:#fff}
    thead th{padding:8px 10px;text-align:left;font-weight:600;font-size:9pt}
    thead th:nth-child(1){width:28px}
    thead th:nth-child(3){width:44px}
    thead th:nth-child(4){width:46px}
    thead th:nth-child(5){width:88px}
    thead th:nth-child(6){width:80px}
    tbody tr:nth-child(even){background:#f5faf6}
    tbody td{padding:7px 10px;border-bottom:1px solid #e8f0ea;vertical-align:top}
    tbody td:nth-child(3),tbody td:nth-child(4),tbody td:nth-child(5),tbody td:nth-child(6){white-space:nowrap}
    .pv-totali{margin-left:auto;width:280px;margin-top:18px;border:1.5px solid #e8f0ea;border-radius:8px;overflow:hidden}
    .pv-totali-row{display:flex;justify-content:space-between;padding:8px 14px;font-size:10.5pt;border-bottom:1px solid #e8f0ea}
    .pv-totali-finale{background:#5a9e6f;color:#fff;font-weight:700;font-size:12pt;padding:11px 14px;display:flex;justify-content:space-between}
    .pv-note{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;font-size:10pt;color:#444;white-space:pre-wrap}
    .pv-footer{margin-top:36px;padding-top:14px;border-top:1px solid #ddd;font-size:8pt;color:#999;text-align:center;line-height:1.7}
    .pv-print-bar{position:sticky;top:0;z-index:10;background:#f0faf4;border-bottom:2px solid #5a9e6f;padding:10px 40px;display:flex;align-items:center;justify-content:space-between}
    .pv-print-btn{background:#5a9e6f;color:#fff;border:none;padding:9px 22px;border-radius:8px;font-size:12pt;font-weight:700;cursor:pointer;font-family:inherit}
    .pv-print-btn:hover{background:#4a8a5f}
    @media print{.pv-print-bar{display:none}body{padding:1.2cm 1.5cm;max-width:100%}}
  </style></head><body>
  <div class="pv-print-bar">
    <span style="font-size:10.5pt;color:#2d6a4a;font-weight:600">Anteprima preventivo — verifica il documento prima di stampare</span>
    <button class="pv-print-btn" onclick="window.print()">🖨️ Stampa / Salva PDF</button>
  </div>
  <div style="padding:32px 40px;max-width:800px;margin:0 auto">
  <div class="pv-header">
    <div>
      <div class="pv-logo">Green<span>house</span></div>
      <div class="pv-logo-sub">Gestione e manutenzione del verde</div>
      ${ghInfo ? `<div class="pv-logo-info">${ghInfo}</div>` : ''}
    </div>
    <div class="pv-meta">
      <div style="font-size:14pt;font-weight:700;color:#1a1a1a;margin-bottom:4px">PREVENTIVO</div>
      <div>Data: <strong>${today}</strong></div>
    </div>
  </div>

  <div class="pv-section">
    <div class="pv-section-title">Dati Cliente</div>
    <div class="pv-client-grid">
      <div><label>Nome referente</label>${escHtml(p.cliente?.nome||'—')}</div>
      <div><label>Azienda / Ente</label><strong>${escHtml(p.cliente?.azienda||'—')}</strong></div>
      ${p.cliente?.email    ? `<div><label>Email</label>${escHtml(p.cliente.email)}</div>`    : ''}
      ${p.cliente?.telefono ? `<div><label>Telefono</label>${escHtml(p.cliente.telefono)}</div>` : ''}
      ${p.cliente?.indirizzo? `<div><label>Indirizzo</label>${escHtml(p.cliente.indirizzo)}</div>` : ''}
      ${p.cliente?.citta    ? `<div><label>Città</label>${escHtml(p.cliente.citta)}${p.cliente.provincia?' ('+p.cliente.provincia+')':''}</div>` : ''}
      ${p.cliente?.piva     ? `<div><label>Partita IVA</label>${escHtml(p.cliente.piva)}</div>` : ''}
      ${p.cliente?.cf       ? `<div><label>Codice Fiscale</label>${escHtml(p.cliente.cf)}</div>` : ''}
      ${p.cliente?.sdi      ? `<div><label>Codice SDI</label>${escHtml(p.cliente.sdi)}</div>` : ''}
    </div>
  </div>

  ${p.sedeLavoro?.indirizzo ? `
  <div class="pv-section">
    <div class="pv-section-title">Sede del Lavoro</div>
    <div style="font-size:10.5pt;line-height:1.7">
      <strong>${escHtml(p.sedeLavoro.indirizzo)}</strong>
      ${p.sedeLavoro.citta ? `<br>${escHtml(p.sedeLavoro.citta)}${p.sedeLavoro.provincia ? ' (' + escHtml(p.sedeLavoro.provincia) + ')' : ''}` : ''}
    </div>
  </div>` : ''}

  <div class="pv-section">
    <div class="pv-section-title">Voci di Preventivo</div>
    <table>
      <thead><tr><th>#</th><th>Descrizione</th><th style="text-align:center">U.M.</th><th style="text-align:right">Qtà</th><th style="text-align:right">Prezzo unit.</th><th style="text-align:right">Totale</th></tr></thead>
      <tbody>${voceRows}</tbody>
    </table>
    <div class="pv-totali">
      <div class="pv-totali-row"><span>Subtotale</span><span>${fmt(subtotalePDF)}</span></div>
      ${scontoRow}
      ${ivaEsclusa
        ? `<div class="pv-totali-row" style="color:#888;font-style:italic"><span>IVA</span><span>Esclusa</span></div>`
        : `<div class="pv-totali-row"><span>IVA ${ivaPct}%</span><span>${fmt(ivaAmt)}</span></div>`}
      <div class="pv-totali-finale"><span>TOTALE</span><span>${fmt(totalePDF)}</span></div>
    </div>
  </div>

  ${(() => {
    const voci = p.noteVoci?.length ? p.noteVoci : (p.note ? [p.note] : []);
    if (!voci.length) return '';
    return `<div class="pv-section">
      <div class="pv-section-title">Note e Condizioni</div>
      ${voci.map((n, i) => `<div class="pv-note"${i > 0 ? ' style="margin-top:6px"' : ''}>${escHtml(n)}</div>`).join('')}
    </div>`;
  })()}

  <div class="pv-footer">
    Preventivo informativo — non costituisce documento fiscale.<br>
    ${ghNome}${conf.piva ? ' · P.IVA ' + escHtml(conf.piva) : ''} · ${today}
  </div>
  </div>
  </body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener' });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ═══════════════════════════════════════════════════════
//  VOCI NOTE PREVENTIVO
// ═══════════════════════════════════════════════════════

let _noteVociCache = [];

async function initNoteVoci() {
  try { _noteVociCache = await DB.getNoteVoci(); }
  catch(e) { console.warn('initNoteVoci:', e); _noteVociCache = []; }
}

function loadNotaVoci() { return _noteVociCache; }

// ── Checklist nella form preventivo ──────────────────
function renderNoteChecklist(selectedTexts = []) {
  const voci      = loadNotaVoci();
  const checklist = document.getElementById('pv-note-checklist');
  const empty     = document.getElementById('pv-note-empty');
  if (!checklist) return;

  if (!voci.length) {
    checklist.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  checklist.innerHTML = voci.map(v => {
    const checked = selectedTexts.includes(v.text);
    return `
      <label class="nota-voce-check">
        <input type="checkbox" data-id="${v.id}" ${checked ? 'checked' : ''}>
        <span>${escHtml(v.text)}</span>
      </label>`;
  }).join('');
}

// Restituisce i testi delle voci selezionate
function getSelectedNoteTexts() {
  const voci    = loadNotaVoci();
  const checked = [...document.querySelectorAll('#pv-note-checklist input[type="checkbox"]:checked')];
  return checked.map(cb => {
    const v = voci.find(x => String(x.id) === cb.getAttribute('data-id'));
    return v ? v.text : null;
  }).filter(Boolean);
}

// ── Modal gestione voci ───────────────────────────────
function openNoteVociManager() {
  renderNoteVociList();
  const inp = document.getElementById('new-nota-voce-text');
  if (inp) inp.value = '';
  document.getElementById('modal-note-voci').classList.add('active');
}

function renderNoteVociList() {
  const voci = loadNotaVoci();
  const list = document.getElementById('note-voci-list');
  if (!list) return;
  if (!voci.length) {
    list.innerHTML = '<p style="font-size:13px;color:var(--g400);text-align:center;padding:24px 0">Nessuna voce. Aggiungine una qui sotto.</p>';
    return;
  }
  list.innerHTML = voci.map(v => `
    <div class="note-preset-item">
      <span class="note-preset-text">${escHtml(v.text)}</span>
      <button class="btn btn-sm btn-danger-outline" type="button" onclick="deleteNotaVoce(${v.id})" title="Elimina">✕</button>
    </div>`).join('');
}

async function addNotaVoce() {
  const text = document.getElementById('new-nota-voce-text')?.value.trim();
  if (!text) { showToast('Inserisci il testo della voce', 'error'); return; }
  try {
    const item = await DB.createNotaVoce(text);
    _noteVociCache.push(item);
    document.getElementById('new-nota-voce-text').value = '';
    renderNoteVociList();
    renderNoteChecklist(getSelectedNoteTexts());
    showToast('Voce aggiunta', 'success');
  } catch(e) {
    console.error(e);
    showToast('Errore nel salvataggio', 'error');
  }
}

async function deleteNotaVoce(id) {
  try {
    await DB.deleteNotaVoce(id);
    _noteVociCache = _noteVociCache.filter(v => String(v.id) !== String(id));
    renderNoteVociList();
    renderNoteChecklist(getSelectedNoteTexts());
  } catch(e) {
    console.error(e);
    showToast("Errore nell'eliminazione", 'error');
  }
}

// ── IMPOSTAZIONI AZIENDA ────────────────────────────
async function openSettings() {
  const s = await DB.getSettings();
  document.getElementById('set-ragione').value    = s.ragioneSociale || '';
  document.getElementById('set-piva').value       = s.piva           || '';
  document.getElementById('set-sito').value       = s.sito           || '';
  document.getElementById('set-email').value      = s.email          || '';
  document.getElementById('set-tel').value        = s.tel            || '';
  document.getElementById('set-assistenza').value = s.assistenza     || '';
  document.getElementById('modal-settings').classList.add('active');
}

async function doSaveSettings() {
  await DB.saveSettings({
    ragioneSociale: document.getElementById('set-ragione').value.trim(),
    piva:           document.getElementById('set-piva').value.trim(),
    sito:           document.getElementById('set-sito').value.trim(),
    email:          document.getElementById('set-email').value.trim(),
    tel:            document.getElementById('set-tel').value.trim(),
    assistenza:     document.getElementById('set-assistenza').value.trim(),
  });
  closeModal('modal-settings');
  showToast('Impostazioni salvate', 'success');
}

// ── LISTINO PREZZI ───────────────────────────────────
async function openListino() {
  _listinoCache = await DB.getListino();
  renderListinoBody(_listinoCache);
  document.getElementById('listino-search').value = '';
  document.getElementById('modal-listino').classList.add('active');
}

function filterListino() {
  const q = document.getElementById('listino-search').value.toLowerCase();
  const filtered = _listinoCache.filter(li =>
    li.descrizione.toLowerCase().includes(q) || li.categoria.toLowerCase().includes(q)
  );
  renderListinoBody(filtered);
}

function renderListinoBody(items) {
  const container = document.getElementById('listino-body');
  if (!items.length) { container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--g400)">Nessuna voce trovata.</div>'; return; }

  const grouped = {};
  items.forEach(li => { if (!grouped[li.categoria]) grouped[li.categoria] = []; grouped[li.categoria].push(li); });

  container.innerHTML = Object.entries(grouped).map(([cat, voci]) => `
    <div style="margin-bottom:20px">
      <div class="prev-cat-header">${escHtml(cat)}</div>
      <table class="users-table" style="font-size:13px">
        <thead><tr><th>Descrizione</th><th style="width:80px">U.M.</th><th style="width:110px">Prezzo</th><th style="width:80px">Azioni</th></tr></thead>
        <tbody>${voci.map(li => `
          <tr>
            <td>${escHtml(li.descrizione)}</td>
            <td>${escHtml(li.unita)}</td>
            <td><strong>€ ${Number(li.prezzoUnitario).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></td>
            <td>
              <button class="btn btn-sm btn-outline" onclick="openEditListinoItem('${li.id}')">✏️</button>
              <button class="btn btn-sm btn-danger-outline" onclick="confirmDeleteListinoItem('${li.id}')">🗑️</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');
}

function openAddListinoItem() {
  _editingListinoId = null;
  document.getElementById('listino-item-title').textContent = 'Nuova voce listino';
  document.getElementById('li-save-btn').textContent = 'Aggiungi voce';
  document.getElementById('form-listino-item').reset();
  document.getElementById('modal-listino-item').classList.add('active');
}

function openEditListinoItem(id) {
  const li = _listinoCache.find(x => x.id === id);
  if (!li) return;
  _editingListinoId = id;
  document.getElementById('listino-item-title').textContent = 'Modifica voce listino';
  document.getElementById('li-save-btn').textContent = 'Salva modifiche';
  document.getElementById('li-categoria').value   = li.categoria;
  document.getElementById('li-descrizione').value = li.descrizione;
  document.getElementById('li-unita').value       = li.unita;
  document.getElementById('li-prezzo').value      = li.prezzoUnitario;
  document.getElementById('modal-listino-item').classList.add('active');
}

function confirmDeleteListinoItem(id) {
  const li = _listinoCache.find(x => x.id === id);
  if (!li) return;
  showConfirm('Elimina voce', `Eliminare "${li.descrizione}" dal listino?`, async () => {
    await DB.deleteListinoItem(id);
    _listinoCache = await DB.getListino();
    filterListino();
    showToast('Voce eliminata', 'success');
  });
}

document.getElementById('form-listino-item')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const fields = {
    categoria:      document.getElementById('li-categoria').value,
    descrizione:    document.getElementById('li-descrizione').value.trim(),
    unita:          document.getElementById('li-unita').value,
    prezzoUnitario: parseFloat(document.getElementById('li-prezzo').value) || 0,
  };
  if (_editingListinoId) {
    await DB.updateListinoItem(_editingListinoId, fields);
    showToast('Voce aggiornata', 'success');
  } else {
    await DB.createListinoItem(fields);
    showToast('Voce aggiunta al listino', 'success');
  }
  _listinoCache = await DB.getListino();
  filterListino();
  closeModal('modal-listino-item');
  _editingListinoId = null;
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
const adminTutorialSteps = [
  { target: '#stat-totali',        title: 'Utenti totali',       content: 'Numero totale di utenti registrati sulla piattaforma.' },
  { target: '#stat-piani',         title: 'Piani attivi',        content: 'Quanti utenti hanno il piano di manutenzione attivo.' },
  { target: '#stat-sedi-tot',      title: 'Sedi totali',         content: 'Numero totale di sedi registrate da tutti gli utenti.' },
  { target: '#recent-users-list',  title: 'Ultimi utenti',       content: 'Utenti registrati più di recente. Clicca per aprire il profilo.' },
  { target: '#plans-summary',      title: 'Riepilogo piani',     content: 'Panoramica degli stati dei piani di tutti gli utenti.' },
  { target: '[data-sec="users"]',  title: 'Gestione Utenti',     content: 'Visualizza, aggiungi, modifica ed elimina gli account utente.' },
];

async function startAdminTutorial() {
  if (!document.getElementById('sec-dashboard').classList.contains('active')) await showSection('dashboard');
  setTimeout(() => new Tutorial(adminTutorialSteps).start(), 150);
}

// ═══════════════════════════════════════════════
// FATTURAZIONE
// ═══════════════════════════════════════════════
function ftBadge(status) {
  const map = { pagata:'badge-success', non_pagata:'badge-warning', scaduta:'badge-danger' };
  const labels = { pagata:'Pagata', non_pagata:'Non pagata', scaduta:'Scaduta' };
  return `<span class="badge ${map[status]||'badge-gray'}">${labels[status]||status}</span>`;
}

function calcFtTotale() {
  const imp = parseFloat(document.getElementById('ft-importo')?.value) || 0;
  const iva = parseFloat(document.getElementById('ft-iva')?.value) || 0;
  const tot = imp * (1 + iva/100);
  const el = document.getElementById('ft-totale-preview');
  if (el) el.textContent = fmtEur(tot);
}

async function renderFatture() {
  _allFatture = await DB.getFatture();
  filterFatture();
}

function filterFatture() {
  const q = (document.getElementById('ft-search')?.value||'').toLowerCase();
  const sf = document.getElementById('ft-status-filter')?.value||'';
  const list = _allFatture.filter(f =>
    (!sf || f.status===sf) &&
    (!q || (f.clienteNome||'').toLowerCase().includes(q) || (f.numero||'').toLowerCase().includes(q))
  ).sort((a,b) => new Date(b.data) - new Date(a.data));

  const tbody = document.getElementById('ft-tbody');
  const cards = document.getElementById('ft-cards');
  const empty = document.getElementById('ft-empty');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = ''; cards.innerHTML = '';
    empty.classList.remove('hidden'); return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = list.map(f => {
    const tot = (f.importo||0) * (1 + (f.iva||22)/100);
    return `<tr>
      <td><strong>${escHtml(f.numero||'')}</strong></td>
      <td>${escHtml(f.clienteNome||'—')}</td>
      <td>${formatDate(f.data)}</td>
      <td>${fmtEur(f.importo)}</td>
      <td>${f.iva||22}%</td>
      <td><strong>${fmtEur(tot)}</strong></td>
      <td>${ftBadge(f.status)}</td>
      <td style="white-space:nowrap">
        ${(f.fileData || f.filePath) ? `<button class="btn btn-sm btn-ghost" title="Anteprima" onclick="previewAdminFile('${f.id}','fattura')">👁️</button>
        <button class="btn btn-sm btn-ghost" title="Scarica" onclick="downloadAdminFile('${f.id}','fattura')">⬇️</button>` : ''}
        <button class="btn btn-sm btn-outline" onclick="editFattura('${f.id}')">✏️</button>
        <button class="btn btn-sm btn-danger-outline" onclick="confirmDeleteFattura('${f.id}','${escHtml(f.numero||'')}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  cards.innerHTML = list.map(f => {
    const tot = (f.importo||0) * (1 + (f.iva||22)/100);
    return `<div class="doc-card">
      <div class="doc-card-head">
        <div>
          <div class="doc-card-title">${escHtml(f.numero||'')} — ${escHtml(f.clienteNome||'—')}</div>
          <div class="doc-card-meta">${formatDate(f.data)} · Totale: <strong>${fmtEur(tot)}</strong></div>
        </div>
        ${ftBadge(f.status)}
      </div>
      <div class="doc-card-foot">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${(f.fileData || f.filePath) ? `<button class="btn btn-sm btn-ghost" onclick="previewAdminFile('${f.id}','fattura')">👁️ Anteprima</button>
          <button class="btn btn-sm btn-ghost" onclick="downloadAdminFile('${f.id}','fattura')">⬇️ Scarica</button>` : ''}
          <button class="btn btn-sm btn-outline" onclick="editFattura('${f.id}')">✏️ Modifica</button>
          <button class="btn btn-sm btn-danger-outline" onclick="confirmDeleteFattura('${f.id}','${escHtml(f.numero||'')}')">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function openNewFattura() {
  _editingFatturaId = null;
  document.getElementById('fattura-modal-title').textContent = 'Nuova Fattura';
  document.getElementById('form-fattura').reset();
  const num = _localDB._nextFtNum();
  document.getElementById('ft-numero').value = num;
  document.getElementById('ft-data').value = new Date().toISOString().split('T')[0];
  document.getElementById('ft-file-name').textContent = '';
  document.getElementById('ft-totale-preview').textContent = '€ 0,00';
  openModal('modal-fattura');
}

async function editFattura(id) {
  const f = await DB.getFatturaById(id);
  if (!f) return;
  _editingFatturaId = id;
  document.getElementById('fattura-modal-title').textContent = 'Modifica Fattura';
  document.getElementById('ft-numero').value = f.numero||'';
  document.getElementById('ft-data').value = f.data||'';
  document.getElementById('ft-cliente').value = f.clienteNome||'';
  document.getElementById('ft-importo').value = f.importo||'';
  document.getElementById('ft-iva').value = f.iva||22;
  document.getElementById('ft-status').value = f.status||'non_pagata';
  document.getElementById('ft-descrizione').value = f.descrizione||'';
  document.getElementById('ft-note').value = f.note||'';
  document.getElementById('ft-file-name').textContent = f.fileName ? `📎 ${f.fileName}` : '';
  calcFtTotale();
  openModal('modal-fattura');
}

document.getElementById('form-fattura').addEventListener('submit', async e => {
  e.preventDefault();
  const fileInput = document.getElementById('ft-file');
  let fileData = null, filePath = null, fileName = '', fileType = '';
  if (_editingFatturaId) {
    const existing = await DB.getFatturaById(_editingFatturaId);
    fileData = existing?.fileData || null;
    filePath = existing?.filePath || null;
    fileName = existing?.fileName || '';
    fileType = existing?.fileType || '';
  }
  if (fileInput.files[0]) {
    fileName = fileInput.files[0].name;
    fileType = fileInput.files[0].type;
    if (USE_LOCAL) {
      try {
        const result = await readFileAsBase64(fileInput.files[0]);
        fileData = result.data;
      } catch(err) { showToast('File troppo grande (max 2MB)', 'error'); return; }
    } else {
      try {
        if (filePath) await DB.deleteFile('fatture', filePath);
        filePath = await DB.uploadFile('fatture', fileInput.files[0]);
      } catch(err) { showToast('Errore caricamento: ' + err.message, 'error'); return; }
    }
  }
  const imp = parseFloat(document.getElementById('ft-importo').value)||0;
  const iva = parseFloat(document.getElementById('ft-iva').value)||22;
  const payload = {
    numero: document.getElementById('ft-numero').value.trim(),
    clienteNome: document.getElementById('ft-cliente').value.trim(),
    data: document.getElementById('ft-data').value,
    importo: imp, iva, totale: imp*(1+iva/100),
    status: document.getElementById('ft-status').value,
    descrizione: document.getElementById('ft-descrizione').value.trim(),
    note: document.getElementById('ft-note').value.trim(),
    fileData, filePath, fileName, fileType
  };
  try {
    if (_editingFatturaId) { await DB.updateFattura(_editingFatturaId, payload); showToast('Fattura aggiornata','success'); }
    else { await DB.createFattura(payload); showToast('Fattura creata','success'); }
  } catch(err) { showToast('Errore: ' + err.message, 'error'); return; }
  closeModal('modal-fattura');
  await renderFatture();
});

function confirmDeleteFattura(id, numero) {
  showConfirm('Elimina fattura', `Eliminare la fattura ${numero}?`, async () => {
    await DB.deleteFattura(id);
    await renderFatture();
    showToast('Fattura eliminata','success');
  });
}

// ═══════════════════════════════════════════════
// DOCUMENTAZIONE
// ═══════════════════════════════════════════════
const DOC_TIPO_LABELS = { rspp:'RSPP', certificazione:'Certificazione', spesa:'Spesa detraibile', permesso:'Permesso', altro:'Altro' };
const DOC_TIPO_COLORS = { rspp:'badge-danger', certificazione:'badge-info', spesa:'badge-success', permesso:'badge-warning', altro:'badge-gray' };

async function renderDocs() {
  _allAdminDocs = await DB.getAdminDocs();
  filterDocs();
}

function filterDocs() {
  const q = (document.getElementById('doc-search')?.value||'').toLowerCase();
  const tf = document.getElementById('doc-tipo-filter')?.value||'';
  const list = _allAdminDocs.filter(d =>
    (!tf || d.tipo===tf) &&
    (!q || (d.note||'').toLowerCase().includes(q) || (d.fileName||'').toLowerCase().includes(q))
  );
  const container = document.getElementById('doc-list');
  const empty = document.getElementById('doc-empty');
  if (!container) return;
  if (!list.length) { container.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  container.innerHTML = list.map(d => `
    <div class="doc-record-card">
      <div class="doc-record-head">
        <div class="doc-record-left">
          <span class="badge ${DOC_TIPO_COLORS[d.tipo]||'badge-gray'}">${DOC_TIPO_LABELS[d.tipo]||d.tipo}</span>
          <span class="doc-record-date">📅 ${formatDate(d.data)}</span>
        </div>
        <div class="doc-record-actions">
          ${(d.fileData || d.filePath) ? `<button class="btn btn-sm btn-ghost" title="Anteprima" onclick="previewAdminFile('${d.id}','doc')">👁️</button>
          <button class="btn btn-sm btn-ghost" title="Scarica" onclick="downloadAdminFile('${d.id}','doc')">⬇️</button>` : ''}
          <button class="btn btn-sm btn-outline" onclick="editDoc('${d.id}')">✏️</button>
          <button class="btn btn-sm btn-danger-outline" onclick="confirmDeleteDoc('${d.id}')">🗑️</button>
        </div>
      </div>
      ${d.fileName ? `<div class="doc-record-file">📎 ${escHtml(d.fileName)}</div>` : ''}
      ${d.note ? `<div class="doc-record-note">${escHtml(d.note)}</div>` : ''}
    </div>`).join('');
}

function openNewDoc() {
  _editingDocId = null;
  document.getElementById('doc-modal-title').textContent = 'Nuovo Documento';
  document.getElementById('form-documento').reset();
  document.getElementById('doc-data').value = new Date().toISOString().split('T')[0];
  document.getElementById('doc-file-name').textContent = '';
  openModal('modal-documento');
}

async function editDoc(id) {
  const d = await DB.getAdminDocById(id);
  if (!d) return;
  _editingDocId = id;
  document.getElementById('doc-modal-title').textContent = 'Modifica Documento';
  document.getElementById('doc-tipo').value = d.tipo||'';
  document.getElementById('doc-data').value = d.data||'';
  document.getElementById('doc-note').value = d.note||'';
  document.getElementById('doc-file-name').textContent = d.fileName ? `📎 ${d.fileName}` : '';
  openModal('modal-documento');
}

document.getElementById('form-documento').addEventListener('submit', async e => {
  e.preventDefault();
  const fileInput = document.getElementById('doc-file');
  let fileData = null, filePath = null, fileName = '', fileType = '';
  if (_editingDocId) {
    const existing = await DB.getAdminDocById(_editingDocId);
    fileData = existing?.fileData || null;
    filePath = existing?.filePath || null;
    fileName = existing?.fileName || '';
    fileType = existing?.fileType || '';
  }
  if (fileInput.files[0]) {
    fileName = fileInput.files[0].name;
    fileType = fileInput.files[0].type;
    if (USE_LOCAL) {
      try {
        const result = await readFileAsBase64(fileInput.files[0]);
        fileData = result.data;
      } catch(err) { showToast('File troppo grande (max 2MB)','error'); return; }
    } else {
      try {
        if (filePath) await DB.deleteFile('documenti', filePath);
        filePath = await DB.uploadFile('documenti', fileInput.files[0]);
      } catch(err) { showToast('Errore caricamento: ' + err.message,'error'); return; }
    }
  }
  if (!_editingDocId && !fileData && !filePath) { showToast('Carica un file documento','error'); return; }
  const payload = {
    tipo: document.getElementById('doc-tipo').value,
    data: document.getElementById('doc-data').value,
    note: document.getElementById('doc-note').value.trim(),
    fileData, filePath, fileName, fileType
  };
  try {
    if (_editingDocId) { await DB.updateAdminDoc(_editingDocId, payload); showToast('Documento aggiornato','success'); }
    else { await DB.createAdminDoc(payload); showToast('Documento salvato','success'); }
  } catch(err) { showToast('Errore: ' + err.message, 'error'); return; }
  closeModal('modal-documento');
  await renderDocs();
});

function confirmDeleteDoc(id) {
  showConfirm('Elimina documento', 'Eliminare definitivamente questo documento?', async () => {
    await DB.deleteAdminDoc(id);
    await renderDocs();
    showToast('Documento eliminato','success');
  });
}

// ═══════════════════════════════════════════════
// FILE UTILITIES (condivise)
// ═══════════════════════════════════════════════
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 2 * 1024 * 1024) { reject(new Error('File > 2MB')); return; }
    const reader = new FileReader();
    reader.onload = e => resolve({ data: e.target.result, name: file.name, type: file.type });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function _base64ToBlob(dataURL) {
  const arr = dataURL.split(','); const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]); let n = bstr.length; const u8 = new Uint8Array(n);
  while(n--) u8[n] = bstr.charCodeAt(n);
  return new Blob([u8], { type: mime });
}

async function previewAdminFile(id, type) {
  const record = type==='fattura' ? await DB.getFatturaById(id) : await DB.getAdminDocById(id);
  if (!record) { showToast('Record non trovato','error'); return; }
  let url;
  if (record.filePath) {
    const bucket = type === 'fattura' ? 'fatture' : 'documenti';
    url = DB.getFileUrl(bucket, record.filePath);
    if (!url) { showToast('URL file non disponibile','error'); return; }
  } else if (record.fileData) {
    const blob = _base64ToBlob(record.fileData);
    url = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else {
    showToast('Nessun file allegato','error'); return;
  }
  const a = Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener' });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function downloadAdminFile(id, type) {
  const record = type==='fattura' ? await DB.getFatturaById(id) : await DB.getAdminDocById(id);
  if (!record) { showToast('Record non trovato','error'); return; }
  let url;
  if (record.filePath) {
    const bucket = type === 'fattura' ? 'fatture' : 'documenti';
    url = DB.getFileUrl(bucket, record.filePath);
    if (!url) { showToast('URL file non disponibile','error'); return; }
  } else if (record.fileData) {
    const blob = _base64ToBlob(record.fileData);
    url = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else {
    showToast('Nessun file allegato','error'); return;
  }
  const a = Object.assign(document.createElement('a'), { href: url, download: record.fileName||'documento' });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ═══════════════════════════════════════════════════════
//  CALENDARIO DISPONIBILITÀ SOCI
// ═══════════════════════════════════════════════════════

const CAL_DEFAULT_USERS = [
  { id: 'cal_lorenzo',  name: 'Lorenzo',  color: '#5a9e6f', slots: [] },
  { id: 'cal_sascha',   name: 'Sascha',   color: '#3b82f6', slots: [] },
  { id: 'cal_emmanuel', name: 'Emmanuel', color: '#f59e0b', slots: [] },
];
const CAL_MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                       'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const CAL_DAYS_IT   = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
const CAL_DAYS_SHORT = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
const CAL_HOURS     = [8,9,10,11,12,13,14,15,16,17,18,19];

let _calUsers        = [];
let _calSelectedUser = null;
let _calSelectedDay  = null;
let _calCurrentYear  = new Date().getFullYear();
let _calCurrentMonth = new Date().getMonth(); // 0-indexed
let _calInited       = false;

// ── Carica da Supabase / localStorage ────────────────
async function calLoad() {
  try {
    const data = await DB.getCalUsers();
    if (data && data.length > 0) {
      _calUsers = data;
    } else if (data === null) {
      _calUsers = JSON.parse(JSON.stringify(CAL_DEFAULT_USERS));
    } else {
      _calUsers = JSON.parse(JSON.stringify(CAL_DEFAULT_USERS));
      for (const u of _calUsers) await DB.upsertCalUser(u);
    }
  } catch(e) {
    console.warn('calLoad error', e);
    _calUsers = JSON.parse(JSON.stringify(CAL_DEFAULT_USERS));
  }
}

function calSaveLocal() {
  const slots = {};
  _calUsers.forEach(u => { slots[u.id] = u.slots || []; });
  localStorage.setItem('gh_cal_data', JSON.stringify({ users: _calUsers, slots }));
}

// ── Init ──────────────────────────────────────────────
async function initCalendario() {
  document.getElementById('cal-users-list').innerHTML =
    '<p style="font-size:13px;color:var(--g400);padding:6px 4px">Caricamento…</p>';
  await calLoad();
  renderCalUsers();
  if (_calSelectedUser) {
    const user = _calUsers.find(u => u.id === _calSelectedUser);
    if (user) { renderCalendar(user); return; }
    _calSelectedUser = null;
  }
  document.getElementById('cal-empty-state').style.display = '';
  document.getElementById('cal-view').classList.add('hidden');

  if (!_calInited) {
    _calInited = true;
    document.getElementById('form-cal-user').addEventListener('submit', async function(e) {
      e.preventDefault();
      const name  = document.getElementById('cal-u-nome').value.trim();
      const color = document.querySelector('input[name="cal-color"]:checked')?.value || '#5a9e6f';
      if (!name) return;
      const newUser = { id: 'cal_' + Date.now(), name, color, slots: [] };
      try {
        await DB.upsertCalUser(newUser);
        _calUsers.push(newUser);
        calSaveLocal();
        renderCalUsers();
        closeModal('modal-cal-user');
        selectCalUser(newUser.id);
      } catch(e) { showToast('Errore nel salvataggio', 'error'); }
    });
  }
}

// ── Render lista soci ─────────────────────────────────
function renderCalUsers() {
  const list = document.getElementById('cal-users-list');
  if (!list) return;
  if (!_calUsers.length) {
    list.innerHTML = '<p style="font-size:13px;color:var(--g400);padding:6px 4px">Nessun socio.</p>';
    return;
  }
  list.innerHTML = _calUsers.map(u => {
    const blockedCount = (u.slots || []).length;
    return `
    <div class="cal-user-card ${_calSelectedUser === u.id ? 'active' : ''}" onclick="selectCalUser('${u.id}')">
      <div class="cal-user-avatar" style="background:${u.color}">${u.name.charAt(0).toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div class="cal-user-name">${u.name}</div>
        ${blockedCount > 0 ? `<div style="font-size:11px;color:var(--g400)">${blockedCount} slot bloccati</div>` : ''}
      </div>
      <button class="cal-del-btn" onclick="event.stopPropagation();confirmDeleteCalUser('${u.id}')" title="Elimina">🗑</button>
    </div>`;
  }).join('');
}

// ── Seleziona socio ───────────────────────────────────
function selectCalUser(userId) {
  _calSelectedUser = userId;
  _calSelectedDay  = null;
  const user = _calUsers.find(u => u.id === userId);
  if (!user) return;
  renderCalUsers();
  renderCalendar(user);
}

// ── Render calendario (header + mese + chiude day panel) ─
function renderCalendar(user) {
  document.getElementById('cal-empty-state').style.display = 'none';
  document.getElementById('cal-view').classList.remove('hidden');

  // Header socio
  const blockedCount = (user.slots || []).length;
  document.getElementById('cal-user-header').innerHTML = `
    <div class="cal-user-header-avatar" style="background:${user.color}">${user.name.charAt(0).toUpperCase()}</div>
    <div>
      <div class="cal-user-header-name">${user.name}</div>
      <div class="cal-user-header-sub">
        ${blockedCount > 0
          ? `<span style="color:${user.color};font-weight:600">${blockedCount}</span> slot non disponibili`
          : 'Nessuno slot bloccato'}
        · Clicca un giorno per modificare
      </div>
    </div>`;

  // Legenda
  const lb = document.getElementById('cal-legend-blocked');
  if (lb) lb.innerHTML = `<div class="cal-legend-dot" style="background:${user.color}"></div><span>Non disponibile</span>`;

  renderCalMonthNav(user);
  renderCalMonthGrid(user);
  if (_calSelectedDay) renderCalDayPanel(user, _calSelectedDay);
  else document.getElementById('cal-day-panel').classList.add('hidden');
}

// ── Navigazione mese ──────────────────────────────────
function renderCalMonthNav(user) {
  const nav = document.getElementById('cal-month-nav');
  if (!nav) return;
  nav.innerHTML = `
    <button class="cal-nav-btn" onclick="calChangeMonth('${user.id}',-1)">‹</button>
    <span class="cal-month-label">${CAL_MONTHS_IT[_calCurrentMonth]} ${_calCurrentYear}</span>
    <button class="cal-nav-btn" onclick="calChangeMonth('${user.id}',1)">›</button>`;
}

function calChangeMonth(userId, delta) {
  _calCurrentMonth += delta;
  if (_calCurrentMonth > 11) { _calCurrentMonth = 0; _calCurrentYear++; }
  if (_calCurrentMonth < 0)  { _calCurrentMonth = 11; _calCurrentYear--; }
  _calSelectedDay = null;
  const user = _calUsers.find(u => u.id === userId);
  if (user) { renderCalMonthNav(user); renderCalMonthGrid(user); document.getElementById('cal-day-panel').classList.add('hidden'); }
}

// ── Griglia mensile ───────────────────────────────────
function renderCalMonthGrid(user) {
  const grid = document.getElementById('cal-month-grid');
  if (!grid) return;

  const slots    = user.slots || [];
  const slotsSet = new Set(slots);

  const today    = new Date();
  const todayStr = _calDateStr(today.getFullYear(), today.getMonth() + 1, today.getDate());

  // Primo giorno del mese e quanti giorni
  const firstDate = new Date(_calCurrentYear, _calCurrentMonth, 1);
  const daysInMonth = new Date(_calCurrentYear, _calCurrentMonth + 1, 0).getDate();

  // Offset: lunedì = 0 (JS: dom=0 → lun=1)
  let startDow = firstDate.getDay(); // 0=dom
  startDow = startDow === 0 ? 6 : startDow - 1; // converti in lun=0..dom=6

  let html = '';

  // Header giorni
  CAL_DAYS_SHORT.forEach(d => { html += `<div class="cal-month-hdr">${d}</div>`; });

  // Celle vuote prima del 1°
  for (let i = 0; i < startDow; i++) html += '<div class="cal-month-cell empty"></div>';

  // Giorni
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr  = _calDateStr(_calCurrentYear, _calCurrentMonth + 1, d);
    const isToday  = dateStr === todayStr;
    const isSel    = dateStr === _calSelectedDay;
    const isPast   = dateStr < todayStr;

    // Mini indicatori orari
    const miniSlots = CAL_HOURS.map(h => {
      const key       = `${dateStr}-${String(h).padStart(2,'0')}`;
      const isBlocked = slotsSet.has(key);
      return `<div class="cal-mini-slot" style="${isBlocked ? `background:${user.color}` : ''}"></div>`;
    }).join('');

    const classes = ['cal-month-cell',
      isToday ? 'today' : '',
      isSel   ? 'selected' : '',
      isPast  ? 'past' : ''
    ].filter(Boolean).join(' ');

    html += `
      <div class="${classes}" onclick="openCalDay('${user.id}','${dateStr}')">
        <div class="cal-day-num">${d}</div>
        <div class="cal-mini-slots">${miniSlots}</div>
      </div>`;
  }

  grid.innerHTML = html;
}

// Helpers
function _calDateStr(y, m, d) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function _calNiceDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${CAL_DAYS_IT[dow]} ${d} ${CAL_MONTHS_IT[m-1]} ${y}`;
}

// ── Apri pannello giorno ──────────────────────────────
function openCalDay(userId, dateStr) {
  const user = _calUsers.find(u => u.id === userId);
  if (!user) return;
  _calSelectedDay = dateStr;
  renderCalMonthGrid(user); // aggiorna selezione nella griglia
  renderCalDayPanel(user, dateStr);
}

function renderCalDayPanel(user, dateStr) {
  const panel = document.getElementById('cal-day-panel');
  panel.classList.remove('hidden');

  const slots    = user.slots || [];
  const slotsSet = new Set(slots);

  document.getElementById('cal-day-panel-header').innerHTML = `
    <span style="font-weight:700;font-size:14px">📅 ${_calNiceDate(dateStr)}</span>
    <button class="btn btn-ghost btn-sm" onclick="closeCalDayPanel('${user.id}')">✕ Chiudi</button>`;

  document.getElementById('cal-day-slots').innerHTML = CAL_HOURS.map(h => {
    const key       = `${dateStr}-${String(h).padStart(2,'0')}`;
    const isBlocked = slotsSet.has(key);
    const bg        = isBlocked ? `background:${user.color};color:#fff;border-color:transparent;` : '';
    return `
      <div class="cal-hour-slot${isBlocked ? ' blocked' : ''}" style="${bg}"
           onclick="toggleCalSlotKey('${user.id}','${key}','${dateStr}')">
        <span class="cal-hour-label">${String(h).padStart(2,'0')}:00 – ${String(h+1).padStart(2,'00')}:00</span>
        <span class="cal-hour-status">${isBlocked ? '🔴 Non disponibile' : '🟢 Disponibile'}</span>
      </div>`;
  }).join('');

  // Scroll al pannello
  setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
}

function closeCalDayPanel(userId) {
  _calSelectedDay = null;
  document.getElementById('cal-day-panel').classList.add('hidden');
  const user = _calUsers.find(u => u.id === userId);
  if (user) renderCalMonthGrid(user);
}

// ── Toggle slot per chiave data-ora ──────────────────
async function toggleCalSlotKey(userId, key, dateStr) {
  const user = _calUsers.find(u => u.id === userId);
  if (!user) return;
  if (!user.slots) user.slots = [];
  const idx = user.slots.indexOf(key);
  if (idx === -1) { user.slots.push(key); } else { user.slots.splice(idx, 1); }

  // Ottimistic UI
  renderCalDayPanel(user, dateStr);
  renderCalMonthGrid(user);
  renderCalUsers();

  // Salva
  try {
    await DB.updateCalSlots(userId, user.slots);
    calSaveLocal();
  } catch(e) {
    console.warn('toggleCalSlotKey error', e);
    showToast('Errore nel salvataggio slot', 'error');
  }
}

// ── Aggiungi socio ────────────────────────────────────
function openAddCalUser() {
  const n = document.getElementById('cal-u-nome');
  if (n) n.value = '';
  const r = document.querySelector('input[name="cal-color"]');
  if (r) r.checked = true;
  document.getElementById('modal-cal-user').classList.add('active');
}

// ── Elimina socio ─────────────────────────────────────
function confirmDeleteCalUser(userId) {
  const user = _calUsers.find(u => u.id === userId);
  if (!user) return;
  showConfirm(
    `Elimina ${user.name}`,
    `Vuoi eliminare ${user.name}? Tutti i suoi slot verranno persi.`,
    () => deleteCalUser(userId)
  );
}
async function deleteCalUser(userId) {
  try {
    await DB.deleteCalUserById(userId);
    _calUsers = _calUsers.filter(u => u.id !== userId);
    calSaveLocal();
    if (_calSelectedUser === userId) {
      _calSelectedUser = null;
      _calSelectedDay  = null;
      document.getElementById('cal-empty-state').style.display = '';
      document.getElementById('cal-view').classList.add('hidden');
    }
    renderCalUsers();
  } catch(e) { showToast("Errore durante l'eliminazione", 'error'); }
}


// ═══════════════════════════════════════════════════════════
//  CONTABILITÀ
// ═══════════════════════════════════════════════════════════

let _contAnno        = new Date().getFullYear();
let _allSpese        = [];
let _allGuadagni     = [];
let _contAliquote    = [];     // array { nome, da, a (null=illimitato), pct }
let _editingSpesaId  = null;
let _spNewFile       = null;   // File object da caricare
let _spExistingPath  = null;   // path allegato già salvato
let _contActiveTab   = 'mensile';

const MESI_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                 'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

// ── Render principale ────────────────────────────────────
async function renderContabilita() {
  document.getElementById('cont-anno-label').textContent = _contAnno;
  const settings = await DB.getSettings();
  _contAliquote  = settings.aliquoteFiscali || [];
  [_allSpese, _allGuadagni] = await Promise.all([
    DB.getSpese(_contAnno),
    DB.getGuadagniAnno(_contAnno)
  ]);
  const months  = _buildContMonths();
  const annual  = _buildAnnualTotals(months);
  _renderContKPI(annual);
  _renderContTax(annual);
  _renderContMensile(months, annual);
  renderContSpese();
  switchContTab(_contActiveTab);
}

function contCambiaAnno(delta) {
  _contAnno += delta;
  renderContabilita();
}

function switchContTab(tab) {
  _contActiveTab = tab;
  document.querySelectorAll('.cont-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('cont-tab-mensile').style.display = tab === 'mensile' ? '' : 'none';
  document.getElementById('cont-tab-spese').style.display   = tab === 'spese'   ? '' : 'none';
}

// ── Calcolo mesi ────────────────────────────────────────
function _buildContMonths() {
  const months = MESI_IT.map((nome, i) => ({
    idx: i, nome,
    entrate: 0, ivaRiscossa: 0, preventivi: [],
    spese: 0, speseDeducibili: 0, ivaRecuperabile: 0, speseList: []
  }));

  for (const p of _allGuadagni) {
    const dt = new Date(p.createdAt || p.created_at || Date.now());
    if (isNaN(dt) || dt.getFullYear() !== _contAnno) continue;
    const m          = dt.getMonth();
    const imponibile = +(p.totaleNetto  || 0);
    const totaleIv   = +(p.totaleIvato  || 0);
    const ivaRisc    = p.ivaPct === 'esclusa' ? 0 : Math.max(0, totaleIv - imponibile);
    months[m].entrate    += imponibile;
    months[m].ivaRiscossa+= ivaRisc;
    months[m].preventivi.push(p);
  }

  for (const s of _allSpese) {
    const dt = new Date(s.data + 'T12:00:00');
    if (isNaN(dt)) continue;
    const m = dt.getMonth();
    months[m].spese           += +(s.importo              || 0);
    months[m].speseDeducibili += +(s.importo              || 0) * +(s.deducibilita_pct     || 0) / 100;
    months[m].ivaRecuperabile += +(s.iva_importo          || 0) * +(s.detraibilita_iva_pct || 0) / 100;
    months[m].speseList.push(s);
  }
  return months;
}

function _buildAnnualTotals(months) {
  const t = months.reduce((a, m) => ({
    entrate:          a.entrate          + m.entrate,
    ivaRiscossa:      a.ivaRiscossa      + m.ivaRiscossa,
    spese:            a.spese            + m.spese,
    speseDeducibili:  a.speseDeducibili  + m.speseDeducibili,
    ivaRecuperabile:  a.ivaRecuperabile  + m.ivaRecuperabile,
  }), { entrate:0, ivaRiscossa:0, spese:0, speseDeducibili:0, ivaRecuperabile:0 });

  const base         = Math.max(0, t.entrate - t.speseDeducibili);
  const tasse        = _calcolaTasse(base, _contAliquote);
  const ivaDaVersare = Math.max(0, t.ivaRiscossa - t.ivaRecuperabile);
  const utileNetto   = t.entrate - t.spese - tasse;
  return { ...t, base, tasse, ivaDaVersare, utileNetto };
}

function _calcolaTasse(base, aliquote) {
  if (!aliquote?.length || base <= 0) return 0;
  const sorted = [...aliquote].sort((a, b) => (a.da || 0) - (b.da || 0));
  let tasse = 0;
  for (const sc of sorted) {
    const da = sc.da || 0;
    if (base <= da) break;
    const limit   = sc.a != null ? sc.a : Infinity;
    const taxable = Math.min(base, limit) - da;
    tasse += Math.max(0, taxable) * (sc.pct || 0) / 100;
  }
  return tasse;
}

// ── KPI Cards ────────────────────────────────────────────
function _renderContKPI(a) {
  const fmt = v => v.toLocaleString('it-IT', { style:'currency', currency:'EUR', maximumFractionDigits:2 });
  const noTax = !_contAliquote.length;
  document.getElementById('cont-kpi').innerHTML = `
    <div class="cont-kpi-card green">
      <div class="cont-kpi-label">💰 Fatturato Lordo</div>
      <div class="cont-kpi-value">${fmt(a.entrate)}</div>
      <div class="cont-kpi-sub">Imponibile preventivi accettati</div>
    </div>
    <div class="cont-kpi-card blue">
      <div class="cont-kpi-label">📊 IVA Riscossa</div>
      <div class="cont-kpi-value">${fmt(a.ivaRiscossa)}</div>
      <div class="cont-kpi-sub">Da versare allo Stato (al netto IVA rec.)</div>
    </div>
    <div class="cont-kpi-card red">
      <div class="cont-kpi-label">📉 Spese Totali</div>
      <div class="cont-kpi-value">${fmt(a.spese)}</div>
      <div class="cont-kpi-sub">Deducibili: ${fmt(a.speseDeducibili)}</div>
    </div>
    <div class="cont-kpi-card orange">
      <div class="cont-kpi-label">🏦 Tasse Stimate</div>
      <div class="cont-kpi-value ${noTax ? '' : ''}">${noTax ? '—' : fmt(a.tasse)}</div>
      <div class="cont-kpi-sub">${noTax ? 'Configura le aliquote' : 'Su base imponibile ' + fmt(a.base)}</div>
    </div>
    <div class="cont-kpi-card teal">
      <div class="cont-kpi-label">💳 IVA da Versare</div>
      <div class="cont-kpi-value">${fmt(a.ivaDaVersare)}</div>
      <div class="cont-kpi-sub">IVA rec. acquisti: ${fmt(a.ivaRecuperabile)}</div>
    </div>
    <div class="cont-kpi-card purple">
      <div class="cont-kpi-label">📈 Utile Netto Stimato</div>
      <div class="cont-kpi-value ${a.utileNetto < 0 ? 'negative' : 'positive'}">${fmt(a.utileNetto)}</div>
      <div class="cont-kpi-sub">${noTax ? 'Configura aliquote per il calcolo' : 'Fatturato − Spese − Tasse'}</div>
    </div>`;
}

// ── Tax Breakdown ─────────────────────────────────────────
function _renderContTax(a) {
  const el = document.getElementById('cont-tax-breakdown');
  const fmt = v => v.toLocaleString('it-IT', { style:'currency', currency:'EUR', maximumFractionDigits:2 });
  if (!_contAliquote.length) {
    el.innerHTML = `
      <div class="cont-tax-card">
        <div class="cont-tax-title">🏦 Calcolo Tasse</div>
        <p class="cont-tax-empty">
          Nessuna aliquota configurata.
          <a href="#" onclick="openContSettings();return false" style="color:var(--primary);font-weight:600">
            Configura le aliquote fiscali →
          </a>
        </p>
      </div>`;
    return;
  }
  const sorted = [..._contAliquote].sort((a, b) => (a.da||0)-(b.da||0));
  const rows = sorted.map(sc => {
    const da    = sc.da || 0;
    const aLbl  = sc.a != null ? fmt(sc.a) : 'Illimitato';
    const range = `${fmt(da)} → ${aLbl}`;
    const limit = sc.a != null ? sc.a : Infinity;
    const taxable = Math.min(a.base, limit) - da;
    const tax     = taxable > 0 ? Math.max(0, taxable) * (sc.pct||0) / 100 : 0;
    return `<div class="cont-tax-row">
      <span>${sc.nome || 'Scaglione'} <span class="sc-badge">${range} · ${sc.pct}%</span></span>
      <span>${taxable > 0 ? fmt(tax) : '—'}</span>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="cont-tax-card">
      <div class="cont-tax-title">🏦 Calcolo Tasse Annuali</div>
      <div class="cont-tax-rows">
        <div class="cont-tax-row">
          <span>Fatturato imponibile</span><span>${fmt(a.entrate)}</span>
        </div>
        <div class="cont-tax-row">
          <span>Spese deducibili</span><span style="color:var(--danger)">− ${fmt(a.speseDeducibili)}</span>
        </div>
        <div class="cont-tax-row total" style="border-top:none;margin-top:0;font-size:13px;color:var(--g600)">
          <span>Base imponibile</span><span>${fmt(a.base)}</span>
        </div>
        <div style="border-top:1px dashed var(--g200);margin:6px 0"></div>
        ${rows}
        <div class="cont-tax-row total">
          <span>Totale tasse stimate</span><span style="color:var(--warning)">${fmt(a.tasse)}</span>
        </div>
      </div>
    </div>`;
}

// ── Monthly Accordion ─────────────────────────────────────
function _renderContMensile(months, annual) {
  const fmt = v => v.toLocaleString('it-IT', { style:'currency', currency:'EUR', maximumFractionDigits:2 });
  const fmtShort = v => v >= 1000
    ? (v/1000).toLocaleString('it-IT', {maximumFractionDigits:1}) + 'k'
    : v.toLocaleString('it-IT', {maximumFractionDigits:0});

  const now = new Date();
  const curMonth = now.getFullYear() === _contAnno ? now.getMonth() : -1;

  const rows = months.map(m => {
    const hasActivity = m.entrate > 0 || m.spese > 0;
    const saldo = m.entrate - m.spese;
    const isOpen = m.idx === curMonth && hasActivity;

    // Detail lines
    const prevLinks = m.preventivi.length
      ? m.preventivi.map(p =>
          `<a href="#" onclick="editPreventivo('${p.id}');return false" title="Apri preventivo">#${p.numero} ${escHtml(p.cliente?.azienda || p.cliente?.nome || '')}</a>`
        ).join('')
      : '<span style="font-size:12px;color:var(--g400)">Nessun preventivo accettato</span>';

    const nSpese = m.speseList.length;

    return `
    <div class="cont-month-row${isOpen ? ' open' : ''}${!hasActivity ? ' cont-month-empty' : ''}" id="cont-month-${m.idx}">
      <div class="cont-month-head" onclick="contToggleMese(${m.idx})">
        <div class="cont-month-name">${m.nome}</div>
        <div class="cont-month-stat">
          <div class="val">${hasActivity ? '€ '+fmtShort(m.entrate) : '—'}</div>
          <div class="lbl">Fatturato</div>
        </div>
        <div class="cont-month-stat">
          <div class="val">${hasActivity ? '€ '+fmtShort(m.spese) : '—'}</div>
          <div class="lbl">Spese</div>
        </div>
        <div class="cont-month-stat">
          <div class="val ${saldo >= 0 ? 'positive' : 'negative'}">${hasActivity ? '€ '+fmtShort(saldo) : '—'}</div>
          <div class="lbl">Saldo</div>
        </div>
        <div class="cont-month-chevron">▼</div>
      </div>
      <div class="cont-month-body">
        <div class="cont-month-detail-grid">
          <div class="cont-month-detail-item">
            <span class="d-lbl">Imponibile</span>
            <span class="d-val">${fmt(m.entrate)}</span>
          </div>
          <div class="cont-month-detail-item">
            <span class="d-lbl">IVA riscossa</span>
            <span class="d-val">${fmt(m.ivaRiscossa)}</span>
          </div>
          <div class="cont-month-detail-item">
            <span class="d-lbl">Spese totali</span>
            <span class="d-val">${fmt(m.spese)}</span>
          </div>
          <div class="cont-month-detail-item">
            <span class="d-lbl">Spese deducibili</span>
            <span class="d-val">${fmt(m.speseDeducibili)}</span>
          </div>
          <div class="cont-month-detail-item">
            <span class="d-lbl">IVA recuperabile</span>
            <span class="d-val">${fmt(m.ivaRecuperabile)}</span>
          </div>
          <div class="cont-month-detail-item">
            <span class="d-lbl" style="font-weight:700">Saldo netto</span>
            <span class="d-val" style="color:${saldo>=0?'var(--success)':'var(--danger)'}">${fmt(saldo)}</span>
          </div>
        </div>
        <div style="font-size:11.5px;font-weight:700;color:var(--g400);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Preventivi accettati</div>
        <div class="cont-month-prev-list">${prevLinks}</div>
        ${nSpese > 0 ? `<span class="cont-month-view-spese" onclick="contVaiASpeseMese(${m.idx})">Vedi ${nSpese} spese di ${m.nome} →</span>` : ''}
      </div>
    </div>`;
  }).join('');

  document.getElementById('cont-monthly-list').innerHTML = rows ||
    '<p style="text-align:center;color:var(--g400);padding:40px 0">Nessun dato per questo anno.</p>';
}

function contToggleMese(idx) {
  document.getElementById(`cont-month-${idx}`)?.classList.toggle('open');
}

function contVaiASpeseMese(mese) {
  switchContTab('spese');
  const sel = document.getElementById('cont-filter-mese');
  if (sel) sel.value = String(mese);
  renderContSpese();
}

// ── Spese list ────────────────────────────────────────────
function renderContSpese() {
  const meseVal = document.getElementById('cont-filter-mese')?.value;
  const catVal  = document.getElementById('cont-filter-cat')?.value || '';
  const fmt = v => v.toLocaleString('it-IT', { style:'currency', currency:'EUR', maximumFractionDigits:2 });

  let list = [..._allSpese];
  if (meseVal !== '' && meseVal !== undefined) {
    list = list.filter(s => {
      const m = new Date(s.data + 'T12:00:00').getMonth();
      return String(m) === String(meseVal);
    });
  }
  if (catVal) list = list.filter(s => s.categoria === catVal);

  // Sort by date descending
  list.sort((a, b) => b.data?.localeCompare(a.data || '') || 0);

  if (!list.length) {
    document.getElementById('cont-spese-list').innerHTML =
      `<div style="text-align:center;padding:48px 0;color:var(--g400)">
        <div style="font-size:40px;margin-bottom:10px">🧾</div>
        <p style="font-size:14px">Nessuna spesa${meseVal !== '' ? ' per questo mese' : ''}.</p>
        <p style="font-size:13px;margin-top:6px">Clicca <strong>+ Aggiungi Spesa</strong> per inserirne una.</p>
      </div>`;
    return;
  }

  const rows = list.map(s => {
    const deducibile  = (+(s.importo||0) * +(s.deducibilita_pct||0) / 100);
    const ivaRec      = (+(s.iva_importo||0) * +(s.detraibilita_iva_pct||0) / 100);
    const dataFmt     = s.data ? new Date(s.data + 'T12:00:00').toLocaleDateString('it-IT') : '—';
    return `
    <div class="cont-spesa-row">
      <span style="color:var(--g500);font-size:13px">${dataFmt}</span>
      <div>
        <div style="font-weight:600;font-size:13.5px">${escHtml(s.descrizione)}</div>
        <span class="cont-spesa-cat">${escHtml(s.categoria)}</span>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700;font-size:14px">${fmt(+(s.importo||0))}</div>
        ${+(s.iva_importo||0) > 0 ? `<div style="font-size:11px;color:var(--g500)">IVA: ${fmt(+(s.iva_importo||0))}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div style="font-size:12px;color:var(--g600)">Ded. ${s.deducibilita_pct}%</div>
        <div style="font-size:12px;font-weight:600;color:var(--success)">${fmt(deducibile)}</div>
        ${+(s.iva_importo||0) > 0 ? `<div style="font-size:11px;color:var(--info)">IVA rec. ${fmt(ivaRec)}</div>` : ''}
      </div>
      <div class="cont-spesa-icons">
        ${s.note ? `<button class="cont-spesa-icon-btn" title="${escHtml(s.note)}" onclick="alert('${escHtml(s.note).replace(/'/g,"\\'")}')">📝</button>` : ''}
        ${s.allegato_path ? `<button class="cont-spesa-icon-btn" title="Visualizza allegato" onclick="viewAllegato('${s.id}','${escHtml(s.allegato_name||'')}','${escHtml(s.allegato_type||'')}')">📎</button>` : ''}
      </div>
      <div style="display:flex;gap:5px">
        <button class="btn btn-sm btn-outline" onclick="openEditSpesa('${s.id}')">✏️</button>
        <button class="btn btn-sm btn-danger-outline" onclick="confirmDeleteSpesa('${s.id}','${escHtml(s.descrizione)}')">🗑️</button>
      </div>
    </div>`;
  }).join('');

  document.getElementById('cont-spese-list').innerHTML = rows;
}

// ── Modal Spesa ───────────────────────────────────────────
function openAddSpesa() {
  _editingSpesaId = null;
  _spNewFile      = null;
  _spExistingPath = null;
  document.getElementById('spesa-modal-title').textContent = '➕ Nuova Spesa';
  document.getElementById('sp-data').value              = new Date().toISOString().slice(0,10);
  document.getElementById('sp-categoria').value         = '';
  document.getElementById('sp-descrizione').value       = '';
  document.getElementById('sp-importo').value           = '';
  document.getElementById('sp-deducibilita').value      = '100';
  document.getElementById('sp-iva-importo').value       = '0';
  document.getElementById('sp-detraibilita-iva').value  = '100';
  document.getElementById('sp-note').value              = '';
  _spResetFileUI();
  document.getElementById('modal-spesa').classList.add('active');
}

async function openEditSpesa(id) {
  const s = _allSpese.find(x => String(x.id) === String(id));
  if (!s) return;
  _editingSpesaId = id;
  _spNewFile      = null;
  _spExistingPath = s.allegato_path || null;
  document.getElementById('spesa-modal-title').textContent = '✏️ Modifica Spesa';
  document.getElementById('sp-data').value              = s.data              || '';
  document.getElementById('sp-categoria').value         = s.categoria         || '';
  document.getElementById('sp-descrizione').value       = s.descrizione       || '';
  document.getElementById('sp-importo').value           = s.importo           || '';
  document.getElementById('sp-deducibilita').value      = s.deducibilita_pct  ?? 100;
  document.getElementById('sp-iva-importo').value       = s.iva_importo       || 0;
  document.getElementById('sp-detraibilita-iva').value  = s.detraibilita_iva_pct ?? 100;
  document.getElementById('sp-note').value              = s.note              || '';
  if (_spExistingPath) {
    _spShowFilePreview(s.allegato_name || 'allegato', true);
  } else {
    _spResetFileUI();
  }
  document.getElementById('modal-spesa').classList.add('active');
}

async function saveSpesa() {
  const data        = document.getElementById('sp-data').value;
  const categoria   = document.getElementById('sp-categoria').value;
  const descrizione = document.getElementById('sp-descrizione').value.trim();
  const importo     = parseFloat(document.getElementById('sp-importo').value) || 0;
  if (!data || !categoria || !descrizione || importo <= 0) {
    showToast('Compila data, categoria, descrizione e importo', 'error'); return;
  }

  const payload = {
    data,
    descrizione,
    categoria,
    importo,
    deducibilita_pct:     parseFloat(document.getElementById('sp-deducibilita').value)      || 0,
    iva_importo:          parseFloat(document.getElementById('sp-iva-importo').value)        || 0,
    detraibilita_iva_pct: parseFloat(document.getElementById('sp-detraibilita-iva').value)   || 0,
    note:                 document.getElementById('sp-note').value.trim() || null,
  };

  // Allegato
  if (_spNewFile) {
    try {
      const path = await DB.uploadFile('spese-allegati', _spNewFile);
      payload.allegato_path = path;
      payload.allegato_name = _spNewFile.name;
      payload.allegato_type = _spNewFile.type;
    } catch(e) {
      showToast('Errore caricamento allegato', 'error'); return;
    }
  } else if (_spExistingPath) {
    payload.allegato_path = _spExistingPath;
    const existing = _allSpese.find(x => String(x.id) === String(_editingSpesaId));
    payload.allegato_name = existing?.allegato_name || null;
    payload.allegato_type = existing?.allegato_type || null;
  } else {
    // file rimosso — cancella il vecchio
    if (_editingSpesaId) {
      const existing = _allSpese.find(x => String(x.id) === String(_editingSpesaId));
      if (existing?.allegato_path) {
        await DB.deleteFile('spese-allegati', existing.allegato_path);
      }
    }
    payload.allegato_path = null;
    payload.allegato_name = null;
    payload.allegato_type = null;
  }

  try {
    if (_editingSpesaId) {
      await DB.updateSpesa(_editingSpesaId, payload);
      showToast('Spesa aggiornata', 'success');
    } else {
      await DB.createSpesa(payload);
      showToast('Spesa salvata', 'success');
    }
    closeModal('modal-spesa');
    await renderContabilita();
    switchContTab('spese');
  } catch(e) {
    console.error(e);
    showToast('Errore nel salvataggio', 'error');
  }
}

function confirmDeleteSpesa(id, desc) {
  showConfirm('Elimina spesa', `Eliminare la spesa "${desc}"?`, async () => {
    try {
      await DB.deleteSpesa(id);
      showToast('Spesa eliminata', 'success');
      await renderContabilita();
      switchContTab('spese');
    } catch(e) { showToast('Errore eliminazione', 'error'); }
  });
}

// ── File handling ─────────────────────────────────────────
function spHandleFile(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { showToast('File troppo grande (max 10 MB)', 'error'); return; }
  _spNewFile = file;
  _spShowFilePreview(file.name, false);
}

function spHandleDrop(e) {
  e.preventDefault();
  document.getElementById('sp-upload-area').classList.remove('drag');
  const file = e.dataTransfer.files?.[0];
  if (file) spHandleFile(file);
}

function _spShowFilePreview(name, isExisting) {
  const ext = name.split('.').pop().toLowerCase();
  const icon = ['jpg','jpeg','png','gif','webp'].includes(ext) ? '🖼️' : '📄';
  document.getElementById('sp-upload-prompt').style.display = 'none';
  document.getElementById('sp-upload-area').style.pointerEvents = 'none';
  document.getElementById('sp-file-preview').style.display = 'flex';
  document.getElementById('sp-file-name').textContent = (isExisting ? '📎 ' : icon + ' ') + name;
}

function _spResetFileUI() {
  _spNewFile = null;
  document.getElementById('sp-upload-prompt').style.display = '';
  document.getElementById('sp-upload-area').style.pointerEvents = '';
  document.getElementById('sp-file-preview').style.display = 'none';
  document.getElementById('sp-file-name').textContent = '';
  document.getElementById('sp-file-input').value = '';
}

function spRimuoviFile() {
  _spNewFile = null;
  _spExistingPath = null;
  _spResetFileUI();
}

// ── Visualizza allegato ───────────────────────────────────
async function viewAllegato(spesaId, name, type) {
  const s = _allSpese.find(x => String(x.id) === String(spesaId));
  if (!s?.allegato_path) return;
  document.getElementById('allegato-modal-title').textContent = '📎 ' + (name || 'Allegato');
  const body = document.getElementById('allegato-modal-body');
  body.innerHTML = '<p style="color:var(--g400);padding:30px">Caricamento...</p>';
  document.getElementById('modal-spesa-allegato').classList.add('active');
  try {
    const url = await DB.getSignedUrl('spese-allegati', s.allegato_path);
    if (!url) { body.innerHTML = '<p style="color:var(--danger);padding:24px">Impossibile caricare il file.</p>'; return; }
    document.getElementById('allegato-download-link').href = url;
    if (type && type.startsWith('image/')) {
      body.innerHTML = `<img src="${url}" style="max-width:100%;max-height:60vh;border-radius:8px">`;
    } else {
      body.innerHTML = `<iframe src="${url}" style="width:100%;height:60vh;border:none;border-radius:8px"></iframe>`;
    }
  } catch(e) {
    body.innerHTML = '<p style="color:var(--danger);padding:24px">Errore nel caricamento allegato.</p>';
  }
}

// ── Impostazioni fiscali ──────────────────────────────────
async function openContSettings() {
  const s = await DB.getSettings();
  _contAliquote = s.aliquoteFiscali || [];
  _renderAliquoteRows();
  document.getElementById('modal-cont-settings').classList.add('active');
}

function _renderAliquoteRows() {
  const rows = _contAliquote.length
    ? _contAliquote.map((sc, i) => _aliquotaRowHTML(i, sc)).join('')
    : '';
  document.getElementById('aliquote-rows').innerHTML = rows ||
    '<p style="font-size:13px;color:var(--g400);text-align:center;padding:12px 0">Nessuno scaglione configurato. Clicca "+ Aggiungi scaglione".</p>';
}

function _aliquotaRowHTML(i, sc) {
  return `<div class="aliquota-row" id="alq-row-${i}">
    <input class="form-control" type="text"   placeholder="Nome (es. Forfettario)"
      value="${escHtml(sc.nome||'')}" onchange="contAlqSet(${i},'nome',this.value)" style="text-align:left">
    <input class="form-control" type="number" placeholder="0" min="0" step="1000"
      value="${sc.da ?? 0}"  onchange="contAlqSet(${i},'da',+this.value)" title="Da (€)">
    <input class="form-control" type="number" placeholder="∞"  min="0" step="1000"
      value="${sc.a  ?? ''}" onchange="contAlqSet(${i},'a', this.value===''||this.value===null?null:+this.value)" title="A (€) — vuoto = nessun limite">
    <input class="form-control" type="number" placeholder="%" min="0" max="100" step="0.1"
      value="${sc.pct ?? ''}" onchange="contAlqSet(${i},'pct',+this.value)" title="Aliquota %">
    <button class="btn btn-sm btn-danger-outline" type="button" onclick="removeAliquotaRow(${i})">✕</button>
  </div>`;
}

function contPreset(tipo) {
  const presets = {
    srls: [
      { nome: 'IRES',  da: 0, a: null, pct: 24  },
      { nome: 'IRAP',  da: 0, a: null, pct: 3.9 },
    ],
  };
  if (presets[tipo]) {
    _contAliquote = presets[tipo].map(r => ({ ...r }));
    _renderAliquoteRows();
  }
}

function addAliquotaRow() {
  const last = _contAliquote[_contAliquote.length - 1];
  const newDa = last ? (last.a != null ? last.a : 0) : 0;
  _contAliquote.push({ nome: '', da: newDa, a: null, pct: 0 });
  _renderAliquoteRows();
}

function removeAliquotaRow(i) {
  _contAliquote.splice(i, 1);
  _renderAliquoteRows();
}

function contAlqSet(i, field, value) {
  if (_contAliquote[i]) _contAliquote[i][field] = value;
}

async function saveContSettings() {
  const s = await DB.getSettings();
  await DB.saveSettings({ ...s, aliquoteFiscali: _contAliquote });
  closeModal('modal-cont-settings');
  showToast('Impostazioni fiscali salvate', 'success');
  await renderContabilita();
}

// ── CSV Export ────────────────────────────────────────────
async function esportaContabilitaCSV() {
  const fmt2 = v => Number(v||0).toFixed(2).replace('.',',');
  const rows = [];

  // Header
  rows.push(['TIPO','DATA','RIFERIMENTO','DESCRIZIONE','CATEGORIA','IMPONIBILE','IVA','SPESA','DEDUCIBILE','IVA_RECUPERABILE'].join(';'));

  // Guadagni
  for (const p of _allGuadagni) {
    const dt = new Date(p.createdAt||p.created_at||Date.now()).toLocaleDateString('it-IT');
    const ivaR = p.ivaPct==='esclusa' ? 0 : Math.max(0,(p.totaleIvato||0)-(p.totaleNetto||0));
    rows.push(['GUADAGNO', dt,
      `Prev. #${p.numero}`,
      escHtmlCsv(p.cliente?.azienda||p.cliente?.nome||''),
      'Preventivo accettato',
      fmt2(p.totaleNetto), fmt2(ivaR), '', '', ''
    ].join(';'));
  }

  // Spese
  for (const s of _allSpese) {
    const dt = s.data ? new Date(s.data+'T12:00:00').toLocaleDateString('it-IT') : '';
    const deducibile = (+(s.importo||0)) * (+(s.deducibilita_pct||0)) / 100;
    const ivaRec     = (+(s.iva_importo||0)) * (+(s.detraibilita_iva_pct||0)) / 100;
    rows.push(['SPESA', dt, '',
      escHtmlCsv(s.descrizione),
      escHtmlCsv(s.categoria),
      '', '', fmt2(s.importo), fmt2(deducibile), fmt2(ivaRec)
    ].join(';'));
  }

  const csv  = rows.join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url, download: `contabilita_${_contAnno}.csv`
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function escHtmlCsv(s) {
  return String(s||'').replace(/"/g,'""');
}
