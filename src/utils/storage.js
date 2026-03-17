import { DEFAULT_USERS } from '../data/defaults.js';

export function getStoredUsers() {
  try {
    const s = localStorage.getItem("es_team");
    if (s) return JSON.parse(s);
  } catch (e) {}
  return DEFAULT_USERS;
}

export function saveUsers(users) {
  try {
    localStorage.setItem("es_team", JSON.stringify(users));
  } catch (e) {}
}
