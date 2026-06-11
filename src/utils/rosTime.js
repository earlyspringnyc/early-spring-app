// Parse a Run-of-Show cue time into minutes-since-midnight for sorting.
// Handles the formats users actually type: "9:00", "09:00", "13:30"
// (24h), and "8am", "8:30 AM", "1:00pm" (12h). Blank/garbage sorts last
// so empty rows fall to the bottom rather than the top.
export function cueTimeToMinutes(s) {
  if (!s) return Infinity;
  const str = String(s).trim().toLowerCase();
  const m = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return Infinity;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3];
  if (ap === 'pm' && h !== 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + min;
}

// Chronological comparator for cue objects with a `.time` field.
export function byCueTime(a, b) {
  return cueTimeToMinutes(a?.time) - cueTimeToMinutes(b?.time);
}
