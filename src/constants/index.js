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

export const PROJECT_STAGES = ["pitching", "awarded", "wrapped", "archived"];
export const STAGE_LABELS = { pitching: "Pitching", awarded: "Awarded", current: "Awarded", wrapped: "Wrapped", archived: "Archived" };
export const STAGE_COLORS = makeMap({
  pitching: () => T.ink,
  awarded: () => T.ink70,
  current: () => T.ink70,
  wrapped: () => T.ink40,
  archived: () => T.fadedInk,
});

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

export const ROLES = ["ep", "admin", "producer", "creative", "finance", "accounts", "production", "client"];
export const ROLE_LABELS = { ep: "Executive Producer", admin: "Admin", producer: "Producer", creative: "Creative", finance: "Finance", accounts: "Accounts", production: "Production", client: "Client" };
export const ROLE_COLORS = makeMap({
  ep: () => T.ink,
  admin: () => T.ink,
  producer: () => T.ink70,
  creative: () => T.ink60,
  finance: () => T.ink80,
  accounts: () => T.ink40,
  production: () => T.ink70,
  client: () => T.fadedInk,
});

export const PERMISSION_LABELS = { budget: "Budget", timeline: "Timeline", vendors: "Vendors", pnl: "P&L", docs: "Documents", ros: "Run of Show", client: "Client View", ai: "AI Assistant", settings: "Settings" };
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
