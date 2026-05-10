import { useState, useRef, useEffect } from 'react';
import T from '../theme/tokens.js';

// Personal sticky notes. All sapphire — same hue, different opacities,
// matches the rest of the Lab brand. Click to edit inline; hover reveals
// delete + a one-click color cycle. After the user stops typing for a
// moment we ask Claude to look for a reminder ("check in on the car
// dealers tuesday") and surface a one-click "Add to Calendar".
const COLORS = {
  light:  { bg: 'rgba(15,82,186,.06)', ink: '#0F52BA', border: 'rgba(15,82,186,.22)', label: 'Light' },
  wash:   { bg: 'rgba(15,82,186,.12)', ink: '#0F52BA', border: 'rgba(15,82,186,.28)', label: 'Wash' },
  deep:   { bg: 'rgba(15,82,186,.20)', ink: '#0F52BA', border: 'rgba(15,82,186,.40)', label: 'Deep' },
  solid:  { bg: '#0F52BA',             ink: '#FFFFFF', border: '#0F52BA',             label: 'Solid' },
};
const COLOR_KEYS = Object.keys(COLORS);

// Deterministic small rotation per note id so the row feels handmade
// without re-randomizing on every render.
function rotationFor(id) {
  if (!id) return 0;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return ((h % 5) - 2) * 0.6; // -1.2deg .. +1.2deg
}

function fmtReminderDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const tgt = new Date(d); tgt.setHours(0,0,0,0);
  const diff = Math.round((tgt - today) / 86400000);
  const hasTime = iso.includes('T') && !iso.endsWith('T00:00:00.000Z');
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = hasTime ? ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  if (diff === 0) return 'Today' + timeStr;
  if (diff === 1) return 'Tomorrow' + timeStr;
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' }) + timeStr;
  return dateStr + timeStr;
}

function StickyNote({ note, onChange, onDelete, onAddToCalendar, onDismissReminder, analyzing }) {
  const [editing, setEditing] = useState(!note.content);
  const [hover, setHover] = useState(false);
  const taRef = useRef(null);
  const palette = COLORS[note.color] || COLORS.wash;
  const rotation = rotationFor(note.id);
  const hasReminder = note.reminder_date && note.reminder_action;
  const hasCalendarEvent = !!note.calendar_event_id;

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      taRef.current.setSelectionRange(taRef.current.value.length, taRef.current.value.length);
    }
  }, [editing]);

  const cycleColor = (e) => {
    e.stopPropagation();
    const idx = COLOR_KEYS.indexOf(note.color);
    const next = COLOR_KEYS[(idx + 1) % COLOR_KEYS.length];
    onChange({ color: next });
  };

  const subtle = palette.ink === '#FFFFFF'
    ? 'rgba(255,255,255,.85)'
    : 'rgba(15,82,186,.70)';
  const muted = palette.ink === '#FFFFFF'
    ? 'rgba(255,255,255,.65)'
    : 'rgba(15,82,186,.50)';

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => !editing && setEditing(true)}
      style={{
        position: 'relative', flex: '0 0 auto',
        width: 220, minHeight: 170,
        display: 'flex', flexDirection: 'column',
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 6,
        boxShadow: hover
          ? `0 8px 24px rgba(15,82,186,.18), 0 2px 4px rgba(15,82,186,.08)`
          : `0 2px 6px rgba(15,82,186,.10), 0 1px 2px rgba(15,82,186,.06)`,
        transform: `rotate(${rotation}deg) ${hover ? 'translateY(-2px)' : ''}`,
        transition: 'transform .18s ease, box-shadow .18s ease',
        cursor: editing ? 'text' : 'pointer',
        fontFamily: T.sans,
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: 1, padding: 16, paddingBottom: hasReminder ? 10 : 16 }}>
        {editing ? (
          <textarea
            ref={taRef}
            value={note.content}
            onChange={e => onChange({ content: e.target.value })}
            onBlur={() => setEditing(false)}
            onKeyDown={e => { if (e.key === 'Escape') { e.target.blur(); } }}
            placeholder="What's on your mind?"
            style={{
              width: '100%', minHeight: 120,
              background: 'transparent', border: 'none', outline: 'none',
              resize: 'none',
              fontFamily: T.sans, fontSize: 13, lineHeight: 1.5, color: palette.ink,
            }}
          />
        ) : (
          <div style={{
            fontSize: 13, lineHeight: 1.5, color: palette.ink,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            minHeight: 120,
          }}>
            {note.content || <span style={{ opacity: .55 }}>Empty note — click to write</span>}
          </div>
        )}
      </div>

      {/* Reminder strip */}
      {hasReminder && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            padding: '8px 12px', borderTop: `1px solid ${palette.border}`,
            background: palette.ink === '#FFFFFF' ? 'rgba(255,255,255,.10)' : 'rgba(15,82,186,.06)',
            display: 'flex', flexDirection: 'column', gap: 6,
            fontSize: 11,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: palette.ink, fontWeight: 600 }}>
            <span style={{ fontSize: 12 }}>◷</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fmtReminderDate(note.reminder_date)}
            </span>
          </div>
          <div style={{ color: subtle, fontSize: 11, lineHeight: 1.3 }}>
            {note.reminder_action}
          </div>
          {!hasCalendarEvent ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
              <button
                onClick={() => onAddToCalendar()}
                style={{
                  flex: 1, padding: '4px 8px', borderRadius: 4,
                  background: palette.ink === '#FFFFFF' ? '#FFFFFF' : '#0F52BA',
                  color: palette.ink === '#FFFFFF' ? '#0F52BA' : '#FFFFFF',
                  border: 'none', cursor: 'pointer',
                  fontSize: 10, fontWeight: 700, letterSpacing: '.04em',
                  textTransform: 'uppercase', fontFamily: T.sans,
                }}
              >Add to calendar</button>
              <button
                onClick={() => onDismissReminder()}
                title="Dismiss"
                style={{
                  padding: '4px 8px', borderRadius: 4,
                  background: 'transparent', border: `1px solid ${palette.border}`,
                  color: subtle, cursor: 'pointer',
                  fontSize: 10, fontWeight: 600, fontFamily: T.sans,
                }}
              >×</button>
            </div>
          ) : (
            <div style={{ color: muted, fontSize: 10, marginTop: 2 }}>✓ On your calendar</div>
          )}
        </div>
      )}

      {/* Hover actions */}
      <div style={{
        position: 'absolute', top: 6, right: 6,
        display: 'flex', gap: 4,
        opacity: hover ? 1 : (analyzing ? 1 : 0), transition: 'opacity .18s',
      }}>
        {analyzing && (
          <div title="Looking for reminders..." style={{
            width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: subtle, fontSize: 11,
          }}>✨</div>
        )}
        <button
          onClick={cycleColor}
          title={`Color: ${palette.label}`}
          style={{
            width: 18, height: 18, padding: 0, borderRadius: '50%',
            background: COLORS[COLOR_KEYS[(COLOR_KEYS.indexOf(note.color) + 1) % COLOR_KEYS.length]].bg,
            border: `1px solid ${palette.border}`,
            cursor: 'pointer', fontSize: 0,
          }}
        />
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Delete note"
          style={{
            width: 18, height: 18, padding: 0, borderRadius: '50%',
            background: palette.ink === '#FFFFFF' ? 'rgba(255,255,255,.20)' : 'rgba(15,82,186,.10)',
            border: 'none',
            color: palette.ink, cursor: 'pointer',
            fontSize: 12, lineHeight: 1, fontFamily: T.sans, fontWeight: 600,
          }}
        >×</button>
      </div>
    </div>
  );
}

