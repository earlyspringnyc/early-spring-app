import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import T from '../theme/tokens.js';
import { uid } from '../utils/uid.js';
import { mkVendor } from '../data/factories.js';
import { getSession } from '../lib/db.js';

// Project-level production topics — a workspace for things that don't
// fit budget or timeline: venues being scouted, catering quotes,
// permit applications, content-creator outreach, etc. Each topic is
// a card on the grid; clicking a card opens a notepad-style editor
// with notes, links, and image gallery.
//
// Data lives on project.data as `productionTopics` (jsonb array). Each
// topic has { id, label, icon, notes, links: [{id,url,label}],
// images: [{id, storagePath, fileName, caption}], updatedAt }.
// Images upload to the production-topics Storage bucket.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const enc = encodeURIComponent;
function publicTopicFile(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/production-topics/${path.split('/').map(enc).join('/')}`;
}
const isPdfFile = (file) => file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '');
const isImageFile = (file) => file?.type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|heic)$/i.test(file?.name || '');

const DEFAULT_SUGGESTIONS = [
  { label: 'Venues', icon: '🏛' },
  { label: 'Catering', icon: '🍽' },
  { label: 'Permits', icon: '📜' },
  { label: 'Content Creators', icon: '🎬' },
  { label: 'Transportation', icon: '🚐' },
  { label: 'Lodging', icon: '🛏' },
  { label: 'Security', icon: '🛡' },
  { label: 'Talent', icon: '🎭' },
];

export default function TopicsV({ project, updateProject, canEdit, onAddVendor, onVendorClick }) {
  const topics = Array.isArray(project?.productionTopics) ? project.productionTopics : [];
  const [activeTopicId, setActiveTopicId] = useState(null);
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicIcon, setNewTopicIcon] = useState('📋');
  const [hoveredId, setHoveredId] = useState(null);
  const [renameId, setRenameId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');

  const projectId = project?.id || project?._dbId;
  const activeTopic = topics.find(t => t.id === activeTopicId) || null;

  const writeTopics = useCallback((next) => {
    updateProject({ productionTopics: next });
  }, [updateProject]);

  const addTopic = useCallback((label, icon = '📋') => {
    const name = (label || '').trim();
    if (!name) return null;
    const topic = {
      id: uid(),
      label: name,
      icon: icon || '📋',
      notes: '',
      links: [],
      images: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    writeTopics([...topics, topic]);
    setAddingTopic(false);
    setNewTopicName('');
    setNewTopicIcon('📋');
    return topic.id;
  }, [topics, writeTopics]);

  const deleteTopic = useCallback((id) => {
    const t = topics.find(x => x.id === id);
    if (!confirm(`Delete "${t?.label || 'this topic'}"? Notes, links and images are gone for good.`)) return;
    writeTopics(topics.filter(x => x.id !== id));
    if (activeTopicId === id) setActiveTopicId(null);
  }, [topics, writeTopics, activeTopicId]);

  const renameTopic = useCallback((id, nextLabel) => {
    const lbl = (nextLabel || '').trim();
    if (!lbl) return;
    writeTopics(topics.map(t => t.id === id ? { ...t, label: lbl, updatedAt: new Date().toISOString() } : t));
  }, [topics, writeTopics]);

  const updateTopic = useCallback((id, patch) => {
    writeTopics(topics.map(t => t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t));
  }, [topics, writeTopics]);

  // ── Grid view ──────────────────────────────────────────────────────
  if (!activeTopic) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: T.cream, letterSpacing: '-0.01em', margin: 0 }}>Production Topics</h1>
            <p style={{ fontSize: 13, color: T.dim, marginTop: 6 }}>
              {topics.length === 0 ? 'A free-form workspace for venues, catering, permits, anything that needs notes + links + photos in one place.' : `${topics.length} ${topics.length === 1 ? 'topic' : 'topics'}`}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {topics.map(t => {
            const isHovered = hoveredId === t.id;
            const isRenaming = renameId === t.id;
            return (
              <div key={t.id}
                onClick={() => { if (!isRenaming) setActiveTopicId(t.id); }}
                onMouseEnter={() => setHoveredId(t.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  position: 'relative', borderRadius: T.r, border: `1px solid ${T.border}`,
                  background: T.surfEl, padding: '22px 24px', cursor: isRenaming ? 'default' : 'pointer',
                  transition: 'all .15s', borderLeft: `3px solid ${T.ink60}`,
                }}>
                {canEdit && isHovered && !isRenaming && (
                  <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 4, zIndex: 2 }} onClick={e => e.stopPropagation()}>
                    <button onClick={e => { e.stopPropagation(); setRenameId(t.id); setRenameDraft(t.label); }} title="Rename" style={iconCircle(T.dim)}>✎</button>
                    <button onClick={e => { e.stopPropagation(); deleteTopic(t.id); }} title="Delete" style={iconCircle(T.neg)}>×</button>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 24, lineHeight: 1 }}>{t.icon || '📋'}</span>
                  {isRenaming ? (
                    <div style={{ flex: 1, display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                      <input autoFocus value={renameDraft} onChange={e => setRenameDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { renameTopic(t.id, renameDraft); setRenameId(null); } else if (e.key === 'Escape') setRenameId(null); }}
                        style={{ flex: 1, padding: '4px 8px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: T.surface, color: T.cream, fontSize: 14, fontFamily: T.sans, outline: 'none' }}/>
                      <button onClick={() => { renameTopic(t.id, renameDraft); setRenameId(null); }} style={pillBtn(T.ink, T.paper)}>Save</button>
                    </div>
                  ) : (
                    <span style={{ fontSize: 15, fontWeight: 600, color: T.cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.label}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: T.dim, fontFamily: T.mono }}>
                  <span>📝 {(t.notes || '').trim() ? `${(t.notes || '').trim().split(/\s+/).length} words` : 'No notes'}</span>
                  <span>🔗 {(t.links || []).length}</span>
                  <span>🖼 {(t.images || []).length}</span>
                </div>
              </div>
            );
          })}

          {/* Add tile */}
          {canEdit && (
            <div onClick={() => { if (!addingTopic) setAddingTopic(true); }}
              style={{ borderRadius: T.r, border: `2px dashed ${T.border}`, background: 'transparent', cursor: addingTopic ? 'default' : 'pointer', padding: '22px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 130 }}>
              {addingTopic ? (
                <div onClick={e => e.stopPropagation()}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>New topic</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input value={newTopicIcon} onChange={e => setNewTopicIcon(e.target.value.slice(0, 2))} placeholder="🏛" style={{ width: 36, padding: '6px 8px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: T.surface, color: T.cream, fontSize: 14, fontFamily: T.sans, outline: 'none', textAlign: 'center' }}/>
                    <input autoFocus value={newTopicName} onChange={e => setNewTopicName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addTopic(newTopicName, newTopicIcon); else if (e.key === 'Escape') setAddingTopic(false); }}
                      placeholder="Venues" style={{ flex: 1, minWidth: 0, padding: '6px 10px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: T.surface, color: T.cream, fontSize: 12, fontFamily: T.sans, outline: 'none' }}/>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    <button onClick={() => addTopic(newTopicName, newTopicIcon)} disabled={!newTopicName.trim()} style={{ flex: 1, padding: '6px 10px', borderRadius: T.rS, border: 'none', background: newTopicName.trim() ? T.ink : T.inkSoft2, color: newTopicName.trim() ? T.paper : T.fadedInk, fontSize: 11, fontWeight: 700, cursor: newTopicName.trim() ? 'pointer' : 'default', fontFamily: T.sans }}>Add</button>
                    <button onClick={() => { setAddingTopic(false); setNewTopicName(''); }} style={{ padding: '6px 12px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: 'transparent', color: T.dim, fontSize: 11, cursor: 'pointer', fontFamily: T.sans }}>Cancel</button>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Or pick a suggestion:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {DEFAULT_SUGGESTIONS.map(s => (
                      <button key={s.label} onClick={() => addTopic(s.label, s.icon)} style={{ padding: '4px 9px', borderRadius: 999, border: `1px solid ${T.border}`, background: 'transparent', color: T.dim, fontSize: 11, cursor: 'pointer', fontFamily: T.sans, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span>{s.icon}</span>{s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: T.dim }}>
                  <div style={{ fontSize: 28, marginBottom: 6, opacity: .4 }}>+</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.cream }}>Add topic</div>
                  <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>Venues, catering, permits, anything</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Topic detail / editor ──────────────────────────────────────────
  const projectVendors = Array.isArray(project?.vendors) ? project.vendors : [];
  return (
    <TopicEditor
      topic={activeTopic}
      projectId={projectId}
      canEdit={canEdit}
      projectVendors={projectVendors}
      onAddVendor={onAddVendor}
      onVendorClick={onVendorClick}
      onBack={() => setActiveTopicId(null)}
      onPatch={(patch) => updateTopic(activeTopic.id, patch)}
      onDelete={() => { deleteTopic(activeTopic.id); }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// TopicEditor — the notepad view. Notes (multi-line textarea) +
// links (list with add row) + images (drag-drop + upload to Storage,
// caption per image).
// ─────────────────────────────────────────────────────────────────────
function TopicEditor({ topic, projectId, canEdit, projectVendors = [], onAddVendor, onVendorClick, onBack, onPatch, onDelete }) {
  const [notesDraft, setNotesDraft] = useState(topic.notes || '');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [uploading, setUploading] = useState({});  // imageId -> pct
  const [dragOver, setDragOver] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const fileRef = useRef(null);

  // Sync notes draft → persist when user stops typing for 700ms
  useEffect(() => { setNotesDraft(topic.notes || ''); }, [topic.id]);
  useEffect(() => {
    if (notesDraft === (topic.notes || '')) return;
    const t = setTimeout(() => onPatch({ notes: notesDraft }), 700);
    return () => clearTimeout(t);
  }, [notesDraft]);

  const addLink = useCallback(() => {
    const url = (newLinkUrl || '').trim();
    if (!url) return;
    const link = { id: uid(), url, label: (newLinkLabel || '').trim() || url };
    onPatch({ links: [...(topic.links || []), link] });
    setNewLinkUrl('');
    setNewLinkLabel('');
  }, [newLinkUrl, newLinkLabel, topic.links, onPatch]);

  const removeLink = useCallback((id) => {
    onPatch({ links: (topic.links || []).filter(l => l.id !== id) });
  }, [topic.links, onPatch]);

  // Upload any image or PDF to Storage with a per-file progress tracker.
  // Mixed in the same gallery array; PDFs get a paper-icon thumbnail
  // and open in a new tab when clicked.
  const uploadFile = useCallback(async (file) => {
    if (!file || !projectId) return;
    const imageId = uid();
    const safeName = file.name.replace(/[^A-Za-z0-9._\-]/g, '_').slice(0, 120);
    const storagePath = `${projectId}/${topic.id}/${imageId}-${safeName}`;
    setUploading(u => ({ ...u, [imageId]: 0 }));
    try {
      const session = await getSession();
      if (!session?.access_token) throw new Error('Not signed in');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/production-topics/${enc(storagePath)}`);
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setUploading(u => ({ ...u, [imageId]: pct }));
        }
      };
      await new Promise((resolve, reject) => {
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Upload network error'));
        xhr.send(file);
      });
      const item = {
        id: imageId,
        storagePath,
        fileName: file.name,
        caption: '',
        kind: isPdfFile(file) ? 'pdf' : 'image',
        contentType: file.type || (isPdfFile(file) ? 'application/pdf' : null),
        uploadedAt: new Date().toISOString(),
      };
      onPatch({ images: [...(topic.images || []), item] });
    } catch (e) {
      console.error('[topics] upload failed:', e);
      alert(`Upload failed: ${e.message || e}`);
    } finally {
      setUploading(u => { const n = { ...u }; delete n[imageId]; return n; });
    }
  }, [projectId, topic.id, topic.images, onPatch]);

  const handleFiles = useCallback((files) => {
    if (!files || !files.length) return;
    Array.from(files).forEach(f => {
      if (isPdfFile(f) || isImageFile(f)) uploadFile(f);
    });
  }, [uploadFile]);

  const removeImage = useCallback((id) => {
    if (!confirm('Remove this image?')) return;
    onPatch({ images: (topic.images || []).filter(im => im.id !== id) });
  }, [topic.images, onPatch]);

  const captionImage = useCallback((id, caption) => {
    onPatch({ images: (topic.images || []).map(im => im.id === id ? { ...im, caption } : im) });
  }, [topic.images, onPatch]);

  const images = topic.images || [];
  const lightboxImage = lightboxIdx !== null ? images[lightboxIdx] : null;

  return (
    <div onDragOver={e => { if (canEdit) { e.preventDefault(); setDragOver(true); } }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); if (canEdit) handleFiles(e.dataTransfer.files); }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.dim, fontSize: 13, fontFamily: T.sans, padding: '6px 0' }}>← All topics</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <span style={{ fontSize: 30, lineHeight: 1 }}>{topic.icon || '📋'}</span>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: T.cream, margin: 0, letterSpacing: '-0.02em' }}>{topic.label}</h1>
        {canEdit && <button onClick={onDelete} title="Delete topic" style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: T.rS, border: `1px solid ${T.alert}40`, background: 'transparent', color: T.alert, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>Delete topic</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 24 }}>
        {/* Left column: notes + images */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Notes */}
          <section>
            <SectionHeader>Notes</SectionHeader>
            <textarea
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
              placeholder={canEdit ? 'Anything — quotes received, contacts, sketches in words, status updates…' : 'No notes yet.'}
              readOnly={!canEdit}
              rows={12}
              style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: T.surface, color: T.cream, fontSize: 13, fontFamily: T.sans, outline: 'none', resize: 'vertical', lineHeight: 1.65, minHeight: 240 }}
            />
            <div style={{ fontSize: 10, color: T.dim, marginTop: 4, fontFamily: T.mono }}>
              {notesDraft === (topic.notes || '') ? `Last saved · ${topic.updatedAt ? new Date(topic.updatedAt).toLocaleString() : '—'}` : 'Saving…'}
            </div>
          </section>

          {/* Files (images + PDFs) */}
          <section>
            <SectionHeader right={canEdit && <button onClick={() => fileRef.current?.click()} style={pillBtn(T.gold + '20', T.gold, T.gold + '60')}>+ Upload files</button>}>Files ({images.length})</SectionHeader>
            <input ref={fileRef} type="file" multiple accept="image/*,application/pdf,.pdf" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }}/>
            {dragOver && canEdit && <div style={{ padding: 28, border: `2px dashed ${T.gold}`, borderRadius: T.r, background: T.gold + '0A', textAlign: 'center', color: T.gold, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Drop to upload</div>}
            {images.length === 0 && Object.keys(uploading).length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', border: `1px dashed ${T.border}`, borderRadius: T.r, color: T.dim, fontSize: 12 }}>
                Drag images or PDFs here, or click Upload. References, signs, contracts, quotes — whatever helps.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {Object.entries(uploading).map(([id, pct]) => (
                  <div key={id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rS, padding: 12, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, fontFamily: T.sans }}>
                    <div style={{ fontSize: 11, color: T.dim }}>Uploading… {pct}%</div>
                    <div style={{ width: '100%', height: 4, background: T.inkSoft2, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: T.gold, transition: 'width .15s' }}/>
                    </div>
                  </div>
                ))}
                {images.map((im, idx) => {
                  const url = publicTopicFile(im.storagePath);
                  const isPdf = im.kind === 'pdf' || /\.pdf$/i.test(im.fileName || '') || im.contentType === 'application/pdf';
                  return (
                    <div key={im.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rS, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      {isPdf ? (
                        // PDFs: filename + open-in-new-tab card (no thumbnail
                        // since rendering pdf.js inline here is heavy)
                        <a href={url} target="_blank" rel="noopener noreferrer" style={{ all: 'unset', cursor: 'pointer', display: 'flex', aspectRatio: '4 / 3', background: 'rgba(122,31,31,.04)', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, padding: 12, textAlign: 'center' }}>
                          <span style={{ fontSize: 32, color: '#7A1F1F', opacity: .85 }}>📄</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#7A1F1F', letterSpacing: '.08em', textTransform: 'uppercase' }}>PDF</span>
                          <span style={{ fontSize: 11, color: T.dim, fontFamily: T.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{im.fileName}</span>
                        </a>
                      ) : (
                        <button onClick={() => setLightboxIdx(idx)} style={{ all: 'unset', cursor: 'pointer', display: 'block', aspectRatio: '4 / 3', background: 'rgba(15,82,186,.04)', overflow: 'hidden' }}>
                          {url ? <img src={url} alt={im.caption || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : <span style={{ fontSize: 10, color: T.dim }}>—</span>}
                        </button>
                      )}
                      <div style={{ padding: 8 }}>
                        <input value={im.caption || ''} onChange={e => captionImage(im.id, e.target.value)} placeholder="Caption…" disabled={!canEdit}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '4px 8px', borderRadius: 4, border: `1px solid ${T.border}`, background: T.bg, color: T.cream, fontSize: 11, fontFamily: T.sans, outline: 'none' }}/>
                        <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                          {isPdf && <a href={url} download={im.fileName} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: T.cyan, textDecoration: 'underline', fontFamily: T.sans }}>Download</a>}
                          {canEdit && <button onClick={() => removeImage(im.id)} style={{ background: 'none', border: 'none', color: T.dim, fontSize: 10, cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: T.sans, marginLeft: 'auto' }}>Remove</button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right column: links + vendors */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <VendorsSection
            topic={topic}
            canEdit={canEdit}
            projectVendors={projectVendors}
            onAddVendor={onAddVendor}
            onVendorClick={onVendorClick}
            onPatch={onPatch}
          />
          <section>
            <SectionHeader>Links ({(topic.links || []).length})</SectionHeader>
            {canEdit && (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rS, padding: 12, marginBottom: 12 }}>
                <input value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink(); }} placeholder="https://…" style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: T.bg, color: T.cream, fontSize: 12, fontFamily: T.sans, outline: 'none', marginBottom: 6 }}/>
                <input value={newLinkLabel} onChange={e => setNewLinkLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink(); }} placeholder="Label (optional)" style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: T.bg, color: T.cream, fontSize: 12, fontFamily: T.sans, outline: 'none', marginBottom: 8 }}/>
                <button onClick={addLink} disabled={!newLinkUrl.trim()} style={{ width: '100%', padding: '8px 12px', borderRadius: T.rS, border: 'none', background: newLinkUrl.trim() ? T.ink : T.inkSoft2, color: newLinkUrl.trim() ? T.paper : T.fadedInk, fontSize: 11, fontWeight: 700, cursor: newLinkUrl.trim() ? 'pointer' : 'default', fontFamily: T.sans, letterSpacing: '.04em' }}>+ Add link</button>
              </div>
            )}
            {(topic.links || []).length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', border: `1px dashed ${T.border}`, borderRadius: T.rS, color: T.dim, fontSize: 12 }}>No links yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(topic.links || []).map(l => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rS }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: T.cyan, fontSize: 12, fontWeight: 600, fontFamily: T.sans, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{l.label || l.url}</a>
                      {l.label !== l.url && <div style={{ fontSize: 10, color: T.dim, fontFamily: T.mono, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url}</div>}
                    </div>
                    {canEdit && <button onClick={() => removeLink(l.id)} title="Remove" style={{ background: 'none', border: 'none', color: T.dim, fontSize: 16, cursor: 'pointer', padding: 4, lineHeight: 1 }}>×</button>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Lightbox — images only. PDFs open in a new tab from the card. */}
      {lightboxImage && createPortal(
        <div onClick={() => setLightboxIdx(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          {(() => {
            // Walk past PDFs when paging through the lightbox so the
            // user only sees real images in the carousel.
            const imageOnlyIdxs = images.map((it, i) => ({ it, i })).filter(({ it }) => !(it.kind === 'pdf' || /\.pdf$/i.test(it.fileName || '') || it.contentType === 'application/pdf')).map(({ i }) => i);
            const pos = imageOnlyIdxs.indexOf(lightboxIdx);
            const goPrev = () => { if (pos > 0) setLightboxIdx(imageOnlyIdxs[pos - 1]); };
            const goNext = () => { if (pos >= 0 && pos < imageOnlyIdxs.length - 1) setLightboxIdx(imageOnlyIdxs[pos + 1]); };
            return (<>
              <button onClick={e => { e.stopPropagation(); goPrev(); }} disabled={pos <= 0} style={lightboxArrow('left', pos <= 0)}>‹</button>
              <img src={publicTopicFile(lightboxImage.storagePath)} alt={lightboxImage.caption || ''} style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 4 }} onClick={e => e.stopPropagation()}/>
              <button onClick={e => { e.stopPropagation(); goNext(); }} disabled={pos < 0 || pos >= imageOnlyIdxs.length - 1} style={lightboxArrow('right', pos < 0 || pos >= imageOnlyIdxs.length - 1)}>›</button>
            </>);
          })()}
          <button onClick={() => setLightboxIdx(null)} style={{ position: 'absolute', top: 18, right: 22, background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', width: 36, height: 36, borderRadius: 18, fontFamily: T.sans }}>×</button>
          {lightboxImage.caption && <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', maxWidth: '80vw', background: 'rgba(255,255,255,.1)', backdropFilter: 'blur(8px)', color: '#fff', padding: '8px 16px', borderRadius: 6, fontSize: 13, fontFamily: T.sans }}>{lightboxImage.caption}</div>}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// VendorsSection — surface the central project.vendors list scoped to
// the ones the user has attached to this topic. Inline form to add a
// new one goes through the parent's onAddVendor, which both saves to
// project.vendors AND syncs to the CRM as a contact (vendor type), so
// adds here aren't isolated.
// ─────────────────────────────────────────────────────────────────────
function VendorsSection({ topic, canEdit, projectVendors, onAddVendor, onVendorClick, onPatch }) {
  const attachedIds = Array.isArray(topic.vendorIds) ? topic.vendorIds : [];
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', contactName: '', email: '', phone: '', vendorType: 'other' });
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkPickerId, setLinkPickerId] = useState('');

  const attached = useMemo(() => {
    const byId = new Map((projectVendors || []).map(v => [v.id, v]));
    return attachedIds.map(id => byId.get(id)).filter(Boolean);
  }, [attachedIds, projectVendors]);

  const unattached = useMemo(() => {
    const set = new Set(attachedIds);
    return (projectVendors || []).filter(v => v?.id && !set.has(v.id));
  }, [projectVendors, attachedIds]);

  const linkVendor = (id) => {
    if (!id || attachedIds.includes(id)) return;
    onPatch({ vendorIds: [...attachedIds, id] });
    setLinkPickerId('');
    setLinkOpen(false);
  };

  const unlinkVendor = (id) => {
    onPatch({ vendorIds: attachedIds.filter(x => x !== id) });
  };

  const submitNew = () => {
    const name = (draft.name || '').trim();
    if (!name) return;
    if (typeof onAddVendor !== 'function') {
      alert('Vendor add not available in this view');
      return;
    }
    const v = mkVendor(name, (draft.email || '').trim(), (draft.phone || '').trim(), '', 'pending', draft.vendorType || 'other', (draft.contactName || '').trim());
    onAddVendor(v);
    // Attach the new vendor to this topic
    onPatch({ vendorIds: [...attachedIds, v.id] });
    setDraft({ name: '', contactName: '', email: '', phone: '', vendorType: 'other' });
    setAdding(false);
  };

  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: T.bg, color: T.cream, fontSize: 12, fontFamily: T.sans, outline: 'none' };

  return (
    <section>
      <SectionHeader right={canEdit && (
        <div style={{ display: 'flex', gap: 6 }}>
          {unattached.length > 0 && <button onClick={() => setLinkOpen(o => !o)} style={pillBtn(T.inkSoft, T.ink, T.border)}>+ Link existing</button>}
          <button onClick={() => setAdding(a => !a)} style={pillBtn(T.gold + '20', T.gold, T.gold + '60')}>+ Add vendor</button>
        </div>
      )}>Vendors ({attached.length})</SectionHeader>

      {/* Link existing vendor */}
      {linkOpen && canEdit && unattached.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rS, padding: 10, marginBottom: 10, display: 'flex', gap: 6 }}>
          <select value={linkPickerId} onChange={e => setLinkPickerId(e.target.value)} style={inputStyle}>
            <option value="">— Pick a vendor —</option>
            {unattached.map(v => <option key={v.id} value={v.id}>{v.name}{v.contactName ? ` · ${v.contactName}` : ''}</option>)}
          </select>
          <button onClick={() => linkVendor(linkPickerId)} disabled={!linkPickerId} style={{ padding: '7px 14px', borderRadius: T.rS, border: 'none', background: linkPickerId ? T.ink : T.inkSoft2, color: linkPickerId ? T.paper : T.fadedInk, fontSize: 11, fontWeight: 700, cursor: linkPickerId ? 'pointer' : 'default', fontFamily: T.sans }}>Link</button>
        </div>
      )}

      {/* Add new vendor inline */}
      {adding && canEdit && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rS, padding: 12, marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
            <input autoFocus value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Vendor name *" style={inputStyle}/>
            <input value={draft.contactName} onChange={e => setDraft({ ...draft, contactName: e.target.value })} placeholder="Contact name" style={inputStyle}/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
            <input value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="Email" style={inputStyle}/>
            <input value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} placeholder="Phone" style={inputStyle}/>
          </div>
          <select value={draft.vendorType} onChange={e => setDraft({ ...draft, vendorType: e.target.value })} style={{ ...inputStyle, marginBottom: 8 }}>
            <option value="other">Other</option>
            <option value="venue">Venue</option>
            <option value="catering">Catering</option>
            <option value="transportation">Transportation</option>
            <option value="rentals">Rentals / equipment</option>
            <option value="staffing">Staffing / talent</option>
            <option value="creative">Creative / production</option>
            <option value="security">Security</option>
            <option value="permits">Permits / legal</option>
            <option value="hotel">Hotel / lodging</option>
            <option value="other_service">Other service</option>
          </select>
          <div style={{ fontSize: 10, color: T.dim, marginBottom: 8 }}>Adds to the project vendor list + CRM contacts. You can fill in the rest later from Vendors.</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={submitNew} disabled={!draft.name.trim()} style={{ flex: 1, padding: '8px 12px', borderRadius: T.rS, border: 'none', background: draft.name.trim() ? T.ink : T.inkSoft2, color: draft.name.trim() ? T.paper : T.fadedInk, fontSize: 11, fontWeight: 700, cursor: draft.name.trim() ? 'pointer' : 'default', fontFamily: T.sans, letterSpacing: '.04em' }}>Save vendor</button>
            <button onClick={() => setAdding(false)} style={{ padding: '8px 12px', borderRadius: T.rS, border: `1px solid ${T.border}`, background: 'transparent', color: T.dim, fontSize: 11, cursor: 'pointer', fontFamily: T.sans }}>Cancel</button>
          </div>
        </div>
      )}

      {attached.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', border: `1px dashed ${T.border}`, borderRadius: T.rS, color: T.dim, fontSize: 12 }}>
          No vendors attached. Add a quick stub here — fill in details from the Vendors tab later.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {attached.map(v => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rS }}>
              <button onClick={() => onVendorClick?.(v.id)} style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</div>
                <div style={{ fontSize: 10, color: T.dim, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.contactName || '—'}{v.email ? ` · ${v.email}` : ''}{v.phone ? ` · ${v.phone}` : ''}
                </div>
              </button>
              {canEdit && <button onClick={() => unlinkVendor(v.id)} title="Unlink from topic (vendor stays in the project)" style={{ background: 'none', border: 'none', color: T.dim, fontSize: 14, cursor: 'pointer', padding: 4, lineHeight: 1 }}>×</button>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SectionHeader({ children, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.dim, letterSpacing: '.10em', textTransform: 'uppercase' }}>{children}</div>
      {right}
    </div>
  );
}

function iconCircle(color) {
  return { width: 24, height: 24, borderRadius: 12, border: `1px solid ${T.border}`, background: T.bg, color, fontSize: 11, cursor: 'pointer', fontFamily: T.sans, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 };
}

function pillBtn(bg, color, borderColor) {
  return { padding: '4px 12px', borderRadius: T.rS, border: borderColor ? `1px solid ${borderColor}` : 'none', background: bg, color, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: T.sans, letterSpacing: '.04em' };
}

function lightboxArrow(side, disabled) {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', [side]: 24,
    width: 48, height: 48, borderRadius: 24,
    border: 'none', background: disabled ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.18)',
    color: disabled ? 'rgba(255,255,255,.3)' : '#fff',
    fontSize: 22, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
    fontFamily: T.sans, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
  };
}
