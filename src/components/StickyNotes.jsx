import { useState, useRef, useEffect } from 'react';
import T from '../theme/tokens.js';

// Personal sticky notes. Horizontally-scrolling row of post-it cards,
// click to edit inline, hover to reveal delete. Brand-aware color set
// (Early Spring accent yellow + sapphire/mint/rose washes).
const COLORS = {
  yellow: { bg: '#FFF4D6', ink: '#5A4A1A', border: 'rgba(240,184,73,.45)' },
  sapphire: { bg: 'rgba(15,82,186,.10)', ink: '#0F52BA', border: 'rgba(15,82,186,.30)' },
  mint: { bg: '#E8F5E8', ink: '#1F5132', border: 'rgba(31,81,50,.30)' },
  rose: { bg: '#FCE8EE', ink: '#7A2746', border: 'rgba(122,39,70,.30)' },
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

function StickyNote({ note, onChange, onDelete }) {
  const [editing, setEditing] = useState(!note.content);
  const [hover, setHover] = useState(false);
  const taRef = useRef(null);
  const palette = COLORS[note.color] || COLORS.yellow;
  const rotation = rotationFor(note.id);

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

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => !editing && setEditing(true)}
      style={{
        position: 'relative', flex: '0 0 auto',
        width: 200, minHeight: 160, padding: 16,
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
      }}
    >
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
          {note.content || <span style={{ opacity: .45 }}>Empty note — click to write</span>}
        </div>
      )}

      {/* Hover actions */}
      <div style={{
        position: 'absolute', top: 6, right: 6,
        display: 'flex', gap: 4,
        opacity: hover ? 1 : 0, transition: 'opacity .18s',
      }}>
        <button
          onClick={cycleColor}
          title="Change color"
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
            background: 'rgba(0,0,0,.06)', border: 'none',
            color: palette.ink, cursor: 'pointer',
            fontSize: 12, lineHeight: 1, fontFamily: T.sans, fontWeight: 600,
          }}
        >×</button>
      </div>
    </div>
  );
}

function StickyNotes({ notes, addNote, updateNote, deleteNote }) {
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
          onClick={() => addNote('yellow')}
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
          onClick={() => addNote('yellow')}
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
          A quiet workspace. Click to add your first note — reminders, follow-ups, anything that doesn't belong to a project yet.
        </div>
      ) : (
        <div style={{
          display: 'flex', gap: 14, overflowX: 'auto',
          padding: '8px 4px 16px',
          // Hide scrollbar but keep scroll
          scrollbarWidth: 'thin',
        }}>
          {notes.map(n => (
            <StickyNote
              key={n.id}
              note={n}
              onChange={patch => updateNote(n.id, patch)}
              onDelete={() => deleteNote(n.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default StickyNotes;
