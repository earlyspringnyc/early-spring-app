/* AI-assisted sheet-to-budget mapping */

import { uid } from './uid.js';
import { mkI } from '../data/factories.js';

// Heuristic column detection patterns
const COLUMN_PATTERNS = {
  category: /^(category|section|department|area|type|group|division|cost\s*center)$/i,
  item: /^(item|description|line.?item|detail|name|expense|service)$/i,
  cost: /^(cost|actual|spend|amount|total|price|estimate|est\.?|budget|subtotal|ext\.?\s*cost)$/i,
  qty: /^(qty|quantity|count|units|#|no\.?)$/i,
  rate: /^(rate|unit.?cost|price.?each|per.?unit|unit.?price|cost.?each)$/i,
  vendor: /^(vendor|supplier|provider|company|source)$/i,
  notes: /^(notes|comments|memo|details|remarks)$/i,
};

// Broader fuzzy matching for headers that contain keywords
const FUZZY_PATTERNS = {
  category: /categor|section|dept|group|area/i,
  item: /item|desc|line|detail|name|expense|service/i,
  cost: /cost|amount|total|price|budget|spend|estimate|ext/i,
  qty: /qty|quant|count|unit|number/i,
  rate: /rate|per\s|each|unit\s*(?:cost|price)/i,
  vendor: /vendor|supplier|provide|company/i,
  notes: /note|comment|memo|remark/i,
};

export function detectHeaderRow(rows) {
  // Find the row that looks most like a header (has multiple text-only cells)
  let bestRow = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] || [];
    if (row.length < 2) continue;
    let score = 0;
    row.forEach(cell => {
      const val = String(cell || '').trim();
      if (!val) return;
      // Text cell (not a number or currency)
      if (isNaN(parseFloat(val.replace(/[$,€£]/g, '')))) score += 1;
      // Bonus for matching known patterns
      for (const pattern of Object.values(COLUMN_PATTERNS)) {
        if (pattern.test(val)) score += 3;
      }
      for (const pattern of Object.values(FUZZY_PATTERNS)) {
        if (pattern.test(val)) score += 1;
      }
    });
    if (score > bestScore) { bestScore = score; bestRow = i; }
  }
  return bestRow;
}

export function detectColumns(headerRow) {
  const mapping = {};
  (headerRow || []).forEach((cell, i) => {
    const val = String(cell || '').trim();
    if (!val) return;
    // Try exact match first
    for (const [field, pattern] of Object.entries(COLUMN_PATTERNS)) {
      if (pattern.test(val) && mapping[field] === undefined) {
        mapping[field] = i;
        return;
      }
    }
    // Try fuzzy match
    for (const [field, pattern] of Object.entries(FUZZY_PATTERNS)) {
      if (pattern.test(val) && mapping[field] === undefined) {
        mapping[field] = i;
        return;
      }
    }
  });
  return mapping;
}

function parseCurrency(val) {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[$,€£\s]/g, '').replace(/\((.+)\)/, '-$1');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function isBlankRow(row) {
  return !row || row.every(c => !c || String(c).trim() === '');
}

function isCategoryRow(row, colMap) {
  // A row might be a category header if it has text in the first column but no cost
  if (!row || row.length === 0) return false;
  const hasName = row[colMap.item ?? colMap.category ?? 0] && String(row[colMap.item ?? colMap.category ?? 0]).trim();
  const hasCost = colMap.cost !== undefined && parseCurrency(row[colMap.cost]) !== 0;
  const hasQty = colMap.qty !== undefined && parseCurrency(row[colMap.qty]) !== 0;
  // If it has a name but no cost/qty, and the name looks like a section header (short, no numbers)
  if (hasName && !hasCost && !hasQty) {
    const name = String(hasName).trim();
    if (name.length < 50 && isNaN(parseFloat(name.replace(/[$,]/g, '')))) return true;
  }
  return false;
}

export function mapRowsToCategories(rows, headerIdx, colMap) {
  const dataRows = rows.slice(headerIdx + 1);
  const categories = [];
  let currentCat = { id: uid(), name: 'Imported', items: [] };

  for (const row of dataRows) {
    if (isBlankRow(row)) continue;

    // Check if this is a category/section header
    if (colMap.category !== undefined) {
      const catVal = String(row[colMap.category] || '').trim();
      if (catVal && !parseCurrency(row[colMap.cost])) {
        if (currentCat.items.length > 0 || categories.length === 0) {
          if (currentCat.items.length > 0) categories.push(currentCat);
          currentCat = { id: uid(), name: catVal, items: [] };
        } else {
          currentCat.name = catVal;
        }
        continue;
      }
    } else if (isCategoryRow(row, colMap)) {
      const name = String(row[colMap.item ?? 0] || '').trim();
      if (name) {
        if (currentCat.items.length > 0) categories.push(currentCat);
        currentCat = { id: uid(), name, items: [] };
        continue;
      }
    }

    // Regular line item
    const itemCol = colMap.item ?? colMap.category ?? 0;
    const itemName = String(row[itemCol] || '').trim();
    if (!itemName) continue;

    const cost = colMap.cost !== undefined ? parseCurrency(row[colMap.cost]) : 0;
    const qty = colMap.qty !== undefined ? parseCurrency(row[colMap.qty]) : 0;
    const rate = colMap.rate !== undefined ? parseCurrency(row[colMap.rate]) : 0;

    const item = mkI(itemName, cost, 0.15);
    if (qty && rate) { item.qty = qty; item.rate = rate; item.qxr = true; item.unit = 'ea'; }
    if (colMap.vendor !== undefined) item.details = String(row[colMap.vendor] || '').trim();
    if (colMap.notes !== undefined) item.notes = String(row[colMap.notes] || '').trim();

    currentCat.items.push(item);
  }

  if (currentCat.items.length > 0) categories.push(currentCat);
  return categories;
}

export function buildDiffPreview(currentCats, importedCats) {
  const diff = { added: [], changed: [], removed: [], unchanged: [], summary: '' };

  const currentItems = new Map();
  (currentCats || []).forEach(c => (c.items || []).forEach(i => currentItems.set(i.name?.toLowerCase(), { ...i, catName: c.name })));

  const importedItems = new Map();
  (importedCats || []).forEach(c => (c.items || []).forEach(i => importedItems.set(i.name?.toLowerCase(), { ...i, catName: c.name })));

  importedItems.forEach((item, key) => {
    const existing = currentItems.get(key);
    if (!existing) {
      diff.added.push(item);
    } else if (Math.abs(existing.actualCost - item.actualCost) > 0.01) {
      diff.changed.push({ name: item.name, oldCost: existing.actualCost, newCost: item.actualCost, catName: item.catName });
    } else {
      diff.unchanged.push(item);
    }
  });

  currentItems.forEach((item, key) => {
    if (!importedItems.has(key)) diff.removed.push(item);
  });

  diff.summary = `${diff.added.length} new, ${diff.changed.length} changed, ${diff.removed.length} removed, ${diff.unchanged.length} unchanged`;
  return diff;
}
