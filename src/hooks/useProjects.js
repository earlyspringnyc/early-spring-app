import { useState, useEffect, useCallback, useRef } from 'react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import * as db from '../lib/db.js';
import { mkProject, mkSampleProject } from '../data/defaults.js';

export function useProjects(orgId) {
  const [projects, setProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);
  const prevOrgId = useRef(null);
  const usesDb = isSupabaseConfigured() && orgId && orgId !== 'local';

  // Load projects - reload when orgId changes (e.g. from 'local' to a real UUID)
  useEffect(() => {
    // Skip if orgId hasn't actually changed
    if (prevOrgId.current === orgId) return;
    prevOrgId.current = orgId;

    // Only show sample project for brand new users who have never had projects
    const hasHadProjects = () => { try { return localStorage.getItem("es_has_projects") === "1" } catch(e) { return false } };
    const markHasProjects = () => { try { localStorage.setItem("es_has_projects", "1") } catch(e) {} };

    if (usesDb) {
      console.log('[projects] Loading from Supabase for org:', orgId);
      setLoaded(false);
      db.getProjects(orgId).then(async p => {
        console.log('[projects] Loaded', p.length, 'projects from Supabase');
        if (p.length > 0) {
          markHasProjects();
          setProjects(p.map(restoreFileData));
        } else if (!hasHadProjects()) {
          // First time ever — create sample
          console.log('[projects] First-time user — creating sample project');
          markHasProjects();
          const sample = mkSampleProject();
          try {
            const saved = await db.createProject(orgId, sample);
            if (saved) { setProjects([saved]); setLoaded(true); return; }
          } catch (e2) { console.error('[projects] Sample create failed:', e2); }
          setProjects([sample]);
        } else {
          // User has had projects before, just none right now
          setProjects([]);
        }
        setLoaded(true);
      }).catch(e => {
        console.error('[projects] Failed to load from Supabase:', e);
        // Fallback to localStorage cache
        try {
          const saved = localStorage.getItem("es_projects");
          if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) { setProjects(parsed); } }
        } catch (e2) {}
        setLoaded(true);
      });
    } else {
      try {
        const saved = localStorage.getItem("es_projects");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            markHasProjects();
            setProjects(parsed);
            setLoaded(true);
            return;
          }
        }
      } catch (e) {}
      if (!hasHadProjects()) {
        markHasProjects();
        const sample = mkSampleProject();
        setProjects([sample]);
      } else {
        setProjects([]);
      }
      setLoaded(true);
    }
  }, [orgId, usesDb]);

  // Always save to localStorage as write-through cache
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem("es_projects", JSON.stringify(projects)); } catch (e) {}
  }, [projects, loaded]);

  // One-time migration: upload files from localStorage to Supabase Storage
  const migrated = useRef(false);
  useEffect(() => {
    if (!loaded || !usesDb || migrated.current || !projects.length) return;
    migrated.current = true;
    const migrateFiles = async () => {
      let changed = false;
      for (const p of projects) {
        for (const key of ['creativeAssets', 'clientFiles', 'docs']) {
          const items = p[key] || [];
          for (const item of items) {
            if (item.storagePath || !item._hasLocalFile) continue;
            // Has localStorage data but no Supabase Storage path — migrate it
            let data = null;
            try { data = localStorage.getItem(`es_file_${item.id}`); } catch (e) {}
            if (!data) continue;
            const result = await db.uploadFileData(orgId, p.id, item.id, item.fileName || item.name || 'file', data);
            if (result) {
              item.storagePath = result.storagePath;
              item.storageUrl = result.storageUrl;
              item._hasLocalFile = false;
              changed = true;
              console.log('[migrate] Uploaded to Supabase Storage:', item.name);
              // Clean up localStorage
              try { localStorage.removeItem(`es_file_${item.id}`); } catch (e) {}
            }
          }
        }
        if (changed) {
          // Save the updated metadata (with storagePath) to Supabase
          try { await db.updateProject(p.id, p); } catch (e) { console.error('[migrate] Save failed:', e); }
        }
      }
      if (changed) {
        console.log('[migrate] File migration to Supabase Storage complete');
        setProjects([...projects]); // trigger re-render with updated paths
      }
    };
    migrateFiles().catch(e => console.error('[migrate] Migration failed:', e));
  }, [loaded, usesDb, projects, orgId]);

  // Upload file data to Supabase Storage, return item with storagePath
  const uploadFileToStorage = async (item, projectId) => {
    if (!item.fileData || item.fileData.length <= 50000) return item;
    // Already in Supabase Storage
    if (item.storagePath) return { ...item, fileData: null };
    // Already on Google Drive
    if (item.driveId) return { ...item, fileData: null };
    // Upload to Supabase Storage
    if (usesDb) {
      const result = await db.uploadFileData(orgId, projectId, item.id, item.fileName || item.name || 'file', item.fileData);
      if (result) {
        console.log('[storage] Stored:', item.name, '→', result.storagePath);
        return { ...item, fileData: null, storagePath: result.storagePath, storageUrl: result.storageUrl };
      }
    }
    // Fallback to localStorage if Supabase Storage fails
    try { localStorage.setItem(`es_file_${item.id}`, item.fileData); } catch (e) {}
    return { ...item, fileData: null, _hasLocalFile: true };
  };

  // Strip file data before saving to Supabase DB — uploads large files to Storage first
  const stripFileData = async (data, projectId) => {
    const stripped = { ...data };
    const upload = (item) => uploadFileToStorage(item, projectId);
    if (stripped.creativeAssets) stripped.creativeAssets = await Promise.all(stripped.creativeAssets.map(upload));
    if (stripped.docs) stripped.docs = await Promise.all(stripped.docs.map(upload));
    if (stripped.clientFiles) stripped.clientFiles = await Promise.all(stripped.clientFiles.map(upload));
    return stripped;
  };

  // Restore file data — from Supabase Storage, Google Drive, or localStorage
  const restoreFileItem = (item) => {
    if (item.fileData) return item;
    // If in Supabase Storage, storageUrl is available for display
    // Actual base64 data fetched on-demand by components that need it
    if (item.storagePath || item.storageUrl) return item;
    if (item.driveId) return item;
    if (!item._hasLocalFile) return item;
    try {
      const f = localStorage.getItem(`es_file_${item.id}`);
      if (f) return { ...item, fileData: f };
    } catch (e) {}
    return item;
  };

  const restoreFileData = (data) => {
    if (data.creativeAssets) data.creativeAssets = data.creativeAssets.map(restoreFileItem);
    if (data.docs) data.docs = data.docs.map(restoreFileItem);
    if (data.clientFiles) data.clientFiles = data.clientFiles.map(restoreFileItem);
    return data;
  };

  // Clean up orphaned localStorage file entries when files are removed
  const cleanupFileCache = (oldProject, newProject) => {
    const oldIds = new Set();
    const newIds = new Set();
    ['creativeAssets', 'docs', 'clientFiles'].forEach(key => {
      (oldProject[key] || []).forEach(f => oldIds.add(f.id));
      (newProject[key] || []).forEach(f => newIds.add(f.id));
    });
    oldIds.forEach(id => {
      if (!newIds.has(id)) {
        try { localStorage.removeItem(`es_file_${id}`); } catch (e) {}
      }
    });
  };

  // Immediate save to Supabase (with debounce for rapid updates)
  const saveToSupabase = useCallback((projectId, projectData) => {
    if (!usesDb) return;
    const timerKey = `_saveTimer_${projectId}`;
    if (saveTimer.current?.[timerKey]) clearTimeout(saveTimer.current[timerKey]);
    if (!saveTimer.current) saveTimer.current = {};
    saveTimer.current[timerKey] = setTimeout(async () => {
      console.log('[projects] Saving project to Supabase:', projectId);
      try {
        const stripped = await stripFileData(projectData, projectId);
        await db.updateProject(projectId, stripped);
      } catch (e) { console.error('[projects] Save failed:', e); }
    }, 500);
  }, [usesDb, orgId]);

  const createProject = useCallback(async (name, client, date, eventDate, logo, clientBudget, stage) => {
    try { localStorage.setItem("es_has_projects", "1") } catch(e) {}
    const p = mkProject(name, client, date, eventDate, logo, clientBudget, stage);
    if (usesDb) {
      try {
        const saved = await db.createProject(orgId, p);
        if (saved) {
          console.log('[projects] Created project in Supabase:', saved.id);
          setProjects(prev => [...prev, saved]);
          return saved.id;
        }
      } catch (e) {
        console.error('[projects] Supabase create failed, saving locally:', e);
      }
    }
    // Local fallback
    setProjects(prev => [...prev, p]);
    return p.id;
  }, [orgId, usesDb]);

  const updateProject = useCallback((projectId, updates) => {
    setProjects(prev => {
      const next = prev.map(p => {
        if (p.id !== projectId) return p;
        const updated = { ...p, ...updates };
        cleanupFileCache(p, updated);
        saveToSupabase(projectId, updated);
        return updated;
      });
      return next;
    });
  }, [saveToSupabase]);

  const deleteProjectById = useCallback(async (projectId) => {
    // Clean up all file cache entries for this project
    const proj = projects.find(p => p.id === projectId);
    if (proj) {
      ['creativeAssets', 'docs', 'clientFiles'].forEach(key => {
        (proj[key] || []).forEach(f => {
          try { localStorage.removeItem(`es_file_${f.id}`); } catch (e) {}
        });
      });
    }
    if (usesDb) {
      try { await db.deleteProject(projectId); } catch (e) { console.error('[projects] Delete failed:', e); }
    }
    setProjects(prev => prev.filter(p => p.id !== projectId));
  }, [usesDb, projects]);

  return {
    projects,
    setProjects,
    loaded,
    createProject,
    updateProject,
    deleteProject: deleteProjectById,
  };
}
