// Early Spring SOW + Exhibit A standard terms. The SOW body
// contains {{variables}} that the editor fills in; the entire
// Exhibit A is locked boilerplate (per your decision — no
// per-contract edits to the T&Cs).
//
// VARIABLES defines the editable field list. The renderer
// substitutes {{name}} tokens in TEMPLATE with values from
// filled_fields.
//
// Per-variable metadata:
//   section          — which wizard step this field belongs to
//   ai               — true on free-text fields the AI polish
//                      endpoint is allowed to operate on
//   clientEligible   — true if a contract can be configured to
//                      let the client fill this field on the
//                      public signing page (address, billing
//                      email, etc.)
//   prompt           — optional softer question shown above the
//                      input in the wizard, replacing the label
//   acceptIfEmpty    — optional "smart default" string the
//                      wizard offers as a one-tap accept if the
//                      user leaves the field blank

export const SECTIONS = [
  { id: 'basics',  label: 'Project basics',
    intro: 'A few facts to anchor the contract.' },
  { id: 'client',  label: 'Client details',
    intro: 'Who you\'re working with — legal name, address, day-to-day contact.' },
  { id: 'phase1',  label: 'Phase 01 — Development & Production',
    intro: 'What you\'ll deliver during build, and what you need from the client.' },
  { id: 'phase2',  label: 'Phase 02 — Installation & Launch',
    intro: 'On-site execution scope and timing.' },
  { id: 'money',   label: 'Fees & invoicing',
    intro: 'Total fee, payment split, invoice dates, billing address.' },
  { id: 'review',  label: 'Review draft',
    intro: 'Read it through. Edit anything inline before sending.' },
];

