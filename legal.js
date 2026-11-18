(() => {
  const settingsLinks = document.querySelectorAll('[data-cookie-settings]');
  if (!settingsLinks.length || !window.HTMLDialogElement) return;

  const language = document.documentElement.lang.startsWith('de') ? 'de' : 'en';
  const labels = {
    en: {
      title: 'Cookie Settings',
      description: 'This site uses browser storage to remember your choice. It currently uses no optional cookies.',
      necessary: 'Strictly necessary (always active)',
      functional: 'Allow functional cookies',
      reject: 'Reject all',
      accept: 'Accept all',
      save: 'Save preferences',
      close: 'Close cookie settings',
    },
    de: {
      title: 'Cookie-Einstellungen',
      description: 'Diese Website speichert Ihre Auswahl in Ihrem Browser. Derzeit werden keine optionalen Cookies eingesetzt.',
      necessary: 'Unbedingt erforderlich (immer aktiv)',
      functional: 'Funktionale Cookies erlauben',
      reject: 'Alle ablehnen',
      accept: 'Alle akzeptieren',
      save: 'Auswahl speichern',
      close: 'Cookie-Einstellungen schließen',
    },
  }[language];

  const dialog = document.createElement('dialog');
  dialog.className = 'cookie-dialog';
  dialog.setAttribute('aria-labelledby', 'cookie-dialog-title');
  dialog.setAttribute('aria-describedby', 'cookie-dialog-description');
  dialog.innerHTML = `
    <form method="dialog">
      <button class="cookie-dismiss" value="dismiss" aria-label="${labels.close}">×</button>
      <h2 id="cookie-dialog-title">${labels.title}</h2>
      <p id="cookie-dialog-description">${labels.description}</p>
      <label class="cookie-choice"><input type="checkbox" checked disabled> ${labels.necessary}</label>
      <label class="cookie-choice"><input name="functional" type="checkbox"> ${labels.functional}</label>
      <div class="cookie-buttons">
        <button value="reject" autofocus>${labels.reject}</button>
        <button value="accept">${labels.accept}</button>
        <button value="save">${labels.save}</button>
      </div>
    </form>`;
  document.body.append(dialog);

  const storageKey = 'tbench-cookie-preferences-v1';
  const functional = dialog.querySelector('[name="functional"]');
  let savedValue = 'reject';
  let opener;
  try {
    savedValue = localStorage.getItem(storageKey) === 'accept' ? 'accept' : 'reject';
  } catch {
    // The dialog also works in browsers that block storage.
  }

  for (const link of settingsLinks) {
    link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      functional.checked = savedValue === 'accept';
      dialog.returnValue = '';
      dialog.showModal();
    });
  }

  dialog.addEventListener('close', () => {
    const action = dialog.returnValue;
    if (action === 'accept' || action === 'reject' || action === 'save') {
      savedValue = action === 'save' ? (functional.checked ? 'accept' : 'reject') : action;
      try {
        localStorage.setItem(storageKey, savedValue);
      } catch {
        // Keep the selection for the current page if storage is blocked.
      }
    }
    opener?.focus();
  });
})();
