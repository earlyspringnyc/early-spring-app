import { useState, useMemo, useEffect } from 'react';
import T from '../theme/tokens.js';

// Morgan user guide. Single-page, sectioned, with a sticky TOC on
// the left so a new teammate can land at /help and orient
// themselves in 5 minutes. Content is written for a producer or
// bookkeeper — friendly but specific.

const SECTIONS = [
  { id: 'welcome',    title: 'Welcome' },
  { id: 'signin',     title: 'Signing in' },
  { id: 'dashboard',  title: 'Portfolio dashboard' },
  { id: 'projects',   title: 'Creating a project' },
  { id: 'project-dashboard', title: 'Project dashboard' },
  { id: 'budget',     title: 'Budget' },
  { id: 'vendors',    title: 'Vendors' },
  { id: 'finance',    title: 'Finance (P&L, AR/AP)' },
  { id: 'contracts',  title: 'Contracts' },
  { id: 'meetings',   title: 'Meetings' },
  { id: 'timeline',   title: 'Production timeline' },
  { id: 'creative',   title: 'Creative' },
  { id: 'ros',        title: 'Run of Show' },
  { id: 'reporting',  title: 'Reporting' },
  { id: 'crm',        title: 'CRM (Contacts)' },
  { id: 'books',      title: 'Books (cross-project finance)' },
  { id: 'activity',   title: 'Activity (audit log)' },
  { id: 'settings',   title: 'Settings & team' },
  { id: 'roles',      title: 'Roles & permissions' },
  { id: 'shortcuts',  title: 'Tips & shortcuts' },
  { id: 'troubleshoot', title: 'Troubleshooting' },
];