export const VARIABLES = [
  // ─── Project basics ───────────────────────────────────────
  { id: 'effective_date',  section: 'basics', label: 'Effective Date',
    prompt: 'When does this agreement take effect?', kind: 'date',
    help: 'Renders as Month D, YYYY in the contract.' },
  { id: 'project_name',    section: 'basics', label: 'Project name',
    prompt: 'What\'s the project called?', kind: 'text',
    placeholder: 'Field Trips Pilot' },
  { id: 'background',      section: 'basics', label: 'High-level description of event',
    prompt: 'In one or two sentences, what is Early Spring developing for this client?',
    kind: 'textarea', ai: true,
    placeholder: 'a multi-sensory pop-up activating Brooklyn during Climate Week, anchored on the brand\'s "made-to-last" platform',
    help: 'Goes after "Early Spring will develop and execute…" — write it as a noun phrase. ✨ Polish to tighten.' },
  { id: 'event_date',      section: 'basics', label: 'Event date',
    prompt: 'When does the event take place?', kind: 'date' },
  { id: 'revision_rounds', section: 'basics', label: 'Number of revision rounds',
    prompt: 'How many rounds of revisions are included?', kind: 'number',
    placeholder: '2', help: 'Default 2.' },

  // ─── Client details ───────────────────────────────────────
  { id: 'client_legal_name',    section: 'client', label: 'Client legal entity name',
    prompt: 'What\'s the client\'s full legal entity name?',
    kind: 'text', placeholder: 'Lonely Planet (USA), Inc.' },
  { id: 'client_legal_address', section: 'client', label: 'Client legal address',
    prompt: 'What\'s the client\'s registered legal address?',
    kind: 'textarea', clientEligible: true,
    placeholder: '1010 Frontier Way\nNashville TN 37203' },
  { id: 'client_pm_name',       section: 'client', label: 'Client project manager · name',
    prompt: 'Who\'s the client\'s day-to-day project lead?',
    kind: 'text', placeholder: 'Bridget Fitzgibbons' },
  { id: 'client_pm_email',      section: 'client', label: 'Client project manager · email',
    kind: 'text', placeholder: 'bridget@lonelyplanet.com' },
  { id: 'client_pm_phone',      section: 'client', label: 'Client project manager · phone',
    kind: 'text', placeholder: '+1 555 555 5555' },

  // ─── Phase 01 ─────────────────────────────────────────────
  { id: 'phase_1_deliverables', section: 'phase1', label: 'Phase 01 · deliverables',
    prompt: 'What will Early Spring deliver during development + production?',
    kind: 'textarea', ai: true,
    placeholder: '- Creative concepting\n- Design presentations\n- 2 rounds of client feedback\n- Final asset production (signage, collateral)\n- Installation planning',
    help: 'Prefix lines with "- " for bullets. ✨ Polish to tighten.' },
  { id: 'phase_1_client_resp',  section: 'phase1', label: 'Phase 01 · client responsibilities',
    prompt: 'What does Early Spring need from the client during Phase 01?',
    kind: 'textarea', ai: true,
    placeholder: '- Personnel requirements (Brand Ambassadors)\n- All necessary product + brand assets\n- Final approvals within agreed-on review windows',
    help: 'Bullets supported. ✨ Polish to tighten.' },
  { id: 'phase_1_timing',       section: 'phase1', label: 'Phase 01 · timing',
    prompt: 'Rough timing for Phase 01?', kind: 'text', placeholder: 'TBD' },

  // ─── Phase 02 ─────────────────────────────────────────────
  { id: 'phase_2_deliverables', section: 'phase2', label: 'Phase 02 · deliverables',
    prompt: 'What will Early Spring deliver during installation + launch?',
    kind: 'textarea', ai: true,
    placeholder: '- On-site execution + management\n- Build oversight\n- Setup, breakdown, security\n- Brand Ambassador support',
    help: 'Bullets supported. ✨ Polish to tighten.' },
  { id: 'phase_2_timing',       section: 'phase2', label: 'Phase 02 · timing',
    prompt: 'Rough timing for Phase 02?', kind: 'text', placeholder: 'TBD' },

  // ─── Money & invoicing ────────────────────────────────────
  { id: 'total_fee',            section: 'money', label: 'Total project fee (USD)',
    prompt: 'What\'s the total project fee?', kind: 'currency',
    placeholder: '150000',
    help: 'Pre-fills from the current calculated project total. Override here if you negotiated a different number.' },
  { id: 'deposit_pct',          section: 'money', label: 'Deposit (%)',
    prompt: 'What percent of the fee is due as deposit?',
    kind: 'number', placeholder: '70',
    help: 'Default 70%. Dollar amount renders automatically.' },
  { id: 'deposit_date',         section: 'money', label: 'Deposit · invoice date',
    prompt: 'When should the deposit invoice go out?', kind: 'date',
    help: 'Commonly the signing date.' },
  { id: 'final_pct',            section: 'money', label: 'Final amount due (%)',
    prompt: 'What percent is the final payment?', kind: 'number',
    placeholder: '30', help: 'Should sum to 100% with the deposit.' },
  { id: 'final_due_date',       section: 'money', label: 'Final amount due · invoice date',
    prompt: 'When does the final payment invoice go out?', kind: 'date' },
  { id: 'incidentals_date',     section: 'money', label: 'Pre-approved incidentals · invoice date',
    prompt: 'Date for the incidentals/expenses invoice?', kind: 'date' },
  { id: 'client_billing_addr',  section: 'money', label: 'Client billing address',
    prompt: 'Where should invoices be addressed?', kind: 'textarea',
    clientEligible: true,
    placeholder: 'Accounts Payable\n1010 Frontier Way\nNashville TN 37203' },
  { id: 'client_billing_email', section: 'money', label: 'Client billing contact (email)',
    prompt: 'Which email receives invoices?', kind: 'text',
    clientEligible: true, placeholder: 'ap@lonelyplanet.com' },
  { id: 'payment_terms_days',   section: 'money', label: 'Payment terms (days)',
    prompt: 'How many days does the client have to pay each invoice?',
    kind: 'number', placeholder: '30',
    help: 'Standard is 30 (Net-30). Renders in Section 9 as e.g. "thirty (30) days" — the word form is generated automatically.' },
];

// Convert 1–99 to its English word form. Used for legal-style
// payment terms phrasing — e.g., 30 → "thirty", 45 → "forty-five".
// Anything outside that range renders as digits only.
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
              'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
              'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function numberToWord(n) {
  const v = Math.floor(Math.abs(Number(n)));
  if (!Number.isFinite(v) || v === 0) return String(n);
  if (v < 20) return ONES[v];
  if (v < 100) {
    const t = Math.floor(v / 10), o = v % 10;
    return o === 0 ? TENS[t] : `${TENS[t]}-${ONES[o]}`;
  }
  return String(v);
}

// Variables grouped by section, in the wizard's section order.
export const VARIABLES_BY_SECTION = SECTIONS.reduce((acc, s) => {
  acc[s.id] = VARIABLES.filter(v => v.section === s.id);
  return acc;
}, {});

