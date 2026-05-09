// Tiny global toast bus. Emits events; App.jsx subscribes and renders.
// Use `toast.error(msg)` / `toast.info(msg)` from anywhere — no prop drilling.

const listeners = new Set();

let nextId = 1;

function emit(toast) {
  for (const fn of listeners) fn(toast);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const toast = {
  error(msg, opts = {}) {
    emit({ id: nextId++, type: 'error', msg, ttl: opts.ttl ?? 6000, action: opts.action });
  },
  info(msg, opts = {}) {
    emit({ id: nextId++, type: 'info', msg, ttl: opts.ttl ?? 3500, action: opts.action });
  },
  success(msg, opts = {}) {
    emit({ id: nextId++, type: 'success', msg, ttl: opts.ttl ?? 3000, action: opts.action });
  },
};
