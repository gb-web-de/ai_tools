// VULNERABLE FIXTURE - test input only, never ship this.
//
// Root cause: the listener accepts messages from any document. TYPO3 backend
// modules run inside iframes, so any page that can reference this window can
// drive the handler with a forged payload.
export function listenForModalResult(onResult) {
  window.addEventListener('message', (event) => {
    onResult(JSON.parse(event.data));
  });
}
