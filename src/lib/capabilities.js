import { getSession } from './db.js';

// Client-side fetcher for the marketing site's structured content
// (case studies, editorials, About page) used to build prep briefs
// and customer-facing capability decks. Goes through Morgan's own
// /api/capabilities proxy — the upstream key never reaches the
// browser. Cached in module scope for the lifetime of the page so
// repeated brief/deck opens don't re-hit the network.

let cache = null;            // { generatedAt, about, content }
let inflight = null;         // pending fetch promise (de-dupes parallel calls)

async function fetchFromServer() {
  const session = await getSession();
  const res = await fetch('/api/capabilities', {
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Capabilities fetch failed: ${res.status}`);
  }
  return data;
}

export async function getCapabilities({ force = false } = {}) {
  if (cache && !force) return cache;
  if (inflight) return inflight;
  inflight = fetchFromServer()
    .then(data => { cache = data; return data; })
    .finally(() => { inflight = null; });
  return inflight;
}

// Convenience accessors — narrow slices for components that only
// need part of the payload.
export async function getCaseStudies() {
  const { content } = await getCapabilities();
  return (content || []).filter(p => p.kind === 'case-study');
}

export async function getEditorials() {
  const { content } = await getCapabilities();
  return (content || []).filter(p => p.kind === 'editorial');
}

export async function getAbout() {
  const { about } = await getCapabilities();
  return about;
}

// Manual reset — wire to a "Refresh from earlyspring.nyc" affordance
// in the brief/deck UI if you ship a new case study mid-session.
export function clearCapabilitiesCache() { cache = null; }
