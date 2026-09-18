// VULNERABLE FIXTURE - test input only, never ship this.
//
// Root cause: a value taken from the URL fragment is assigned to innerHTML.
// The browser parses it as markup, so `#<img src=x onerror=...>` executes.
import DocumentService from '@typo3/core/document-service.js';

DocumentService.ready().then(() => {
  const banner = document.querySelector('.module-banner');
  const message = new URLSearchParams(window.location.search).get('message');

  banner.innerHTML = `<strong>${message}</strong>`;
});
