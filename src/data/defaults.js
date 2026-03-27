import { uid } from '../utils/uid.js';
import { mkI, mkA, mkTask, mkROS, mkVendor, mkDoc, mkTxn, mkMeeting } from './factories.js';

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
  { id: uid(), email: "client@example.com", name: "Client", role: "client", avatar: "", permissions: { budget: false, timeline: false, vendors: false, pnl: false, docs: false, ros: false, client: true, ai: false, settings: false } }
];

export function mkProject(name, client, date, eventDate, logo, clientBudget, stage) {
  return { id: uid(), name, client, date: date || new Date().toLocaleDateString(), eventDate: eventDate || "", logo: logo || "", clientBudget: clientBudget || 0, stage: stage || "pitching", cats: defaultCats(), ag: defaultAg(), feeP: .20, timeline: defaultTimeline(), ros: defaultROS(), docs: [], txns: [], vendors: [], clientFiles: [], meetings: [], staffing: [], createdAt: Date.now() };
}

export function mkSampleProject() {
  const vendors = [
    mkVendor("The Williamsburg Hotel", "events@thewilliamsburghotel.com", "718-362-8100", "Rooftop + ballroom available", "received", "venue", "Sarah Chen"),
    mkVendor("Devoción Catering", "catering@devocion.com", "718-285-6180", "Colombian-inspired menu", "received", "catering", "Marco Rivera"),
    mkVendor("PRG Lighting", "rentals@prg.com", "212-539-7000", "LED wall + intelligent lighting", "pending", "av", "Jake Morrison"),
    mkVendor("Sweets by Chloe", "hello@sweetsbychloe.com", "347-555-0192", "Custom dessert bar", "pending", "catering", "Chloe Park"),
    mkVendor("Tandem Photo + Film", "book@tandempf.com", "917-555-0234", "Photo + video team", "received", "creative", "Dia Okafor"),
    mkVendor("SHOWTIME Staffing", "dispatch@showtimestaffing.com", "212-555-0371", "Brand ambassadors + event staff", "pending", "staffing", "Devon Clark"),
  ];

  const cats = [
    { id: uid(), name: "Venue", items: [
      { ...mkI("Rooftop Buyout", 28000, .18), qxr: true, qty: 1, rate: 28000, unit: "ea", vendorId: vendors[0].id, details: "Full rooftop exclusive 6pm–1am" },
      { ...mkI("Ballroom Hold (Rain Plan)", 5000, .18), vendorId: vendors[0].id, details: "Indoor backup — released 48hr prior if clear" },
      { ...mkI("Security Deposit", 3000, 0), vendorId: vendors[0].id },
      mkI("Permit Fees", 1200, .10),
    ]},
    { id: uid(), name: "Catering & Beverage", items: [
      { ...mkI("Dinner Service", 18750, .15), qxr: true, qty: 150, rate: 125, unit: "ea", vendorId: vendors[1].id, details: "3-course seated, family style" },
      { ...mkI("Open Bar Package", 11250, .15), qxr: true, qty: 150, rate: 75, unit: "ea", vendorId: vendors[1].id, details: "Premium spirits, craft cocktails, wine, beer — 4hrs" },
      { ...mkI("Late Night Snacks", 2500, .15), vendorId: vendors[1].id, details: "Empanadas + slider station" },
      { ...mkI("Custom Dessert Bar", 3200, .20), vendorId: vendors[3].id, details: "Branded macarons, mini cakes, chocolate truffles" },
      mkI("F&B Staffing", 4800, .12),
    ]},
    { id: uid(), name: "Staging & AV", items: [
      { ...mkI("LED Wall (12×8)", 8500, .15), vendorId: vendors[2].id, details: "2.6mm pixel pitch, content-ready" },
      { ...mkI("Sound System + DJ Booth", 4200, .15), vendorId: vendors[2].id },
      { ...mkI("Lighting Design", 6800, .18), vendorId: vendors[2].id, details: "Intelligent fixtures, uplighting, pin spots" },
      { ...mkI("AV Tech", 3600, .10), qxr: true, qty: 2, rate: 1800, unit: "ea", vendorId: vendors[2].id, details: "On-site techs for load-in through strike" },
    ]},
    { id: uid(), name: "Fabrication & Scenic", items: [
      mkI("Custom Entry Arch", 7500, .20),
      mkI("Step & Repeat Wall", 3500, .15),
      mkI("Branded Bar Wrap", 2800, .15),
      mkI("Lounge Furniture", 4500, .12),
      { ...mkI("Install / Strike Labor", 6400, .10), qxr: true, qty: 8, rate: 800, unit: "ea", details: "8-person crew, load-in + strike" },
    ]},
    { id: uid(), name: "Content & Capture", items: [
      { ...mkI("Photography", 4500, .15), vendorId: vendors[4].id, details: "2 photographers, 6hrs + edited gallery" },
      { ...mkI("Videography", 6500, .15), vendorId: vendors[4].id, details: "Highlight reel + social cuts, 2 operators" },
      mkI("Drone Operator", 1800, .15),
      mkI("Photo Booth", 2200, .12),
    ]},
    { id: uid(), name: "Staffing", items: [
      mkI("Event Manager (Day-of)", 3500, .10),
      { ...mkI("Brand Ambassadors", 4800, .10), qxr: true, qty: 6, rate: 800, unit: "ea", vendorId: vendors[5].id },
      { ...mkI("Registration Staff", 1600, .10), qxr: true, qty: 2, rate: 800, unit: "ea", vendorId: vendors[5].id },
      mkI("Security", 2400, .08),
    ]},
    { id: uid(), name: "Travel & Logistics", items: [
      mkI("Team Hotels (2 nights)", 3200, .05),
      mkI("Ground Transport", 1500, .05),
      mkI("Shipping / Freight", 2800, .08),
    ]},
    { id: uid(), name: "Contingency", items: [mkI("Contingency", 7500, 0)] },
  ];

  const ag = [
    mkA("Account Lead", 5, 1200, .15),
    mkA("Creative Director", 4, 1500, .15),
    mkA("Production Manager", 8, 900, .15),
    mkA("Production Coordinator", 10, 550, .12),
    mkA("Designer", 6, 800, .15),
  ];

  const today = new Date();
  const eventDate = new Date(today);
  eventDate.setDate(today.getDate() + 45);
  const fmtDate = d => `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;

  const timeline = [
    { ...mkTask("Confirm venue contract", "Venue", "Account Lead"), status: "done", startDate: fmtDate(new Date(today.getTime() - 30*86400000)), endDate: fmtDate(new Date(today.getTime() - 25*86400000)) },
    { ...mkTask("Finalize catering menu", "Catering", "Production Manager"), status: "done", startDate: fmtDate(new Date(today.getTime() - 20*86400000)), endDate: fmtDate(new Date(today.getTime() - 14*86400000)) },
    { ...mkTask("AV walkthrough at venue", "Production", "Production Manager"), status: "in-progress", startDate: fmtDate(new Date(today.getTime() - 3*86400000)), endDate: fmtDate(new Date(today.getTime() + 2*86400000)) },
    { ...mkTask("Approve lighting design", "Design", "Creative Director"), status: "in-progress", startDate: fmtDate(today), endDate: fmtDate(new Date(today.getTime() + 5*86400000)) },
    { ...mkTask("Finalize floor plan + CAD", "Design", "Designer"), status: "todo", startDate: fmtDate(new Date(today.getTime() + 3*86400000)), endDate: fmtDate(new Date(today.getTime() + 10*86400000)) },
    { ...mkTask("Order branded collateral", "Print", "Production Coordinator"), status: "todo", startDate: fmtDate(new Date(today.getTime() + 7*86400000)), endDate: fmtDate(new Date(today.getTime() + 14*86400000)) },
    { ...mkTask("Confirm staffing headcount", "Staffing", "Production Manager"), status: "todo", startDate: fmtDate(new Date(today.getTime() + 10*86400000)), endDate: fmtDate(new Date(today.getTime() + 18*86400000)) },
    { ...mkTask("Final vendor payments", "Finance", "Account Lead"), status: "todo", startDate: fmtDate(new Date(today.getTime() + 30*86400000)), endDate: fmtDate(new Date(today.getTime() + 38*86400000)) },
    { ...mkTask("Load-in / strike plan", "Production", "Production Manager"), status: "todo", startDate: fmtDate(new Date(today.getTime() + 35*86400000)), endDate: fmtDate(new Date(today.getTime() + 42*86400000)) },
    { ...mkTask("Day-of run of show finalized", "Production", "Production Manager"), status: "todo", startDate: fmtDate(new Date(today.getTime() + 40*86400000)), endDate: fmtDate(eventDate) },
  ];

  const ros = defaultROS();

  const docs = [
    mkDoc("Venue Contract — Williamsburg Hotel", "contract", vendors[0].id, 36000, fmtDate(new Date(today.getTime() - 20*86400000)), "paid"),
    mkDoc("Devoción Catering Proposal", "invoice", vendors[1].id, 37300, fmtDate(new Date(today.getTime() + 14*86400000)), "pending"),
    mkDoc("PRG AV Quote", "invoice", vendors[2].id, 23100, fmtDate(new Date(today.getTime() + 21*86400000)), "pending"),
    mkDoc("Tandem Photo+Film Agreement", "contract", vendors[4].id, 11000, fmtDate(new Date(today.getTime() + 7*86400000)), "pending"),
  ];

  const txns = [
    mkTxn("expense", "Venue deposit — Williamsburg Hotel", 18000, fmtDate(new Date(today.getTime() - 20*86400000)), "Venue", vendors[0].id),
    mkTxn("expense", "Venue final payment", 18000, fmtDate(new Date(today.getTime() - 5*86400000)), "Venue", vendors[0].id),
  ];

  const meetings = [
    { ...mkMeeting("Client Kickoff", fmtDate(new Date(today.getTime() - 28*86400000)), "10:00", "1h", ["Account Lead", "Creative Director"], "Align on vision, budget, timeline", "Zoom", true), summary: "Client wants immersive, elevated vibe. Rooftop mandatory. Budget approved at $250K." },
    mkMeeting("Venue Site Visit", fmtDate(new Date(today.getTime() - 15*86400000)), "14:00", "1.5h", ["Production Manager", "AV Tech"], "Walk rooftop, check power drops, measure LED wall placement", "The Williamsburg Hotel"),
    mkMeeting("Creative Review", fmtDate(new Date(today.getTime() + 5*86400000)), "11:00", "45m", ["Creative Director", "Designer", "Account Lead"], "Review mood boards, signage concepts, entry arch design", "Studio", true),
  ];

  return {
    id: uid(),
    name: "Meridian Summer Launch",
    client: "Meridian Spirits",
    date: fmtDate(new Date(today.getTime() - 30*86400000)),
    eventDate: fmtDate(eventDate),
    logo: "",
    clientBudget: 250000,
    stage: "awarded",
    currency: "USD",
    cats,
    ag,
    feeP: .20,
    timeline,
    ros,
    docs,
    txns,
    vendors,
    clientFiles: [],
    meetings,
    createdAt: Date.now(),
    _isSample: true,
  };
}
