// Landing page interactions

// Navbar scroll effect
const navbar = document.querySelector('.navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 20) navbar.classList.add('scrolled');
  else navbar.classList.remove('scrolled');
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
});

// Scroll reveal
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in-view'); revealObserver.unobserve(e.target); } });
}, { threshold: 0.12 });
document.querySelectorAll('.gh-reveal').forEach(el => revealObserver.observe(el));

// ── Stats counter ──
const statTargets = [80, 40, 7];
let statsAnimated = false;
function animateStats() {
  if (statsAnimated) return;
  statsAnimated = true;
  const el0 = document.getElementById('stat-0');
  const el1 = document.getElementById('stat-1');
  const el2 = document.getElementById('stat-2');
  const start = performance.now(), dur = 1500;
  function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    if (el0) el0.textContent = Math.round(statTargets[0] * e) + '%';
    if (el1) el1.textContent = '+' + Math.round(statTargets[1] * e);
    if (el2) el2.textContent = Math.round(statTargets[2] * e) + '/7';
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
const statsSection = document.querySelector('[data-stats]');
if (statsSection) {
  const statsObserver = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) { animateStats(); statsObserver.disconnect(); }
  }, { threshold: 0.3 });
  statsObserver.observe(statsSection);
}

// ── Calendario mensile (tab a stato) ──
const monthData = [
  { name: 'Gennaio',   short: 'Gen', season: 'Inverno',  tasks: ['Potatura piante dormienti', 'Pulizia da foglie e detriti', 'Controllo impianti di irrigazione', 'Trattamenti antiparassitari preventivi'] },
  { name: 'Febbraio',  short: 'Feb', season: 'Inverno',  tasks: ['Preparazione del terreno', 'Concimazione di fondo', 'Potatura siepi invernale', 'Semina anticipata in serra'] },
  { name: 'Marzo',     short: 'Mar', season: 'Primavera', tasks: ['Semina del prato', 'Prima concimazione primaverile', 'Arieggiatura e scarificatura', 'Potatura alberi ornamentali'] },
  { name: 'Aprile',    short: 'Apr', season: 'Primavera', tasks: ['Taglio prato (inizio stagione)', 'Potatura siepi', 'Piantumazione stagionale', 'Attivazione impianti irrigazione'] },
  { name: 'Maggio',    short: 'Mag', season: 'Primavera', tasks: ['Taglio prato bisettimanale', 'Trattamenti fitosanitari', 'Regolazione irrigazione', 'Semina manti erbosi'] },
  { name: 'Giugno',    short: 'Giu', season: 'Estate',    tasks: ['Taglio prato frequente', 'Potatura siepi (seconda)', 'Fertilizzazione estiva', 'Manutenzione irrigazione'] },
  { name: 'Luglio',    short: 'Lug', season: 'Estate',    tasks: ['Irrigazione intensiva', 'Controllo parassiti e malattie', 'Taglio selettivo zone ombreggiate', 'Ricarica taleaggio'] },
  { name: 'Agosto',    short: 'Ago', season: 'Estate',    tasks: ['Manutenzione impianti', 'Taglio selettivo aree critiche', 'Monitoraggio stress idrico', 'Pianificazione interventi autunnali'] },
  { name: 'Settembre', short: 'Set', season: 'Autunno',  tasks: ['Semina prato autunnale', 'Potatura siepi (terza)', 'Fertilizzazione autunnale', 'Risistemazione bordure'] },
  { name: 'Ottobre',   short: 'Ott', season: 'Autunno',  tasks: ['Raccolta foglie cadute', 'Concimazione profonda', 'Potatura piante da fiore', 'Spegnimento irrigazione'] },
  { name: 'Novembre',  short: 'Nov', season: 'Autunno',  tasks: ['Potatura alberi e arbusti', 'Preparazione invernale del suolo', 'Protezione piante dal gelo', 'Scarificatura del prato'] },
  { name: 'Dicembre',  short: 'Dic', season: 'Inverno',  tasks: ['Pulizia generale area verde', 'Ispezione e manutenzione attrezzature', 'Pianificazione anno nuovo', 'Relazione annuale interventi'] }
];
let selectedMonth = new Date().getMonth();

function renderCalendar() {
  const tabsEl  = document.getElementById('cal-tabs');
  const nameEl  = document.getElementById('cal-month-name');
  const seasonEl = document.getElementById('cal-season');
  const tasksEl = document.getElementById('cal-tasks');
  if (!tabsEl) return;

  tabsEl.innerHTML = monthData.map((m, i) =>
    `<button class="gh-cal-tab${i === selectedMonth ? ' active' : ''}" data-month="${i}">${m.short}</button>`
  ).join('');
  tabsEl.querySelectorAll('.gh-cal-tab').forEach(btn => {
    btn.addEventListener('click', () => { selectedMonth = +btn.dataset.month; renderCalendar(); });
  });

  const sel = monthData[selectedMonth];
  nameEl.textContent = sel.name;
  seasonEl.textContent = sel.season;
  tasksEl.innerHTML = sel.tasks.map((t, i) =>
    `<div class="gh-cal-task"><span class="gh-cal-task-n">0${i + 1}</span><span class="gh-cal-task-label">${t}</span></div>`
  ).join('');
}
renderCalendar();
document.getElementById('cal-prev')?.addEventListener('click', () => { selectedMonth = (selectedMonth + 11) % 12; renderCalendar(); });
document.getElementById('cal-next')?.addEventListener('click', () => { selectedMonth = (selectedMonth + 1) % 12; renderCalendar(); });

// ── Form "Richiedi preventivo" ──
document.getElementById('form-sopralluogo')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const [nomeEl, cognomeEl, aziendaEl, emailEl, telEl, cittaEl, noteEl] = this.querySelectorAll('input, textarea');
  const btn = document.getElementById('form-sopralluogo-btn');
  btn.disabled = true;
  try {
    await DB.createQuote({
      nome:     nomeEl.value.trim(),
      cognome:  cognomeEl.value.trim(),
      azienda:  aziendaEl.value.trim(),
      email:    emailEl.value.trim(),
      telefono: telEl.value.trim(),
      citta:    cittaEl.value.trim(),
      note:     noteEl.value.trim()
    });
    showToast('Richiesta inviata! Ti contatteremo presto.', 'success');
    this.reset();
  } catch (err) {
    showToast('Errore nell\'invio. Riprova.', 'error');
  } finally {
    btn.disabled = false;
  }
});
