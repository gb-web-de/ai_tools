// VULNERABLE FIXTURE - test input only, never ship this.
//
// Root cause: a server-supplied string is executed as code. Whatever reaches
// the response body becomes program logic in the visitor's browser.
export function applyFieldRule(element, ruleSource) {
  const result = eval(ruleSource);

  element.hidden = !result;
}
