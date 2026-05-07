// ─── Supabase client ───────────────────────────────
const { createClient } = supabase;
const USE_LOCAL = !SUPABASE_URL || SUPABASE_URL.includes('XXXXXXXX');
const sb = USE_LOCAL ? null : createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
if (USE_LOCAL) console.info('ℹ️ Supabase non configurato — modalità locale (localStorage)');

// ══════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════
const Auth = {
  // ── LOGIN ──
  async login(email, password) {
    if (USE_LOCAL) return _localAuth.login(email, password);
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: 'Email o password non validi' };
    const { data: profile } = await sb.from('user_profiles').select('role').eq('id', data.user.id).single();
    return { success: true, type: profile?.role === 'admin' ? 'admin' : 'user' };
  },

  // ── REGISTER ──
  async register(userData) {
    if (USE_LOCAL) return _localAuth.register(userData);
    const { data, error } = await sb.auth.signUp({
      email: userData.email,
      password: userData.password,
      options: {
        data: {
          nome:         userData.nome,
          cognome:      userData.cognome,
          type:         userData.type,
          company_name: userData.companyName,
          phone:        userData.phone
        }
      }
    });
    if (error) return { success: false, error: error.message };
    if (!data.user) return { success: false, error: 'Registrazione non completata. Controlla la tua email.' };
    // Il profilo viene creato automaticamente dal trigger on_auth_user_created
    return { success: true };
  },

  // ── LOGOUT ──
  async logout() {
    if (USE_LOCAL) { sessionStorage.removeItem('gh_session'); return; }
    await sb.auth.signOut();
  },

  // ── GET SESSION ──
  async getSession() {
    if (USE_LOCAL) {
      const d = sessionStorage.getItem('gh_session');
      return d ? JSON.parse(d) : null;
    }
    const { data: { session } } = await sb.auth.getSession();
    return session;
  },

  // ── REQUIRE AUTH ──
  async requireAuth(type) {
    if (USE_LOCAL) return _localAuth.requireAuth(type);
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = 'login.html'; return null; }
    const { data: profile } = await sb.from('user_profiles').select('*').eq('id', session.user.id).single();
    if (!profile) { await sb.auth.signOut(); window.location.href = 'login.html'; return null; }
    if (type === 'admin' && profile.role !== 'admin') { window.location.href = 'dashboard.html'; return null; }
    if (type === 'user'  && profile.role === 'admin')  { window.location.href = 'admin.html'; return null; }
    return { session, profile: mapProfileFromDb(profile) };
  }
};

// ── LOCAL AUTH (modalità localStorage) ────────────
const _localAuth = {
  ADMIN_EMAIL: 'admin@greenhouse.it',
  ADMIN_PASS:  'Admin2024!',

  login(email, password) {
    if (email.toLowerCase() === this.ADMIN_EMAIL && password === this.ADMIN_PASS) {
      sessionStorage.setItem('gh_session', JSON.stringify({ type: 'admin', userId: 'admin' }));
      return { success: true, type: 'admin' };
    }
    const users = _localDB.getUsers();
    const user  = users.find(u => u.email === email.toLowerCase());
    if (!user)                  return { success: false, error: 'Email non trovata' };
    if (user.password !== password) return { success: false, error: 'Password errata' };
    sessionStorage.setItem('gh_session', JSON.stringify({ type: 'user', userId: user.id }));
    return { success: true, type: 'user' };
  },

  register(userData) {
    const users = _localDB.getUsers();
    if (users.find(u => u.email === userData.email.toLowerCase()))
      return { success: false, error: 'Questa email è già registrata' };
    const user = _localDB.createUser(userData);
    sessionStorage.setItem('gh_session', JSON.stringify({ type: 'user', userId: user.id }));
    return { success: true };
  },

  requireAuth(type) {
    const raw = sessionStorage.getItem('gh_session');
    if (!raw) { window.location.href = 'login.html'; return null; }
    const s = JSON.parse(raw);
    if (type === 'admin' && s.type !== 'admin') { window.location.href = 'dashboard.html'; return null; }
    if (type === 'user'  && s.type === 'admin') { window.location.href = 'admin.html'; return null; }
    if (s.type === 'admin')
      return { session: s, profile: { id: 'admin', role: 'admin', companyName: 'Admin', planStatus: 'attivo', email: _localAuth.ADMIN_EMAIL } };
    const user = _localDB.getUserById(s.userId);
    if (!user) { sessionStorage.removeItem('gh_session'); window.location.href = 'login.html'; return null; }
    return { session: s, profile: { ...user, email: user.email } };
  }
};

