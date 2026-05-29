import T from '../theme/tokens.js';

/* ── Per Lab guidelines: two colors only.
     Charts and category systems separate by sapphire/paper opacity.
     `alert` (#7A1F1F in light, pale rose in dark) is the single off-system
     tone, reserved for destructive/error/blocked.

     Color maps below use getters that read T at access time, so when the
     theme flips at runtime the values flip with it. ── */

function makeMap(definition) {
  const out = {};
  for (const [key, getter] of Object.entries(definition)) {
    Object.defineProperty(out, key, { get: getter, enumerable: true, configurable: true });
  }
  return out;
}

// "lost" sits between active stages and archived: it's a terminal
// non-revenue state for pitches we didn't win. Anything checking for
// "this project counts" should use isInactiveStage() to catch both
// archived and lost.
export const PROJECT_STAGES = ["pitching", "awarded", "wrapped", "lost", "archived"];
export const STAGE_LABELS = { pitching: "Pitching", awarded: "Awarded", current: "Awarded", wrapped: "Wrapped", lost: "Lost", archived: "Archived" };
export const STAGE_COLORS = makeMap({
  pitching: () => T.ink,
  awarded: () => T.ink70,
  current: () => T.ink70,
  wrapped: () => T.ink40,
  lost: () => T.alert,
  archived: () => T.fadedInk,
});

// Lost + archived are treated identically for revenue/active filtering:
// they don't count against totals and don't appear in active lists.
export const INACTIVE_STAGES = new Set(["archived", "lost"]);
export const isInactiveStage = (stage) => INACTIVE_STAGES.has(stage);

export const STATUS_COLORS = makeMap({
  todo: () => T.fadedInk,
  progress: () => T.ink70,
  roadblocked: () => T.alert,
  done: () => T.ink,
});
export const STATUS_LABELS = { todo: "To Do", progress: "In Progress", roadblocked: "Roadblocked", done: "Done" };

export const DOC_TYPES = ["invoice", "w9", "w2", "contract"];
export const DOC_TYPE_COLORS = makeMap({
  invoice: () => T.ink,
  w9: () => T.ink60,
  w2: () => T.ink40,
  contract: () => T.ink70,
});

export const PAYMENT_COLORS = makeMap({
  none: () => T.fadedInk,
  invoiced: () => T.ink70,
  partial: () => T.ink,
  paid: () => T.ink,
});
export const PAYMENT_LABELS = { none: "No Invoice", invoiced: "Invoiced", partial: "Partial", paid: "Paid" };

export const VENDOR_TYPES = ["venue", "catering", "av", "fabrication", "staffing", "print", "photo_video", "floral", "talent", "freight", "rental", "freelance", "other"];
export const VENDOR_TYPE_LABELS = { venue: "Venue", catering: "Catering & Bev", av: "AV / Sound", fabrication: "Fabrication", staffing: "Staffing", print: "Print", photo_video: "Photo / Video", floral: "Floral", talent: "Talent", freight: "Freight / Logistics", rental: "Rental", freelance: "Freelance", other: "Other" };
export const VENDOR_TYPE_COLORS = makeMap({
  venue: () => T.ink,
  catering: () => T.ink80,
  av: () => T.ink60,
  fabrication: () => T.ink40,
  staffing: () => T.ink20,
  print: () => T.ink70,
  photo_video: () => T.ink,
  floral: () => T.ink60,
  talent: () => T.ink80,
  freight: () => T.ink40,
  rental: () => T.ink60,
  freelance: () => T.ink70,
  other: () => T.fadedInk,
});

export const INVOICE_KINDS = ["deposit", "final", "addendum"];
export const INVOICE_KIND_LABELS = { deposit: "Deposit", final: "Final", addendum: "Addendum" };
export const INVOICE_KIND_COLORS = makeMap({
  deposit: () => T.ink,
  final: () => T.ink70,
  addendum: () => T.ink40,
});

export const CLIENT_FILE_CATS = ["rfp", "brief", "design", "contract", "deck", "reference", "other"];
export const CLIENT_FILE_LABELS = { rfp: "RFP", brief: "Brief", design: "Design Files", contract: "Contract", deck: "Deck / Presentation", reference: "Reference", other: "Other" };
export const CLIENT_FILE_COLORS = makeMap({
  rfp: () => T.ink,
  brief: () => T.ink80,
  design: () => T.ink60,
  contract: () => T.ink70,
  deck: () => T.ink40,
  reference: () => T.ink25,
  other: () => T.fadedInk,
});