export default function HelpView({ onBack }) {
  const [activeId, setActiveId] = useState('welcome');

  // Update activeId based on scroll position so the TOC highlights
  // the current section as the user scrolls. Scrolling happens
  // inside the .help-scroll container (Morgan locks body overflow).
  useEffect(() => {
    const container = document.querySelector('.help-scroll');
    if (!container) return;
    const onScroll = () => {
      let current = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= 120) current = s.id;
      }
      setActiveId(current);
    };
    onScroll();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    const container = document.querySelector('.help-scroll');
    if (!el || !container) return;
    const top = el.offsetTop - 24;
    container.scrollTo({ top, behavior: 'smooth' });
  };

  return (
    <div className="help-scroll" style={{ height: '100%', overflow: 'auto', background: T.paper, color: T.ink, fontFamily: T.sans }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        padding: '16px 32px', borderBottom: `1px solid ${T.faintRule}`,
        background: 'rgba(255,255,255,.94)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        {onBack && (
          <button onClick={onBack} style={{
            background: 'transparent', border: 'none', color: T.fadedInk,
            cursor: 'pointer', fontSize: 13, fontFamily: T.sans,
          }}>← Back</button>
        )}
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: T.ink, letterSpacing: '-0.01em' }}>Morgan · Help</h1>
          <div style={{ fontSize: 11, color: T.fadedInk, marginTop: 2 }}>How to use Morgan, end to end.</div>
        </div>
      </div>

      <div className="help-grid" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 32, maxWidth: 1200, margin: '0 auto', padding: '32px' }}>
        {/* TOC */}
        <nav className="help-toc" style={{ position: 'sticky', top: 80, alignSelf: 'start', maxHeight: 'calc(100vh - 100px)', overflow: 'auto' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.fadedInk, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 8 }}>Contents</div>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '6px 10px', borderRadius: 6,
                fontSize: 12, fontFamily: T.sans, color: activeId === s.id ? T.ink : T.fadedInk,
                background: activeId === s.id ? T.inkSoft : 'transparent',
                border: 'none', cursor: 'pointer', marginBottom: 2,
                fontWeight: activeId === s.id ? 700 : 500,
              }}
            >{s.title}</button>
          ))}
        </nav>

        {/* Body */}
        <article className="help-body" style={{ minWidth: 0, fontSize: 14, lineHeight: 1.65, color: T.ink }}>

          <Section id="welcome" title="Welcome">
            <P>
              Morgan is an in-house tool for running an experiential-marketing studio. It does five things:
            </P>
            <Ul>
              <Li><b>Projects</b> — track budget, scope, deliverables, timeline, crew, vendors, all in one place.</Li>
              <Li><b>Contracts</b> — author a SOW from a wizard, send it for signature, get back a fully-executed PDF/DOCX.</Li>
              <Li><b>Finance</b> — vendor invoices (AP), client invoices (AR), transaction log, vendor W-9 / 1099 tracking, CSV export.</Li>
              <Li><b>CRM</b> — contacts, companies, meeting history, project relationships.</Li>
              <Li><b>Books</b> — a cross-project view for whoever is doing the bookkeeping.</Li>
            </Ul>
            <P>
              If you only read one section, read <a href="#roles" onClick={e => { e.preventDefault(); scrollTo('roles'); }} style={linkStyle}>Roles &amp; permissions</a> — it explains what each team member is allowed to see and do.
            </P>
          </Section>

          <Section id="signin" title="Signing in">
            <P>
              Two ways to sign in:
            </P>
            <Ol>
              <Li><b>Google sign-in</b> (recommended). One click. Grants Morgan access to your Calendar, Drive, and Gmail so the studio's automations (calendar invites, drive folder sync, email sends) can run as you. Your token is scoped to Early Spring's Google project.</Li>
              <Li><b>Email + password</b>. Fine for clients or external collaborators who don't have a Google account.</Li>
            </Ol>
            <P>
              Once signed in, your session persists across browser refreshes. Sign-out is in the sidebar.
            </P>
            <Callout>
              For full functionality — contract emails, meeting invites, document uploads — sign in with Google.
            </Callout>
          </Section>

          <Section id="dashboard" title="Portfolio dashboard">
            <P>
              The landing page after sign-in. Shows every project the org has, grouped by status (Pitching, Awarded, Current, Past). Each card surfaces the most useful info at a glance: client name, event date, total fee, stage, last touched.
            </P>
            <Ul>
              <Li>Click any project card to enter its workspace.</Li>
              <Li>Top-right header has nav buttons: <b>Early Spring CRM</b>, <b>Books</b>, <b>Activity</b>, <b>New Project</b>.</Li>
              <Li>The org switcher (top-left, only if you belong to multiple orgs) jumps between organizations you have access to.</Li>
            </Ul>
          </Section>

          <Section id="projects" title="Creating a project">
            <P>
              Click <b>+ New Project</b> in the portfolio header. Fill in:
            </P>
            <Ul>
              <Li><b>Name</b> — internal name. Be specific ("Lonely Planet Field Trips Pilot" beats "LP Pilot").</Li>
              <Li><b>Client</b> — the client's display name. This drives the company auto-fill in contracts and the CRM clustering.</Li>
              <Li><b>Event date</b> — used everywhere (contract Section 2, timeline anchors, dashboard countdown).</Li>
              <Li><b>Client budget</b> — the target you're working toward. Compared against actual costs in the budget view.</Li>
              <Li><b>Stage</b> — pitching, awarded, current, past, etc.</Li>
            </Ul>
            <P>
              Once created, the project gets a default scaffold: empty Budget, empty Timeline, no vendors yet. You can also clone an existing project (right-click a card) to copy its budget and structure.
            </P>
          </Section>

          <Section id="project-dashboard" title="Project dashboard">
            <P>
              When you open a project, the left sidebar shows every workspace tab for that project. The Dashboard is the overview — it surfaces:
            </P>
            <Ul>
              <Li>Big-number metrics (total fee, days to event, collection %, expense %).</Li>
              <Li>Client team contacts (auto-linked from the CRM by company match — <b>hardwire</b>).</Li>
              <Li>Today's calendar items pulled from your Google Calendar.</Li>
              <Li>Outstanding tasks, overdue invoices, recently-uploaded docs.</Li>
            </Ul>
            <P>
              The sidebar tabs you see depend on your role (see <a href="#roles" onClick={e => { e.preventDefault(); scrollTo('roles'); }} style={linkStyle}>Roles &amp; permissions</a>).
            </P>
          </Section>

          <Section id="budget" title="Budget">
            <P>
              The most-used tab. Every line item has the same anatomy:
            </P>
            <Ul>
              <Li><b>Details</b> — what the cost is (e.g., "Build crew, 4 days").</Li>
              <Li><b>Budget</b> — the rough estimate.</Li>
              <Li><b>Est Cost</b> — your refined estimate (gets fed by quotes).</Li>
              <Li><b>Actual Cost</b> — what was actually billed.</Li>
              <Li><b>Margin %</b> — your markup.</Li>
              <Li><b>Client Price</b> — auto-calculated as Actual × (1 + Margin). Click the value to type-override (e.g., when negotiating).</Li>
              <Li><b>Vendor</b> — pick from the project's vendor list (auto-suggests existing CRM vendors as you type).</Li>
            </Ul>
            <P>
              The four totals at the bottom: Production Subtotal, Agency Costs, Agency Fee (% of total cost, configurable), and (optional) Rep Fee (% of <i>final client spend</i> — so 10% of a $250K project is $25K).
            </P>
            <P>
              <b>Alt budgets:</b> click the budget name dropdown at the top to spin up an alternate version (e.g., "v2 — premium build"). Each alt has its own categories, agency lines, fee %. You can promote an alt to primary if it wins.
            </P>
            <Callout>
              Tip: edits autosave. The "Last saved Xm ago" indicator at the top-right tells you when the last write succeeded.
            </Callout>
          </Section>

          <Section id="vendors" title="Vendors">
            <P>
              The Vendors tab is your project-level vendor registry. Each vendor has name, contact person, email, phone, vendor type (production, venue, talent, etc.), W-9 status, finance contact, and an attached doc list.
            </P>
            <Ul>
              <Li><b>Adding a vendor</b> — click <b>Add Vendor</b>. As you type the name, Morgan suggests existing vendors from your CRM (any contact tagged <code>type=vendor</code>). Click a suggestion to autofill name, contact, email, phone.</Li>
              <Li><b>Org-wide sync</b> — any vendor you add to a project is automatically also created as a CRM contact (<code>type=vendor</code>) so it's reusable across projects.</Li>
              <Li><b>W-9 tracking</b> — set status (pending / received / verified) per vendor. The Books view flags any vendor paid $600+ in the year without a verified W-9 (1099 risk).</Li>
              <Li><b>Document uploads</b> — drop PDFs/images on a vendor card. Morgan extracts amount, due date, vendor name via AI and pre-fills the invoice details.</Li>
            </Ul>
          </Section>

          <Section id="finance" title="Finance (P&L, AR/AP)">
            <P>
              The Finance tab combines P&amp;L, transaction ledger, and document tracking for a single project.
            </P>
            <H3>Accounts Receivable (top card)</H3>
            <Ul>
              <Li><b>Upload Invoice</b> — drop a PDF you've already sent the client. Track invoice number, amount, sent date, due date.</Li>
              <Li>Sent invoices appear in a "Sent — awaiting payment" list. Overdue ones are tinted red.</Li>
              <Li>Click <b>Mark Paid</b> when the client pays — creates an income transaction automatically.</Li>
              <Li>Header shows Collected / Invoiced (unpaid) / Outstanding / Total at a glance.</Li>
            </Ul>
            <H3>Accounts Payable</H3>
            <Ul>
              <Li>Vendor invoices uploaded from the project. Same shape: amount, due date, paid amount, status (pending / overdue / paid / partial).</Li>
              <Li><b>Mark Paid</b> on any AP row → flips it to paid and adds an expense transaction.</Li>
            </Ul>
            <H3>Add Transaction</H3>
            <Ul>
              <Li>Toggle income or expense. For expenses, pick a vendor. If there are outstanding invoices for that vendor, Morgan offers to match the transaction to one (auto-fills the amount).</Li>
            </Ul>
            <H3>Documents</H3>
            <Ul>
              <Li>Drag-and-drop any file (PDF, image, DOCX). Morgan auto-detects whether it's an invoice, W-9, contract, etc. and runs AI extraction to pull amount + due date + vendor name.</Li>
              <Li>Filter by type or status across the document list.</Li>
            </Ul>
          </Section>

          <Section id="contracts" title="Contracts">
            <P>
              The Contract tab generates a Statement of Work (SOW) from the project data + a step-by-step wizard.
            </P>
            <H3>Authoring (wizard)</H3>
            <Ol>
              <Li><b>Project basics</b> — effective date, project name, high-level description (✨ Polish button for AI clean-up), event date, revision rounds.</Li>
              <Li><b>Client details</b> — legal name, legal address, project manager. Auto-fills from the CRM company card if you've populated it.</Li>
              <Li><b>Phase 01 & 02</b> — deliverables, client responsibilities, timing. Free-text, bullet-friendly. ✨ Polish available.</Li>
              <Li><b>Money</b> — total fee (pre-fills from budget), deposit % + date, final % + date, incidentals date, billing address, billing email, payment terms (renders as "thirty (30) days" automatically).</Li>
              <Li><b>Review</b> — section completeness summary + send panel.</Li>
            </Ol>
            <H3>Client-fillable fields</H3>
            <P>
              On the Client step and Money step, certain fields (legal address, billing address, billing email) have a "Let client edit this on the signing page" checkbox. Toggle on → on the public signing page the client gets editable inputs they fill before signing. Their values get saved into the executed contract.
            </P>
            <H3>Sending</H3>
            <Ul>
              <Li>On the Review step, enter a recipient email (defaults to the client PM). Add an optional intro message.</Li>
              <Li>Click <b>✉ Send for signature</b>. Morgan sends the email <i>from your Gmail</i> with the full contract embedded inline and a "Review &amp; sign" CTA. Their reply goes back to you natively. The email lands in your Sent folder.</Li>
              <Li>Status pill flips to <b>Sent</b>. After they view: <b>Viewed</b>. After they sign: <b>Signed</b> (immutable from there).</Li>
              <Li>You can resend, revoke (rotates the share token), or copy the link to share via Slack.</Li>
            </Ul>
            <H3>Public signing page</H3>
            <P>
              The client gets a URL like <code>earlyspring.nyc/contract/[token]</code>. The page is unlisted (noindex), token is unguessable (~128 bits of entropy). They see the full SOW + Exhibit A, can download as Word (.docx) for redline, save as PDF, fill in client-editable fields, and sign by typing their name.
            </P>
            <P>
              On signature: both you and the client get email confirmations. The signed contract is permanently viewable at the same URL.
            </P>
            <H3>Uploading an existing contract</H3>
            <P>
              If you signed elsewhere (DocuSign, manual PDF, etc.), use <b>📎 Upload</b> below the status pill to attach the PDF/DOCX to the project for the record.
            </P>
          </Section>

          <Section id="meetings" title="Meetings">
            <P>
              The project Meetings tab lists every meeting attached to the project, plus a free-form notes area.
            </P>
            <H3>How meetings get attached</H3>
            <Ul>
              <Li><b>Manual</b> — pick from the dropdown ("Link existing meeting").</Li>
              <Li><b>Auto via Fireflies</b> — if Fireflies records a meeting and any attendee email matches a CRM contact already linked to this project, the meeting auto-attaches. Each card shows <i>"auto-linked because [name] attended."</i></Li>
            </Ul>
            <H3>Off-topic auto-linked meetings</H3>
            <P>
              The Fireflies auto-linker is aggressive — a single shared attendee will pull the meeting in. Morgan filters by default: only meetings whose title/summary mentions the project name or client name (or that you manually linked) are shown. Off-topic ones are hidden behind a "X hidden" toggle at the top of the list, with an Unlink button on each one.
            </P>
            <H3>Scheduling a new meeting</H3>
            <P>
              Click <b>📅 Schedule meeting</b> (top-right of the Meetings tab). Pre-fills attendees from project contacts + vendors with a click-to-toggle pill picker. Date/time/duration, optional location, agenda, Google Meet link (on by default). Submit → creates the event on your Google Calendar, you're the organizer, Google sends invites to every attendee.
            </P>
          </Section>

          <Section id="timeline" title="Production timeline">
            <P>
              A gantt-style view of all production tasks. Add a task with start + end dates, assignee, status (todo / in-progress / done), and category. Drag to reschedule. Overdue tasks get a red flag and surface on the project dashboard.
            </P>
            <P>
              Each task can be sent to your Google Calendar as a one-off event (button next to it). You can also print a clean client-facing timeline view (toggle "Client view" — strips internal categories and assignees).
            </P>
          </Section>

          <Section id="creative" title="Creative">
            <P>
              Asset review workflow. Drop a file or paste a URL, label it (e.g., "Round 2 — exterior design"), set status (Draft / Internal Review / Client Review / Approved / Sent). Comments thread per asset. Useful for keeping all client-facing material in one place during the back-and-forth.
            </P>
          </Section>

          <Section id="ros" title="Run of Show">
            <P>
              The minute-by-minute schedule for event day. Add segments with start time, duration, role assignments (who's doing what), location, and notes. Print or share with the on-site crew.
            </P>
          </Section>

          <Section id="reporting" title="Reporting">
            <P>
              Post-event report builder. Upload photos and videos, write narrative sections (overview, what worked, what didn't, recommendations), capture client feedback and NPS, generate a portfolio-quality PDF you can hand to the client.
            </P>
          </Section>

          <Section id="crm" title="CRM (Contacts)">
            <P>
              Every person you've ever talked to. Auto-clustered by company so "Bridget @ Lonely Planet" and "Sarah @ Lonely Planet" both live on the same company card.
            </P>
            <H3>Contact types &amp; statuses</H3>
            <Ul>
              <Li><b>Type</b> — client, prospect, vendor, agent, internal, press, etc.</Li>
              <Li><b>Status</b> — prospect, pitching, active, past, vendor, press.</Li>
              <Li>Different combinations surface in different places (active clients in priority view, vendors in the project picker, etc.).</Li>
            </Ul>
            <H3>How contacts get into Morgan</H3>
            <Ul>
              <Li>Manually — <b>+ New contact</b>.</Li>
              <Li>From a LinkedIn URL — paste it into the new-contact modal's RocketReach lookup field; auto-fills name, email, title, company, photo, bio.</Li>
              <Li>From Gmail — periodic sync surfaces people you've corresponded with.</Li>
              <Li>From Fireflies meetings — every attendee email becomes a contact, auto-clustered.</Li>
              <Li>Automatically when you add a vendor to a project (created as <code>type=vendor</code>).</Li>
            </Ul>
            <H3>Company cards</H3>
            <P>
              Click on a company in the contacts list to open its detail panel. Edit Legal entity name / Address / Website / Billing email — these auto-populate into contracts for any project where <code>project.client</code> matches this company.
            </P>
            <P>
              <b>🪄 Look up online</b> — runs a Claude web search to find the company's legal name, full address (from Google Maps), and website. Returns up to 3 candidates so you can pick if the name is ambiguous. Click <b>💾 Save now</b> to commit your edits.
            </P>
            <H3>Linking contacts to projects</H3>
            <P>
              On a contact's detail drawer, search for a project and pick a role (Champion, Point of contact, RFP sender, Team member). The contact then appears on that project's dashboard automatically, and any future meeting they attend auto-links to the project.
            </P>
          </Section>

          <Section id="books" title="Books (cross-project finance)">
            <P>
              Cross-project view designed for whoever runs the books. Access via the <b>Books</b> button in the portfolio header. Four tabs:
            </P>
            <Ul>
              <Li><b>Receivables (AR)</b> — every unpaid client invoice across every project, sorted by days outstanding, aging bucket (0–30 / 31–60 / 61–90 / 90+).</Li>
              <Li><b>Payables (AP)</b> — every unpaid vendor invoice across every project, with remaining balance and days overdue.</Li>
              <Li><b>Transactions</b> — flat log of every income + expense across every project (max 500 rows visible, full set in CSV).</Li>
              <Li><b>Vendors / 1099</b> — YTD totals per vendor, W-9 status, and a <b>1099 risk</b> flag for vendors paid $600+ without a W-9 on file.</Li>
            </Ul>
            <P>
              Each tab has a <b>↓ Export CSV</b> button. The Transactions CSV is column-compatible with QuickBooks and Xero imports (date, type, description, vendor, project, amount, GL code placeholder, notes).
            </P>
            <P>
              Click any row to jump into that project. Header shows running totals: Outstanding AR (green) and Outstanding AP (red).
            </P>
          </Section>

          <Section id="activity" title="Activity (audit log)">
            <P>
              Visible to admins, EPs, and producers. Shows every insert / update / delete on the key tables (projects, vendors, contracts, contacts, companies) with timestamp, actor, and a field-level diff.
            </P>
            <P>
              Filter by table or click any row to expand the diff ("name: 'Acme' → 'Acme, Inc.'"). Useful for answering "who changed this number?" when an external collaborator is on the system.
            </P>
            <Callout>
              Activity only starts logging once the <code>supabase-audit-log.sql</code> migration has been run. Until then it'll say "No activity yet."
            </Callout>
          </Section>

          <Section id="settings" title="Settings & team">
            <P>
              The Settings tab (only visible to admins / EPs / producers) covers:
            </P>
            <Ul>
              <Li><b>Team management</b> — invite team members by email, assign a role (see <a href="#roles" onClick={e => { e.preventDefault(); scrollTo('roles'); }} style={linkStyle}>next section</a>), customize per-permission toggles, remove members.</Li>
              <Li><b>Org profile</b> — org name and logo.</Li>
              <Li><b>Google Drive integration</b> — pick a root folder where Morgan creates a folder structure per new project.</Li>
              <Li><b>Companies metadata</b> — clean up duplicate company rows, edit legal info.</Li>
              <Li><b>Vendor types</b> — manage the dropdown of vendor categories.</Li>
            </Ul>
          </Section>

          <Section id="roles" title="Roles & permissions">
            <P>
              Roles control what tabs and actions a team member can access. The current set:
            </P>
            <table style={tableStyle}>
              <thead><tr><Th>Role</Th><Th>Can see</Th><Th>Notes</Th></tr></thead>
              <tbody>
                <Tr><Td>Executive Producer</Td><Td>Everything</Td><Td>Full read/write across the org.</Td></Tr>
                <Tr><Td>Admin</Td><Td>Everything + team management</Td><Td>Can change roles, remove members.</Td></Tr>
                <Tr><Td>Producer</Td><Td>All project tabs except Settings</Td><Td>Day-to-day project owner.</Td></Tr>
                <Tr><Td>Finance (bookkeeper)</Td><Td>Dashboard, Budget, Vendors, Finance, Contract (read-only)</Td><Td>Lands on Books by default. No Creative / Meetings / AI / Contacts.</Td></Tr>
                <Tr><Td>Accounts</Td><Td>Dashboard, Budget, Vendors, Finance</Td><Td>Similar to Finance but no Contract access.</Td></Tr>
                <Tr><Td>Creative</Td><Td>Dashboard, Creative, Timeline, Meetings, AI</Td><Td>No budget or finance.</Td></Tr>
                <Tr><Td>Production</Td><Td>Dashboard, Timeline, Vendors, Run of Show, Meetings</Td><Td>On-site / logistics focus.</Td></Tr>
                <Tr><Td>Client</Td><Td>Single read-only shared view of a project</Td><Td>Highly restricted.</Td></Tr>
              </tbody>
            </table>
            <P>
              The legal-only <b>Finance</b> role is what you assign to an external bookkeeper. Contracts are visible (so they can see fee + payment terms) but locked to read-only.
            </P>
          </Section>

          <Section id="shortcuts" title="Tips & shortcuts">
            <Ul>
              <Li><b>Tab on a blank textarea</b> in the contract wizard accepts the suggested placeholder text.</Li>
              <Li><b>Step pills</b> at the top of the contract wizard show progress per section. Click any pill to jump.</Li>
              <Li><b>Refresh inside a project tab</b> keeps you on that tab (per-project view memory). Clicking a project from the dashboard always lands you on the project dashboard, regardless of where you last were.</Li>
              <Li><b>Sidebar collapse</b> — hover off the sidebar to collapse to icons-only.</Li>
              <Li><b>Org switcher</b> — top-left of the sidebar shows when you're a member of multiple orgs.</Li>
              <Li><b>Inline-edit budget client price</b> — click the value, type new amount. Override sticks until you click × to revert to cost × margin.</Li>
              <Li><b>Drag a file</b> anywhere on the Finance / Vendors tabs to upload it.</Li>
            </Ul>
          </Section>

          <Section id="troubleshoot" title="Troubleshooting">
            <Ul>
              <Li><b>"Sign in with Google" not working?</b> — Make sure pop-ups aren't blocked. If you've signed in before, sign out and back in to refresh tokens.</Li>
              <Li><b>"Send for signature" button disabled?</b> — You need to be signed in with Google so Morgan can send via Gmail.</Li>
              <Li><b>Calendar invites not sending?</b> — Re-grant calendar scope in your Google account, then sign out and back in.</Li>
              <Li><b>Vendor I added isn't showing in the CRM?</b> — Refresh the Contacts page. The sync is best-effort and fires once after the project save.</Li>
              <Li><b>Auto-linked meeting that doesn't belong</b> — open the Meetings tab on the project, expand the "X hidden" banner, click Unlink on the noise.</Li>
              <Li><b>Books showing $0?</b> — Confirm you have transactions saved on at least one project. Books reads from each project's stored transactions, not a separate ledger.</Li>
              <Li><b>Contract preview missing fields?</b> — Walk back through the wizard. Blank fields render as blanks in the preview. The Review step shows section-completeness counts so you can spot gaps.</Li>
              <Li><b>Activity page says "No activity yet"</b> — The <code>supabase-audit-log.sql</code> migration hasn't been run yet. Once it's run, every change starts logging.</Li>
            </Ul>
            <P style={{ marginTop: 18, fontSize: 12, color: T.fadedInk, fontStyle: 'italic' }}>
              Anything else broken? Ping Kamil directly — Morgan is a small enough tool that bugs get fixed same-day.
            </P>
          </Section>

          <div style={{ marginTop: 60, padding: 24, borderTop: `1px solid ${T.faintRule}`, fontSize: 12, color: T.fadedInk }}>
            Morgan · Early Spring · last updated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </article>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function Section({ id, title, children }) {
  return (
    <section id={id} style={{ marginBottom: 48, scrollMarginTop: 80 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: T.ink, letterSpacing: '-0.012em', margin: '0 0 16px' }}>{title}</h2>
      {children}
    </section>
  );
}
function H3({ children }) {
  return <h3 style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: '-0.005em', margin: '20px 0 8px' }}>{children}</h3>;
}
function P({ children, style }) {
  return <p style={{ margin: '0 0 12px', color: T.ink, ...style }}>{children}</p>;
}
function Ul({ children }) {
  return <ul style={{ margin: '0 0 14px', paddingLeft: 22, color: T.ink }}>{children}</ul>;
}
function Ol({ children }) {
  return <ol style={{ margin: '0 0 14px', paddingLeft: 22, color: T.ink }}>{children}</ol>;
}
function Li({ children }) {
  return <li style={{ marginBottom: 6 }}>{children}</li>;
}
function Callout({ children }) {
  return (
    <div style={{
      margin: '14px 0', padding: '12px 16px', borderRadius: 8,
      background: T.inkSoft, border: `1px solid ${T.faintRule}`,
      fontSize: 13, color: T.ink, lineHeight: 1.55,
    }}>
      💡 {children}
    </div>
  );
}
function Th({ children }) {
  return <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, color: T.fadedInk, letterSpacing: '.10em', textTransform: 'uppercase', padding: '8px 12px', borderBottom: `1px solid ${T.faintRule}` }}>{children}</th>;
}
function Td({ children }) {
  return <td style={{ padding: '8px 12px', fontSize: 12, color: T.ink, borderBottom: `1px solid ${T.faintRule}`, verticalAlign: 'top' }}>{children}</td>;
}
function Tr({ children }) {
  return <tr>{children}</tr>;
}

const tableStyle = {
  width: '100%', borderCollapse: 'collapse', marginBottom: 16,
};
const linkStyle = {
  color: T.ink, textDecoration: 'underline', textUnderlineOffset: 2,
};
