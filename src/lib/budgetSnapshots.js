import { restFetch } from './db.js';
import { calcProject } from '../utils/calc.js';

// CRUD for budget snapshots. Snapshots live in their own table
// (budget_snapshots) rather than inside project.data so we can
// retain the full version history from project creation onward
// without bloating the project row.

const enc = encodeURIComponent;

// Compute grand totals for every budget in a snapshot payload so
// the history list can show "$250K" against each row without
// re-pulling and re-calculating each snapshot's full data.
//   data: { cats, ag, feeP, clientBudget, budgets, repFeeEnabled, repFeeP }
// Returns: { primary: number, "<alt-id>": number, ... }
export function computeBudgetTotals(data) {
  const out = {};
  try {
    const primary = calcProject({
      cats: data.cats || [],
      ag: data.ag || [],
      feeP: data.feeP || 0,
      repFeeEnabled: data.repFeeEnabled || false,
      repFeeP: data.repFeeP || 0,
    });
    out.primary = primary.grandTotal || 0;
  } catch (e) { out.primary = 0; }
  for (const alt of data.budgets || []) {
    try {
      const c = calcProject({
        cats: alt.cats || [],
        ag: alt.ag || [],
        feeP: alt.feeP || 0,
        repFeeEnabled: alt.repFeeEnabled || false,
        repFeeP: alt.repFeeP || 0,
      });
      if (alt.id) out[alt.id] = c.grandTotal || 0;
    } catch (e) { if (alt.id) out[alt.id] = 0; }
  }
  return out;
}

export async function listBudgetSnapshots(projectId, { limit = 100, offset = 0 } = {}) {
  if (!projectId) return [];
  return await restFetch(
    `/budget_snapshots?select=id,at,label,auto,user_id,user_name,user_email,budget_totals&project_id=eq.${enc(projectId)}&order=at.desc&limit=${limit}&offset=${offset}`
  ) || [];
}

export async function getBudgetSnapshot(id) {
  if (!id) return null;
  const rows = await restFetch(`/budget_snapshots?select=*&id=eq.${enc(id)}&limit=1`);
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function createBudgetSnapshot(projectId, { userId, userName, userEmail, label, auto = true, data }) {
  if (!projectId || !data) throw new Error('projectId and data are required');
  const body = {
    project_id: projectId,
    user_id: userId || null,
    user_name: userName || null,
    user_email: userEmail || null,
    label: label || null,
    auto,
    data,
    budget_totals: computeBudgetTotals(data),
  };
  const out = await restFetch('/budget_snapshots?select=*', { method: 'POST', body });
  return Array.isArray(out) ? out[0] : out;
}

export async function deleteBudgetSnapshot(id) {
  if (!id) return;
  await restFetch(`/budget_snapshots?id=eq.${enc(id)}`, { method: 'DELETE' });
}
