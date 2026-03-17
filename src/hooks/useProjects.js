import { useState, useEffect, useCallback, useRef } from 'react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import * as db from '../lib/db.js';
import { mkProject } from '../data/defaults.js';

export function useProjects(orgId) {
  const [projects, setProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);
  const initialLoadDone = useRef(false);
  const usesDb = isSupabaseConfigured() && orgId && orgId !== 'local';

  // Load projects
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    if (usesDb) {
      db.getProjects(orgId).then(p => {
        setProjects(p.length ? p : []);
        setLoaded(true);
      }).catch(e => {
        console.error('Failed to load projects from Supabase:', e);
        // Fallback to localStorage
        try {
          const saved = localStorage.getItem("es_projects");
          if (saved) setProjects(JSON.parse(saved));
        } catch (e2) {}
        setLoaded(true);
      });
    } else {
      try {
        const saved = localStorage.getItem("es_projects");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setProjects(parsed);
            setLoaded(true);
            return;
          }
        }
      } catch (e) {}
      setProjects([]);
      setLoaded(true);
    }
  }, [orgId, usesDb]);

  // Always save to localStorage as backup
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem("es_projects", JSON.stringify(projects)); } catch (e) {}
  }, [projects, loaded]);

  // Debounced save to Supabase
  const saveToSupabase = useCallback((projectId, projectData) => {
    if (!usesDb) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      db.updateProject(projectId, projectData).catch(e => console.error('Save failed:', e));
    }, 1000);
  }, [usesDb]);

  const createProject = useCallback(async (name, client, date, eventDate, logo, clientBudget, stage) => {
    const p = mkProject(name, client, date, eventDate, logo, clientBudget, stage);
    if (usesDb) {
      try {
        const saved = await db.createProject(orgId, p);
        if (saved) {
          setProjects(prev => [...prev, saved]);
          return saved.id;
        }
      } catch (e) {
        console.error('Supabase create failed, saving locally:', e);
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
        saveToSupabase(projectId, updated);
        return updated;
      });
      return next;
    });
  }, [saveToSupabase]);

  const deleteProjectById = useCallback(async (projectId) => {
    if (usesDb) {
      try { await db.deleteProject(projectId); } catch (e) { console.error('Delete failed:', e); }
    }
    setProjects(prev => prev.filter(p => p.id !== projectId));
  }, [usesDb]);

  return {
    projects,
    setProjects,
    loaded,
    createProject,
    updateProject,
    deleteProject: deleteProjectById,
  };
}