export const ROLES = ["ep", "admin", "producer", "agent", "creative", "finance", "accounts", "production", "viewer", "client"];
export const ROLE_LABELS = { ep: "Executive Producer", admin: "Admin", producer: "Producer", agent: "Agent", creative: "Creative", finance: "Finance", accounts: "Accounts", production: "Production", viewer: "Viewer", client: "Client" };
// Roles that bypass per-project membership and see every project in
// the org. Everyone else needs an explicit project_members row.
export const PROJECT_BYPASS_ROLES = new Set(['admin', 'ep']);
export const ROLE_COLORS = makeMap({
  ep: () => T.ink,
  admin: () => T.ink,
  producer: () => T.ink70,
  agent: () => T.ink70,
  creative: () => T.ink60,
  finance: () => T.ink80,
  accounts: () => T.ink40,
  production: () => T.ink70,
  viewer: () => T.fadedInk,
  client: () => T.fadedInk,
});

export const PERMISSION_LABELS = { budget: "Budget", timeline: "Timeline", vendors: "Vendors", pnl: "P&L", docs: "Documents", ros: "Run of Show", client: "Client View", ai: "AI Assistant", settings: "Settings" };

// Org-wide surfaces (live outside of any single project). Each one is
// permission-gateable per teammate via profiles.org_permissions JSON.
// null/missing on the profile = use the role default below.
export const ORG_SURFACES = [
  { id: 'crm',       label: 'Early Spring CRM', desc: 'Contacts, drawers, follow-ups' },
  { id: 'pipeline',  label: 'Pipeline',         desc: 'Deal pipeline + stage tracking' },
  { id: 'meetings',  label: 'Meetings Library', desc: 'Cross-project Fireflies meetings' },
  { id: 'books',     label: 'Books / Finance',  desc: 'Org-wide invoices + payments' },
  { id: 'activity',  label: 'Activity Log',     desc: 'Audit log of org-wide actions' },
  { id: 'reporting', label: 'Reporting',        desc: 'Cross-project reporting dashboards' },
];

// Per-role default surface access — applied only when a teammate's
// org_permissions JSON is null (i.e. admin hasn't explicitly tuned it).
// Keeps migrations safe — nobody loses access they had before.
const ROLE_SURFACE_DEFAULTS = {
  admin: ['crm','pipeline','meetings','books','activity','reporting'],
  ep:    ['crm','pipeline','meetings','books','activity','reporting'],
  producer: ['crm','pipeline','meetings','reporting'],
  agent:    ['crm','pipeline','meetings'],
  creative: ['meetings'],
  finance:  ['books','reporting','activity'],
  accounts: ['books','reporting','activity'],
  production: ['meetings'],
  viewer:   [],
  client:   [],
};

export function defaultSurfacesForRole(role) {
  return new Set(ROLE_SURFACE_DEFAULTS[role] || []);
}

// canSeeSurface — admin/ep always pass; explicit org_permissions JSON
// overrides; otherwise role default. Use this everywhere we gate the
// nav pills or top-view routing.
export function canSeeSurface(profile, surface) {
  if (!profile) return false;
  if (profile.role === 'admin' || profile.role === 'ep') return true;
  const perms = profile.org_permissions;
  if (perms && typeof perms === 'object' && surface in perms) return !!perms[surface];
  return defaultSurfacesForRole(profile.role).has(surface);
}

// ─────────────────────────────────────────────────────────────────────
// Action capabilities — what a user can DO regardless of which views
// they can SEE. Currently driven by role only; extend to per-user
// overrides later if needed.
//
// send_email      — fire emails via Gmail from inside Morgan
// create_meeting  — schedule + log meetings (Fireflies-synced or manual)
// create_project  — create new projects
// manage_team     — invite teammates, manage permissions
// invite_client   — provision client portal accounts
// ─────────────────────────────────────────────────────────────────────
const ROLE_CAPABILITIES = {
  admin:     { send_email: true,  create_meeting: true,  create_project: true,  manage_team: true,  invite_client: true  },
  ep:        { send_email: true,  create_meeting: true,  create_project: true,  manage_team: true,  invite_client: true  },
  producer:  { send_email: true,  create_meeting: true,  create_project: true,  manage_team: false, invite_client: true  },
  agent:     { send_email: false, create_meeting: false, create_project: false, manage_team: false, invite_client: false },
  creative:  { send_email: true,  create_meeting: true,  create_project: false, manage_team: false, invite_client: false },
  finance:   { send_email: true,  create_meeting: false, create_project: false, manage_team: false, invite_client: false },
  accounts:  { send_email: true,  create_meeting: false, create_project: false, manage_team: false, invite_client: false },
  production:{ send_email: true,  create_meeting: true,  create_project: false, manage_team: false, invite_client: false },
  viewer:    { send_email: false, create_meeting: false, create_project: false, manage_team: false, invite_client: false },
  client:    { send_email: false, create_meeting: false, create_project: false, manage_team: false, invite_client: false },
};

export function canDo(profile, capability) {
  if (!profile) return false;
  const caps = ROLE_CAPABILITIES[profile.role];
  if (!caps) return false;
  return !!caps[capability];
}
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
