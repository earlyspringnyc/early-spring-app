/* Budget health indicator: green / yellow / red */

import { calcProject } from './calc.js';

export function getBudgetHealth(project) {
  const clientBudget = project.clientBudget || 0;
  if (clientBudget === 0) return { status: 'none', color: '#6B7280', label: 'No budget set', pct: 0 };

  const comp = calcProject(project);
  const totalActual = (comp.productionSubtotal?.actualCost || 0)
    + (comp.agencyCostsSubtotal?.actualCost || 0)
    + (comp.agencyFee?.actualCost || 0);
  const pct = totalActual / clientBudget;

  if (pct > 0.95) return { status: 'red', color: '#F87171', label: 'Over/At Limit', pct };
  if (pct > 0.75) return { status: 'yellow', color: '#FBBF24', label: 'Watch', pct };
  return { status: 'green', color: '#34D399', label: 'Healthy', pct };
}
