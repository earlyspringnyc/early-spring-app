import { uid } from '../utils/uid.js';

export const mkI = (n, c = 0, m = .15) => ({ id: uid(), name: n, budget: 0, estCost: 0, actualCost: c, margin: m, vendorId: "", notes: "", details: "", linkedDocIds: [] });
export const mkA = (n, d = 0, r = 0, m = .15) => ({ id: uid(), name: n, actualCost: d * r, margin: m, days: d, dayRate: r });
export const mkTask = (name, cat = "General", assignee = "", start = "", end = "", linkedItemId = "") => ({ id: uid(), name, category: cat, assignee, status: "todo", startDate: start, endDate: end, linkedItemId });
export const mkROS = (time, item, loc = "", lead = "", dur = "", notes = "") => ({ id: uid(), time, duration: dur, item, location: loc, lead, notes });
export const mkDoc = (name, type, vendorId = "", amount = 0, dueDate = "", status = "pending", linkedCatId = "", linkedItemId = "", invoiceKind = "", fileData = null) => ({ id: uid(), name, type, vendorId, amount, paidAmount: 0, dueDate, status, dateAdded: new Date().toLocaleDateString(), linkedCatId, linkedItemId, invoiceKind, fileData });
export const mkTxn = (type, desc, amount, date, cat = "", vendorId = "", linkedDocId = "") => ({ id: uid(), type, description: desc, amount, date: date || new Date().toLocaleDateString(), category: cat, vendorId, linkedDocId });
export const mkVendor = (name, email = "", phone = "", notes = "", w9Status = "pending", vendorType = "other") => ({ id: uid(), name, email, phone, notes, w9Status, vendorType });
export const mkClientFile = (name, category, fileData, fileName) => ({ id: uid(), name, category, fileData, fileName, dateAdded: new Date().toLocaleDateString() });
export const mkMeeting = (title, date, time, duration = "30m", attendees = [], agenda = "", location = "") => ({ id: uid(), title, date, time, duration, attendees, agenda, location, notes: "", summary: "", actionItems: [], calendarSent: false, recordingUrl: "", transcript: "", dateCreated: new Date().toLocaleDateString() });
