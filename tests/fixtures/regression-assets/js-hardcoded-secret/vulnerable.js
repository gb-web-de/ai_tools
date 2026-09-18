// VULNERABLE FIXTURE - test input only, never ship this.
//
// Root cause: a credential is embedded in a file that is delivered to every
// visitor. Anything in browser JavaScript is public by construction.
const apiKey = 'a1b2c3d4e5f6a7b8c9d0';

export async function fetchSuggestions(term) {
  const response = await fetch(`/api/suggest?q=${encodeURIComponent(term)}`, {
    headers: { 'X-Api-Key': apiKey },
  });

  return response.json();
}
