/**
 * In-progress session storage. Each puzzle's session lives in its own key so a move rewrites
 * only one small record. An index keeps the most recent few and evicts the oldest — except the
 * board being saved and any `keep` keys (today's Daily, the current campaign level).
 */
import type { SessionSnapshot } from '../game/session';
import { KEYS, kv } from './storage';

export const MAX_SESSIONS = 8;

type Index = Record<string, number>; // puzzleKey → savedAt

function loadIndex(): Index {
  return kv.get<Index>(KEYS.sessionIndex, {});
}

export function saveSession(key: string, snap: SessionSnapshot, keep: readonly string[] = []): void {
  if (!kv.set(KEYS.session(key), snap)) return;
  const idx = loadIndex();
  idx[key] = snap.savedAt;
  const oldestFirst = Object.keys(idx).sort((a, b) => idx[a] - idx[b]);
  let count = oldestFirst.length;
  for (const old of oldestFirst) {
    if (count <= MAX_SESSIONS) break;
    if (old === key || keep.includes(old)) continue;
    kv.remove(KEYS.session(old));
    delete idx[old];
    count--;
  }
  kv.set(KEYS.sessionIndex, idx);
}

export function loadSession(key: string): SessionSnapshot | null {
  const s = kv.get<SessionSnapshot | null>(KEYS.session(key), null);
  if (!s || s.v !== 2 || !s.puzzle || s.puzzle.id !== key) return null;
  if (typeof s.cells !== 'string' || s.cells.length !== s.puzzle.size * s.puzzle.size) return null;
  return s;
}

export function clearSession(key: string): void {
  kv.remove(KEYS.session(key));
  const idx = loadIndex();
  if (key in idx) {
    delete idx[key];
    kv.set(KEYS.sessionIndex, idx);
  }
}

export function hasSession(key: string): boolean {
  const s = loadSession(key);
  return !!s && s.outcome !== 'won';
}
