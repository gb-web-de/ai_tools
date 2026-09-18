// SECURE COUNTERPART - functionally equivalent to the vulnerable fixture.
//
// The dynamic part is inserted as text, so markup inside it can never become
// active. The surrounding element is built as a node instead of as a string.
import DocumentService from '@typo3/core/document-service.js';

DocumentService.ready().then(() => {
  const banner = document.querySelector('.module-banner');
  const message = new URLSearchParams(window.location.search).get('message');

  const strong = document.createElement('strong');
  strong.textContent = message;

  banner.replaceChildren(strong);
});