// Fields that auto-calculate from other fields. No longer used
// to pre-fill stored fields — deposit/final are now percentage-
// driven and amounts render dynamically. Kept for the editor's
// recompute hook compatibility.
export const DERIVED = {};

// Money formatter for preview output. Returns "$105,000" style.
function fmtUSD(n) {
  if (n == null || n === '') return '';
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

// Template substitution. Pass values keyed by VARIABLES[i].id.
// Currency fields render formatted; computed amounts (deposit /
// final dollar values from percentages) are derived at render
// time so the contract always reflects current pct × total.
export function renderContract(values = {}) {
  const total = Number(values.total_fee) || 0;
  const depositPct = Number(values.deposit_pct) || 0;
  const finalPct = Number(values.final_pct) || 0;
  const termsDays = Number(values.payment_terms_days) || 30;
  const computed = {
    ...values,
    deposit_amount_calc: total && depositPct ? Math.round(total * depositPct / 100) : '',
    final_amount_calc:   total && finalPct   ? Math.round(total * finalPct   / 100) : '',
    // Renders as "thirty (30)" — legal-doc convention. The word
    // is generated; the user only edits the digit.
    payment_terms_phrase: `${numberToWord(termsDays)} (${termsDays})`,
  };

  const v = (key) => {
    const raw = computed[key];
    if (raw == null || raw === '') return '';
    // Currency fields + the computed _calc fields render as money
    const spec = VARIABLES.find(x => x.id === key);
    if (spec?.kind === 'currency' || key.endsWith('_amount_calc')) return fmtUSD(raw);
    // Date fields stored as ISO YYYY-MM-DD format as "Month D, YYYY"
    // for the rendered contract. Legacy free-text strings just
    // pass through.
    if (spec?.kind === 'date' && /^\d{4}-\d{2}-\d{2}/.test(String(raw))) {
      const d = new Date(String(raw) + 'T00:00:00');
      if (!isNaN(d)) return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    return String(raw);
  };

  return TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_, k) => v(k));
}