// ══════════════════════════════════════════════════
//  DB
// ══════════════════════════════════════════════════
const DB = {

  // ── Users ──
  async getUsers() {
    if (USE_LOCAL) return _localDB.getUsers();
    const { data } = await sb.from('user_profiles').select('*').order('created_at', { ascending: false });
    return (data || []).map(mapProfileFromDb);
  },
  async getUserById(id) {
    if (USE_LOCAL) return _localDB.getUserById(id);
    const { data } = await sb.from('user_profiles').select('*').eq('id', id).single();
    return data ? mapProfileFromDb(data) : null;
  },
  async updateUser(id, fields) {
    if (USE_LOCAL) return _localDB.updateUser(id, fields);
    const { data, error } = await sb.from('user_profiles').update(mapProfileToDb(fields)).eq('id', id).select().single();
    if (error) throw error;
    return mapProfileFromDb(data);
  },
  async createUserByAdmin(userData) {
    if (USE_LOCAL) return _localDB.createUser(userData);
    const { data, error } = await sb.auth.signUp({ email: userData.email, password: userData.password });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Utente non creato');
    const { error: pErr } = await sb.from('user_profiles').insert({
      id: data.user.id, type: userData.type, nome: userData.nome, cognome: userData.cognome,
      company_name: userData.companyName, phone: userData.phone,
      plan_status: userData.planStatus || 'inattivo', role: 'user'
    });
    if (pErr) throw new Error(pErr.message);
    return { id: data.user.id, ...userData };
  },
  async deleteUser(id) {
    if (USE_LOCAL) { _localDB.deleteUser(id); return; }
    const { error } = await sb.from('user_profiles').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Properties ──
  async getPropertiesByUser(userId) {
    if (USE_LOCAL) return _localDB.getPropertiesByUser(userId);
    const { data } = await sb.from('properties').select('*').eq('user_id', userId).order('created_at');
    return (data || []).map(mapPropFromDb);
  },
  async getAllProperties() {
    if (USE_LOCAL) return _localDB.getAllProperties();
    const { data } = await sb.from('properties').select('*').order('created_at');
    return (data || []).map(mapPropFromDb);
  },
  async getPropertyById(id) {
    if (USE_LOCAL) return _localDB.getPropertyById(id);
    const { data } = await sb.from('properties').select('*').eq('id', id).single();
    return data ? mapPropFromDb(data) : null;
  },
  async createProperty(fields) {
    if (USE_LOCAL) return _localDB.createProperty(fields);
    const { data, error } = await sb.from('properties').insert({ user_id: fields.userId, address: fields.address, city: fields.city, province: fields.province }).select().single();
    if (error) throw error;
    return mapPropFromDb(data);
  },
  async updateProperty(id, fields) {
    if (USE_LOCAL) return _localDB.updateProperty(id, fields);
    const upd = {};
    if (fields.address  !== undefined) upd.address  = fields.address;
    if (fields.city     !== undefined) upd.city     = fields.city;
    if (fields.province !== undefined) upd.province = fields.province;
    const { data, error } = await sb.from('properties').update(upd).eq('id', id).select().single();
    if (error) throw error;
    return mapPropFromDb(data);
  },
  async deleteProperty(id) {
    if (USE_LOCAL) { _localDB.deleteProperty(id); return; }
    const { error } = await sb.from('properties').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Documents ──
  async getDocumentsByProperty(propId) {
    if (USE_LOCAL) return _localDB.getDocumentsByProperty(propId);
    const { data } = await sb.from('documents').select('*').eq('property_id', propId).order('created_at');
    return data || [];
  },
  async uploadDocument(file, propertyId, userId) {
    if (USE_LOCAL) return _localDB.uploadDocumentLocal(file, propertyId, userId);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${userId}/${propertyId}/${Date.now()}_${safeName}`;
    const { error: upErr } = await sb.storage.from('documents').upload(path, file, { upsert: false });
    if (upErr) throw upErr;
    const { data, error } = await sb.from('documents').insert({ property_id: propertyId, user_id: userId, name: file.name, file_path: path, file_type: file.type, file_size: file.size }).select().single();
    if (error) { await sb.storage.from('documents').remove([path]); throw error; }
    return data;
  },
  async getDocumentUrl(filePath) {
    if (USE_LOCAL) return filePath; // local: filePath IS the base64 data URL
    const { data } = await sb.storage.from('documents').createSignedUrl(filePath, 3600);
    return data?.signedUrl || null;
  },
  async deleteDocument(docId, filePath) {
    if (USE_LOCAL) { _localDB.deleteDocument(docId); return; }
    await sb.storage.from('documents').remove([filePath]);
    await sb.from('documents').delete().eq('id', docId);
  },

  // ── Maintenance Records ──
  async getRecordsByProperty(propId) {
    if (USE_LOCAL) return _localDB.getRecordsByProperty(propId);
    const { data } = await sb.from('maintenance_records').select('*').eq('property_id', propId).order('date', { ascending: false });
    return (data || []).map(mapRecFromDb);
  },
  async getRecordsByUser(userId) {
    if (USE_LOCAL) return _localDB.getRecordsByUser(userId);
    const { data } = await sb.from('maintenance_records').select('*').eq('user_id', userId).order('date', { ascending: false });
    return (data || []).map(mapRecFromDb);
  },
  async getAllRecords() {
    if (USE_LOCAL) return _localDB.getAllRecords();
    const { data } = await sb.from('maintenance_records').select('*').order('date', { ascending: false });
    return (data || []).map(mapRecFromDb);
  },
  async createRecord(fields) {
    if (USE_LOCAL) return _localDB.createRecord(fields);
    const { data, error } = await sb.from('maintenance_records').insert({ property_id: fields.propertyId, user_id: fields.userId, maintenance_type: fields.maintenanceType, date: fields.date, work_type: fields.workType, status: fields.status, notes: fields.notes || null }).select().single();
    if (error) throw error;
    return mapRecFromDb(data);
  },
  async updateRecord(id, fields) {
    if (USE_LOCAL) return _localDB.updateRecord(id, fields);
    const upd = {};
    if (fields.propertyId      !== undefined) upd.property_id      = fields.propertyId;
    if (fields.maintenanceType !== undefined) upd.maintenance_type = fields.maintenanceType;
    if (fields.date            !== undefined) upd.date             = fields.date;
    if (fields.workType        !== undefined) upd.work_type        = fields.workType;
    if (fields.status          !== undefined) upd.status           = fields.status;
    if (fields.notes           !== undefined) upd.notes            = fields.notes;
    const { data, error } = await sb.from('maintenance_records').update(upd).eq('id', id).select().single();
    if (error) throw error;
    return mapRecFromDb(data);
  },
  async deleteRecord(id) {
    if (USE_LOCAL) { _localDB.deleteRecord(id); return; }
    const { error } = await sb.from('maintenance_records').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Quote Requests ──
  async getQuotes() {
    if (USE_LOCAL) return _localDB.getQuotes();
    const { data } = await sb.from('quote_requests').select('*').order('created_at', { ascending: false });
    return (data || []).map(mapQuoteFromDb);
  },
  async createQuote(fields) {
    if (USE_LOCAL) return _localDB.createQuote(fields);
    const { data, error } = await sb.from('quote_requests').insert({
      nome: fields.nome, cognome: fields.cognome, azienda: fields.azienda,
      email: fields.email, telefono: fields.telefono,
      citta: fields.citta || null, note: fields.note || null, status: 'in_attesa'
    }).select().single();
    if (error) throw error;
    return mapQuoteFromDb(data);
  },
  async updateQuoteStatus(id, status) {
    if (USE_LOCAL) return _localDB.updateQuote(id, { status });
    const { data, error } = await sb.from('quote_requests').update({ status }).eq('id', id).select().single();
    if (error) throw error;
    return mapQuoteFromDb(data);
  },
  async deleteQuote(id) {
    if (USE_LOCAL) { _localDB.deleteQuote(id); return; }
    const { error } = await sb.from('quote_requests').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Suppliers ──
  async getSuppliers() {
    if (USE_LOCAL) return _localDB.getSuppliers();
    const { data } = await sb.from('suppliers').select('*').order('ragione_sociale');
    return (data || []).map(mapSupplierFromDb);
  },
  async createSupplier(fields) {
    if (USE_LOCAL) return _localDB.createSupplier(fields);
    const { data, error } = await sb.from('suppliers').insert(mapSupplierToDb(fields)).select().single();
    if (error) throw error;
    return mapSupplierFromDb(data);
  },
  async updateSupplier(id, fields) {
    if (USE_LOCAL) return _localDB.updateSupplier(id, fields);
    const { data, error } = await sb.from('suppliers').update(mapSupplierToDb(fields)).eq('id', id).select().single();
    if (error) throw error;
    return mapSupplierFromDb(data);
  },
  async deleteSupplier(id) {
    if (USE_LOCAL) { _localDB.deleteSupplier(id); return; }
    const { error } = await sb.from('suppliers').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Collaboratori ──
  async getCollaboratori() {
    if (USE_LOCAL) return _localDB.getCollaboratori();
    const { data } = await sb.from('collaboratori').select('*').order('cognome');
    return (data || []).map(mapCollaboratoreFromDb);
  },
  async createCollaboratore(fields) {
    if (USE_LOCAL) return _localDB.createCollaboratore(fields);
    const { data, error } = await sb.from('collaboratori').insert(mapCollaboratoreToDb(fields)).select().single();
    if (error) throw error;
    return mapCollaboratoreFromDb(data);
  },
  async updateCollaboratore(id, fields) {
    if (USE_LOCAL) return _localDB.updateCollaboratore(id, fields);
    const { data, error } = await sb.from('collaboratori').update(mapCollaboratoreToDb(fields)).eq('id', id).select().single();
    if (error) throw error;
    return mapCollaboratoreFromDb(data);
  },
  async deleteCollaboratore(id) {
    if (USE_LOCAL) { _localDB.deleteCollaboratore(id); return; }
    const { error } = await sb.from('collaboratori').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Impostazioni azienda (always local) ──
  async getSettings()     { return JSON.parse(localStorage.getItem('gh_settings') || '{}'); },
  async saveSettings(d)   { localStorage.setItem('gh_settings', JSON.stringify(d)); return d; },

  // ── Note Voci Preventivo ──
  async getNoteVoci() {
    if (USE_LOCAL) {
      try { return JSON.parse(localStorage.getItem('gh_note_voci') || '[]'); } catch { return []; }
    }
    const { data } = await sb.from('note_voci').select('id, text').order('created_at');
    return data || [];
  },
  async createNotaVoce(text) {
    if (USE_LOCAL) {
      const list = JSON.parse(localStorage.getItem('gh_note_voci') || '[]');
      const item = { id: Date.now(), text };
      list.push(item);
      localStorage.setItem('gh_note_voci', JSON.stringify(list));
      return item;
    }
    const { data, error } = await sb.from('note_voci').insert({ text }).select('id, text').single();
    if (error) throw error;
    return { id: data.id, text: data.text };
  },
  async deleteNotaVoce(id) {
    if (USE_LOCAL) {
      const list = JSON.parse(localStorage.getItem('gh_note_voci') || '[]');
      localStorage.setItem('gh_note_voci', JSON.stringify(list.filter(v => String(v.id) !== String(id))));
      return;
    }
    const { error } = await sb.from('note_voci').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Listino Prezzi ──
  async getListino() {
    if (USE_LOCAL) return _localDB.getListino();
    const { data } = await sb.from('listino').select('voci').eq('id', 1).single();
    return data?.voci || DEFAULT_LISTINO;
  },
  async resetListino() {
    if (USE_LOCAL) return _localDB.resetListino();
    await sb.from('listino').upsert({ id: 1, voci: DEFAULT_LISTINO });
    return DEFAULT_LISTINO;
  },
  async createListinoItem(f) {
    if (USE_LOCAL) return _localDB.createListinoItem(f);
    const current = await this.getListino();
    const item = { id: _genId(), ...f };
    await sb.from('listino').upsert({ id: 1, voci: [...current, item] });
    return item;
  },
  async updateListinoItem(id, f) {
    if (USE_LOCAL) return _localDB.updateListinoItem(id, f);
    const current = await this.getListino();
    const i = current.findIndex(x => x.id === id);
    if (i < 0) return null;
    current[i] = { ...current[i], ...f };
    await sb.from('listino').upsert({ id: 1, voci: current });
    return current[i];
  },
  async deleteListinoItem(id) {
    if (USE_LOCAL) { _localDB.deleteListinoItem(id); return; }
    const current = await this.getListino();
    await sb.from('listino').upsert({ id: 1, voci: current.filter(x => x.id !== id) });
  },

  // ── Preventivi ──
  async getPreventivi() {
    if (USE_LOCAL) return _localDB.getPreventivi();
    const { data } = await sb.from('preventivi').select('*').order('created_at', { ascending: false });
    return (data || []).map(mapPreventivoFromDb);
  },
  async getPreventivoById(id) {
    if (USE_LOCAL) return _localDB.getPreventivoById(id);
    const { data } = await sb.from('preventivi').select('*').eq('id', id).single();
    return data ? mapPreventivoFromDb(data) : null;
  },
  async createPreventivo(f) {
    if (USE_LOCAL) return _localDB.createPreventivo(f);
    const { data: maxRow } = await sb.from('preventivi').select('numero').order('numero', { ascending: false }).limit(1).maybeSingle();
    const numero = (maxRow?.numero || 0) + 1;
    const { data, error } = await sb.from('preventivi').insert({ ...mapPreventivoToDb(f), numero }).select().single();
    if (error) throw error;
    return mapPreventivoFromDb(data);
  },
  async updatePreventivo(id, f) {
    if (USE_LOCAL) return _localDB.updatePreventivo(id, f);
    const { data, error } = await sb.from('preventivi').update(mapPreventivoToDb(f)).eq('id', id).select().single();
    if (error) throw error;
    return mapPreventivoFromDb(data);
  },
  async deletePreventivo(id) {
    if (USE_LOCAL) { _localDB.deletePreventivo(id); return; }
    const { error } = await sb.from('preventivi').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Fatture ──
  async getFatture() {
    if (USE_LOCAL) return _localDB.getFatture();
    const { data } = await sb.from('fatture').select('*').order('created_at', { ascending: false });
    return (data || []).map(mapFatturaFromDb);
  },
  async getFatturaById(id) {
    if (USE_LOCAL) return _localDB.getFatturaById(id);
    const { data } = await sb.from('fatture').select('*').eq('id', id).single();
    return data ? mapFatturaFromDb(data) : null;
  },
  async createFattura(f) {
    if (USE_LOCAL) return _localDB.createFattura(f);
    const { data, error } = await sb.from('fatture').insert(mapFatturaToDb(f)).select().single();
    if (error) throw error;
    return mapFatturaFromDb(data);
  },
  async updateFattura(id, f) {
    if (USE_LOCAL) return _localDB.updateFattura(id, f);
    const { data, error } = await sb.from('fatture').update(mapFatturaToDb(f)).eq('id', id).select().single();
    if (error) throw error;
    return mapFatturaFromDb(data);
  },
  async deleteFattura(id) {
    if (USE_LOCAL) { _localDB.deleteFattura(id); return; }
    const { data } = await sb.from('fatture').select('file_path').eq('id', id).single();
    if (data?.file_path) await sb.storage.from('fatture').remove([data.file_path]);
    const { error } = await sb.from('fatture').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Documenti Admin ──
  async getAdminDocs() {
    if (USE_LOCAL) return _localDB.getAdminDocs();
    const { data } = await sb.from('documenti').select('*').order('data', { ascending: false });
    return (data || []).map(mapDocumentoFromDb);
  },
  async getAdminDocById(id) {
    if (USE_LOCAL) return _localDB.getAdminDocById(id);
    const { data } = await sb.from('documenti').select('*').eq('id', id).single();
    return data ? mapDocumentoFromDb(data) : null;
  },
  async createAdminDoc(f) {
    if (USE_LOCAL) return _localDB.createAdminDoc(f);
    const { data, error } = await sb.from('documenti').insert(mapDocumentoToDb(f)).select().single();
    if (error) throw error;
    return mapDocumentoFromDb(data);
  },
  async updateAdminDoc(id, f) {
    if (USE_LOCAL) return _localDB.updateAdminDoc(id, f);
    const { data, error } = await sb.from('documenti').update(mapDocumentoToDb(f)).eq('id', id).select().single();
    if (error) throw error;
    return mapDocumentoFromDb(data);
  },
  async deleteAdminDoc(id) {
    if (USE_LOCAL) { _localDB.deleteAdminDoc(id); return; }
    const { data } = await sb.from('documenti').select('file_path').eq('id', id).single();
    if (data?.file_path) await sb.storage.from('documenti').remove([data.file_path]);
    const { error } = await sb.from('documenti').delete().eq('id', id);
    if (error) throw error;
  },

  // ── File Storage ──
  async uploadFile(bucket, file) {
    if (USE_LOCAL) return null;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}_${safeName}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: false });
    if (error) throw error;
    return path;
  },
  getFileUrl(bucket, path) {
    if (!path || USE_LOCAL) return null;
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || null;
  },
  async deleteFile(bucket, path) {
    if (!path || USE_LOCAL) return;
    await sb.storage.from(bucket).remove([path]);
  },

  // ── Calendario Soci ──
  async getCalUsers() {
    if (USE_LOCAL) {
      try {
        const d = JSON.parse(localStorage.getItem('gh_cal_data') || 'null');
        if (!d || !Array.isArray(d.users)) return null; // null = usa default
        return d.users.map(u => ({ ...u, slots: d.slots?.[u.id] || [] }));
      } catch { return null; }
    }
    const { data, error } = await sb.from('calendar_users').select('*').order('created_at');
    if (error) throw error;
    return data || [];
  },
  async upsertCalUser(user) {
    if (USE_LOCAL) return;
    const { error } = await sb.from('calendar_users').upsert({
      id: user.id, name: user.name, color: user.color, slots: user.slots || []
    });
    if (error) throw error;
  },
  async deleteCalUserById(userId) {
    if (USE_LOCAL) return;
    const { error } = await sb.from('calendar_users').delete().eq('id', userId);
    if (error) throw error;
  },
  async updateCalSlots(userId, slots) {
    if (USE_LOCAL) return;
    const { error } = await sb.from('calendar_users').update({ slots }).eq('id', userId);
    if (error) throw error;
  },
};

// ══════════════════════════════════════════════════
//  LOCAL DB (localStorage fallback)
// ══════════════════════════════════════════════════
const _localDB = {
  _init() {
    if (!localStorage.getItem('gh_init')) {
      localStorage.setItem('gh_users',     JSON.stringify([]));
      localStorage.setItem('gh_props',     JSON.stringify([]));
      localStorage.setItem('gh_docs',      JSON.stringify([]));
      localStorage.setItem('gh_recs',      JSON.stringify([]));
      localStorage.setItem('gh_quotes',    JSON.stringify([]));
      localStorage.setItem('gh_suppliers', JSON.stringify([]));
      localStorage.setItem('gh_init',      '1');
    }
    if (!localStorage.getItem('gh_quotes'))         localStorage.setItem('gh_quotes',         JSON.stringify([]));
    if (!localStorage.getItem('gh_suppliers'))       localStorage.setItem('gh_suppliers',       JSON.stringify([]));
    if (!localStorage.getItem('gh_collaboratori'))   localStorage.setItem('gh_collaboratori',   JSON.stringify([]));
    if (!localStorage.getItem('gh_preventivi'))      localStorage.setItem('gh_preventivi',      JSON.stringify([]));
    if (!localStorage.getItem('gh_listino'))         localStorage.setItem('gh_listino',         JSON.stringify(DEFAULT_LISTINO));
    if (!localStorage.getItem('gh_fatture'))    localStorage.setItem('gh_fatture',    JSON.stringify([]));
    if (!localStorage.getItem('gh_admin_docs')) localStorage.setItem('gh_admin_docs', JSON.stringify([]));
  },
  _u()  { return JSON.parse(localStorage.getItem('gh_users')  || '[]'); },
  _su(d) { localStorage.setItem('gh_users',  JSON.stringify(d)); },
  _p()  { return JSON.parse(localStorage.getItem('gh_props')  || '[]'); },
  _sp(d) { localStorage.setItem('gh_props',  JSON.stringify(d)); },
  _d()  { return JSON.parse(localStorage.getItem('gh_docs')   || '[]'); },
  _sd(d) { localStorage.setItem('gh_docs',   JSON.stringify(d)); },
  _r()  { return JSON.parse(localStorage.getItem('gh_recs')   || '[]'); },
  _sr(d) { localStorage.setItem('gh_recs',   JSON.stringify(d)); },
  _q()  { return JSON.parse(localStorage.getItem('gh_quotes') || '[]'); },
  _sq(d) { localStorage.setItem('gh_quotes', JSON.stringify(d)); },

  getUsers()          { return this._u(); },
  getUserById(id)     { return this._u().find(u => u.id === id) || null; },
  createUser(data)    { const users = this._u(); const u = { id: _genId(), ...data, email: (data.email||'').toLowerCase(), planStatus: data.planStatus||'inattivo', role: data.role||'user', createdAt: new Date().toISOString() }; users.push(u); this._su(users); return u; },
  updateUser(id, f)   { const arr = this._u(); const i = arr.findIndex(u => u.id === id); if (i<0) return null; arr[i] = { ...arr[i], ...f }; this._su(arr); return arr[i]; },
  deleteUser(id)      { this._su(this._u().filter(u => u.id !== id)); this._sp(this._p().filter(p => p.userId !== id)); this._sr(this._r().filter(r => r.userId !== id)); this._sd(this._d().filter(d => d.userId !== id)); },

  getAllProperties()          { return this._p(); },
  getPropertiesByUser(uid)    { return this._p().filter(p => p.userId === uid); },
  getPropertyById(id)         { return this._p().find(p => p.id === id) || null; },
  createProperty(f)           { const arr = this._p(); const p = { id: _genId(), ...f, createdAt: new Date().toISOString() }; arr.push(p); this._sp(arr); return p; },
  updateProperty(id, f)       { const arr = this._p(); const i = arr.findIndex(p => p.id === id); if (i<0) return null; arr[i] = { ...arr[i], ...f }; this._sp(arr); return arr[i]; },
  deleteProperty(id)          { this._sp(this._p().filter(p => p.id !== id)); this._sr(this._r().filter(r => r.propertyId !== id)); this._sd(this._d().filter(d => d.propertyId !== id)); },

  getDocumentsByProperty(pid) { return this._d().filter(d => d.property_id === pid); },
  async uploadDocumentLocal(file, propertyId, userId) {
    return new Promise((resolve, reject) => {
      if (file.size > 10*1024*1024) { reject(new Error('File troppo grande (max 10MB)')); return; }
      const reader = new FileReader();
      reader.onload = ev => {
        const docs = this._d();
        const doc  = { id: _genId(), property_id: propertyId, user_id: userId, name: file.name, file_path: ev.target.result, file_type: file.type, file_size: file.size, created_at: new Date().toISOString() };
        docs.push(doc); this._sd(docs); resolve(doc);
      };
      reader.onerror = () => reject(new Error('Errore lettura file'));
      reader.readAsDataURL(file);
    });
  },
  deleteDocument(docId)       { this._sd(this._d().filter(d => d.id !== docId)); },

  getQuotes()        { return this._q().sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)); },
  createQuote(f)     { const arr = this._q(); const q = { id: _genId(), ...f, status: 'in_attesa', createdAt: new Date().toISOString() }; arr.push(q); this._sq(arr); return q; },
  updateQuote(id, f) { const arr = this._q(); const i = arr.findIndex(q => q.id === id); if (i<0) return null; arr[i] = { ...arr[i], ...f }; this._sq(arr); return arr[i]; },
  deleteQuote(id)    { this._sq(this._q().filter(q => q.id !== id)); },

  _s()  { return JSON.parse(localStorage.getItem('gh_suppliers') || '[]'); },
  _ss(d) { localStorage.setItem('gh_suppliers', JSON.stringify(d)); },
  getSuppliers()        { return this._s().sort((a,b) => (a.ragioneSociale||'').localeCompare(b.ragioneSociale||'')); },
  createSupplier(f)     { const arr = this._s(); const s = { id: _genId(), ...f, createdAt: new Date().toISOString() }; arr.push(s); this._ss(arr); return s; },
  updateSupplier(id, f) { const arr = this._s(); const i = arr.findIndex(s => s.id === id); if (i<0) return null; arr[i] = { ...arr[i], ...f }; this._ss(arr); return arr[i]; },
  deleteSupplier(id)    { this._ss(this._s().filter(s => s.id !== id)); },

  _c()  { return JSON.parse(localStorage.getItem('gh_collaboratori') || '[]'); },
  _sc(d) { localStorage.setItem('gh_collaboratori', JSON.stringify(d)); },
  getCollaboratori()        { return this._c().sort((a,b) => (a.cognome||'').localeCompare(b.cognome||'')); },
  createCollaboratore(f)    { const arr = this._c(); const c = { id: _genId(), ...f, createdAt: new Date().toISOString() }; arr.push(c); this._sc(arr); return c; },
  updateCollaboratore(id,f) { const arr = this._c(); const i = arr.findIndex(c => c.id === id); if (i<0) return null; arr[i] = { ...arr[i], ...f }; this._sc(arr); return arr[i]; },
  deleteCollaboratore(id)   { this._sc(this._c().filter(c => c.id !== id)); },

  getAllRecords()              { return this._r(); },
  getRecordsByProperty(pid)   { return this._r().filter(r => r.propertyId === pid).sort((a,b) => new Date(b.date) - new Date(a.date)); },
  getRecordsByUser(uid)       { return this._r().filter(r => r.userId === uid); },
  createRecord(f)             { const arr = this._r(); const r = { id: _genId(), ...f, createdAt: new Date().toISOString() }; arr.push(r); this._sr(arr); return r; },
  updateRecord(id, f)         { const arr = this._r(); const i = arr.findIndex(r => r.id === id); if (i<0) return null; arr[i] = { ...arr[i], ...f }; this._sr(arr); return arr[i]; },
  deleteRecord(id)            { this._sr(this._r().filter(r => r.id !== id)); },
};
// ── DEFAULT LISTINO (Assoverde 2022 reference prices) ─
const DEFAULT_LISTINO = [
  { id: 'li01', categoria: 'Alberature – Potature',      descrizione: 'Potatura albero fino h 5 m',                   unita: 'cad', prezzoUnitario: 80.00 },
  { id: 'li02', categoria: 'Alberature – Potature',      descrizione: 'Potatura albero h 5-10 m',                     unita: 'cad', prezzoUnitario: 150.00 },
  { id: 'li03', categoria: 'Alberature – Potature',      descrizione: 'Potatura albero h 10-15 m',                    unita: 'cad', prezzoUnitario: 250.00 },
  { id: 'li04', categoria: 'Alberature – Potature',      descrizione: 'Potatura albero h > 15 m',                     unita: 'cad', prezzoUnitario: 400.00 },
  { id: 'li05', categoria: 'Alberature – Abbattimenti',  descrizione: 'Abbattimento albero fino h 5 m',               unita: 'cad', prezzoUnitario: 120.00 },
  { id: 'li06', categoria: 'Alberature – Abbattimenti',  descrizione: 'Abbattimento albero h 5-10 m',                 unita: 'cad', prezzoUnitario: 220.00 },
  { id: 'li07', categoria: 'Alberature – Abbattimenti',  descrizione: 'Abbattimento albero h 10-15 m',                unita: 'cad', prezzoUnitario: 380.00 },
  { id: 'li08', categoria: 'Alberature – Abbattimenti',  descrizione: 'Abbattimento albero h > 15 m',                 unita: 'cad', prezzoUnitario: 600.00 },
  { id: 'li09', categoria: 'Arbusti, Siepi, Aiuole',     descrizione: 'Potatura siepe (taglio e sagomatura)',          unita: 'ml',  prezzoUnitario: 3.50 },
  { id: 'li10', categoria: 'Arbusti, Siepi, Aiuole',     descrizione: 'Potatura arbusto',                             unita: 'cad', prezzoUnitario: 12.00 },
  { id: 'li11', categoria: 'Arbusti, Siepi, Aiuole',     descrizione: 'Diserbo aiuola',                               unita: 'mq',  prezzoUnitario: 2.50 },
  { id: 'li12', categoria: 'Arbusti, Siepi, Aiuole',     descrizione: 'Fresatura e lavorazione aiuola',               unita: 'mq',  prezzoUnitario: 4.00 },
  { id: 'li13', categoria: 'Tappeti Erbosi – Manutenzione', descrizione: 'Sfalcio tappeto erboso',                    unita: 'mq',  prezzoUnitario: 0.18 },
  { id: 'li14', categoria: 'Tappeti Erbosi – Manutenzione', descrizione: 'Sfalcio tappeto erboso con raccolta erba',  unita: 'mq',  prezzoUnitario: 0.28 },
  { id: 'li15', categoria: 'Tappeti Erbosi – Manutenzione', descrizione: 'Trattamento fertilizzante prato',           unita: 'mq',  prezzoUnitario: 0.35 },
  { id: 'li16', categoria: 'Tappeti Erbosi – Manutenzione', descrizione: 'Arieggiatura tappeto erboso',               unita: 'mq',  prezzoUnitario: 0.45 },
  { id: 'li17', categoria: "Opere d'Impianto",           descrizione: 'Messa a dimora albero (circ. fino 20 cm)',     unita: 'cad', prezzoUnitario: 45.00 },
  { id: 'li18', categoria: "Opere d'Impianto",           descrizione: 'Messa a dimora albero (circ. 20-40 cm)',       unita: 'cad', prezzoUnitario: 80.00 },
  { id: 'li19', categoria: "Opere d'Impianto",           descrizione: 'Messa a dimora arbusto',                       unita: 'cad', prezzoUnitario: 18.00 },
  { id: 'li20', categoria: "Opere d'Impianto",           descrizione: 'Posa zolle tappeto erboso',                    unita: 'mq',  prezzoUnitario: 8.50 },
  { id: 'li21', categoria: "Opere d'Impianto",           descrizione: 'Semina tappeto erboso',                        unita: 'mq',  prezzoUnitario: 3.20 },
  { id: 'li22', categoria: 'Impianti di Irrigazione',    descrizione: 'Installazione impianto interrato (stima)',     unita: 'mq',  prezzoUnitario: 12.00 },
  { id: 'li23', categoria: 'Impianti di Irrigazione',    descrizione: 'Manutenzione impianto di irrigazione',         unita: 'ora', prezzoUnitario: 45.00 },
  { id: 'li24', categoria: 'Impianti di Irrigazione',    descrizione: 'Programmazione stagionale impianto',           unita: 'cad', prezzoUnitario: 80.00 },
  { id: 'li25', categoria: 'Lavorazioni Terreno',        descrizione: 'Scavo a mano',                                 unita: 'mc',  prezzoUnitario: 35.00 },
  { id: 'li26', categoria: 'Lavorazioni Terreno',        descrizione: 'Scavo meccanico',                              unita: 'mc',  prezzoUnitario: 18.00 },
  { id: 'li27', categoria: 'Lavorazioni Terreno',        descrizione: 'Trasporto e smaltimento terreno',              unita: 'mc',  prezzoUnitario: 25.00 },
  { id: 'li28', categoria: 'Lavorazioni Terreno',        descrizione: 'Fornitura e posa terra da coltivo',            unita: 'mc',  prezzoUnitario: 45.00 },
  { id: 'li29', categoria: 'Noleggi e Servizi',          descrizione: 'Nolo piattaforma aerea + operatore',           unita: 'ora', prezzoUnitario: 85.00 },
  { id: 'li30', categoria: 'Noleggi e Servizi',          descrizione: 'Smaltimento sfalci e potature',                unita: 'mc',  prezzoUnitario: 15.00 },
  { id: 'li31', categoria: 'Noleggi e Servizi',          descrizione: 'Manodopera specializzata verde',               unita: 'ora', prezzoUnitario: 38.00 },
];

// ── EXTEND _localDB with Listino + Preventivi ──────
Object.assign(_localDB, {
  _li()    { return JSON.parse(localStorage.getItem('gh_listino') || 'null'); },
  _sli(d)  { localStorage.setItem('gh_listino', JSON.stringify(d)); },
  getListino()            { return this._li() || []; },
  resetListino()          { this._sli(DEFAULT_LISTINO); return DEFAULT_LISTINO; },
  createListinoItem(f)    { const a = this.getListino(); const item = { id: _genId(), ...f }; a.push(item); this._sli(a); return item; },
  updateListinoItem(id,f) { const a = this.getListino(); const i = a.findIndex(x => x.id === id); if (i<0) return null; a[i] = { ...a[i], ...f }; this._sli(a); return a[i]; },
  deleteListinoItem(id)   { this._sli(this.getListino().filter(x => x.id !== id)); },

  _pv()    { return JSON.parse(localStorage.getItem('gh_preventivi') || '[]'); },
  _spv(d)  { localStorage.setItem('gh_preventivi', JSON.stringify(d)); },
  _nextNum() { const a = this._pv(); if (!a.length) return 1; return Math.max(...a.map(p => parseInt(p.numero)||0)) + 1; },
  getPreventivi()         { return this._pv().sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)); },
  getPreventivoById(id)   { return this._pv().find(p => p.id === id) || null; },
  createPreventivo(f)     { const a = this._pv(); const p = { id: _genId(), numero: this._nextNum(), ...f, status: f.status||'bozza', createdAt: new Date().toISOString() }; a.push(p); this._spv(a); return p; },
  updatePreventivo(id,f)  { const a = this._pv(); const i = a.findIndex(p => p.id === id); if (i<0) return null; a[i] = { ...a[i], ...f }; this._spv(a); return a[i]; },
  deletePreventivo(id)    { this._spv(this._pv().filter(p => p.id !== id)); },

  // ── Fatture ──
  _ft()  { return JSON.parse(localStorage.getItem('gh_fatture') || '[]'); },
  _sft(d){ localStorage.setItem('gh_fatture', JSON.stringify(d)); },
  _nextFtNum() { const a = this._ft(); if (!a.length) return `FT-${new Date().getFullYear()}-0001`; const nums = a.map(f => parseInt((f.numero||'').split('-').pop())||0); const n = Math.max(...nums)+1; return `FT-${new Date().getFullYear()}-${String(n).padStart(4,'0')}`; },
  getFatture()            { return this._ft(); },
  getFatturaById(id)      { return this._ft().find(f=>f.id===id)||null; },
  createFattura(f)        { const a=this._ft(); const fat={id:_genId(),numero:this._nextFtNum(),...f,createdAt:new Date().toISOString()}; a.push(fat); this._sft(a); return fat; },
  updateFattura(id,f)     { const a=this._ft(); const i=a.findIndex(x=>x.id===id); if(i>-1){a[i]={...a[i],...f};this._sft(a);return a[i];} return null; },
  deleteFattura(id)       { this._sft(this._ft().filter(f=>f.id!==id)); },
  // ── Admin Docs ──
  _ad()  { return JSON.parse(localStorage.getItem('gh_admin_docs') || '[]'); },
  _sad(d){ localStorage.setItem('gh_admin_docs', JSON.stringify(d)); },
  getAdminDocs()          { return this._ad().sort((a,b)=>new Date(b.data)-new Date(a.data)); },
  getAdminDocById(id)     { return this._ad().find(d=>d.id===id)||null; },
  createAdminDoc(f)       { const a=this._ad(); const d={id:_genId(),...f,createdAt:new Date().toISOString()}; a.push(d); this._sad(a); return d; },
  updateAdminDoc(id,f)    { const a=this._ad(); const i=a.findIndex(x=>x.id===id); if(i>-1){a[i]={...a[i],...f};this._sad(a);return a[i];} return null; },
  deleteAdminDoc(id)      { this._sad(this._ad().filter(d=>d.id!==id)); },
});

if (USE_LOCAL) _localDB._init();

// ─── Field mappers ─────────────────────────────────
function mapProfileFromDb(r) {
  if (!r) return null;
  return { id: r.id, type: r.type, nome: r.nome, cognome: r.cognome, companyName: r.company_name, phone: r.phone, planStatus: r.plan_status, role: r.role, createdAt: r.created_at };
}
function mapProfileToDb(f) {
  const r = {};
  if (f.type        !== undefined) r.type         = f.type;
  if (f.nome        !== undefined) r.nome         = f.nome;
  if (f.cognome     !== undefined) r.cognome      = f.cognome;
  if (f.companyName !== undefined) r.company_name = f.companyName;
  if (f.phone       !== undefined) r.phone        = f.phone;
  if (f.planStatus  !== undefined) r.plan_status  = f.planStatus;
  return r;
}
function mapPropFromDb(r) {
  if (!r) return null;
  return { id: r.id, userId: r.user_id, address: r.address, city: r.city, province: r.province, createdAt: r.created_at };
}
function mapRecFromDb(r) {
  if (!r) return null;
  return { id: r.id, propertyId: r.property_id, userId: r.user_id, maintenanceType: r.maintenance_type, date: r.date, workType: r.work_type, status: r.status, notes: r.notes, createdAt: r.created_at };
}
function mapQuoteFromDb(r) {
  if (!r) return null;
  return { id: r.id, nome: r.nome, cognome: r.cognome, azienda: r.azienda, email: r.email, telefono: r.telefono, citta: r.citta, note: r.note, status: r.status, createdAt: r.created_at };
}
function mapSupplierFromDb(r) {
  if (!r) return null;
  return { id: r.id, ragioneSociale: r.ragione_sociale, email: r.email, telefono: r.telefono, indirizzo: r.indirizzo, citta: r.citta, sito: r.sito, tipo: r.tipo, note: r.note, createdAt: r.created_at };
}
function mapCollaboratoreFromDb(r) {
  if (!r) return null;
  return { id: r.id, nome: r.nome, cognome: r.cognome, ruolo: r.ruolo, email: r.email, telefono: r.telefono, indirizzo: r.indirizzo, citta: r.citta, note: r.note, createdAt: r.created_at };
}
function mapCollaboratoreToDb(f) {
  const r = {};
  if (f.nome      !== undefined) r.nome      = f.nome;
  if (f.cognome   !== undefined) r.cognome   = f.cognome;
  if (f.ruolo     !== undefined) r.ruolo     = f.ruolo;
  if (f.email     !== undefined) r.email     = f.email;
  if (f.telefono  !== undefined) r.telefono  = f.telefono;
  if (f.indirizzo !== undefined) r.indirizzo = f.indirizzo;
  if (f.citta     !== undefined) r.citta     = f.citta;
  if (f.note      !== undefined) r.note      = f.note;
  return r;
}
function mapSupplierToDb(f) {
  const r = {};
  if (f.ragioneSociale !== undefined) r.ragione_sociale = f.ragioneSociale;
  if (f.email          !== undefined) r.email           = f.email;
  if (f.telefono       !== undefined) r.telefono        = f.telefono;
  if (f.indirizzo      !== undefined) r.indirizzo       = f.indirizzo;
  if (f.citta          !== undefined) r.citta           = f.citta;
  if (f.sito           !== undefined) r.sito            = f.sito;
  if (f.tipo           !== undefined) r.tipo            = f.tipo;
  if (f.note           !== undefined) r.note            = f.note;
  return r;
}

// ─── Field mappers — Preventivi ────────────────────
function mapPreventivoFromDb(r) {
  if (!r) return null;
  // status: colonna DB ha precedenza, poi dati, poi default 'bozza'
  const status = r.status || (r.dati || {}).status || 'bozza';
  return { ...(r.dati || {}), id: r.id, numero: r.numero, status, createdAt: r.created_at };
}
function mapPreventivoToDb(f) {
  const r = {};
  if (f.status    !== undefined) r.status      = f.status || 'bozza';
  if (f.data      !== undefined) r.data        = f.data || null;
  if (f.cliente   !== undefined) r.cliente_nome = f.cliente?.nome || null;
  if (f.totaleIvato !== undefined || f.totale !== undefined)
    r.totale = f.totaleIvato || f.totale || 0;
  // Salva dati completi solo quando c'è un salvataggio reale (non un semplice cambio stato)
  if (f.cliente !== undefined || f.voci !== undefined)
    r.dati = { ...f };
  return r;
}

// ─── Field mappers — Fatture ───────────────────────
function mapFatturaFromDb(r) {
  if (!r) return null;
  return {
    id: r.id, numero: r.numero, clienteNome: r.cliente_nome,
    data: r.data, importo: r.importo, iva: r.iva, totale: r.totale,
    status: r.stato, descrizione: r.descrizione, note: r.note,
    filePath: r.file_path || null, fileName: r.file_name || null, fileType: r.file_type || null,
    createdAt: r.created_at
  };
}
function mapFatturaToDb(f) {
  const r = {
    numero: f.numero, cliente_nome: f.clienteNome, data: f.data,
    importo: f.importo, iva: f.iva, totale: f.totale,
    stato: f.status, descrizione: f.descrizione || null, note: f.note || null
  };
  if (f.filePath  !== undefined) r.file_path = f.filePath;
  if (f.fileName  !== undefined) r.file_name = f.fileName;
  if (f.fileType  !== undefined) r.file_type = f.fileType;
  return r;
}

// ─── Field mappers — Documenti Admin ───────────────
function mapDocumentoFromDb(r) {
  if (!r) return null;
  return {
    id: r.id, tipo: r.tipo, data: r.data, note: r.note,
    filePath: r.file_path || null, fileName: r.file_name || null, fileType: r.file_type || null,
    createdAt: r.created_at
  };
}
function mapDocumentoToDb(f) {
  const r = { tipo: f.tipo, data: f.data, note: f.note || null };
  if (f.filePath !== undefined) r.file_path = f.filePath;
  if (f.fileName !== undefined) r.file_name = f.fileName;
  if (f.fileType !== undefined) r.file_type = f.fileType;
  return r;
}

// ─── Utilities ─────────────────────────────────────
function _genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 9); }

function showToast(msg, type = 'success') {
  let c = document.querySelector('.toast-container');
  if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  const icons = { success: '✓', error: '✕', warning: '⚠' };
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || '✓'}</span><span>${escHtml(msg)}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(110%)'; setTimeout(() => t.remove(), 350); }, 3200);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function escHtml(s) {
  const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML;
}

function planBadge(status) {
  const map = { attivo: ['badge-success','Attivo'], inattivo: ['badge-gray','Inattivo'], scaduto: ['badge-danger','Scaduto'] };
  const [cls, label] = map[status] || ['badge-gray', status || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function quoteBadge(status) {
  const map = { in_attesa: ['badge-warning','⏳ In attesa'], completato: ['badge-success','✓ Completato'] };
  const [cls, label] = map[status] || ['badge-gray', status || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function recordStatusBadge(status) {
  const map = { futuro: ['badge-info','Futuro'], completato: ['badge-success','Completato'], annullato: ['badge-danger','Annullato'] };
  const [cls, label] = map[status] || ['badge-gray', status || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function showLoading(el, msg = 'Caricamento...') {
  if (!el) return;
  el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--g400)"><div style="font-size:28px;margin-bottom:10px">⏳</div><p>${msg}</p></div>`;
}

// ─── Tutorial ──────────────────────────────────────
class Tutorial {
  constructor(steps) { this.steps = steps; this.cur = 0; this.overlay = null; this.box = null; }
  start() {
    this.cur = 0;
    this.overlay = document.createElement('div'); this.overlay.className = 'tut-overlay'; document.body.appendChild(this.overlay);
    this.box = document.createElement('div'); this.box.className = 'tut-box'; document.body.appendChild(this.box);
    window.__tut = this; this.show(0);
  }
  show(i) {
    document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight'));
    const step = this.steps[i];
    const el = document.querySelector(step.target);
    if (!el) { if (i < this.steps.length - 1) { this.cur++; this.show(this.cur); } else this.end(); return; }
    el.classList.add('tut-highlight');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      const rect = el.getBoundingClientRect();
      this.box.innerHTML = `
        <div class="tut-counter">${i + 1} / ${this.steps.length}</div>
        <div class="tut-icon">💡</div>
        <h4>${escHtml(step.title)}</h4>
        <p>${escHtml(step.content)}</p>
        <div class="tut-nav">
          ${i > 0 ? `<button class="btn btn-sm btn-outline" onclick="window.__tut.prev()">← Indietro</button>` : '<span></span>'}
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm btn-ghost" onclick="window.__tut.end()">Salta</button>
            ${i < this.steps.length - 1
              ? `<button class="btn btn-sm btn-primary" onclick="window.__tut.next()">Avanti →</button>`
              : `<button class="btn btn-sm btn-primary" onclick="window.__tut.end()">Fine ✓</button>`}
          </div>
        </div>`;
      this.box.style.display = 'block'; this.box.style.opacity = '0';
      const bw = this.box.offsetWidth || 300;
      let top  = rect.bottom + window.scrollY + 12;
      let left = Math.max(12, Math.min(rect.left + window.scrollX, window.innerWidth - bw - 12));
      if (top + 220 > window.innerHeight + window.scrollY) top = rect.top + window.scrollY - 230;
      this.box.style.top = top + 'px'; this.box.style.left = left + 'px';
      requestAnimationFrame(() => { this.box.style.opacity = '1'; this.box.style.transition = 'opacity 0.2s'; });
    }, 400);
  }
  next() { document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight')); this.cur++; if (this.cur < this.steps.length) this.show(this.cur); else this.end(); }
  prev() { document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight')); this.cur--; if (this.cur >= 0) this.show(this.cur); }
  end()  { document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight')); if (this.overlay) this.overlay.remove(); if (this.box) this.box.remove(); window.__tut = null; }
}
