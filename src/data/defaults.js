import { uid } from '../utils/uid.js';
import { mkI, mkA, mkTask, mkROS } from './factories.js';

export function defaultCats() {
  return [
    { id: uid(), name: "Venue", items: [mkI("Venue Rental"), mkI("Venue Buyout / Minimum"), mkI("Permit Fees"), mkI("Security Deposit")] },
    { id: uid(), name: "Catering & Beverage", items: [mkI("Food Service"), mkI("Bar / Beverage Package"), mkI("F&B Staffing"), mkI("Rentals (Glassware, Flatware, Linen)"), mkI("Ice / Misc Supplies")] },
    { id: uid(), name: "Staging & AV", items: [mkI("LED Wall / Screens"), mkI("Sound System + Mics"), mkI("Lighting Design + Fixtures"), mkI("Stage / Riser Build"), mkI("AV Tech / Operator")] },
    { id: uid(), name: "Fabrication & Scenic", items: [mkI("Custom Build / Scenic"), mkI("Signage (Vinyl, Acrylic, Neon)"), mkI("Furniture / Lounge Build"), mkI("Props / Decor"), mkI("Install / Strike Labor")] },
    { id: uid(), name: "Printing & Collateral", items: [mkI("Invitations / STDs"), mkI("Event Signage / Banners"), mkI("Programs / Menus"), mkI("Branded Merchandise")] },
    { id: uid(), name: "Staffing", items: [mkI("Event Manager (Day-of)"), mkI("Registration / Check-in"), mkI("Brand Ambassadors"), mkI("Security"), mkI("Cleanup Crew")] },
    { id: uid(), name: "Content & Capture", items: [mkI("Photographer"), mkI("Videographer"), mkI("Livestream / Webcast"), mkI("Editing / Post-Production")] },
    { id: uid(), name: "Travel & Logistics", items: [mkI("Team Flights"), mkI("Team Hotels"), mkI("Ground Transport"), mkI("Shipping / Freight")] },
    { id: uid(), name: "Insurance & Permits", items: [mkI("Event Insurance (COI)"), mkI("Liquor License / Permit"), mkI("Noise / Street Permits")] },
    { id: uid(), name: "Contingency", items: [mkI("Contingency", 0, 0)] },
  ];
}

export function defaultAg() {
  return [mkA("Account / Project Mgmt"), mkA("Creative Director"), mkA("Brand Designer"), mkA("Print Production"), mkA("Environmental Design (3D)"), mkA("Production Management"), mkA("Production Assistant")];
}

export function defaultTimeline() {
  return [mkTask("Confirm venue contract", "Venue"), mkTask("Submit permit applications", "Permits"), mkTask("Finalize floor plan", "Design"), mkTask("AV walkthrough", "Production"), mkTask("Catering tasting", "Catering"), mkTask("Print collateral to printer", "Print"), mkTask("Final vendor payments", "Finance"), mkTask("Load-in / strike plan", "Production")];
}

export function defaultROS() {
  return [mkROS("07:00", "Load-in begins", "Main Entrance", "Production Lead", "3h", "Freight elevator reserved"), mkROS("10:00", "AV check + soundcheck", "Main Stage", "AV Tech", "1h"), mkROS("11:00", "Catering setup", "Kitchen / Bar", "Catering Lead", "2h"), mkROS("12:00", "Walk-through with client", "Full Venue", "Account Lead", "30m"), mkROS("13:00", "Doors open", "Lobby", "Event Manager"), mkROS("13:30", "Welcome remarks", "Main Stage", "Client", "15m"), mkROS("17:00", "Event ends", "", "Event Manager"), mkROS("17:30", "Strike begins", "Full Venue", "Production Lead", "2h")];
}

export const DEFAULT_USERS = [
  { id: uid(), email: "kamil@earlyspring.nyc", name: "Kamil", role: "admin", avatar: "", permissions: { budget: true, timeline: true, vendors: true, pnl: true, docs: true, ros: true, client: true, ai: true, settings: true } },
  { id: uid(), email: "producer@earlyspring.nyc", name: "Producer", role: "producer", avatar: "", permissions: { budget: true, timeline: true, vendors: true, pnl: true, docs: true, ros: true, client: false, ai: true, settings: false } },
  { id: uid(), email: "client@example.com", name: "Client Viewer", role: "viewer", avatar: "", permissions: { budget: false, timeline: false, vendors: false, pnl: false, docs: false, ros: false, client: true, ai: false, settings: false } }
];

export function mkProject(name, client, date, eventDate, logo, clientBudget, stage) {
  return { id: uid(), name, client, date: date || new Date().toLocaleDateString(), eventDate: eventDate || "", logo: logo || "", clientBudget: clientBudget || 0, stage: stage || "pitching", cats: defaultCats(), ag: defaultAg(), feeP: .20, timeline: defaultTimeline(), ros: defaultROS(), docs: [], txns: [], vendors: [], clientFiles: [], meetings: [], createdAt: Date.now() };
}
