(function () {
  const KEY = 'gh_cookie_consent';
  if (localStorage.getItem(KEY)) return;

  const banner = document.createElement('div');
  banner.id = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Gestione cookie');
  banner.innerHTML = `
    <div class="cb-inner">
      <div class="cb-text">
        <span class="cb-icon">🍪</span>
        <div>
          <strong>Questo sito utilizza cookie</strong>
          <p>Usiamo cookie tecnici essenziali per il funzionamento della piattaforma e cookie funzionali per migliorare la tua esperienza. Nessun cookie di profilazione o advertising.
          <a href="cookie.html" class="cb-link">Cookie Policy</a> · <a href="privacy.html" class="cb-link">Privacy</a></p>
        </div>
      </div>
      <div class="cb-actions">
        <button id="cb-essential" class="cb-btn-outline">Solo essenziali</button>
        <button id="cb-accept" class="cb-btn-primary">Accetta tutti</button>
      </div>
    </div>`;

  document.body.appendChild(banner);
  requestAnimationFrame(() => requestAnimationFrame(() => banner.classList.add('cb-visible')));

  function accept(level) {
    localStorage.setItem(KEY, level);
    banner.classList.remove('cb-visible');
    setTimeout(() => banner.remove(), 380);
  }

  document.getElementById('cb-accept').addEventListener('click', () => accept('all'));
  document.getElementById('cb-essential').addEventListener('click', () => accept('essential'));
})();
