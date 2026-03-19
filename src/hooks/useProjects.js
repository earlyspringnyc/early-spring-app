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

  // Strip large file data before saving to Supabase to prevent payload too large errors
  // Files with driveId are safely on Google Drive — no need for localStorage cache
  const stripFileItem = (item) => {
    if (!item.fileData || item.fileData.length <= 50000) return item;
    // If already on Google Drive, just strip the base64 — Drive is the source of truth
    if (item.driveId) return { ...item, fileData: null, _hasLocalFile: false };
    // Otherwise try to cache in localStorage
    let cached = false;
    try { localStorage.setItem(`es_file_${item.id}`, item.fileData); cached = true; } catch (e) {
      console.warn(`[persist] localStorage quota exceeded for ${item.id}, file data may be lost without Google Drive`);
    }
    return { ...item, fileData: null, _hasLocalFile: cached };
  };

  const stripFileData = (data) => {
    const stripped = { ...data };
    if (stripped.creativeAssets) stripped.creativeAssets = stripped.creativeAssets.map(stripFileItem);
    if (stripped.docs) stripped.docs = stripped.docs.map(stripFileItem);
    if (stripped.clientFiles) stripped.clientFiles = stripped.clientFiles.map(stripFileItem);
    return stripped;
  };

  // Restore file data from localStorage (for files not yet on Google Drive)
  const restoreFileItem = (item) => {
    if (item.fileData) return item; // already has data
    if (item.driveId) return item; // on Drive — app can display via driveLink
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
    // Use per-project timers to avoid one project's save cancelling another's
    const timerKey = `_saveTimer_${projectId}`;
    if (saveTimer.current?.[timerKey]) clearTimeout(saveTimer.current[timerKey]);
    if (!saveTimer.current) saveTimer.current = {};
    saveTimer.current[timerKey] = setTimeout(() => {
      console.log('[projects] Saving project to Supabase:', projectId);
      db.updateProject(projectId, stripFileData(projectData)).catch(e => console.error('[projects] Save failed:', e));
    }, 500);
  }, [usesDb]);

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
