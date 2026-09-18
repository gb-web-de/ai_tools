// SECURE COUNTERPART - functionally equivalent to the vulnerable fixture.
//
// The browser calls an endpoint of this installation, which authenticates the
// request through the existing session and holds the upstream credential
// server-side. No secret is shipped to the client.
export async function fetchSuggestions(term) {
  const response = await fetch(`/api/suggest?q=${encodeURIComponent(term)}`, {
    credentials: 'same-origin',
  });

  return response.json();
}
