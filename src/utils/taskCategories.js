// Task categories — multi-select with backwards-compatibility.
//
// Legacy tasks stored a single `category: string`. Newer tasks store
// `categories: string[]`. Always read via getCategories() so call sites
// don't have to care about the shape.
//
// projectCategories() merges DEFAULTS + the project's custom additions
// + categories already in use on this project's tasks, so the picker
// surfaces anything the user has ever typed (no orphaned values).

export const DEFAULT_CATEGORIES = ['Production', 'Strategy', 'Creative', 'Design'];

export function getCategories(task) {
  if (!task) return [];
  if (Array.isArray(task.categories)) return task.categories.filter(Boolean);
  if (typeof task.category === 'string' && task.category) return [task.category];
  return [];
}

export function primaryCategory(task) {
  return getCategories(task)[0] || '';
}

export function categoriesLabel(task) {
  return getCategories(task).join(' · ');
}

// All categories surfaced in this project's category picker. Order:
// the four defaults first, then custom additions in insertion order,
// then any other values still referenced by existing tasks (so legacy
// tasks with one-off categories don't lose their option in the picker).
export function projectCategories(project) {
  const seen = new Set();
  const out = [];
  const push = (c) => {
    const v = (c || '').trim();
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };
  DEFAULT_CATEGORIES.forEach(push);
  (project?.customTaskCategories || []).forEach(push);
  (project?.timeline || []).forEach((t) => getCategories(t).forEach(push));
  return out;
}
