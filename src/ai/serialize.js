import { ct, isOverdue } from '../utils/calc.js';
import { listMeetingsForProject } from '../lib/meetings.js';
import { listProjectNotes } from '../lib/projectNotes.js';
import { getContractForProject } from '../lib/contracts.js';
import { listTimeEntriesForProject, aggregateTimeEntries } from '../lib/timeEntries.js';
import { restFetch } from '../lib/db.js';
import { normalizeCompany } from '../utils/companyDedup.js';
import { listGmailThreadsForEmail, getGmailMessageBody } from '../utils/gmail.js';

// Hard caps so a chatty project doesn't blow the context window /
// burn tokens. Meeting transcripts are the biggest offender — keep
// them readable but capped.
const TRANSCRIPT_MAX = 6000;
const NOTE_MAX = 2000;
const MEETING_LIMIT = 30;
const NOTE_LIMIT = 50;
const TIME_ENTRY_LIMIT = 200;
const CHAT_MESSAGE_LIMIT = 100;
// Email caps. We can't blast every contact at the company through
// Gmail — quota burns fast and most contacts have nothing useful.
// 5 most-recently-updated contacts, 8 threads each, then dedupe.
const EMAIL_CONTACT_LIMIT = 5;
const EMAIL_THREADS_PER_CONTACT = 8;
const EMAIL_THREAD_LIST_CAP = 20;
const EMAIL_BODY_FETCH_COUNT = 5;
const EMAIL_BODY_MAX_CHARS = 3000;

const truncate = (str, max) => {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + `\n[…truncated, ${str.length - max} more chars]` : str;
};

const fmtDate = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return iso; }
};

// Resolve "the client" to a set of CRM contact email addresses by
// matching contacts whose normalized company === normalized
// project.client. Broad ilike on a 4-char prefix to limit the
// initial fetch, then exact normalized match client-side so
// "Lonely Planet Inc" and "Lonely Planet, LLC" both count.
async function fetchClientEmailsForProject(project) {
  const clientName = project?.client;
  if (!clientName) return [];
  const norm = normalizeCompany(clientName);
  if (!norm) return [];
  // Use a short prefix of the canonical name for the server-side
  // ilike so a project.client of "Acme" still catches "Acme, Inc.".
  // Falls back to the full string if it's already <=4 chars.
  const stem = clientName.replace(/[%_]/g, '').trim().slice(0, 4);
  const path = `/contacts?select=email,first_name,last_name,company,last_contacted_at,updated_at&email=not.is.null&company=ilike.${encodeURIComponent('%' + stem + '%')}&limit=200`;
  const rows = await restFetch(path) || [];
  const matched = rows.filter((c) => c?.email && normalizeCompany(c.company) === norm);
  // Most-recently-touched contacts first — they're the people the
  // user is actively talking to on this project.
  matched.sort((a, b) => (b.last_contacted_at || b.updated_at || '').localeCompare(a.last_contacted_at || a.updated_at || ''));
  return matched.slice(0, EMAIL_CONTACT_LIMIT);
}

