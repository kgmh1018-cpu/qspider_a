import { GameShelfEntry, SaveData, Storage } from '@qspider/contracts';
import { QspiderDatabase } from './db';
import { WebStorage } from './web-storage';

const LOCAL_FILES_PREFIX = '/qspider-files/';
const GAMES_TIMEOUT_MS = 5000;
const SAVE_LIST_TIMEOUT_MS = 8000;
const TRANSFER_TIMEOUT_MS = 20000;
const SAVE_WAIT_MS = 3000;
const META_RETRY_MS = 60000;

interface CloudSave {
  slot: number;
  key: string;
  timestamp: number;
  size: number;
}

interface CloudGames {
  games: Record<string, GameShelfEntry>;
  deleted: Record<string, number>;
}

interface MetaEntry {
  at: number;
  failed: boolean;
  promise: Promise<Map<string, CloudSave>>;
}

function nameOf(slot: number, key: string): string {
  return key ? `k${key}` : `s${slot}`;
}

function targetQuery(slot: number, key: string): string {
  return key ? `key=${encodeURIComponent(key)}` : `slot=${slot}`;
}

async function call(path: string, init: RequestInit = {}, timeoutMs = SAVE_LIST_TIMEOUT_MS): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${globalThis.location.origin}${path}`, {
      ...init,
      redirect: 'manual',
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok ? response : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function waitAtMost(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    work.catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]);
  clearTimeout(timer);
}

function isSyncable(entry: GameShelfEntry): boolean {
  return !entry.loadConfig.url.startsWith(LOCAL_FILES_PREFIX);
}

export class CloudStorage implements Storage {
  private local: Storage = new WebStorage();
  private db = new QspiderDatabase();
  private metas = new Map<string, MetaEntry>();

  prepareLoadConfig(game_id: string, entrypoint: string): Promise<GameShelfEntry['loadConfig']> {
    return this.local.prepareLoadConfig(game_id, entrypoint);
  }

  addGameResource(game_id: string, path: string, data: ArrayBuffer): Promise<void> {
    return this.local.addGameResource(game_id, path, data);
  }

  getGameResource(game_id: string, path: string): Promise<ArrayBuffer | null> {
    return this.local.getGameResource(game_id, path);
  }

  private async putGame(id: string, entry: GameShelfEntry): Promise<void> {
    await call(
      `/api/games/${encodeURIComponent(id)}`,
      { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) },
      GAMES_TIMEOUT_MS,
    );
  }

  async getGames(): Promise<Record<string, GameShelfEntry>> {
    const local = await this.local.getGames();
    const response = await call('/api/games', {}, GAMES_TIMEOUT_MS);
    if (!response) return local;
    let cloud: CloudGames;
    try {
      cloud = (await response.json()) as CloudGames;
    } catch {
      return local;
    }
    const cloudGames = cloud.games || {};
    const deleted = cloud.deleted || {};
    const result = { ...local };
    for (const [id, entry] of Object.entries(cloudGames)) {
      if (!result[id] && isSyncable(entry)) {
        await this.local.addGame(id, entry);
        result[id] = entry;
      }
    }
    for (const id of Object.keys(deleted)) {
      if (result[id] && !cloudGames[id] && isSyncable(result[id])) {
        await this.local.removeGame(id);
        delete result[id];
      }
    }
    for (const [id, entry] of Object.entries(local)) {
      if (result[id] && isSyncable(entry) && !cloudGames[id] && !deleted[id]) {
        void this.putGame(id, entry);
      }
    }
    return result;
  }

  async addGame(id: string, data: GameShelfEntry): Promise<void> {
    await this.local.addGame(id, data);
    if (isSyncable(data)) await waitAtMost(this.putGame(id, data), SAVE_WAIT_MS);
  }

  async updateGame(id: string, data: Partial<GameShelfEntry>): Promise<void> {
    await this.local.updateGame(id, data);
    const entry = (await this.local.getGames())[id];
    if (entry && isSyncable(entry)) await waitAtMost(this.putGame(id, entry), SAVE_WAIT_MS);
  }

  async removeGame(id: string): Promise<void> {
    const entry = (await this.local.getGames())[id];
    await this.local.removeGame(id);
    if (!entry || isSyncable(entry)) {
      await waitAtMost(
        call(`/api/games/${encodeURIComponent(id)}`, { method: 'DELETE' }, GAMES_TIMEOUT_MS),
        SAVE_WAIT_MS,
      );
    }
  }

  private meta(gameId: string): Promise<Map<string, CloudSave>> {
    const cached = this.metas.get(gameId);
    if (cached && !(cached.failed && Date.now() - cached.at > META_RETRY_MS)) return cached.promise;
    const entry: MetaEntry = { at: Date.now(), failed: false, promise: Promise.resolve(new Map()) };
    entry.promise = this.fetchMeta(gameId, entry);
    this.metas.set(gameId, entry);
    return entry.promise;
  }

  private async fetchMeta(gameId: string, entry: MetaEntry): Promise<Map<string, CloudSave>> {
    const map = new Map<string, CloudSave>();
    const response = await call(`/api/saves/${encodeURIComponent(gameId)}`);
    if (!response) {
      entry.failed = true;
      return map;
    }
    try {
      const list = (await response.json()) as CloudSave[];
      for (const save of list) map.set(nameOf(save.slot, save.key), save);
    } catch {
      entry.failed = true;
    }
    return map;
  }

  private async cachedMeta(gameId: string): Promise<Map<string, CloudSave> | null> {
    const entry = this.metas.get(gameId);
    return entry ? entry.promise : null;
  }

  private localRecord(gameId: string, key: string, slot: number) {
    return this.db.gameSaves.where({ game_id: gameId, key, slot }).first();
  }

  private async push(gameId: string, key: string, slot: number): Promise<void> {
    const record = await this.localRecord(gameId, key, slot);
    if (!record) return;
    const response = await call(
      `/api/save/${encodeURIComponent(gameId)}?${targetQuery(slot, key)}&ts=${record.timestamp}`,
      { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: record.data },
      TRANSFER_TIMEOUT_MS,
    );
    if (!response) return;
    const meta = await this.cachedMeta(gameId);
    meta?.set(nameOf(slot, key), { slot, key, timestamp: record.timestamp, size: record.data.byteLength });
  }

  private async pull(gameId: string, save: CloudSave): Promise<ArrayBuffer | null> {
    const response = await call(
      `/api/save/${encodeURIComponent(gameId)}?${targetQuery(save.slot, save.key)}`,
      {},
      TRANSFER_TIMEOUT_MS,
    );
    if (!response) return null;
    try {
      const data = await response.arrayBuffer();
      const timestamp = Number(response.headers.get('x-timestamp')) || save.timestamp;
      await this.db.transaction('rw', this.db.gameSaves, async () => {
        await this.db.gameSaves.where({ game_id: gameId, key: save.key, slot: save.slot }).delete();
        await this.db.gameSaves.put({ game_id: gameId, key: save.key, slot: save.slot, timestamp, data });
      });
      return data;
    } catch {
      return null;
    }
  }

  private mergeSaves(gameId: string, local: SaveData[], cloud: CloudSave[]): SaveData[] {
    const merged = new Map<string, SaveData>();
    for (const save of local) merged.set(nameOf(save.slot, save.key), save);
    for (const save of cloud) {
      const name = nameOf(save.slot, save.key);
      const current = merged.get(name);
      if (!current || save.timestamp > current.timestamp) {
        merged.set(name, { game_id: gameId, key: save.key, slot: save.slot, timestamp: save.timestamp });
      }
    }
    return [...merged.values()];
  }

  async saveByKey(game_id: string, key: string, data: ArrayBuffer): Promise<void> {
    await this.local.saveByKey(game_id, key, data);
    await waitAtMost(this.push(game_id, key, -1), SAVE_WAIT_MS);
  }

  async saveBySlot(game_id: string, slot: number, data: ArrayBuffer): Promise<void> {
    await this.local.saveBySlot(game_id, slot, data);
    await waitAtMost(this.push(game_id, '', slot), SAVE_WAIT_MS);
  }

  async hasSaveByKey(game_id: string, key: string): Promise<boolean> {
    if (await this.local.hasSaveByKey(game_id, key)) return true;
    return (await this.meta(game_id)).has(nameOf(-1, key));
  }

  async hasSaveBySlot(game_id: string, slot: number): Promise<boolean> {
    if (await this.local.hasSaveBySlot(game_id, slot)) return true;
    return (await this.meta(game_id)).has(nameOf(slot, ''));
  }

  async getSaveDataByKey(game_id: string, key: string): Promise<ArrayBuffer | null> {
    const cloud = (await this.meta(game_id)).get(nameOf(-1, key));
    const local = await this.localRecord(game_id, key, -1);
    if (cloud && (!local || cloud.timestamp > local.timestamp)) {
      const pulled = await this.pull(game_id, cloud);
      if (pulled) return pulled;
    }
    return local?.data || null;
  }

  async getSaveDataBySlot(game_id: string, slot: number): Promise<ArrayBuffer | null> {
    const cloud = (await this.meta(game_id)).get(nameOf(slot, ''));
    const local = await this.localRecord(game_id, '', slot);
    if (cloud && (!local || cloud.timestamp > local.timestamp)) {
      const pulled = await this.pull(game_id, cloud);
      if (pulled) return pulled;
    }
    return local?.data || null;
  }

  async getSavedSlots(game_id: string): Promise<SaveData[]> {
    const [local, meta] = await Promise.all([this.local.getSavedSlots(game_id), this.meta(game_id)]);
    return this.mergeSaves(
      game_id,
      local,
      [...meta.values()].filter((save) => !save.key && save.slot > 0),
    );
  }

  async getNamedSaves(game_id: string): Promise<SaveData[]> {
    const [local, meta] = await Promise.all([this.local.getNamedSaves(game_id), this.meta(game_id)]);
    return this.mergeSaves(
      game_id,
      local,
      [...meta.values()].filter((save) => save.key !== ''),
    );
  }

  async clearSaveSlot(game_id: string, slot: number): Promise<void> {
    await this.local.clearSaveSlot(game_id, slot);
    await waitAtMost(
      call(`/api/save/${encodeURIComponent(game_id)}?${targetQuery(slot, '')}`, { method: 'DELETE' }),
      SAVE_WAIT_MS,
    );
    (await this.cachedMeta(game_id))?.delete(nameOf(slot, ''));
  }

  async clearSaveKey(game_id: string, key: string): Promise<void> {
    await this.local.clearSaveKey(game_id, key);
    await waitAtMost(
      call(`/api/save/${encodeURIComponent(game_id)}?${targetQuery(-1, key)}`, { method: 'DELETE' }),
      SAVE_WAIT_MS,
    );
    (await this.cachedMeta(game_id))?.delete(nameOf(-1, key));
  }
}

let instance: Storage | null = null;
export function getStorage(): Storage {
  if (!instance) {
    instance = new CloudStorage();
  }
  return instance;
}
