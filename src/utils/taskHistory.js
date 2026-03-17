const STORAGE_KEY = 'es_task_history';
const MAX_HISTORY = 100;

export function getTaskHistory() {
  try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : []; } catch(e) { return []; }
}

export function addTaskToHistory(name) {
  if (!name?.trim()) return;
  const history = getTaskHistory();
  const clean = name.trim();
  if (history.includes(clean)) return;
  const updated = [clean, ...history].slice(0, MAX_HISTORY);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch(e) {}
}

export function searchTaskHistory(query) {
  if (!query?.trim()) return [];
  const q = query.toLowerCase();
  return getTaskHistory().filter(t => t.toLowerCase().includes(q)).slice(0, 8);
}