async function fetchProjectEmailContext(accessToken, project) {
  if (!accessToken || !project?.client) return { contacts: [], threads: [], bodies: {} };
  let contacts = [];
  try { contacts = await fetchClientEmailsForProject(project); }
  catch (e) { console.warn('[ai-context] client contact lookup failed:', e); return { contacts: [], threads: [], bodies: {} }; }
  if (!contacts.length) return { contacts: [], threads: [], bodies: {} };

  // Fetch threads per contact in parallel, but swallow individual
  // failures (a missing gmail.readonly scope shouldn't break the
  // whole chat).
  const lists = await Promise.all(contacts.map(async (c) => {
    try {
      const threads = await listGmailThreadsForEmail(accessToken, c.email, { limit: EMAIL_THREADS_PER_CONTACT });
      return threads.map((t) => ({ ...t, _contactEmail: c.email, _contactName: [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email }));
    } catch (e) { console.warn('[ai-context] gmail list failed for', c.email, e); return []; }
  }));

  // Dedupe by threadId (a single thread might involve multiple
  // contacts at the same company). Keep the newest occurrence.
  const seen = new Map();
  lists.flat().forEach((t) => {
    const key = t.threadId || t.id;
    if (!key) return;
    const existing = seen.get(key);
    if (!existing || (t.date || '') > (existing.date || '')) seen.set(key, t);
  });
  const threads = Array.from(seen.values())
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, EMAIL_THREAD_LIST_CAP);

  // Fetch full bodies for the newest N threads.
  const toFetch = threads.slice(0, EMAIL_BODY_FETCH_COUNT);
  const bodyEntries = await Promise.all(toFetch.map(async (t) => {
    try { return [t.id, await getGmailMessageBody(accessToken, t.id, { maxChars: EMAIL_BODY_MAX_CHARS })]; }
    catch (e) { return [t.id, '']; }
  }));
  const bodies = Object.fromEntries(bodyEntries.filter(([, v]) => v));

  return { contacts, threads, bodies };
}

// Fetch all project-scoped data that lives in Supabase (not on the
// in-memory project blob). Run in parallel, swallow individual
// failures so the chat still works if one source is unavailable.
// `accessToken` and `project` are optional — if provided, Gmail
// threads for client contacts get included.
export async function fetchProjectAIContext(projectId, { accessToken, project } = {}) {
  if (!projectId) return { supabaseMeetings: [], notes: [], contract: null, timeEntries: [], clientMessages: [], email: { contacts: [], threads: [], bodies: {} } };
  const safe = (p, fallback) => p.catch((e) => { console.warn('[ai-context] fetch failed:', e); return fallback; });
  const [supabaseMeetings, notes, contract, timeEntries, clientMessages, email] = await Promise.all([
    safe(listMeetingsForProject(projectId), []),
    safe(listProjectNotes(projectId), []),
    safe(getContractForProject(projectId), null),
    safe(listTimeEntriesForProject(projectId, { limit: TIME_ENTRY_LIMIT }), []),
    safe(
      restFetch(`/client_messages?project_id=eq.${encodeURIComponent(projectId)}&order=created_at.asc&limit=${CHAT_MESSAGE_LIMIT}`).then((r) => r || []),
      [],
    ),
    safe(fetchProjectEmailContext(accessToken, project), { contacts: [], threads: [], bodies: {} }),
  ]);
  return { supabaseMeetings, notes, contract, timeEntries, clientMessages, email };
}

