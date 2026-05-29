import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Render the first page of a PDF (passed in as a base64 data URL) to
// a PNG data URL. Used so we can feed PDF invoices to Claude's
// vision model — the chat API accepts images, not PDFs.
export async function renderPdfFirstPageToPng(dataUrl, { scale = 1.5 } = {}) {
  if (!dataUrl || !dataUrl.startsWith('data:application/pdf')) return null;
  try {
    const raw = atob(dataUrl.split(',')[1]);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data: arr }).promise;
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.error('[pdfOcr] render failed:', e);
    return null;
  }
}

// Render every page of a PDF (passed in as a base64 data URL) to
// an array of PNG data URLs. Used by the in-app document viewer so
// PDFs render reliably regardless of browser iframe restrictions
// (Chrome refuses blob: PDFs in iframes). Pages capped at 20 so a
// pathological 200-page PDF doesn't lock up the renderer.
export async function renderPdfAllPagesToPngs(dataUrl, { scale = 1.5, maxPages = 20 } = {}) {
  if (!dataUrl || !dataUrl.startsWith('data:application/pdf')) return [];
  try {
    const raw = atob(dataUrl.split(',')[1]);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data: arr }).promise;
    const pages = Math.min(doc.numPages, maxPages);
    const out = [];
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      out.push(canvas.toDataURL('image/png'));
    }
    return out;
  } catch (e) {
    console.error('[pdfOcr] all-pages render failed:', e);
    return [];
  }
}

// Convert a base64 data URL (image OR PDF) into a blob URL that
// browsers will happily load in an <iframe src> or window.open.
// Chrome blocks PDFs from data: URLs in iframes but allows blob URLs.
// Caller is responsible for calling URL.revokeObjectURL when done.
export function dataUrlToBlobUrl(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  try {
    const [meta, b64] = dataUrl.split(',');
    const mime = meta.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
    const raw = atob(b64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    const blob = new Blob([arr], { type: mime });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.error('[pdfOcr] blob url failed:', e);
    return null;
  }
}

// Call /api/chat with an image (or PDF rendered to PNG pages) and
// ask Claude to extract invoice fields. For PDFs we render every
// page (capped at 5) so totals on page 2+ aren't missed. Returns
// the parsed JSON object or null on failure.
export async function extractInvoiceData(fileData, fileName, { maxPdfPages = 5 } = {}) {
  if (!fileData) return null;
  const isImage = fileData.startsWith('data:image');
  const isPdf = fileData.startsWith('data:application/pdf');
  if (!isImage && !isPdf) return null;

  // Collect image data URLs to send (1 for images, up to N for PDFs).
  let pages = [];
  if (isImage) {
    pages = [fileData];
  } else {
    pages = await renderPdfAllPagesToPngs(fileData, { maxPages: maxPdfPages });
    if (!pages.length) return null;
  }

  // /api/chat requires Supabase auth — pull the session JWT same
  // way AIV.jsx does so the call doesn't 401.
  let authHeaders = { 'Content-Type': 'application/json' };
  try {
    const { getSession } = await import('../lib/db.js');
    const s = await getSession();
    if (s?.access_token) authHeaders.Authorization = `Bearer ${s.access_token}`;
  } catch (e) { /* fall through — call will 401 if auth was required */ }

  const content = [];
  pages.forEach((p) => {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: p.split(',')[1] } });
  });
  content.push({
    type: 'text',
    text: `This is a${pages.length > 1 ? ` ${pages.length}-page` : ''} document. Look at every page — totals are often on the last page. Extract the following and return ONLY valid JSON:

1) "type": one of "invoice" | "quote" | "contract" | "w9" | "w2" | "estimate" | "other". A "quote" is a price proposal that hasn't been billed yet (look for words like "Quote", "Estimate", "Proposal", "SOW", "Statement of Work" with no payment due section). An "invoice" has an amount actually owed.
2) "amount": the amount DUE NOW as a number (no $, no commas). For deposit/partial invoices, this is the deposit/installment amount, NOT the project total. Look for "Payment Due", "Amount Due", "Balance Due", "Deposit" — those override the line-item total. If it's a quote, use the quoted total.
3) "totalAmount": the FULL project total as a number (no $, no commas). For a single-payment invoice this equals "amount". For a deposit invoice, this is the bigger contract total.
4) "dueDate": in MM/DD/YYYY format
5) "terms": payment terms text if visible — e.g. "Net 30", "Due on receipt", "50% deposit, 50% on completion". Empty string if not stated.
6) "number": invoice/document number
7) "vendor": vendor/company name (who sent this)

Example: {"type":"invoice","amount":4700,"totalAmount":9400,"dueDate":"05/22/2026","terms":"50% deposit, 50% on delivery","number":"INV-001","vendor":"Vintage Truck Purveyors"}`,
  });

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 500, messages: [{ role: 'user', content }] }),
    });
    if (!res.ok) {
      console.error('[pdfOcr] /api/chat error', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (e) {
    console.error('[pdfOcr] /api/chat threw:', e);
    return null;
  }
}
