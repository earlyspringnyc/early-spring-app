import { useState, useEffect, useCallback, useRef } from 'react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import * as db from '../lib/db.js';
import { mkProject, mkSampleProject } from '../data/defaults.js';

/* ── Save reliability ──
   - Every project always has a write-through copy in localStorage.
   - On load we MERGE Supabase + localStorage. Anything cached locally that
     Supabase doesn't have is treated as an unsynced local-only project
     and re-uploaded with its existing id (upsert).
   - createProject sets `_unsynced:true` if the insert fails, persists
     immediately, and the next merge pass tries to push it.
   - updateProject debounces 500ms; pending saves are flushed synchronously
     on pagehide / visibilitychange to keep the last edit safe. */

const cacheKey = (orgId) => `es_projects_${orgId || 'local'}`;
const tombstoneKey = (orgId) => `es_deleted_${orgId || 'local'}`;
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function readCache(orgId) {
  try {
    const raw = localStorage.getItem(cacheKey(orgId));
    if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed; }
    // Legacy key fallback (single bucket pre-orgId migration)
    const legacy = localStorage.getItem('es_projects');
    if (legacy) { const parsed = JSON.parse(legacy); if (Array.isArray(parsed)) return parsed; }
  } catch (e) {}
  return [];
}

function writeCache(orgId, projects) {
  // Strip large fileData first — those should live in Supabase Storage or
  // es_file_* entries, not in the cache. Without this, a single big upload
  // can blow the 5–10MB localStorage quota and silently lose all writes.
  const slim = projects.map(p => stripLargeFiles(p));
  let payload = JSON.stringify(slim);
  try {
    localStorage.setItem(cacheKey(orgId), payload);
  } catch (e) {
    // QuotaExceededError — drop file blobs entirely on a second pass and
    // GC stale es_file_* entries so the next save has room.
    console.warn('[projects] localStorage quota hit; pruning fileData and retrying', e);
    try {
      Object.keys(localStorage).filter(k => k.startsWith('es_file_')).forEach(k => {
        try { localStorage.removeItem(k); } catch (e) {}
      });
      const stripped = slim.map(p => {
        const out = { ...p };
        ['creativeAssets','clientFiles','docs'].forEach(key => {
          if (out[key]) out[key] = out[key].map(it => ({ ...it, fileData: null }));
        });
        return out;
      });
      localStorage.setItem(cacheKey(orgId), JSON.stringify(stripped));
    } catch (e2) {
      console.error('[projects] localStorage write failed even after prune:', e2);
    }
  }
  // Mirror to legacy key — best-effort, ignore quota.
  try { localStorage.setItem('es_projects', payload); } catch (e) {}
}