function StickyNotes({ notes, addNote, updateNote, deleteNote, addToCalendar, dismissReminder, analyzingIds = new Set() }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '.10em',
          textTransform: 'uppercase', color: T.ink,
        }}>
          Notes <span style={{ color: T.fadedInk, fontWeight: 600 }}>· only you</span>
        </div>
        <button
          onClick={() => addNote('wash')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 999,
            background: 'transparent', border: `1px solid ${T.faintRule}`,
            color: T.ink, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', fontFamily: T.sans,
            transition: 'all .18s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.ink; e.currentTarget.style.background = T.inkSoft; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.faintRule; e.currentTarget.style.background = 'transparent'; }}
        >+ New note</button>
      </div>

      {notes.length === 0 ? (
        <div
          onClick={() => addNote('wash')}
          style={{
            padding: '24px 20px', borderRadius: T.rS,
            border: `1px dashed ${T.faintRule}`,
            color: T.fadedInk, fontSize: 12, textAlign: 'center',
            cursor: 'pointer', fontFamily: T.sans,
            transition: 'all .18s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.ink; e.currentTarget.style.color = T.ink; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.faintRule; e.currentTarget.style.color = T.fadedInk; }}
        >
          A quiet workspace. Click to add your first note — try “remind me to check in on the car dealers tuesday.”
        </div>
      ) : (
        <div style={{
          display: 'flex', gap: 14, overflowX: 'auto',
          padding: '8px 4px 16px',
          scrollbarWidth: 'thin',
        }}>
          {notes.map(n => (
            <StickyNote
              key={n.id}
              note={n}
              analyzing={analyzingIds.has(n.id)}
              onChange={patch => updateNote(n.id, patch)}
              onDelete={() => deleteNote(n.id)}
              onAddToCalendar={() => addToCalendar(n)}
              onDismissReminder={() => dismissReminder(n.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default StickyNotes;