// The raw SOW + Exhibit A. Boilerplate text is verbatim from the
// shared template; variables sit at {{tokens}}. Rendered to HTML
// by the editor and the public signing route — minimal markdown
// (newlines, headings, lists) only.
const TEMPLATE = `# SCOPE OF WORK

## Early Spring × {{client_legal_name}}

This Scope of Work (this "SOW"), together with the Early Spring Standard Terms and Conditions (attached hereto as Exhibit A and incorporated herein by reference) shall form the entire agreement ("Agreement") entered into and effective as of {{effective_date}} (the "Effective Date"), by and between EARLY SPRING, LLC, a New York limited liability company of 385 Van Brunt Street, Brooklyn, New York 11231 ("Agency") and {{client_legal_name}} of {{client_legal_address}} ("Client" and, together with Agency, the "Parties", or each individually, a "Party").

In consideration of the mutual promises contained herein, and for other good and valuable consideration, the receipt and sufficiency of which is hereby acknowledged, the Parties agree as follows:

### 1. PROJECT MANAGERS

The Parties' project managers for **{{project_name}}** (the "Project") are:

| EARLY SPRING, LLC | {{client_legal_name}} |
| --- | --- |
| Name: Kamil Tyebally | Name: {{client_pm_name}} |
| Email: kamil@earlyspring.nyc | Email: {{client_pm_email}} |
| Phone: +1.646.701.2844 | Phone: {{client_pm_phone}} |

### 2. BACKGROUND

Agency has been engaged by Client to deliver the Project on or around {{event_date}}, pursuant to the terms and conditions of this Agreement.

As a partner to {{client_legal_name}}, Early Spring will develop and execute {{background}}.

### 3. SERVICES AND DELIVERABLES

Agency's Services and deliverables provided to Client in connection with the Project (collectively, the "Deliverables") will consist of the following:

#### Phase 01: Development & Production

**Deliverables**

{{phase_1_deliverables}}

**Client's Responsibilities**

{{phase_1_client_resp}}

**Timing:** {{phase_1_timing}}

#### Phase 02: Installation & Launch

**Deliverables**

{{phase_2_deliverables}}

**Timing:** {{phase_2_timing}}

### 4. ASSUMPTIONS

Client will provide Agency with written approval and acceptance of all Deliverables provided. Delays in approval or responses from Client and/or Client-managed individuals/entities could result in delays and will affect Agency's successful completion of Services.

The scope of this SOW allows for reviews and revisions as outlined in the Deliverables and Services in Section 3 ({{revision_rounds}} rounds). Additional rounds of review and revisions will have an impact on the overall timeline, budget, and fees for the Project. If additional rounds are desired, Agency will provide an overage estimate (if any) for Client's prior written approval. For the avoidance of doubt, any amendment to the Fee (as defined herein) must be memorialized in the form of a written amendment to this Agreement executed by authorized representatives of both Parties.

### 5. OUT OF SCOPE SERVICES

From time to time, Client may request Agency to perform certain activities and/or services that do not fall within the scope of the Services set forth in this SOW (in each case, "Out of Scope" services). If Agency receives a request that it determines is a request for Out of Scope services, Agency will notify Client that the services requested are Out of Scope and that additional fees may be incurred if Agency is able to accommodate the request. If Client desires Agency to perform the Out of Scope service(s), Client shall make requests to Agency in writing via email. Agency will review Client's request and propose solutions, including the services, deliverables, timelines, staffing/resource plan, and corresponding fees for completion of the Out of Scope services.

For all Out of Scope services, Agency will provide a non-binding estimate for Client's prior written approval before performing any additional work. For the avoidance of doubt, any amendment to the Services and/or Deliverables hereunder to add on Out of Scope services and/or deliverables must be memorialized in the form of a written amendment to this Agreement executed by authorized representatives of both Parties.

### 6. CLIENT RESPONSIBILITIES

Client understands and acknowledges that it shall be responsible for performing the following in a reasonable and timely manner throughout the Term (as defined herein):

- Provide Client content, in a form suitable for reproduction or incorporation into Agency Deliverables, to ensure Client alignment and product integration. This includes creation and/or provision of Client's logo, fonts, Client copy, product descriptions, and additional copywriting;
- Deliver consolidated feedback to Agency on all Deliverables as listed in Section 3 within the stipulated timeline of asset delivery unless otherwise noted; and
- Manage and coordinate third-party companies and individuals necessary for Agency to complete its Services and Deliverables listed in Section 3 and not otherwise directly contracted by Agency.

However, Agency's performance is not contingent on Client's performance of the responsibilities listed above unless, and only to the extent, such a failure by Client prohibits Agency from being able to perform.

### 7. TERMS AND TERMINATION

The Term of this Agreement commences on the Effective Date and will continue until completion of the Project and provision of all Services and Deliverables hereunder (the "Term"), unless otherwise terminated in accordance with the terms of this SOW.

Either Party may terminate this Agreement For Cause (as defined below) by delivering a minimum of fifteen (15) days' written notice (a "Termination Notice") to the other Party, which shall particularly describe the grounds for termination.

In the event Client terminates this Agreement For Cause, either (i) Client will owe Agency a pro-rata portion of the Fee for all Services rendered prior to the receipt of the Termination Notice for which Client has not yet paid, or (ii) Agency will reimburse Client for any portion of the Fee prepaid by Client for which Services have not been rendered prior to the receipt of the Termination Notice.

In the event Agency terminates this Agreement For Cause, Client will owe Agency the remainder of any unpaid portion of the Fee set out herein.

All payment owed following termination of this Agreement For Cause shall be due and payable within thirty (30) days of the date of the Termination Notice.

For purposes of this Agreement, "For Cause" means:

- Any breach of a Party's material obligations under this Agreement, including, but not limited to, a refusal by, or inability of, Agency to perform the Services, or a refusal by, or inability of, Client to render payment of the Fee and expenses, as described in Section 9 below; in each case, which violation is not remedied within fifteen (15) days after receipt of written notice from the non-violating Party; or
- the happening of a voluntary or involuntary filing for a petition under bankruptcy laws of the United States, the execution of an assignment for the benefit of creditors, a calling of a meeting of creditors, an appointment of a dissolution or liquidate agent or committee, or an application for an appointment of a receiver by the other Party.

Termination of this Agreement by Client for any reason other than For Cause will require payment of the Fee for all Services rendered and expenses incurred by Agency material to the Project prior to its receipt of the Termination Notice, as well as any additional expenses agreed-upon, within thirty (30) days of termination unless otherwise agreed upon by the Parties.

### 8. EXPERIENTIAL EVENTS & SPECIAL PROJECTS

Client acknowledges that, due to the inherent complexities of physical builds and live events, some Deliverables may, by their nature, differ from what was provided in renderings, moodboards, and other preparatory materials delivered to Client (the "Conceptual Materials"). Client should anticipate some deviation from what was depicted in the Conceptual Materials. Notwithstanding the foregoing, Agency shall use best efforts to execute and deliver the Deliverables as agreed upon with Client through the Conceptual Materials, aiming to fully realize the concepts and designs proposed. Further, where possible, Agency shall propose and implement reasonable solutions to address and compensate for any substantive disparities between the proposed designs and the Deliverables with the aim to maintain the integrity and quality of the Event experience.

### 9. FEES AND EXPENSES

In exchange for the Services and Deliverables, Client shall pay Agency a project fee of {{total_fee}} USD (the "Fee").

Payment of the Fee and reimbursable out-of-pocket expenses or other incidentals (the "Expenses") shall be invoiced as follows:

| Fee/Expense Type | Amount | Invoice Date |
| --- | --- | --- |
| Project Deposit ({{deposit_pct}}%) | {{deposit_amount_calc}} | {{deposit_date}} |
| Final Amount Due ({{final_pct}}%) | {{final_amount_calc}} | {{final_due_date}} |
| Pre-Approved Incidentals / Out of Pocket Expenses | To be confirmed / If applicable | {{incidentals_date}} |

Agency will send invoices in accordance with the instructions set forth by Client as follows:

| Billing Address (provided by Client) | {{client_billing_addr}} |
| --- | --- |
| Invoice Instructions (provided by Client) | Agency will submit project invoices via email to {{client_billing_email}}. |

Full payment of all invoiced amounts shall be due {{payment_terms_phrase}} days after Client's receipt of the applicable, accurate invoice. All invoices shall reference the Project and shall be emailed to Client's Project Manager set forth in Section 1.

Total costs are subject to change pending development and approval of Services and/or Deliverables. Agency is committed to communicating any shifts in scope that warrant additional time and costs and will receive written approval from Client before moving forward. For the avoidance of doubt, authorized representatives of both Parties must execute an amendment to this SOW in the event the Fee will exceed the amount indicated herein; otherwise, Client shall not be obligated to pay any amount in excess of the Fee indicated herein.

Agency must obtain Client's written approval prior to incurring any out-of-pocket expenses or other incidentals in the performance of its obligations hereunder. Agency must submit receipts for such Expenses with an invoice reflecting such Expenses in order to obtain reimbursement from Client.

Upon the full execution of this Agreement, Agency must provide Client with an executed W-9, and Agency acknowledges and agrees that its failure to provide such executed W-9 in a timely manner may result in a delay of payment of amounts due herein.

---

## EXHIBIT A — EARLY SPRING STANDARD TERMS AND CONDITIONS

These Early Spring Standard Terms and Conditions, together with the fully executed Statement of Work (and any attachments thereto) ("SOW"), shall form the entire agreement ("Agreement") between EARLY SPRING, LLC ("AGENCY") and the person or entity identified as "Client" in the SOW (the "Parties", or each individually, a "Party").

**1. Grant of Rights to Client.** Solely in connection with the Services and Project throughout the Term, Agency hereby grants to the exclusive (save and except for Agency and other authorized parties) right and license to display, copy and use any materials, photographs, films, drawings, and other results and proceeds created by Agency for the Project (collectively, "Results and Proceeds"). Notwithstanding the foregoing, Client is under no obligation to remove any Results and Proceeds as it appears in its original form on the Client's social and digital media channels after the Term and (iii) Client shall retain the right to display and use the Results and Proceeds after the Term, solely for non-commercial administrative, historical, and portfolio purposes, provided Client cannot alter or repurpose such Content. Any additional uses of the Results and Proceeds shall require Agency's prior written approval.

**2. Grant of Rights to Agency.** Client grants to Agency a non-exclusive, sub-licensable (solely to Influencer(s)) right and license to use any and all Client intellectual property ("Client IP") provided hereunder, throughout the world, solely in connection with the provision of the Services. Agency shall not gain any interest in or to any Client IP. Following the end of the Term, Agency shall be permitted to use the Client IP, solely as incorporated into the Content, for administrative, historical, portfolio, and award consideration purposes.

**3. Confidentiality; Non-Disclosure.** During the course of this Agreement, the Parties may share with each other certain information of a proprietary and/or confidential nature, including, without limitation, (a) the details of this Agreement; (b) any financial, operational or marketing data, lists or strategies of the other Party; or (c) any other information relating to the business of the other Party, irrespective of whether such information is labeled as proprietary, confidential, material, or important (collectively, the "Confidential Information"). The Parties shall maintain the Confidential Information in strict confidence. The Parties agree that, without the other Party's consent, no Party shall use for its own benefit or divulge, disclose or communicate to any third-party any Confidential Information (except to each Party's respective employees, legal and financial representatives, as and to the extent necessary). Notwithstanding the foregoing, Agency may disclose to any Influencer such Confidential Information as is necessary to perform the Services, provided that Agency shall notify any Influencer who may be provided with such Confidential Information of (x) the confidential and proprietary nature of the Confidential Information and (y) such Influencer's obligation to comply with and be bound by the terms of this Section. The receiving Party shall not be liable for the disclosure of Confidential Information that: (i) is or becomes known through no fault of the receiving Party; (ii) is provided by the disclosing Party on a non-restricted basis; (iii) is disclosed with the disclosing Party's consent; (iv) is known to the receiving Party prior to receipt thereof, (v) is independently developed by the receiving Party; or (vi) is required to be disclosed by law or judicial order, but only to the extent required by such law or judicial order.

**4. Non-Solicitation.** During the Term, and for a period of twelve (12) months thereafter, neither Client nor any of Client's directors, officers, shareholders, employees, agents, representatives or affiliates (each, a "Client Party") shall, directly or indirectly, (a) induce or attempt to influence any directors, officers, shareholders, employees, contractors customers, agents, representatives or affiliates of Agency (each, a "Agency Party") to terminate their relationship with Agency or to enter into any business relationship with any other person or entity (including Client); or (b) attempt to circumvent this Agreement by soliciting, contracting with or otherwise communicating or doing business with any Agency Party without Agency's consent. Client acknowledges that it has received sufficient and valuable consideration for the restrictions contained in this Section.

**5. Relationship of Parties.** Agency shall be an independent contractor and not an agent or employee of Client. Agency shall supervise the performance of its own work, and that of the Agency Parties, and shall have control over the manner and means by which the Services are performed, subject to compliance with this Agreement.

**6. Representations.** The Parties represent, warrant, covenant, and agree that: (a) they have the power and authority to enter into and perform this Agreement; (b) any necessary rights, permits, licenses, insurance, bonds, certificates and other similar approvals or consents have been or will be obtained prior to commencing the Services; (c) they will comply with all applicable laws and regulations in fulfilling its obligations hereunder; (d) they will not act in a manner or enter into any oral or written agreements inconsistent with this Agreement; and (d) any materials provided by either Party will not violate or infringe the rights of any third party.

**7. Indemnification.** Each party (an "Indemnifying Party") agrees to defend, indemnify and hold harmless the other Party and their partners, principals, members, officers, employees, representatives, and permitted subcontractors, including, for Agency, Influencers, (each, an "Indemnified Party") from and against any and all third-party claims liabilities, deficiencies, judgments, awards, settlements, interest, damages, losses, fines, injuries, penalties, fees, costs and expenses (including reasonable attorneys' fees and expenses) (collectively, "Claims") in connection with Indemnifying Party's (a) material breach of this Agreement, (b) gross negligence or willful misconduct in connection with this Agreement or (c) infringement of any intellectual property rights or other third-party rights. If the Indemnified Party is also at fault, this indemnification obligation shall be on a comparative fault basis. Upon receipt of a Claim, the Indemnified Party must provide the Indemnifying Party with notice of such Claim (a "Claim Notice") within five (5) days. The Indemnified Party's failure to timely provide a Claim Notice shall be deemed a waiver by the Indemnified Party of its right of indemnity. The Indemnifying Party's failure to reasonably defend a Claim after receipt of a timely Claim Notice shall entitle the Indemnified Party to reasonably defend such Claim, at the Indemnifying Party's reasonable expense. The Indemnifying Party shall be entitled to control the defense and settlement of the claim, provided, however, that the Indemnifying Party must get the Indemnified Party's consent before settling a Claim if such settlement involves anything other than a payment of funds for which the Indemnified Party is entitled to full indemnification. If the Indemnifying Party has been notified of and is not diligently and continuously pursuing a Claim, then the Indemnified Party may take control of the defense at the Indemnifying Party's cost and expense.

**8. Limitations on Liability.** NEITHER PARTY WILL BE LIABLE TO THE OTHER FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, PUNITIVE OR SPECIAL DAMAGES, ARISING OUT OF OR RELATED TO THIS AGREEMENT, EVEN IF SUCH PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. IN NO EVENT SHALL AGENCY'S TOTAL LIABILITY TO CLIENT UNDER THIS AGREEMENT EXCEED THE TOTAL COMPENSATION PAID TO AGENCY BY CLIENT UNDER THIS AGREEMENT. HOWEVER, THIS LIMIT ON TYPES OF DAMAGES RECOVERABLE SHALL NOT APPLY TO DAMAGES ARISING OUT OF OR RELATING TO A PARTY'S INDEMNIFICATION OBLIGATIONS HEREIN.

**9. Severability.** If any provision of this Agreement is found to be unenforceable by a court of competent jurisdiction, such unenforceability shall not impair, affect or render invalid or unenforceable any other provision of this Agreement, and such invalid or unenforceable provision shall be replaced by a provision that is valid and enforceable and that comes closest to expressing the intention of such invalid or unenforceable provision.

**10. Notices.** All notices, consents, approvals and other communications pursuant to this Agreement shall (a) be deemed given on the date received, and (b) be in writing, (i) sent by registered or certified mail, return receipt requested, (ii) hand delivered, (iii) e-mailed (with delivery confirmed to the respective emails set out in the SOW) or (iv) sent by prepaid overnight carrier, with a record of receipt, to the Parties at the addresses above, or such other address as may be provided by the Parties from time to time.

**11. Force Majeure.** No Party will be liable to the other Party if such Party is prevented from, or delayed in, performing its obligations hereunder by any cause beyond the reasonable control of that Party. For the purpose of this section, a cause shall be any interruptions, acts, events, omissions or accidents that would affect any person similarly situated, including, without limitation, strikes, lockouts or other industrial disputes, failure of a utility service or transport network, act of God, war, riot, terrorism, or material changes in any law or governmental order, rule, regulation or direction directly applicable to the performance of the Services or other obligations under this Agreement) but shall not be beyond the reasonable control of such party when peculiar to such party (such as financial inability or ordering materials requiring a long lead time).

**12. Survival and Non-Waiver.** The rights and obligations of the Parties hereunder, which, by their terms, are intended to survive the termination of this Agreement, shall so survive. The failure of either Party to enforce any provision of this Agreement will not be construed as a waiver by such Party of its right to enforce that provision or any other provision of this Agreement, and will not operate as an amendment to this Agreement.

**13. Assignment.** Client may not assign this Agreement or any of its obligations contained herein without Agency's prior written consent. Agency may assign this Agreement, without Client's prior written approval, in whole or in part provided that any assignee shall assume all of Agency's obligations hereunder.

**14. Advice of Counsel.** Each Party acknowledges that, in executing this Agreement, such Party has had the opportunity to seek the advice of independent legal counsel, and has read and understood the terms and conditions of this Agreement. This Agreement shall not be construed against any Party by reason of the drafting hereof.

**15. Entire Agreement.** This Agreement constitutes the entire agreement of the Parties in connection with the subject matter hereof. It is expressly warranted by each of the undersigned Parties that no promise or inducement has been offered except as herein set forth and that this Agreement is executed without reliance upon any statement or representation of any person or party or its representatives concerning the nature and extent of damages, costs and/or legal liability therefor.

**16. Headings.** The headings within this Agreement are purely for convenience and not to be used as an aid in interpretation. This Agreement shall not be construed against either Party as the drafter of the Agreement.

**17. Jurisdiction and Choice of Law.** This Agreement shall be governed and construed in accordance with the laws of the State of New York, without regard to the principles of conflicts of law. Any action or claim brought by any Party for any matter arising out of or in any way relating to this Agreement shall be heard in and venue shall be located in King's County, New York. If either Party brings any action or proceeding by reason of any breach or alleged breach of the other Party hereunder, the Party prevailing in such action or proceeding shall be entitled to recover its reasonable expenses in connection therewith (including without limitation reasonable attorneys' fees and court costs) from the other Party. The term "prevailing party" means the party obtaining substantially the relief sought, whether by compromise, settlement or judgment.

**18. Execution.** This Agreement may be executed in any number of counterparts each of which shall be deemed an original but all of which together shall constitute one and the same instrument.`;
