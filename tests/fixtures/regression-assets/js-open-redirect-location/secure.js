// SECURE COUNTERPART - functionally equivalent to the vulnerable fixture.
//
// The parameter selects a route from a fixed table rather than becoming the
// target itself, so the set of reachable destinations is closed.
const RETURN_ROUTES = {
  list: '/typo3/module/web/list',
  page: '/typo3/module/web/layout',
  filelist: '/typo3/module/file/list',
};

export function returnToOrigin() {
  const requested = new URLSearchParams(window.location.search).get('returnUrl');
  const target = RETURN_ROUTES[requested];

  if (!target) {
    throw new Error(`Unknown return route: ${requested}`);
  }

  window.location.href = target;
}
