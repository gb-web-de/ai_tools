// VULNERABLE FIXTURE - test input only, never ship this.
//
// Root cause: the navigation target is taken from a request parameter without
// validation. An attacker can send users to an external site under their
// control, or execute script through a `javascript:` URI.
export function returnToOrigin() {
  const returnUrl = new URLSearchParams(window.location.search).get('returnUrl');

  window.location.href = returnUrl;
}
