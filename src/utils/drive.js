/* ── Google Drive & Sheets integration ── */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const SHEETS_API = 'https://www.googleapis.com/v4/spreadsheets';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

/* ── Folder operations ── */

async function findFolder(token, name, parentId) {
  const q = parentId
    ? `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(token, name, parentId) {
  const existing = await findFolder(token, name, parentId);
  if (existing) return existing;

  const body = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) body.parents = [parentId];

  const res = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { console.error('[drive] Create folder failed:', await res.text()); return null; }
  const data = await res.json();
  return data.id;
}

/* ── Project folder structure ── */

const PROJECT_FOLDERS = {
  'Finance': ['Invoices', 'Contracts', 'Estimates', 'W-9s'],
  'Creative': ['Design Files', 'Photography', 'Video', 'Decks'],
  'Production': ['Run of Show', 'Floor Plans', 'Permits', 'Budgets'],
  'Client': ['RFPs & Briefs', 'Presentations', 'Contracts', 'References'],
  'Vendor Documents': [],
};

export async function createProjectFolders(token, projectName) {
  console.log('[drive] Creating folder structure for:', projectName);
  const morganId = await createFolder(token, 'Morgan', null);
  if (!morganId) return null;

  const projectId = await createFolder(token, projectName, morganId);
  if (!projectId) return null;

  const folderIds = { _morgan: morganId, _root: projectId };

  for (const [parent, children] of Object.entries(PROJECT_FOLDERS)) {
    const parentFolderId = await createFolder(token, parent, projectId);
    if (parentFolderId) {
      folderIds[parent] = parentFolderId;
      for (const child of children) {
        const childId = await createFolder(token, child, parentFolderId);
        if (childId) folderIds[`${parent}/${child}`] = childId;
      }
    }
  }

  console.log('[drive] Folder structure created:', Object.keys(folderIds).length, 'folders');
  return folderIds;
}

/* ── Share the Morgan folder with a team member ── */

export async function shareFolderWithUser(token, folderId, email, role = 'writer') {
  if (!token || !folderId || !email) return false;
  try {
    const res = await fetch(`${DRIVE_API}/files/${folderId}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'user',
        role, // 'writer' or 'reader'
        emailAddress: email,
      }),
    });
    if (!res.ok) { console.error('[drive] Share failed:', await res.text()); return false; }
    console.log('[drive] Shared with:', email);
    return true;
  } catch (e) {
    console.error('[drive] Share error:', e);
    return false;
  }
}

/* ── Share Morgan folder with all team members ── */

export async function shareWithTeam(token, morganFolderId, teamEmails) {
  if (!token || !morganFolderId || !teamEmails?.length) return;
  for (const email of teamEmails) {
    await shareFolderWithUser(token, morganFolderId, email);
  }
}

/* ── Map document type to folder path ── */

function getTargetFolder(docType, uploadContext) {
  // uploadContext: "finance", "creative", "client", "vendor", "production"
  const map = {
    // Finance documents
    invoice: 'Finance/Invoices',
    contract: 'Finance/Contracts',
    estimate: 'Finance/Estimates',
    w9: 'Finance/W-9s',
    w2: 'Finance/W-9s',
    // Creative
    design: 'Creative/Design Files',
    photo: 'Creative/Photography',
    video: 'Creative/Video',
    deck: 'Creative/Decks',
    // Client files
    rfp: 'Client/RFPs & Briefs',
    brief: 'Client/RFPs & Briefs',
    presentation: 'Client/Presentations',
    reference: 'Client/References',
    // Production
    ros: 'Production/Run of Show',
    floorplan: 'Production/Floor Plans',
    permit: 'Production/Permits',
    budget: 'Production/Budgets',
  };

  if (map[docType]) return map[docType];

  // Fall back by context
  const contextMap = {
    finance: 'Finance',
    creative: 'Creative',
    client: 'Client',
    vendor: 'Vendor Documents',
    production: 'Production',
  };
  return contextMap[uploadContext] || 'Finance';
}

/* ── Upload file to Drive ── */

