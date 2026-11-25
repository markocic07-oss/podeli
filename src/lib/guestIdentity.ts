import type { GuestSession } from '../types';

const STORAGE_KEY = 'podeli_guest_identities_v1';

function readMap(): Record<string, GuestSession> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, GuestSession>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, GuestSession>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function getGuestIdentity(groupId: string): GuestSession | null {
  const map = readMap();
  return map[groupId] ?? null;
}

export function saveGuestIdentity(session: GuestSession): void {
  const map = readMap();
  map[session.groupId] = session;
  writeMap(map);
}

export function removeGuestIdentity(groupId: string): void {
  const map = readMap();
  if (groupId in map) {
    delete map[groupId];
    writeMap(map);
  }
}

export function getAllGuestIdentities(): GuestSession[] {
  return Object.values(readMap());
}