// Tombstones: a project id stays in this list for 30 days after delete so
// the merge-on-load recovery doesn't resurrect it from a stale local cache.
function readTombstones(orgId) {
  try {
    const raw = localStorage.getItem(tombstoneKey(orgId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || !parsed) return {};
    // Garbage-collect expired entries
    const now = Date.now();
    let dirty = false;
    for (const id of Object.keys(parsed)) {
      if (!parsed[id] || (now - parsed[id]) > TOMBSTONE_TTL_MS) {
        delete parsed[id]; dirty = true;
      }
    }
    if (dirty) { try { localStorage.setItem(tombstoneKey(orgId), JSON.stringify(parsed)); } catch (e) {} }
    return parsed;
  } catch (e) { return {}; }
}

function addTombstone(orgId, id) {
  if (!id) return;
  const t = readTombstones(orgId);
  t[id] = Date.now();
  try { localStorage.setItem(tombstoneKey(orgId), JSON.stringify(t)); } catch (e) {}
}

export function useProjects(orgId) {
  const [projects, setProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);
  const pendingSaves = useRef(new Map()); // projectId → latest stripped data
  const prevOrgId = useRef(null);
  const usesDb = isSupabaseConfigured() && orgId && orgId !== 'local';

  // Load + merge — Supabase is treated as authoritative for content, but
  // any local-only project (cached but missing in Supabase) is preserved
  // and re-uploaded.
  useEffect(() => {
    if (prevOrgId.current === orgId) return;
    prevOrgId.current = orgId;

    const hasHadProjects = () => { try { return localStorage.getItem('es_has_projects') === '1' } catch(e) { return false } };
    const markHasProjects = () => { try { localStorage.setItem('es_has_projects', '1') } catch(e) {} };

    if (!usesDb) {
      const cached = readCache(orgId);
      if (cached.length) { markHasProjects(); setProjects(cached); setLoaded(true); return; }
      if (!hasHadProjects()) { markHasProjects(); setProjects([mkSampleProject()]); }
      else setProjects([]);
      setLoaded(true);
      return;
    }

    console.log('[projects] Loading from Supabase for org:', orgId);
    setLoaded(false);
    Promise.all([db.getProjects(orgId), db.getTombstoneIds(orgId)]).then(async ([serverProjects, serverTombstones]) => {
      console.log('[projects] Loaded', serverProjects.length, 'projects from Supabase');
      const cached = readCache(orgId);
      const localTombstones = readTombstones(orgId);
      const serverIds = new Set(serverProjects.map(p => p.id));
      const isTombstoned = (id) => !!localTombstones[id] || serverTombstones.has(id);
      // A "local-only" project is one cached but not on the server AND not
      // intentionally deleted. Local tombstones (30-day TTL) protect against
      // resurrection in this browser; server tombstones protect across
      // browsers — so a teammate's stale cache can't bring back something
      // we deleted.
      const localOnly = cached.filter(p => p && p.id && !serverIds.has(p.id) && !isTombstoned(p.id));
      const skippedDeleted = cached.filter(p => p && p.id && !serverIds.has(p.id) && isTombstoned(p.id));
      if (skippedDeleted.length) {
        console.log('[projects] Skipped', skippedDeleted.length, 'tombstoned project(s) from cache');
      }

      // Re-upload any local-only projects (failed creates from a previous
      // session, or projects from a pre-orgId cache).
      const recovered = [];
      for (const lp of localOnly) {
        try {
          const toSave = stripLargeFiles(lp);
          const saved = await db.upsertProject(orgId, toSave);
          if (saved) {
            console.log('[projects] Recovered local-only project →', saved.name);
            recovered.push(saved);
          } else {
            recovered.push({ ...lp, _unsynced: true });
          }
        } catch (e) {
          console.error('[projects] Recovery upsert failed for', lp.name, e);
          recovered.push({ ...lp, _unsynced: true });
        }
      }

      // First-time-ever sample
      let final = [...serverProjects, ...recovered];
      if (final.length === 0 && !hasHadProjects()) {
        markHasProjects();
        const sample = mkSampleProject();
        try {
          const saved = await db.createProject(orgId, sample);
          if (saved) final = [saved];
          else final = [sample];
        } catch (e) {
          console.error('[projects] Sample create failed:', e);
          final = [sample];
        }
      } else if (final.length > 0) {
        markHasProjects();
      }

      // Seed optimistic-lock map so the first save after load can guard
      // against teammates' edits.
      final.forEach(p => { if (p?.id && p._serverUpdatedAt) lastSyncedAt.current.set(p.id, p._serverUpdatedAt); });
      setProjects(final.map(restoreFileData));
      setLoaded(true);
    }).catch(e => {
      console.error('[projects] Failed to load from Supabase:', e);
      // Hard fallback — show the cache so we don't lose user work. We
      // intentionally do NOT auto-create a sample project here even if
      // the cache is empty: a Supabase outage shouldn't cause a duplicate
      // sample project to be inserted into the org once it recovers.
      const cached = readCache(orgId);
      setProjects(cached.map(restoreFileData));
      setLoaded(true);
      import('../lib/toast.js').then(({ toast }) => toast.error('Could not load projects from server — showing cached copy. Edits will sync when you reconnect.'));
    });
  }, [orgId, usesDb]);

  // Write-through cache.
  useEffect(() => {
    if (!loaded) return;
    writeCache(orgId, projects);
  }, [projects, loaded, orgId]);

  // Boot-time GC: drop es_file_* entries whose parent project/file is no
  // longer in any cache. Without this they pile up forever and eventually
  // blow the localStorage quota.
  const gcRun = useRef(false);
  useEffect(() => {
    if (!loaded || gcRun.current) return;
    gcRun.current = true;
    try {
      const validIds = new Set();
      projects.forEach(p => {
        ['creativeAssets', 'docs', 'clientFiles'].forEach(key => {
          (p[key] || []).forEach(f => f?.id && validIds.add(f.id));
        });
      });
      const orphans = Object.keys(localStorage).filter(k => k.startsWith('es_file_'))
        .map(k => ({ key: k, id: k.slice('es_file_'.length) }))
        .filter(({ id }) => !validIds.has(id) && !inFlightUploads.current.has(id));
      if (orphans.length) {
        orphans.forEach(({ key }) => { try { localStorage.removeItem(key); } catch (e) {} });
        console.log('[projects] GC removed', orphans.length, 'orphan es_file_* entries');
      }
    } catch (e) { console.warn('[projects] GC failed:', e); }
  }, [loaded, projects]);

  // ── File migration (unchanged structure) ───────────────────────────
  const migrated = useRef(false);
  const canStorage = isSupabaseConfigured();
  useEffect(() => {
    if (!loaded || !canStorage || migrated.current || !projects.length) return;
    migrated.current = true;
    const effectiveOrgId = orgId && orgId !== 'local' ? orgId : 'default';
    let cachedProjects = []; try { cachedProjects = readCache(orgId); } catch (e) {}

    const migrateFiles = async () => {
      let totalUploaded = 0;
      const updatedProjects = [...projects];
      for (let pi = 0; pi < updatedProjects.length; pi++) {
        const p = updatedProjects[pi];
        let projectChanged = false;
        for (const key of ['creativeAssets', 'clientFiles', 'docs']) {
          const items = p[key] || [];
          for (let ii = 0; ii < items.length; ii++) {
            const item = items[ii];
            if (item.storagePath) continue;
            let data = item.fileData || null;
            if (!data) { try { data = localStorage.getItem(`es_file_${item.id}`); } catch (e) {} }
            if (!data) {
              const cachedP = cachedProjects.find(cp => cp.id === p.id);
              if (cachedP) { const cachedItem = (cachedP[key] || []).find(ci => ci.id === item.id); if (cachedItem?.fileData) data = cachedItem.fileData; }
            }
            if (!data || data.length <= 100) continue;
            console.log('[migrate] Uploading:', item.name || item.fileName, `(${Math.round(data.length/1024)}KB)`);
            const result = await db.uploadFileData(effectiveOrgId, p.id, item.id, item.fileName || item.name || 'file', data);
            if (result) {
              items[ii] = { ...item, storagePath: result.storagePath, _hasLocalFile: false, fileData: null };
              projectChanged = true; totalUploaded++;
              try { localStorage.removeItem(`es_file_${item.id}`); } catch (e) {}
            }
          }
        }
        if (projectChanged) {
          try { await db.updateProject(p.id, stripLargeFiles(p)); } catch (e) { console.error('[migrate] Save failed:', e); }
        }
      }
      if (totalUploaded > 0) { console.log(`[migrate] ✓ ${totalUploaded} file(s) backed up to Supabase Storage`); setProjects([...updatedProjects]); }
      else console.log('[migrate] No files needed migration');
    };
    migrateFiles().catch(e => console.error('[migrate] Migration failed:', e));
  }, [loaded, canStorage, projects, orgId]);

  // ── File handling helpers ─────────────────────────────────────────
  // Track in-flight uploads so cleanupFileCache doesn't yank a localStorage
  // entry that's still being uploaded. Lifecycle: add when upload starts,
  // remove when it finishes (success or fail).
  const inFlightUploads = useRef(new Set());

  const uploadFileToStorage = async (item, projectId) => {
    if (!item.fileData || item.fileData.length <= 50000) return item;
    if (item.storagePath) return { ...item, fileData: null };
    if (item.driveId) return { ...item, fileData: null };
    inFlightUploads.current.add(item.id);
    try {
      if (usesDb) {
        const result = await db.uploadFileData(orgId, projectId, item.id, item.fileName || item.name || 'file', item.fileData);
        if (result) return { ...item, fileData: null, storagePath: result.storagePath };
      }
      // Storage upload failed (or local-only mode) — try localStorage,
      // but don't claim _hasLocalFile if the write itself fails.
      try {
        localStorage.setItem(`es_file_${item.id}`, item.fileData);
        return { ...item, fileData: null, _hasLocalFile: true };
      } catch (e) {
        console.error('[storage] localStorage fallback failed (likely quota):', e);
        import('../lib/toast.js').then(({ toast }) => toast.error('Storage is full — could not save the uploaded file. Remove old files first.'));
        // Keep fileData inline so the user can retry. Better than silently
        // dropping it.
        return item;
      }
    } finally {
      inFlightUploads.current.delete(item.id);
    }
  };

  const stripFileData = async (data, projectId) => {
    const stripped = { ...data };
    const upload = (item) => uploadFileToStorage(item, projectId);
    if (stripped.creativeAssets) stripped.creativeAssets = await Promise.all(stripped.creativeAssets.map(upload));
    if (stripped.docs) stripped.docs = await Promise.all(stripped.docs.map(upload));
    if (stripped.clientFiles) stripped.clientFiles = await Promise.all(stripped.clientFiles.map(upload));
    return stripped;
  };

  const restoreFileItem = (item) => {
    if (item.fileData) return item;
    if (item.storagePath) return item;
    if (item.driveId) return item;
    if (!item._hasLocalFile) return item;
    try { const f = localStorage.getItem(`es_file_${item.id}`); if (f) return { ...item, fileData: f }; } catch (e) {}
    return item;
  };

  // Immutable — never mutate the input. The caller's reference may be
  // memoized elsewhere, and mutating it can cause stale-render bugs.
  const restoreFileData = (data) => {
    const out = { ...data };
    if (data.creativeAssets) out.creativeAssets = data.creativeAssets.map(restoreFileItem);
    if (data.docs) out.docs = data.docs.map(restoreFileItem);
    if (data.clientFiles) out.clientFiles = data.clientFiles.map(restoreFileItem);
    return out;
  };

  const cleanupFileCache = (oldProject, newProject) => {
    const oldIds = new Set(); const newIds = new Set();
    ['creativeAssets', 'docs', 'clientFiles'].forEach(key => {
      (oldProject[key] || []).forEach(f => oldIds.add(f.id));
      (newProject[key] || []).forEach(f => newIds.add(f.id));
    });
    oldIds.forEach(id => {
      if (newIds.has(id)) return;
      // Skip if upload is still in flight — the localStorage entry might be
      // the only copy of the user's file until Storage finishes accepting it.
      if (inFlightUploads.current.has(id)) return;
      try { localStorage.removeItem(`es_file_${id}`); } catch (e) {}
    });
  };

  // ── Saves ──────────────────────────────────────────────────────────
  const flushPending = useCallback(async () => {
    if (!usesDb) return;
    const entries = Array.from(pendingSaves.current.entries());
    pendingSaves.current.clear();
    for (const [projectId, data] of entries) {
      try { await db.updateProject(projectId, await stripFileData(data, projectId)); }
      catch (e) { console.error('[projects] Flush failed for', projectId, e); }
    }
  }, [usesDb]);

  // Per-project failure counter for backoff. Persists across the session.
  const saveFailCount = useRef(new Map());
  // Optimistic-lock token: the updated_at we last saw from the server.
  // Sent as a precondition on the next write; if a teammate has saved since,
  // db.updateProject throws ProjectConflictError and we refetch.
  const lastSyncedAt = useRef(new Map());
  const [conflicts, setConflicts] = useState([]); // [{projectId, name, at}]

  const scheduleRetry = useCallback((projectId, delayMs) => {
    const timerKey = `_saveTimer_${projectId}`;
    if (saveTimer.current?.[timerKey]) clearTimeout(saveTimer.current[timerKey]);
    if (!saveTimer.current) saveTimer.current = {};
    saveTimer.current[timerKey] = setTimeout(async () => {
      const data = pendingSaves.current.get(projectId);
      if (!data) return;
      console.log('[projects] Saving project to Supabase:', projectId);
      try {
        const expected = lastSyncedAt.current.get(projectId);
        const newAt = await db.updateProject(
          projectId,
          await stripFileData(data, projectId),
          expected ? { expectedUpdatedAt: expected } : {}
        );
        if (newAt) lastSyncedAt.current.set(projectId, newAt);
        pendingSaves.current.delete(projectId);
        saveFailCount.current.delete(projectId);
      } catch (e) {
        if (e?.code === 'CONFLICT') {
          // Teammate saved in the meantime. Refetch + replace local state
          // with server's. The local edit is preserved in pendingSaves until
          // the user resolves; for now we surface a conflict banner.
          console.warn('[projects] Conflict — another user saved this project. Refreshing.');
          try {
            const fresh = await db.getProjects(orgId);
            const incoming = fresh.find(p => p.id === projectId);
            if (incoming) {
              lastSyncedAt.current.set(projectId, incoming._serverUpdatedAt);
              setProjects(prev => prev.map(p => p.id === projectId ? restoreFileData(incoming) : p));
              setConflicts(c => [...c.filter(x => x.projectId !== projectId), { projectId, name: incoming.name, at: Date.now() }]);
            }
          } catch (refetchErr) { console.error('[projects] Conflict refetch failed:', refetchErr); }
          // Drop the stale pending save; user can re-edit on top of the new state.
          pendingSaves.current.delete(projectId);
          saveFailCount.current.delete(projectId);
          return;
        }
        const failures = (saveFailCount.current.get(projectId) || 0) + 1;
        saveFailCount.current.set(projectId, failures);
        // Bounded exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s cap.
        const next = Math.min(30000, 1000 * Math.pow(2, failures - 1));
        console.error(`[projects] Save failed (attempt ${failures}); retrying in ${next}ms`, e);
        scheduleRetry(projectId, next);
      }
    }, delayMs);
  }, [orgId]);

  const saveToSupabase = useCallback((projectId, projectData) => {
    if (!usesDb) return;
    pendingSaves.current.set(projectId, projectData);
    scheduleRetry(projectId, 500);
  }, [usesDb, scheduleRetry]);

  // Flush pending saves before the page unloads. CRITICAL: must strip
  // large fileData synchronously or Postgres rejects the row (54000) and
  // the user's last edit is lost.
  useEffect(() => {
    const onHide = () => {
      const entries = Array.from(pendingSaves.current.entries());
      for (const [projectId, data] of entries) {
        try {
          // Synchronous strip — no awaits, this is during unload.
          const safe = stripLargeFiles(data);
          db.updateProject(projectId, safe);
        } catch (e) {}
      }
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    const visHandler = () => { if (document.visibilityState === 'hidden') onHide(); };
    document.addEventListener('visibilitychange', visHandler);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', visHandler);
    };
  }, []);

  // ── CRUD ───────────────────────────────────────────────────────────
  const createProject = useCallback(async (name, client, date, eventDate, logo, clientBudget, stage) => {
    try { localStorage.setItem('es_has_projects', '1'); } catch(e) {}
    const local = mkProject(name, client, date, eventDate, logo, clientBudget, stage);

    if (usesDb) {
      try {
        const saved = await db.createProject(orgId, local);
        if (saved) {
          console.log('[projects] Created project in Supabase:', saved.id);
          setProjects(prev => [...prev, saved]);
          return saved.id;
        }
      } catch (e) {
        console.error('[projects] Supabase create failed; keeping locally and will retry:', e);
        // Persist with `_unsynced` flag — recovery pass on next load will
        // re-upload via upsert (preserving the local id).
        const flagged = { ...local, _unsynced: true };
        setProjects(prev => [...prev, flagged]);
        // Also try a one-shot upsert in case it's a transient error.
        db.upsertProject(orgId, local)
          .then(saved => {
            if (saved) setProjects(prev => prev.map(p => p.id === local.id ? { ...saved, _unsynced: false } : p));
          })
          .catch(() => {});
        return local.id;
      }
    }
    setProjects(prev => [...prev, local]);
    return local.id;
  }, [orgId, usesDb]);

  // Accepts either an object of updates OR a function (prev) => updates.
  // The function form is critical for code that runs after `await` — it
  // gets the latest project from React state instead of stale closure.
  const updateProject = useCallback((projectId, updatesOrFn) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      const updates = typeof updatesOrFn === 'function' ? updatesOrFn(p) : updatesOrFn;
      const updated = { ...p, ...updates };
      cleanupFileCache(p, updated);
      saveToSupabase(projectId, updated);
      return updated;
    }));
  }, [saveToSupabase]);

  const deleteProjectById = useCallback(async (projectId) => {
    const proj = projects.find(p => p.id === projectId);
    if (proj) {
      ['creativeAssets', 'docs', 'clientFiles'].forEach(key => {
        (proj[key] || []).forEach(f => { try { localStorage.removeItem(`es_file_${f.id}`); } catch (e) {} });
      });
    }
    // Tombstone the id so the merge-on-load recovery pass doesn't resurrect
    // it. Local tombstone protects this browser; the orgId is passed to the
    // server-side delete which also writes a row to project_tombstones,
    // protecting other teammates' browsers from resurrecting via stale cache.
    addTombstone(orgId, projectId);
    if (usesDb) { try { await db.deleteProject(projectId, orgId); } catch (e) { console.error('[projects] Delete failed:', e); } }
    setProjects(prev => prev.filter(p => p.id !== projectId));
  }, [usesDb, projects, orgId]);

  const dismissConflict = useCallback((projectId) => {
    setConflicts(c => c.filter(x => x.projectId !== projectId));
  }, []);

  return {
    projects,
    setProjects,
    loaded,
    createProject,
    updateProject,
    deleteProject: deleteProjectById,
    flushPending,
    conflicts,
    dismissConflict,
  };
}

// Strip large fileData blobs and any UI-only flags before any DB write.
function stripLargeFiles(p) {
  const out = { ...p };
  delete out._unsynced; // UI flag, never persist
  ['creativeAssets', 'clientFiles', 'docs'].forEach(k => {
    if (out[k]) out[k] = out[k].map(it => it.fileData && it.fileData.length > 50000 ? { ...it, fileData: null } : it);
  });
  return out;
}