export async function uploadToDrive(token, fileData, fileName, folderIds, docType, uploadContext) {
  if (!token || !fileData || !folderIds) return null;

  const targetPath = getTargetFolder(docType, uploadContext);
  const folderId = folderIds[targetPath] || folderIds[targetPath.split('/')[0]] || folderIds._root;

  if (!folderId) { console.error('[drive] No folder found for:', targetPath); return null; }

  // Convert base64 data URL to blob
  const parts = fileData.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const byteStr = atob(parts[1]);
  const ab = new ArrayBuffer(byteStr.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
  const blob = new Blob([ab], { type: mime });

  // Multipart upload
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const boundary = 'morgan_upload_' + Date.now();
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mime}\r\nContent-Transfer-Encoding: base64\r\n\r\n${parts[1]}\r\n--${boundary}--`;

  try {
    const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    if (!res.ok) { console.error('[drive] Upload failed:', await res.text()); return null; }
    const data = await res.json();
    console.log('[drive] Uploaded:', fileName, '→', data.id);
    return { driveId: data.id, webViewLink: data.webViewLink };
  } catch (e) {
    console.error('[drive] Upload error:', e);
    return null;
  }
}

/* ── Export budget to Google Sheets ── */

export async function exportBudgetToSheets(token, project, cats, ag, comp, feeP, folderIds) {
  if (!token) return null;

  const budgetsFolderId = folderIds?.['Production/Budgets'] || folderIds?.['Production'] || folderIds?._root;

  // Create spreadsheet
  const sheetTitle = `${project.name || 'Budget'} — Production Budget`;
  const createRes = await fetch(SHEETS_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title: sheetTitle },
      sheets: [{ properties: { title: 'Production Budget' } }],
    }),
  });

  if (!createRes.ok) { console.error('[sheets] Create failed:', await createRes.text()); return null; }
  const sheet = await createRes.json();
  const spreadsheetId = sheet.spreadsheetId;

  // Move to budgets folder
  if (budgetsFolderId) {
    await fetch(`${DRIVE_API}/files/${spreadsheetId}?addParents=${budgetsFolderId}&fields=id`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Build rows
  const rows = [
    [sheetTitle, '', '', '', '', '', '', ''],
    [`Generated: ${new Date().toLocaleDateString()}`, '', '', `Client: ${project.client || ''}`, '', '', '', ''],
    [],
    ['Category', 'Item', 'Description', 'Vendor', 'Actual Cost', 'Margin %', 'Client Price', 'Variance'],
  ];

  const vendors = project.vendors || [];
  const getVendor = id => vendors.find(v => v.id === id)?.name || '';

  cats.forEach(c => {
    c.items.forEach(it => {
      const cp = it.actualCost === 0 ? 0 : it.actualCost * (1 + (it.margin || 0));
      rows.push([c.name, it.name, it.details || '', getVendor(it.vendorId), it.actualCost, `${Math.round((it.margin || 0) * 100)}%`, cp, cp - it.actualCost]);
    });
  });

  rows.push([]);
  rows.push(['', '', '', '', 'PRODUCTION SUBTOTAL', '', comp.productionSubtotal.clientPrice, '']);
  rows.push([]);
  rows.push(['Agency Role', '', '', '', 'Days', 'Day Rate', 'Cost', '']);

  ag.forEach(it => {
    const cp = it.actualCost === 0 ? 0 : it.actualCost * (1 + (it.margin || 0));
    rows.push([it.name, '', '', '', it.days || '', it.dayRate || '', cp, '']);
  });

  rows.push(['', '', '', '', 'AGENCY SUBTOTAL', '', comp.agencyCostsSubtotal.clientPrice, '']);
  rows.push(['', '', '', '', `AGENCY FEE (${Math.round(feeP * 100)}%)`, '', comp.agencyFee.clientPrice, '']);
  rows.push([]);
  rows.push(['', '', '', '', 'GRAND TOTAL', '', comp.grandTotal, '']);
  rows.push(['', '', '', '', 'NET PROFIT', '', comp.netProfit, '']);

  // Write data
  const updateRes = await fetch(`${SHEETS_API}/${spreadsheetId}/values/A1?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range: 'A1', majorDimension: 'ROWS', values: rows }),
  });

  if (!updateRes.ok) { console.error('[sheets] Update failed:', await updateRes.text()); return null; }

  // Format header and totals
  await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        // Bold title row
        { repeatCell: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } }, fields: 'userEnteredFormat.textFormat' } },
        // Bold header row
        { repeatCell: { range: { sheetId: 0, startRowIndex: 3, endRowIndex: 4 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' } },
        // Auto-resize columns
        { autoResizeDimensions: { dimensions: { sheetId: 0, dimension: 'COLUMNS', startIndex: 0, endIndex: 8 } } },
      ],
    }),
  });

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  console.log('[sheets] Budget exported:', url);
  return { spreadsheetId, url };
}
