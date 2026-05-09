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
  try { localStorage.setItem(cacheKey(orgId), JSON.stringify(projects)); } catch (e) {}
  // Mirror to legacy key so an older tab can still read.
  try { localStorage.setItem('es_projects', JSON.stringify(projects)); } catch (e) {}
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

      setProjects(final.map(restoreFileData));
      setLoaded(true);
    }).catch(e => {
      console.error('[projects] Failed to load from Supabase:', e);
      // Hard fallback — show the cache so we don't lose user work.
      const cached = readCache(orgId);
      setProjects(cached.map(restoreFileData));
      setLoaded(true);
    });
  }, [orgId, usesDb]);

  // Write-through cache.
  useEffect(() => {
    if (!loaded) return;
    writeCache(orgId, projects);
  }, [projects, loaded, orgId]);

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
  const uploadFileToStorage = async (item, projectId) => {
    if (!item.fileData || item.fileData.length <= 50000) return item;
    if (item.storagePath) return { ...item, fileData: null };
    if (item.driveId) return { ...item, fileData: null };
    if (usesDb) {
      const result = await db.uploadFileData(orgId, projectId, item.id, item.fileName || item.name || 'file', item.fileData);
      if (result) return { ...item, fileData: null, storagePath: result.storagePath };
    }
    try { localStorage.setItem(`es_file_${item.id}`, item.fileData); } catch (e) {}
    return { ...item, fileData: null, _hasLocalFile: true };
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

  const restoreFileData = (data) => {
    if (data.creativeAssets) data.creativeAssets = data.creativeAssets.map(restoreFileItem);
    if (data.docs) data.docs = data.docs.map(restoreFileItem);
    if (data.clientFiles) data.clientFiles = data.clientFiles.map(restoreFileItem);
    return data;
  };

  const cleanupFileCache = (oldProject, newProject) => {
    const oldIds = new Set(); const newIds = new Set();
    ['creativeAssets', 'docs', 'clientFiles'].forEach(key => {
      (oldProject[key] || []).forEach(f => oldIds.add(f.id));
      (newProject[key] || []).forEach(f => newIds.add(f.id));
    });
    oldIds.forEach(id => { if (!newIds.has(id)) { try { localStorage.removeItem(`es_file_${id}`); } catch (e) {} } });
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

  const scheduleRetry = useCallback((projectId, delayMs) => {
    const timerKey = `_saveTimer_${projectId}`;
    if (saveTimer.current?.[timerKey]) clearTimeout(saveTimer.current[timerKey]);
    if (!saveTimer.current) saveTimer.current = {};
    saveTimer.current[timerKey] = setTimeout(async () => {
      const data = pendingSaves.current.get(projectId);
      if (!data) return;
      console.log('[projects] Saving project to Supabase:', projectId);
      try {
        await db.updateProject(projectId, await stripFileData(data, projectId));
        pendingSaves.current.delete(projectId);
        saveFailCount.current.delete(projectId);
      } catch (e) {
        const failures = (saveFailCount.current.get(projectId) || 0) + 1;
        saveFailCount.current.set(projectId, failures);
        // Bounded exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s cap.
        const next = Math.min(30000, 1000 * Math.pow(2, failures - 1));
        console.error(`[projects] Save failed (attempt ${failures}); retrying in ${next}ms`, e);
        scheduleRetry(projectId, next);
      }
    }, delayMs);
  }, []);

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

  return {
    projects,
    setProjects,
    loaded,
    createProject,
    updateProject,
    deleteProject: deleteProjectById,
    flushPending,
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
