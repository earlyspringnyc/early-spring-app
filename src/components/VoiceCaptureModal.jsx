import { useState, useEffect, useRef, useMemo } from 'react';
import T from '../theme/tokens.js';
import { restFetch, getSession } from '../lib/db.js';
import { addProjectNote } from '../lib/projectNotes.js';
import VoiceCaptureHistory from './VoiceCaptureHistory.jsx';

// Voice capture modal. Mobile-first: full-screen on phones, centered
// card on desktop. State machine:
//
//   idle        → tap mic → start recording
//   recording   → stop button → blob ready → kick off transcribe
//   transcribing → spinner; on success → reviewing
//   reviewing   → show transcript + Claude's suggestion card. User
//                 picks one of {File it as suggested, Save as note,
//                 Discard}. Editing destination lives here too.
//   filing      → writing the chosen row + the capture log
//   done        → 1.2s success toast, then auto-close
//   error       → message + retry/close
//
// We pick the best browser MIME at record-start time (Safari iOS only
// gives us mp4; Chrome/Firefox/Android give webm/opus). MediaRecorder
// without `mimeType` falls back to the browser default, which Gemini
// can usually still parse — but specifying is more reliable.

function pickAudioMime() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of candidates) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {}
  }
  return '';
}

function fmtClock(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      const idx = typeof result === 'string' ? result.indexOf(',') : -1;
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const KIND_LABELS = {
  reminder: 'Reminder',
  project_note: 'Project note',
  general_note: 'Sticky note',
};

// Mirrors the COLORS map in StickyNotes.jsx — same hue, different
// opacities. Keep these in sync if the sticky-notes palette changes.
const NOTE_COLORS = [
  { key: 'light', bg: 'rgba(15,82,186,.06)', border: 'rgba(15,82,186,.28)' },
  { key: 'wash',  bg: 'rgba(15,82,186,.12)', border: 'rgba(15,82,186,.40)' },
  { key: 'deep',  bg: 'rgba(15,82,186,.20)', border: 'rgba(15,82,186,.55)' },
  { key: 'solid', bg: '#0F52BA',             border: '#0F52BA' },
];

export default function VoiceCaptureModal({ user, projects = [], accessToken, onClose, onFiled }) {
  const [view, setView] = useState('capture'); // 'capture' | 'history'
  const [phase, setPhase] = useState('idle'); // idle | recording | transcribing | reviewing | filing | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const [recStartedAt, setRecStartedAt] = useState(0);
  const [tick, setTick] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [editKind, setEditKind] = useState('general_note');
  const [editProjectId, setEditProjectId] = useState('');
  const [editReminderDate, setEditReminderDate] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editColor, setEditColor] = useState('wash');
  const [captureRowId, setCaptureRowId] = useState(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const mimeRef = useRef('');

  const userId = user?.user_id || user?.id || null;

  const activeProjects = useMemo(() =>
    (projects || []).filter(p => p.id && !['cancelled', 'archived', 'past'].includes(p.stage))
      .map(p => ({ id: p.id, name: p.name, client: p.client }))
  , [projects]);

  const projectById = useMemo(() => {
    const m = new Map();
    activeProjects.forEach(p => m.set(p.id, p));
    return m;
  }, [activeProjects]);

  // Recording clock — re-render every 250ms while recording so the
  // timer ticks. Cheap because the modal is the only thing mounted.
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(() => setTick(t => t + 1), 250);
    return () => clearInterval(id);
  }, [phase]);

  // Defensive cleanup: stop tracks if the modal unmounts mid-record.
  useEffect(() => () => {
    try { recorderRef.current?.state === 'recording' && recorderRef.current.stop(); } catch (e) {}
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch (e) {}
  }, []);

  const startRecording = async () => {
    setErrorMsg('');
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('This browser does not expose the microphone API. On iOS, add this site to your Home Screen and open from there.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickAudioMime();
      mimeRef.current = mime || 'audio/webm';
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunksRef.current.push(ev.data); };
      rec.onstop = () => onRecordingStopped();
      rec.start();
      recorderRef.current = rec;
      setRecStartedAt(Date.now());
      setPhase('recording');
    } catch (e) {
      setErrorMsg(e?.message || 'Could not access microphone. Check browser permissions.');
      setPhase('error');
    }
  };

  const stopRecording = () => {
    try {
      recorderRef.current?.stop();
    } catch (e) {
      setErrorMsg(e?.message || 'Failed to stop recording');
      setPhase('error');
    }
  };

  const onRecordingStopped = async () => {
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch (e) {}
    streamRef.current = null;

    const blob = new Blob(chunksRef.current, { type: mimeRef.current || 'audio/webm' });
    const duration_ms = Date.now() - recStartedAt;

    if (!blob.size) {
      setErrorMsg('Empty recording — try again.');
      setPhase('error');
      return;
    }

    setPhase('transcribing');
    try {
      const session = await getSession();
      const audio = await blobToBase64(blob);
      const tRes = await fetch('/api/voice/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ audio, mime: mimeRef.current }),
      });
      if (!tRes.ok) {
        const j = await tRes.json().catch(() => ({}));
        throw new Error(j.error || `Transcription failed (${tRes.status})`);
      }
      const { transcript: text } = await tRes.json();
      if (!text || !text.trim()) {
        setErrorMsg('Audio was silent or could not be understood. Try again.');
        setPhase('error');
        return;
      }
      setTranscript(text);

      // In parallel: (a) log the capture row so we have an audit trail,
      // (b) ask Claude to classify. Filing waits on the user's choice.
      const captureP = restFetch('/voice_captures?select=id', {
        method: 'POST',
        body: {
          user_id: userId,
          transcript: text,
          status: 'pending',
          duration_ms,
        },
      }).then(rows => {
        const id = Array.isArray(rows) ? rows[0]?.id : rows?.id;
        if (id) setCaptureRowId(id);
      }).catch(e => console.warn('[voice] capture log insert failed:', e?.message || e));

      const classifyRes = await fetch('/api/voice/classify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ transcript: text, projects: activeProjects }),
      });
      await captureP;

      if (!classifyRes.ok) {
        // Classification failure isn't fatal — let the user file manually.
        console.warn('[voice] classify failed; falling back to general_note');
        setSuggestion({ kind: 'general_note', body: text, summary: 'New thought', confidence: 'low', reasoning: 'classifier unavailable' });
        setEditKind('general_note');
        setEditBody(text);
        setPhase('reviewing');
        return;
      }
      const { suggestion: s } = await classifyRes.json();
      setSuggestion(s);
      setEditKind(s.kind || 'general_note');
      setEditProjectId(s.project_id || (activeProjects[0]?.id || ''));
      setEditBody(s.body || text);
      if (s.kind === 'reminder' && s.reminder_date) {
        // datetime-local needs YYYY-MM-DDTHH:MM (no seconds, no tz)
        const d = new Date(s.reminder_date);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        setEditReminderDate(iso);
      } else {
        setEditReminderDate('');
      }
      setPhase('reviewing');
    } catch (e) {
      setErrorMsg(e?.message || 'Transcription failed');
      setPhase('error');
    }
  };

  const fileIt = async () => {
    setPhase('filing');
    try {
      let routedTable = null;
      let routedId = null;

      if (editKind === 'reminder') {
        // Write into user_notes with reminder_date set. Existing
        // useUserNotes hook will surface it in StickyNotes with the
        // "add to calendar" action wired up.
        const reminderIso = editReminderDate
          ? new Date(editReminderDate).toISOString()
          : null;
        const action = (suggestion?.reminder_action || suggestion?.summary || 'Voice reminder').trim().slice(0, 120);
        const inserted = await restFetch('/user_notes?select=id', {
          method: 'POST',
          body: {
            user_id: userId,
            content: editBody,
            color: editColor,
            sort_order: 0,
            analyzed_content: editBody,
            reminder_date: reminderIso,
            reminder_action: action,
          },
        });
        routedTable = 'user_notes';
        routedId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
      } else if (editKind === 'project_note') {
        if (!editProjectId) throw new Error('Pick a project first.');
        const row = await addProjectNote(userId, editProjectId, {
          content: editBody,
          source: 'manual',
        });
        routedTable = 'project_notes';
        routedId = row?.id;
      } else {
        // general_note → user_notes (a sticky note), no reminder
        const inserted = await restFetch('/user_notes?select=id', {
          method: 'POST',
          body: {
            user_id: userId,
            content: editBody,
            color: editColor,
            sort_order: 0,
            analyzed_content: editBody,
          },
        });
        routedTable = 'user_notes';
        routedId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
      }

      if (captureRowId) {
        await restFetch(`/voice_captures?id=eq.${encodeURIComponent(captureRowId)}`, {
          method: 'PATCH',
          body: {
            suggestion,
            status: 'filed',
            routed_to_table: routedTable,
            routed_to_id: routedId,
          },
          prefer: 'return=minimal',
        }).catch(() => {});
      }

      setPhase('done');
      try { onFiled?.({ kind: editKind, table: routedTable, id: routedId }); } catch (e) {}
      setTimeout(() => onClose?.(), 1100);
    } catch (e) {
      setErrorMsg(e?.message || 'Could not file the note');
      setPhase('error');
    }
  };

  const discard = async () => {
    if (captureRowId) {
      await restFetch(`/voice_captures?id=eq.${encodeURIComponent(captureRowId)}`, {
        method: 'PATCH', body: { status: 'discarded', suggestion }, prefer: 'return=minimal',
      }).catch(() => {});
    }
    onClose?.();
  };

  const elapsedMs = phase === 'recording' ? Date.now() - recStartedAt : 0;

  // Layout: full-screen sheet that anchors to the bottom on mobile,
  // centered card on desktop. We use position: fixed + flex centering
  // and a media query via window.innerWidth at render — cheap, no CSS.
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div
      onClick={phase !== 'recording' && phase !== 'transcribing' && phase !== 'filing' ? onClose : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 9997,
        background: 'rgba(15,82,186,.32)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
        padding: isMobile ? 0 : 24,
        fontFamily: T.sans,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isMobile ? '100%' : 'min(520px, 92vw)',
          maxHeight: isMobile ? '92vh' : '88vh',
          background: T.bg,
          color: T.ink,
          borderRadius: isMobile ? '24px 24px 0 0' : T.r,
          boxShadow: T.shadow,
          overflow: 'auto',
          border: `1px solid ${T.border}`,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '18px 22px', borderBottom: `1px solid ${T.border}`, gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.10em', color: T.ink }}>
            {view === 'history' ? 'Recent captures' : 'Voice capture'}
          </div>
          <button
            onClick={() => setView(view === 'history' ? 'capture' : 'history')}
            disabled={phase === 'recording' || phase === 'transcribing' || phase === 'filing'}
            title={view === 'history' ? 'Back to recording' : 'See past captures'}
            style={{
              marginLeft: 'auto',
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: T.rS,
              border: `1px solid ${T.border}`, background: 'transparent',
              color: T.fadedInk, fontSize: 10, fontWeight: 600,
              letterSpacing: '.06em', textTransform: 'uppercase',
              cursor: 'pointer', fontFamily: T.sans,
              opacity: (phase === 'recording' || phase === 'transcribing' || phase === 'filing') ? .3 : 1,
            }}
          >
            {view === 'history' ? (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                Record
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                History
              </>
            )}
          </button>
          <button
            onClick={onClose}
            disabled={phase === 'recording' || phase === 'transcribing' || phase === 'filing'}
            style={{
              background: 'none', border: 'none',
              color: T.fadedInk, fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1,
              opacity: (phase === 'recording' || phase === 'transcribing' || phase === 'filing') ? .3 : 1,
            }}
          >&#10005;</button>
        </div>

        <div style={{ padding: '24px 22px 28px' }}>
          {view === 'history' && (
            <VoiceCaptureHistory projects={projects} />
          )}

          {view === 'capture' && phase === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
              <p style={{ fontSize: 13, color: T.fadedInk, textAlign: 'center', margin: 0, maxWidth: 320 }}>
                Tap to record a thought. Claude will figure out whether it's a reminder, a project note, or just a brain dump.
              </p>
              <MicButton onClick={startRecording} />
              <div style={{ fontSize: 11, color: T.fadedInk }}>Hold the phone close, speak naturally.</div>
            </div>
          )}

          {view === 'capture' && phase === 'recording' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
              <PulsingDot />
              <div style={{ fontSize: 34, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                {fmtClock(elapsedMs)}
              </div>
              <button
                onClick={stopRecording}
                style={{
                  padding: '14px 28px', borderRadius: 999, border: 'none',
                  background: T.ink, color: T.paper, fontSize: 13, fontWeight: 700,
                  letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer',
                  fontFamily: T.sans,
                }}
              >Stop &amp; transcribe</button>
            </div>
          )}

          {view === 'capture' && phase === 'transcribing' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '24px 0' }}>
              <div style={{ fontSize: 22, color: T.ink, animation: 'pulse 1.4s ease-in-out infinite' }}>&#9676;</div>
              <div style={{ fontSize: 12, color: T.fadedInk }}>Transcribing &amp; classifying…</div>
            </div>
          )}

          {view === 'capture' && phase === 'reviewing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <Label>What I heard</Label>
                <div style={{ fontSize: 14, lineHeight: 1.5, color: T.ink, background: T.surface, padding: '12px 14px', borderRadius: T.rS, border: `1px solid ${T.border}`, marginTop: 6 }}>
                  {transcript}
                </div>
              </div>

              <div style={{ background: T.surface, padding: 14, borderRadius: T.rS, border: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Label>Claude suggests</Label>
                  <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: `${T.ink}14`, color: T.ink, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {suggestion?.confidence || 'med'} confidence
                  </span>
                </div>

                {/* Kind picker — segmented control */}
                <div style={{ display: 'flex', gap: 4, background: T.paper, borderRadius: T.rS, padding: 3, marginBottom: 12, border: `1px solid ${T.border}` }}>
                  {['reminder', 'project_note', 'general_note'].map(k => (
                    <button
                      key={k}
                      onClick={() => setEditKind(k)}
                      style={{
                        flex: 1, padding: '8px 8px', borderRadius: T.rS, border: 'none',
                        background: editKind === k ? T.ink : 'transparent',
                        color: editKind === k ? T.paper : T.fadedInk,
                        fontSize: 11, fontWeight: editKind === k ? 700 : 500,
                        cursor: 'pointer', fontFamily: T.sans, transition: 'all .15s',
                      }}
                    >{KIND_LABELS[k]}</button>
                  ))}
                </div>

                {editKind === 'project_note' && (
                  <div style={{ marginBottom: 12 }}>
                    <Label>Project</Label>
                    <select
                      value={editProjectId}
                      onChange={(e) => setEditProjectId(e.target.value)}
                      style={{
                        width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: T.rS,
                        border: `1px solid ${T.border}`, background: T.paper, color: T.ink,
                        fontSize: 13, fontFamily: T.sans,
                      }}
                    >
                      <option value="">— pick a project —</option>
                      {activeProjects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}{p.client ? ` — ${p.client}` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                {editKind === 'reminder' && (
                  <div style={{ marginBottom: 12 }}>
                    <Label>Remind me at</Label>
                    <input
                      type="datetime-local"
                      value={editReminderDate}
                      onChange={(e) => setEditReminderDate(e.target.value)}
                      style={{
                        width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: T.rS,
                        border: `1px solid ${T.border}`, background: T.paper, color: T.ink,
                        fontSize: 13, fontFamily: T.sans,
                      }}
                    />
                  </div>
                )}

                {(editKind === 'reminder' || editKind === 'general_note') && (
                  <div style={{ marginBottom: 12 }}>
                    <Label>Sticky color</Label>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      {NOTE_COLORS.map(c => (
                        <button
                          key={c.key}
                          onClick={() => setEditColor(c.key)}
                          aria-label={`Color ${c.key}`}
                          style={{
                            width: 30, height: 30, borderRadius: 15,
                            background: c.bg,
                            border: `2px solid ${editColor === c.key ? T.ink : c.border}`,
                            cursor: 'pointer',
                            outline: 'none',
                            transition: 'transform .12s',
                            transform: editColor === c.key ? 'scale(1.08)' : 'scale(1)',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <Label>Note</Label>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={4}
                    style={{
                      width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: T.rS,
                      border: `1px solid ${T.border}`, background: T.paper, color: T.ink,
                      fontSize: 13, fontFamily: T.sans, resize: 'vertical', lineHeight: 1.5,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={discard}
                  style={{
                    padding: '12px 16px', borderRadius: T.rS, border: `1px solid ${T.border}`,
                    background: 'transparent', color: T.fadedInk, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: T.sans,
                  }}
                >Discard</button>
                <button
                  onClick={fileIt}
                  disabled={editKind === 'project_note' && !editProjectId}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: T.rS, border: 'none',
                    background: T.ink, color: T.paper, fontSize: 13, fontWeight: 700,
                    letterSpacing: '.04em', cursor: 'pointer', fontFamily: T.sans,
                    opacity: (editKind === 'project_note' && !editProjectId) ? .4 : 1,
                  }}
                >File it</button>
              </div>
            </div>
          )}

          {view === 'capture' && phase === 'filing' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '24px 0' }}>
              <div style={{ fontSize: 22, color: T.ink, animation: 'pulse 1.4s ease-in-out infinite' }}>&#9676;</div>
              <div style={{ fontSize: 12, color: T.fadedInk }}>Filing…</div>
            </div>
          )}

          {view === 'capture' && phase === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '32px 0' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 28, background: T.ink, color: T.paper,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
              }}>&#10003;</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Filed.</div>
            </div>
          )}

          {view === 'capture' && phase === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
              <div style={{ fontSize: 13, color: T.alert, background: T.alertSoft, padding: '12px 14px', borderRadius: T.rS, lineHeight: 1.5 }}>
                {errorMsg || 'Something went wrong.'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={onClose}
                  style={{
                    padding: '12px 16px', borderRadius: T.rS, border: `1px solid ${T.border}`,
                    background: 'transparent', color: T.fadedInk, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: T.sans,
                  }}
                >Close</button>
                <button
                  onClick={() => { setErrorMsg(''); setPhase('idle'); }}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: T.rS, border: 'none',
                    background: T.ink, color: T.paper, fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', fontFamily: T.sans,
                  }}
                >Try again</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: T.fadedInk, textTransform: 'uppercase', letterSpacing: '.08em' }}>
      {children}
    </div>
  );
}

function MicButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 96, height: 96, borderRadius: 48, border: 'none',
        background: T.ink, color: T.paper, cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(15,82,186,.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform .12s',
      }}
      onMouseDown={(e) => e.currentTarget.style.transform = 'scale(.96)'}
      onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
      aria-label="Start recording"
    >
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    </button>
  );
}

function PulsingDot() {
  return (
    <div style={{ position: 'relative', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 40, background: T.ink, opacity: .15,
        animation: 'pulse 1.4s ease-in-out infinite',
      }}/>
      <div style={{
        width: 28, height: 28, borderRadius: 14, background: T.ink,
      }}/>
    </div>
  );
}
