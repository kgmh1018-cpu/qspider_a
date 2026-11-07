import '../../index';
import { namedSlots$, QUICK_SAVE_KEY } from '@qspider/game-state';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { QspSlotDate } from './slots';
import { QspNamedSavesList, QspSaveName } from './named-saves-list';

let root: Root | null = null;
let host: HTMLElement | null = null;

async function renderList(): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  root.render(
    <QspNamedSavesList attrs={{}}>
      <QspSaveName attrs={{}} />
      <QspSlotDate attrs={{}}>-</QspSlotDate>
    </QspNamedSavesList>,
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  return host;
}

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
  namedSlots$.set([]);
});

describe('QspNamedSavesList', () => {
  it('renders nothing without named saves', async () => {
    const element = await renderList();
    expect(element.querySelector('qsp-named-saves-list')).toBeNull();
  });

  it('lists named saves newest first without the quick save', async () => {
    namedSlots$.set([
      { game_id: 'g', key: 'autosave_old.sav', slot: -1, timestamp: 1000 },
      { game_id: 'g', key: QUICK_SAVE_KEY, slot: -1, timestamp: 9000 },
      { game_id: 'g', key: 'autosave_new.sav', slot: -1, timestamp: 5000 },
      { game_id: 'g', key: '__recovery_2', slot: -1, timestamp: 3000 },
    ]);
    const element = await renderList();
    const items = [...element.querySelectorAll('qsp-save-slot')];
    expect(items.map((item) => item.getAttribute('data-qsp-save-path'))).toEqual([
      'autosave_new.sav',
      '__recovery_2',
      'autosave_old.sav',
    ]);
    const names = items.map((item) => item.querySelector('qsp-save-name')?.textContent ?? '');
    expect(names[0]).toBe('autosave_new.sav');
    expect(names[1]).toMatch(/2$/);
    expect(names[1]).not.toContain('__recovery_');
  });
});
