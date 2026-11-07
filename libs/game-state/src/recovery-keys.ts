import { LOCAL_ONLY_KEY_PREFIX } from '@qspider/contracts';

export const RECOVERY_SLOTS = 5;
const EVERY_STORAGE_KEY = 'qq-recovery-every';
const DEFAULT_EVERY = 10;

export function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // storage is optional
  }
}

export function recoveryEvery(): number {
  return readNumber(EVERY_STORAGE_KEY, DEFAULT_EVERY);
}

export function recoveryKey(index: number): string {
  return `${LOCAL_ONLY_KEY_PREFIX}${index}`;
}

export function recoveryIndex(key: string): number | null {
  if (!key.startsWith(LOCAL_ONLY_KEY_PREFIX)) return null;
  const index = Number(key.slice(LOCAL_ONLY_KEY_PREFIX.length));
  return Number.isInteger(index) && index >= 1 && index <= RECOVERY_SLOTS ? index : null;
}
