/* Google Sheets read utilities */

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export function parseSheetUrl(url) {
  if (!url) return null;
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export async function getSheetTabs(token, spreadsheetId) {
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
  const data = await res.json();
  return (data.sheets || []).map(s => s.properties.title);
}

export async function readSheetCell(token, spreadsheetId, cellRef, sheetName) {
  const range = sheetName ? `'${sheetName}'!${cellRef}` : cellRef;
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to read cell: ${res.status}`);
  const data = await res.json();
  return data.values?.[0]?.[0] || null;
}

export async function readEntireSheet(token, spreadsheetId, sheetName) {
  const range = sheetName ? `'${sheetName}'` : 'Sheet1';
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to read sheet: ${res.status}`);
  const data = await res.json();
  return data.values || [];
}
