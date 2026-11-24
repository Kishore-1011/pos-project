// Shop details the printed receipt needs (organization + licences + receipt settings).
// Fetched once and cached for the session; Settings calls invalidateReceiptProfile() after a save.

let cache = null;
let pending = null;

export function getCachedReceiptProfile() {
  return cache;
}

export function invalidateReceiptProfile() {
  cache = null;
  pending = null;
}

/** Resolves to { organization, licences, settings } or null when it can't be loaded. */
export function loadReceiptProfile(authFetch) {
  if (cache) return Promise.resolve(cache);
  if (!authFetch) return Promise.resolve(null);
  if (!pending) {
    pending = Promise.all([
      authFetch('/api/organization').then((r) => (r.ok ? r.json() : null)),
      authFetch('/api/settings').then((r) => (r.ok ? r.json() : null))
    ])
      .then(([org, settings]) => {
        cache = {
          organization: org?.organization || null,
          licences: org?.licences || [],
          settings: settings || {}
        };
        return cache;
      })
      .catch(() => {
        pending = null;
        return null;
      });
  }
  return pending;
}
