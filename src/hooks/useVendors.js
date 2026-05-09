import { useState, useEffect, useCallback, useRef } from 'react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import * as db from '../lib/db.js';
import { uid } from '../utils/uid.js';

export function useVendors(orgId) {
  const [vendors, setVendors] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const prevOrgId = useRef(null);
  const usesDb = isSupabaseConfigured() && orgId && orgId !== 'local';

  // Load vendors - reload when orgId changes
  useEffect(() => {
    if (prevOrgId.current === orgId) return;
    prevOrgId.current = orgId;

    if (usesDb) {
      console.log('[vendors] Loading from Supabase for org:', orgId);
      setLoaded(false);
      db.getVendors(orgId).then(v => {
        // Map DB format to app format
        const mapped = v.map(vendor => ({
          ...vendor,
          vendorType: vendor.vendor_type || vendor.vendorType || 'other',
          w9Status: vendor.w9_status || vendor.w9Status || 'pending',
        }));
        console.log('[vendors] Loaded', mapped.length, 'vendors from Supabase');
        setVendors(mapped);
        setLoaded(true);
      }).catch(e => {
        console.error('[vendors] Failed to load:', e);
        // Fallback to localStorage cache
        try {
          const saved = localStorage.getItem("es_vendors");
          if (saved) setVendors(JSON.parse(saved));
        } catch (e2) {}
        setLoaded(true);
      });
    } else {
      try {
        const saved = localStorage.getItem("es_vendors");
        if (saved) setVendors(JSON.parse(saved));
      } catch (e) {}
      setLoaded(true);
    }
  }, [orgId, usesDb]);

  // Save to localStorage as write-through cache
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem("es_vendors", JSON.stringify(vendors)); } catch (e) {}
  }, [vendors, loaded]);

  const addVendor = useCallback(async (vendor) => {
    if (usesDb) {
      try {
        const saved = await db.createVendor(orgId, vendor);
        if (saved) {
          console.log('[vendors] Created vendor in Supabase:', saved.id);
          setVendors(prev => [...prev, saved]);
          return saved;
        }
      } catch (e) { console.error('[vendors] Vendor create failed:', e); }
    }
    // Local fallback
    const v = { id: uid(), ...vendor };
    setVendors(prev => [...prev, v]);
    return v;
  }, [orgId, usesDb]);

  // Debounced vendor save — collapses rapid keystrokes into one DB write.
  const saveTimers = useRef(new Map());
  const pendingVendor = useRef(new Map());

  const flushVendor = useCallback(async (vendorId) => {
    const updates = pendingVendor.current.get(vendorId);
    if (!updates) return;
    pendingVendor.current.delete(vendorId);
    try { await db.updateVendorDb(vendorId, updates); }
    catch (e) {
      console.error('[vendors] Vendor update failed:', e);
      // Re-queue on failure
      pendingVendor.current.set(vendorId, updates);
    }
  }, []);

  const updateVendor = useCallback(async (vendorId, updates) => {
    setVendors(prev => prev.map(v => v.id === vendorId ? { ...v, ...updates } : v));
    if (!usesDb) return;
    // Merge into the pending queue and reset the debounce timer.
    const merged = { ...(pendingVendor.current.get(vendorId) || {}), ...updates };
    pendingVendor.current.set(vendorId, merged);
    const tmap = saveTimers.current;
    if (tmap.has(vendorId)) clearTimeout(tmap.get(vendorId));
    tmap.set(vendorId, setTimeout(() => flushVendor(vendorId), 500));
  }, [usesDb, flushVendor]);

  // Flush pending vendor saves before unload so the last keystroke isn't lost.
  useEffect(() => {
    const onHide = () => {
      const entries = Array.from(pendingVendor.current.entries());
      for (const [id, updates] of entries) {
        try { db.updateVendorDb(id, updates); } catch (e) {}
      }
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
    };
  }, []);

  const removeVendor = useCallback(async (vendorId) => {
    setVendors(prev => prev.filter(v => v.id !== vendorId));
    if (usesDb) {
      try {
        await db.deleteVendorDb(vendorId);
      } catch (e) { console.error('[vendors] Vendor delete failed:', e); }
    }
  }, [usesDb]);

  return { vendors, loaded, addVendor, updateVendor, removeVendor };
}
