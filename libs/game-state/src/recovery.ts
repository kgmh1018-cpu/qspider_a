import { getStorage } from '@qspider/env';
import { withCounterPaused, isPaused$ } from './counter';
import { currentGameEntry$ } from './current-game';
import { isPauseScreenVisible$ } from './pause-screen';
import { newLocHash$ } from './panels';
import { qspApi$ } from './qsp-api';
import { RECOVERY_SLOTS, readNumber, recoveryKey, recoveryEvery, writeNumber } from './recovery-keys';
import { loadSaveList } from './save';

function nextSlotKey(gameId: string): string {
  return `qq-recovery-next:${gameId}`;
}

let scenes = 0;
let due = false;
let saving = false;

export async function recoverySave(): Promise<boolean> {
  const game = currentGameEntry$.value;
  const api = qspApi$.value;
  if (!game || !api || saving || isPaused$.value) return false;
  if (api.readVariable('NOSAVE')) return false;
  saving = true;
  let saved = false;
  try {
    await withCounterPaused(async () => {
      const data = api.saveGame();
      if (!data) return;
      const next = readNumber(nextSlotKey(game.id), 0) % RECOVERY_SLOTS;
      await getStorage().saveByKey(game.id, recoveryKey(next + 1), data);
      writeNumber(nextSlotKey(game.id), next + 1);
      saved = true;
    });
  } catch (error) {
    console.error(error);
  } finally {
    saving = false;
  }
  return saved;
}

async function attemptRecoverySave(): Promise<void> {
  if (!due) return;
  if (await recoverySave()) due = false;
}

newLocHash$.subscribe(() => {
  const every = recoveryEvery();
  if (every <= 0) {
    due = false;
    return;
  }
  scenes += 1;
  if (scenes % every === 0) due = true;
  if (due) setTimeout(() => void attemptRecoverySave(), 0);
});

currentGameEntry$.subscribe(() => {
  scenes = 0;
  due = false;
});

isPauseScreenVisible$.subscribe((visible) => {
  if (visible) void loadSaveList();
});
