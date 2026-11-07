import { describe, expect, it } from 'vitest';
import { isLocalOnlyKey } from '@qspider/contracts';
import { RECOVERY_SLOTS, recoveryEvery, recoveryIndex, recoveryKey } from './recovery-keys';

describe('recovery keys', () => {
  it('builds keys that are local only', () => {
    expect(recoveryKey(1)).toBe('__recovery_1');
    expect(isLocalOnlyKey(recoveryKey(3))).toBe(true);
    expect(isLocalOnlyKey('autosave_sg_x.sav')).toBe(false);
    expect(isLocalOnlyKey('__quicksave_qspider__')).toBe(false);
  });

  it('reads the slot index back from a key', () => {
    expect(recoveryIndex('__recovery_1')).toBe(1);
    expect(recoveryIndex(`__recovery_${RECOVERY_SLOTS}`)).toBe(RECOVERY_SLOTS);
    expect(recoveryIndex(`__recovery_${RECOVERY_SLOTS + 1}`)).toBeNull();
    expect(recoveryIndex('__recovery_0')).toBeNull();
    expect(recoveryIndex('__recovery_x')).toBeNull();
    expect(recoveryIndex('autosave_sg_x.sav')).toBeNull();
  });

  it('falls back to the default interval without browser storage', () => {
    expect(recoveryEvery()).toBe(10);
  });
});
