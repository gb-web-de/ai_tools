// SECURE COUNTERPART - functionally equivalent to the vulnerable fixture.
//
// The handler rejects anything that did not come from this installation's own
// origin before it looks at the payload.
export function listenForModalResult(onResult) {
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) {
      return;
    }

    onResult(JSON.parse(event.data));
  });
}
