const ACCESS_HEADER = 'Cf-Access-Jwt-Assertion';
const MAX_SAVE_BYTES = 20 * 1024 * 1024;
const GAMES_KEY = 'games.json';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function saveObjectKey(gameId, target) {
  const name = target.key ? `k${encodeURIComponent(target.key)}` : `s${target.slot}`;
  return `saves/${encodeURIComponent(gameId)}/${name}`;
}

function parseTarget(params) {
  const key = params.get('key') || '';
  if (key) return { key, slot: -1 };
  const slot = Number(params.get('slot'));
  if (!Number.isInteger(slot) || slot <= 0) return null;
  return { key: '', slot };
}

async function readGames(env) {
  const object = await env.SAVES.get(GAMES_KEY);
  if (!object) return { games: {}, deleted: {} };
  const state = await object.json();
  return { games: state.games || {}, deleted: state.deleted || {} };
}

async function writeGames(env, state) {
  await env.SAVES.put(GAMES_KEY, JSON.stringify(state), {
    httpMetadata: { contentType: 'application/json' },
  });
}

async function listSaves(env, gameId) {
  const prefix = `saves/${encodeURIComponent(gameId)}/`;
  const saves = [];
  let cursor;
  do {
    const page = await env.SAVES.list({ prefix, cursor, include: ['customMetadata'] });
    for (const object of page.objects) {
      const meta = object.customMetadata || {};
      saves.push({
        slot: Number(meta.slot ?? -1),
        key: meta.key ?? '',
        timestamp: Number(meta.timestamp ?? 0),
        size: object.size,
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return saves;
}

async function handleSave(request, env, url, gameId) {
  const target = parseTarget(url.searchParams);
  if (!target) return json({ error: 'bad target' }, 400);
  const objectKey = saveObjectKey(gameId, target);

  if (request.method === 'GET') {
    const object = await env.SAVES.get(objectKey);
    if (!object) return json({ error: 'not found' }, 404);
    return new Response(object.body, {
      headers: {
        'content-type': 'application/octet-stream',
        'cache-control': 'no-store',
        'x-timestamp': object.customMetadata?.timestamp ?? '0',
      },
    });
  }

  if (request.method === 'PUT') {
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_SAVE_BYTES) return json({ error: 'too large' }, 413);
    const timestamp = Number(url.searchParams.get('ts')) || Date.now();
    await env.SAVES.put(objectKey, body, {
      customMetadata: { timestamp: String(timestamp), slot: String(target.slot), key: target.key },
    });
    return json({ ok: true, timestamp });
  }

  if (request.method === 'DELETE') {
    await env.SAVES.delete(objectKey);
    return json({ ok: true });
  }

  return json({ error: 'method not allowed' }, 405);
}

async function handleGame(request, env, gameId) {
  const state = await readGames(env);

  if (request.method === 'PUT') {
    const entry = await request.json();
    state.games[gameId] = entry;
    delete state.deleted[gameId];
    await writeGames(env, state);
    return json({ ok: true });
  }

  if (request.method === 'DELETE') {
    delete state.games[gameId];
    state.deleted[gameId] = Date.now();
    await writeGames(env, state);
    return json({ ok: true });
  }

  return json({ error: 'method not allowed' }, 405);
}

async function route(request, env, url) {
  const path = url.pathname;

  if (path === '/api/ping') {
    let bucket = false;
    try {
      await env.SAVES.list({ limit: 1 });
      bucket = true;
    } catch {
      bucket = false;
    }
    return json({ ok: true, access: request.headers.has(ACCESS_HEADER), bucket });
  }

  if (!request.headers.has(ACCESS_HEADER)) return json({ error: 'forbidden' }, 403);

  if (path === '/api/games' && request.method === 'GET') return json(await readGames(env));

  const gameMatch = path.match(/^\/api\/games\/([^/]+)$/);
  if (gameMatch) return handleGame(request, env, decodeURIComponent(gameMatch[1]));

  const listMatch = path.match(/^\/api\/saves\/([^/]+)$/);
  if (listMatch && request.method === 'GET') return json(await listSaves(env, decodeURIComponent(listMatch[1])));

  const saveMatch = path.match(/^\/api\/save\/([^/]+)$/);
  if (saveMatch) return handleSave(request, env, url, decodeURIComponent(saveMatch[1]));

  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await route(request, env, url);
    } catch (error) {
      return json({ error: 'internal error' }, 500);
    }
  },
};