export function serializeRemoteContext({ supabaseMeetings = [], notes = [], contract = null, timeEntries = [], clientMessages = [], email = { contacts: [], threads: [], bodies: {} } } = {}) {
  const meetings = (supabaseMeetings || []).slice(0, MEETING_LIMIT).map((m) => {
    const attendeeNames = (m.meeting_contacts || [])
      .map((mc) => mc?.contacts)
      .filter(Boolean)
      .map((c) => [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email)
      .filter(Boolean);
    const rawAttendees = Array.isArray(m.attendees) ? m.attendees.map((a) => a?.displayName || a?.name || a?.email).filter(Boolean) : [];
    const allAttendees = Array.from(new Set([...attendeeNames, ...rawAttendees]));
    const classification = m.user_classification || m.classification || 'uncategorized';
    const actionItems = Array.isArray(m.action_items) ? m.action_items : [];
    const keywords = Array.isArray(m.keywords) ? m.keywords : [];
    const tags = Array.isArray(m.tags) ? m.tags : [];
    return `--- MEETING: ${m.title || 'Untitled'} (${classification}) ---
When: ${fmtDate(m.occurred_at)}${m.duration_minutes ? ` · ${m.duration_minutes}m` : ''}
Attendees: ${allAttendees.join(', ') || 'none'}
${keywords.length ? `Keywords: ${keywords.join(', ')}\n` : ''}${tags.length ? `Tags: ${tags.join(', ')}\n` : ''}${m.external_url ? `Source: ${m.external_url}\n` : ''}${m.summary ? `Summary:\n${m.summary}\n` : ''}${actionItems.length ? `Action items:\n${actionItems.map((ai, i) => `  ${i + 1}. ${typeof ai === 'string' ? ai : (ai.text || ai.action || JSON.stringify(ai))}`).join('\n')}\n` : ''}${m.notes ? `User notes:\n${m.notes}\n` : ''}${m.transcript ? `Transcript:\n${truncate(m.transcript, TRANSCRIPT_MAX)}\n` : ''}`;
  });

  const noteLines = (notes || []).slice(0, NOTE_LIMIT).map((n) => {
    const head = n.source === 'meeting' && n.meetings
      ? `[from meeting: ${n.meetings.title || 'Untitled'} · ${fmtDate(n.meetings.occurred_at)}]`
      : `[${n.source || 'manual'}]`;
    return `- ${fmtDate(n.created_at)} ${head}\n  ${truncate(n.content || '', NOTE_MAX).replace(/\n/g, '\n  ')}`;
  });

  const contractStr = contract
    ? `Status: ${contract.status || 'draft'}${contract.sent_at ? ` · sent ${fmtDate(contract.sent_at)}` : ''}${contract.signed_at ? ` · signed ${fmtDate(contract.signed_at)}` : ''}
Filled fields: ${contract.filled_fields ? JSON.stringify(contract.filled_fields) : '{}'}
Client-fillable fields: ${(contract.client_fillable_fields || []).join(', ') || 'none'}`
    : 'No contract on file.';

  const teAgg = aggregateTimeEntries(timeEntries || []);
  const teLines = (timeEntries || []).slice(0, TIME_ENTRY_LIMIT).map((t) =>
    `- ${t.date} · ${t.hours}h${t.rate != null ? ` @ $${t.rate}/h` : ' (unbilled)'} — ${t.description || 'no description'}`,
  );

  const chatLines = (clientMessages || []).slice(-CHAT_MESSAGE_LIMIT).map((m) =>
    `[${fmtDate(m.created_at)}] ${m.user_id ? 'staff' : 'client'}: ${m.body}`,
  );

  const emailContacts = (email?.contacts || []).map((c) => {
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
    return name ? `${name} <${c.email}>` : c.email;
  });
  const emailThreadLines = (email?.threads || []).map((t, i) => {
    const dir = t.direction === 'in' ? '←' : '→';
    const who = t._contactName || t.from?.email || t.to?.email || 'unknown';
    const head = `${i + 1}. ${dir} ${who} · ${fmtDate(t.date)} · "${t.subject || '(no subject)'}"`;
    const snippet = t.snippet ? `\n   snippet: ${t.snippet}` : '';
    const body = email?.bodies?.[t.id] ? `\n   --- body ---\n   ${email.bodies[t.id].replace(/\n/g, '\n   ')}\n   --- end body ---` : '';
    return head + snippet + body;
  });

  return `
================================================================
SUPABASE-SOURCED PROJECT CONTEXT
================================================================

LINKED MEETINGS (${(supabaseMeetings || []).length}${(supabaseMeetings || []).length > MEETING_LIMIT ? `, showing first ${MEETING_LIMIT}` : ''}):
${meetings.join('\n') || 'None'}

PROJECT NOTES (${(notes || []).length}${(notes || []).length > NOTE_LIMIT ? `, showing first ${NOTE_LIMIT}` : ''}):
${noteLines.join('\n') || 'None'}

CONTRACT:
${contractStr}

TIME ENTRIES (${(timeEntries || []).length} entries · ${teAgg.totalHours}h logged · $${teAgg.totalBilled.toFixed(2)} billed · ${teAgg.unbilledHours}h unbilled):
${teLines.join('\n') || 'None'}

CLIENT CHAT THREAD (${(clientMessages || []).length} messages${(clientMessages || []).length > CHAT_MESSAGE_LIMIT ? `, showing last ${CHAT_MESSAGE_LIMIT}` : ''}):
${chatLines.join('\n') || 'No messages'}

CLIENT EMAIL (${emailContacts.length} contact(s) at the client company, ${(email?.threads || []).length} recent thread(s), ${Object.keys(email?.bodies || {}).length} with full bodies):
Contacts surveyed: ${emailContacts.join(', ') || 'none'}
${emailThreadLines.join('\n\n') || 'No threads found (either no emails yet, or gmail.readonly scope not granted — user may need to re-authorize Google).'}`;
}

export function serializeProject(project,comp){
  const docs=project.docs||[];const txns=project.txns||[];const tasks=project.timeline||[];const vendors=project.vendors||[];const meetings=project.meetings||[];
  const overdue=docs.filter(d=>d.status==="overdue"||(d.status==="pending"&&isOverdue(d)));
  const pending=docs.filter(d=>d.status==="pending"&&!isOverdue(d));
  const tasksDone=tasks.filter(t=>t.status==="done").length;
  const totalIncome=txns.filter(t=>t.type==="income").reduce((a,t)=>a+t.amount,0);
  const totalExpenses=txns.filter(t=>t.type==="expense").reduce((a,t)=>a+t.amount,0);
  const getVendorName=id=>(vendors.find(v=>v.id===id)||{}).name||"none";
  return`PROJECT: ${project.name}
Client: ${project.client||"None"}
Start: ${project.date||"Not set"} | Event: ${project.eventDate||"Not set"}

FINANCIALS:
Grand Total: $${comp.grandTotal.toFixed(2)}
Net Profit: $${comp.netProfit.toFixed(2)}
Production Cost: $${comp.productionSubtotal.actualCost.toFixed(2)} (client: $${comp.productionSubtotal.clientPrice.toFixed(2)})
Agency Cost: $${comp.agencyCostsSubtotal.actualCost.toFixed(2)} (client: $${comp.agencyCostsSubtotal.clientPrice.toFixed(2)})
Agency Fee (${(project.feeP*100).toFixed(0)}%): $${comp.agencyFee.clientPrice.toFixed(2)}
Income Collected: $${totalIncome.toFixed(2)} of $${comp.grandTotal.toFixed(2)} (${comp.grandTotal>0?Math.round(totalIncome/comp.grandTotal*100):0}%)
Expenses Logged: $${totalExpenses.toFixed(2)}
Cashflow: $${(totalIncome-totalExpenses).toFixed(2)}

BUDGET CATEGORIES:
${project.cats.map(c=>{const t=ct(c.items).totals;return`${c.name}: actual $${t.actualCost.toFixed(2)}, client $${t.clientPrice.toFixed(2)}, items: ${c.items.map(i=>`${i.name}($${i.actualCost}/${(i.margin*100).toFixed(0)}%)`).join(", ")}`}).join("\n")}

AGENCY TEAM:
${project.ag.map(a=>`${a.name}: ${a.days}d @ $${a.dayRate}/day = $${a.actualCost}, margin ${(a.margin*100).toFixed(0)}%`).join("\n")}

TIMELINE (${tasks.length} tasks, ${tasksDone} done):
${tasks.map(t=>`[${t.status}] ${t.name} (${t.category}) ${t.startDate||"no date"}${t.endDate?" to "+t.endDate:""} ${t.assignee?"assigned:"+t.assignee:""}`).join("\n")}

RUN OF SHOW (${(project.ros||[]).length} cues):
${(project.ros||[]).map(r=>`${r.time} - ${r.item} @ ${r.location||"TBD"} (${r.lead||"no lead"}) ${r.duration||""}`).join("\n")}

VENDORS (${vendors.length}):
${vendors.map(v=>`- ${v.name} (${v.vendorType||"other"}) ${v.email||""} ${v.phone||""} w9:${v.w9Status||"pending"}`).join("\n")||"None"}

DOCUMENTS (${docs.length} total, ${overdue.length} overdue):
${docs.map(d=>`[${d.status}] ${d.name} (${d.type}) vendor:${getVendorName(d.vendorId)} $${d.amount} due:${d.dueDate||"none"}`).join("\n")}

MEETINGS (${meetings.length}):
${meetings.map(m=>`- ${m.title} ${m.date||""} ${m.time||""} (${m.duration||""}) ${m.location||""} ${m.isClientMeeting?"[CLIENT]":""}`).join("\n")||"None"}

P&L TRANSACTIONS:
${txns.map(t=>`[${t.type}] ${t.description} $${t.amount} ${t.date} ${t.category||""}`).join("\n")}

CLIENT FILES (${(project.clientFiles||[]).length}):
${(project.clientFiles||[]).map(f=>`- ${f.name} (${f.fileName||"unknown"}) [${f.category||"other"}] uploaded: ${f.dateAdded||"unknown"}`).join("\n")||"None"}

CREATIVE ASSETS (${(project.creativeAssets||[]).length}):
${(project.creativeAssets||[]).map(a=>`- ${a.name} (${a.fileName||a.fileType||"unknown"}) [${a.section||"general"}] status:${a.status||"draft"} ${a.fileSize||""} ${a.notes?`notes:"${a.notes}"`:""}${a.comments&&a.comments.length?` ${a.comments.length} comment(s)`:""}`).join("\n")||"None"}

ALTERNATE BUDGETS (${(project.budgets||[]).length}):
${(project.budgets||[]).map(b=>{const t=ct&&b.cats?b.cats.reduce((a,c)=>a+ct(c.items).totals.clientPrice,0):0;return`- ${b.name}: client total ~$${t.toFixed(2)}, ${b.cats?.length||0} categories, fee ${((b.feeP||0)*100).toFixed(0)}%`}).join("\n")||"None"}`;
}


export const AI_SYSTEM=`You are the AI assistant built into Early Spring's production management tool. You have full access to the current project data. You are sharp, direct, and helpful. No corporate filler. Match the user's pace.

You can do four things:
1. ANSWER questions about the project (budget, timeline, documents, P&L, client files, creative assets, alternate budgets, linked meetings + transcripts + action items, project notes, the contract, time entries, the staff↔client chat thread, AND recent emails to/from contacts at the client's company — anything).
2. SEE and analyze images AND PDFs from the project's creative assets and client files when they are attached to a message. PDFs are rendered as images of their first page. You can critique designs, review contracts/briefs/decks, compare versions, check brand consistency, flag issues, and give creative feedback. You can reference specific files by name.
3. SUGGEST improvements, flag risks, identify missing items, optimize margins. Cross-reference meeting transcripts and notes against the budget/timeline to surface commitments that haven't been actioned.
4. EXECUTE actions by including JSON action blocks in your response.

When you want to modify project data, include an action block like this:
\`\`\`action
{"type":"add_task","name":"Book venue","category":"Venue","startDate":"03/20/2026","endDate":"03/25/2026"}
\`\`\`

Available actions:
- {"type":"add_task","name":"...","category":"...","assignee":"...","startDate":"MM/DD/YYYY","endDate":"MM/DD/YYYY"}
- {"type":"add_doc","name":"...","docType":"invoice|w9|w2|contract","vendor":"...","amount":0,"dueDate":"MM/DD/YYYY"}
- {"type":"add_txn","txnType":"income|expense","description":"...","amount":0,"date":"MM/DD/YYYY","category":"..."}
- {"type":"add_ros","time":"14:00","item":"...","location":"...","lead":"...","duration":"30m"}
- {"type":"update_fee","feePercent":0.20}
- {"type":"update_item","category":"Venue","item":"Venue Rental","actualCost":15000,"margin":0.15}
- {"type":"update_agency","item":"Creative Director","days":5,"dayRate":800,"margin":0.15}
- {"type":"add_item","category":"Venue","name":"New Line Item","actualCost":0,"margin":0.15}

For update_item: match by category name and item name. You can update actualCost, margin, budget, estCost.
For update_agency: match by item name. You can update days, dayRate, margin.
For add_item: adds a new line item to an existing budget category.

You can include multiple action blocks. Always explain what you're doing before or after the action block. Keep responses concise. Use real numbers from the project data. If something looks off (margin too low, missing docs, timeline gaps), say so directly.`;

