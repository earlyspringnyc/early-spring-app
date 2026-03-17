import { useState, useEffect, useCallback, useRef } from 'react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import * as db from '../lib/db.js';
import { mkProject } from '../data/defaults.js';

export function useProjects(orgId) {
  const [projects, setProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);

  // Load projects
  useEffect(() => {
    if (isSupabaseConfigured() && orgId && orgId !== 'local') {
      db.getProjects(orgId).then(p => {
        setProjects(p.length ? p : [mkProject("My First Project", "", "", "")]);
        setLoaded(true);
      });
    } else {
      // localStorage fallback
      try {
        const saved = localStorage.getItem("es_projects");
        if (saved) {
          setProjects(JSON.parse(saved));
          setLoaded(true);
          return;
        }
      } catch (e) {}
      setProjects([mkProject("SeedAI House SXSW 2026", "SeedAI", "3/16/2026", "3/9/2026")]);
      setLoaded(true);
    }
  }, [orgId]);

  // Save to localStorage (fallback) on every change
  useEffect(() => {
    if (!loaded) return;
    if (!isSupabaseConfigured() || !orgId || orgId === 'local') {
      try { localStorage.setItem("es_projects", JSON.stringify(projects)); } catch (e) {}
    }
  }, [projects, loaded, orgId]);

  // Debounced save to Supabase
  const saveToSupabase = useCallback((projectId, projectData) => {
    if (!isSupabaseConfigured() || !orgId || orgId === 'local') return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      db.updateProject(projectId, projectData);
    }, 1000); // Debounce 1s
  }, [orgId]);

  const createProject = useCallback(async (name, client, date, eventDate, logo, clientBudget) => {
    const p = mkProject(name, client, date, eventDate, logo, clientBudget);
    if (isSupabaseConfigured() && orgId && orgId !== 'local') {
      const saved = await db.createProject(orgId, p);
      if (saved) {
        setProjects(prev => [...prev, saved]);
        return saved.id;
      }
    }
    setProjects(prev => [...prev, p]);
    return p.id;
  }, [orgId]);

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
    if (isSupabaseConfigured() && orgId && orgId !== 'local') {
      await db.deleteProject(projectId);
    }
    setProjects(prev => prev.filter(p => p.id !== projectId));
  }, [orgId]);

  return {
    projects,
    setProjects,
    loaded,
    createProject,
    updateProject,
    deleteProject: deleteProjectById,
  };
}
