-- ══════════════════════════════════════════════════════
--  GREENHOUSE — Setup Database Supabase
--  Esegui questo script nell'SQL Editor del tuo progetto
--  supabase.com → SQL Editor → New query → Incolla → Run
-- ══════════════════════════════════════════════════════

-- ── 1. TABELLE ──────────────────────────────────────

-- Profili utente (estende auth.users di Supabase)
CREATE TABLE IF NOT EXISTS user_profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'azienda' CHECK (type IN ('azienda','organizzazione')),
  nome          TEXT,
  cognome       TEXT,
  company_name  TEXT,
  phone         TEXT,
  plan_status   TEXT NOT NULL DEFAULT 'inattivo' CHECK (plan_status IN ('attivo','inattivo','scaduto')),
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Sedi / Proprietà
CREATE TABLE IF NOT EXISTS properties (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  address    TEXT NOT NULL,
  city       TEXT NOT NULL,
  province   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documenti (metadati — i file sono in Supabase Storage)
CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  file_type   TEXT,
  file_size   BIGINT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Interventi di manutenzione
CREATE TABLE IF NOT EXISTS maintenance_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL DEFAULT 'ordinaria' CHECK (maintenance_type IN ('ordinaria','straordinaria')),
  date             DATE NOT NULL,
  work_type        TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'futuro' CHECK (status IN ('futuro','completato','annullato')),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Collaboratori (visibili solo all'admin)
CREATE TABLE IF NOT EXISTS collaboratori (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  cognome    TEXT NOT NULL,
  ruolo      TEXT,
  email      TEXT,
  telefono   TEXT,
  indirizzo  TEXT,
  citta      TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fornitori (visibili solo all'admin)
CREATE TABLE IF NOT EXISTS suppliers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ragione_sociale  TEXT NOT NULL,
  tipo             TEXT,
  email            TEXT,
  telefono         TEXT,
  indirizzo        TEXT,
  citta            TEXT,
  sito             TEXT,
  note             TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Richieste di preventivo (dalla landing page, senza autenticazione)
CREATE TABLE IF NOT EXISTS quote_requests (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      TEXT NOT NULL,
  cognome   TEXT NOT NULL,
  azienda   TEXT NOT NULL,
  email     TEXT NOT NULL,
  telefono  TEXT NOT NULL,
  citta     TEXT,
  note      TEXT,
  status    TEXT NOT NULL DEFAULT 'in_attesa' CHECK (status IN ('in_attesa','completato')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. FUNZIONE HELPER ADMIN ────────────────────────

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── 3. ROW LEVEL SECURITY ───────────────────────────

ALTER TABLE user_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties          ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboratori       ENABLE ROW LEVEL SECURITY;

-- user_profiles
CREATE POLICY "profile_select" ON user_profiles FOR SELECT
  USING (auth.uid() = id OR is_admin());
CREATE POLICY "profile_insert" ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id OR is_admin());
CREATE POLICY "profile_update" ON user_profiles FOR UPDATE
  USING (auth.uid() = id OR is_admin());
CREATE POLICY "profile_delete" ON user_profiles FOR DELETE
  USING (is_admin());

-- properties
CREATE POLICY "prop_select" ON properties FOR SELECT
  USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "prop_insert" ON properties FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());
CREATE POLICY "prop_update" ON properties FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "prop_delete" ON properties FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- documents
CREATE POLICY "doc_select" ON documents FOR SELECT
  USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "doc_insert" ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());
CREATE POLICY "doc_delete" ON documents FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- collaboratori: solo admin
CREATE POLICY "col_select" ON collaboratori FOR SELECT USING (is_admin());
CREATE POLICY "col_insert" ON collaboratori FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "col_update" ON collaboratori FOR UPDATE USING (is_admin());
CREATE POLICY "col_delete" ON collaboratori FOR DELETE USING (is_admin());

-- suppliers: solo admin
CREATE POLICY "sup_select" ON suppliers FOR SELECT USING (is_admin());
CREATE POLICY "sup_insert" ON suppliers FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "sup_update" ON suppliers FOR UPDATE USING (is_admin());
CREATE POLICY "sup_delete" ON suppliers FOR DELETE USING (is_admin());

-- quote_requests: chiunque può inserire (landing pubblica), solo admin legge/modifica/elimina
CREATE POLICY "quote_insert" ON quote_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "quote_select" ON quote_requests FOR SELECT USING (is_admin());
CREATE POLICY "quote_update" ON quote_requests FOR UPDATE USING (is_admin());
CREATE POLICY "quote_delete" ON quote_requests FOR DELETE USING (is_admin());

-- maintenance_records: utenti leggono i propri, solo admin crea/modifica/elimina
CREATE POLICY "rec_select" ON maintenance_records FOR SELECT
  USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "rec_insert" ON maintenance_records FOR INSERT
  WITH CHECK (is_admin());
CREATE POLICY "rec_update" ON maintenance_records FOR UPDATE
  USING (is_admin());
CREATE POLICY "rec_delete" ON maintenance_records FOR DELETE
  USING (is_admin());

-- ── 4. STORAGE POLICIES ─────────────────────────────
-- Crea prima il bucket "documents" (privato) dal Dashboard:
-- Storage → New bucket → nome: documents → uncheck Public → Create
-- Poi esegui queste policy:

CREATE POLICY "storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents' AND
    split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "storage_select" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents' AND
    (split_part(name, '/', 1) = auth.uid()::text OR is_admin())
  );

CREATE POLICY "storage_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents' AND
    (split_part(name, '/', 1) = auth.uid()::text OR is_admin())
  );

-- ── 5. TRIGGER: updated_at automatico ───────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══════════════════════════════════════════════════════
--  DOPO AVER ESEGUITO LO SCRIPT:
--  1. Vai su Authentication → Settings e DISABILITA
--     "Enable email confirmations"
--  2. Registrati sul sito con la email admin
--  3. Poi esegui questo UPDATE per darti il ruolo admin
--     (sostituisci la email):
--
--  UPDATE user_profiles
--  SET role = 'admin'
--  WHERE id = (SELECT id FROM auth.users WHERE email = 'tua@email.it');
-- ══════════════════════════════════════════════════════
