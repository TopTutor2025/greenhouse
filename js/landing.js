// Landing page interactions

// Rotating words
const words = ['taglio prato','taglio siepi','potature','semina','preparazione terreno','manti erbosi','impianti di irrigazione','manutenzione verde'];
let wordIdx = 0;
function rotateWord() {
  const el = document.getElementById('rotating-word');
  if (!el) return;
  el.classList.add('fade-out');
  setTimeout(() => {
    wordIdx = (wordIdx + 1) % words.length;
    el.textContent = words[wordIdx];
    el.classList.remove('fade-out');
    el.classList.add('fade-in');
    setTimeout(() => el.classList.remove('fade-in'), 400);
  }, 400);
}
setInterval(rotateWord, 1800);

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

// Calendar scroll buttons
const calScroll = document.querySelector('.calendar-scroll');
document.getElementById('cal-prev')?.addEventListener('click', () => calScroll.scrollBy({ left: -260, behavior: 'smooth' }));
document.getElementById('cal-next')?.addEventListener('click', () => calScroll.scrollBy({ left: 260, behavior: 'smooth' }));

// Animate on scroll
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.style.opacity = '1'; e.target.style.transform = 'translateY(0)'; } });
}, { threshold: 0.12 });
document.querySelectorAll('.why-card, .innov-card, .month-card, .platform-feat').forEach(el => {
  el.style.opacity = '0'; el.style.transform = 'translateY(24px)'; el.style.transition = 'opacity 0.55s ease, transform 0.55s ease';
  observer.observe(el);
});

// Sopralluogo modal
function openSopralluogo() {
  const o = document.getElementById('modal-sopralluogo');
  if (o) { o.classList.add('active'); }
}
function closeSopralluogo() {
  const o = document.getElementById('modal-sopralluogo');
  if (o) { o.classList.remove('active'); }
}
document.getElementById('modal-sopralluogo')?.addEventListener('click', function(e) {
  if (e.target === this) closeSopralluogo();
});

// Sopralluogo form
document.getElementById('form-sopralluogo')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const [nomeEl, cognomeEl, aziendaEl, emailEl, telEl, cittaEl, noteEl] = this.querySelectorAll('input, textarea');
  const btn = this.querySelector('[type="submit"]');
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
    closeSopralluogo();
    showToast('Richiesta inviata! Ti contatteremo presto.', 'success');
    this.reset();
  } catch (err) {
    showToast('Errore nell\'invio. Riprova.', 'error');
  } finally {
    btn.disabled = false;
  }
});
