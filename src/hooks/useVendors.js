import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import * as db from '../lib/db.js';
import { uid } from '../utils/uid.js';

export function useVendors(orgId) {
  const [vendors, setVendors] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const usesDb = isSupabaseConfigured() && orgId && orgId !== 'local';

  // Load vendors
  useEffect(() => {
    if (usesDb) {
      db.getVendors(orgId).then(v => {
        // Map DB format to app format
        setVendors(v.map(vendor => ({
          ...vendor,
          vendorType: vendor.vendor_type || vendor.vendorType || 'other',
          w9Status: vendor.w9_status || vendor.w9Status || 'pending',
        })));
        setLoaded(true);
      }).catch(e => {
        console.error('Failed to load vendors:', e);
        // Fallback to localStorage
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

  // Save to localStorage as backup
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem("es_vendors", JSON.stringify(vendors)); } catch (e) {}
  }, [vendors, loaded]);

  const addVendor = useCallback(async (vendor) => {
    if (usesDb) {
      try {
        const saved = await db.createVendor(orgId, vendor);
        if (saved) {
          setVendors(prev => [...prev, saved]);
          return saved;
        }
      } catch (e) { console.error('Vendor create failed:', e); }
    }
    // Local fallback
    const v = { id: uid(), ...vendor };
    setVendors(prev => [...prev, v]);
    return v;
  }, [orgId, usesDb]);

  const updateVendor = useCallback(async (vendorId, updates) => {
    setVendors(prev => prev.map(v => v.id === vendorId ? { ...v, ...updates } : v));
    if (usesDb) {
      try { await db.updateVendorDb(vendorId, updates); } catch (e) { console.error('Vendor update failed:', e); }
    }
  }, [usesDb]);

  const removeVendor = useCallback(async (vendorId) => {
    setVendors(prev => prev.filter(v => v.id !== vendorId));
    if (usesDb) {
      try { await db.deleteVendorDb(vendorId); } catch (e) { console.error('Vendor delete failed:', e); }
    }
  }, [usesDb]);

  return { vendors, loaded: loaded, addVendor, updateVendor, removeVendor };
}
