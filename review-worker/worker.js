/**
 * Content-review Worker - KV-backed comment store for the ReviewOverlay tool
 * and the /review page.
 *
 * Storage model: one KV key per page - `page:<encoded path>` holds a JSON array
 * of comment records for that page. The dashboard lists every `page:` key.
 *
 * Auth: every request must send header `X-Review-Pass: <REVIEW_PASS>`. The
 * passcode is the single shared gate (checked here, server-side).
 *
 * Bindings (wrangler.toml):
 *   COMMENTS      - KV namespace (the store).
 *   REVIEW_PASS   - secret, the shared passcode.
 *   ALLOW_ORIGIN  - the exact site origin allowed to call this Worker
 *                   (e.g. "https://owner.github.io"). "*" only for testing.
 *
 * Endpoints:
 *   POST /comments            add a comment                 -> the saved record
 *   GET  /comments?path=/x    list one page's comments      -> record[]
 *   GET  /comments            list ALL comments (dashboard) -> record[]
 *   POST /resolve             set a comment's status        -> the updated record
 */
export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Review-Pass',
      'Access-Control-Max-Age': '86400',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // ---- passcode gate (all methods) ----
    if (!env.REVIEW_PASS || request.headers.get('X-Review-Pass') !== env.REVIEW_PASS) {
      return json({ error: 'unauthorized' }, 401, cors);
    }

    const url = new URL(request.url);
    const kv = env.COMMENTS;
    const keyFor = (path) => 'page:' + encodeURIComponent(path || '/');

    try {
      // ---- add a comment ----
      if (request.method === 'POST' && url.pathname === '/comments') {
        const b = await request.json();
        const comment = String(b.comment || '').trim();
        if (!comment) return json({ error: 'empty comment' }, 400, cors);
        const path = (b.page && b.page.path) || '/';
        const rec = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          status: 'open',
          parentId: b.parentId || null, // set on replies -> threads a comment
          team: b.team ? String(b.team).slice(0, 40) : '',
          name: String(b.name || 'anonymous').slice(0, 80),
          comment: comment.slice(0, 4000),
          changeTo: b.changeTo ? String(b.changeTo).slice(0, 4000) : '', // Content: suggested new copy
          page: {
            path,
            url: (b.page && b.page.url) || '',
            title: (b.page && b.page.title) || '',
            slug: (b.page && b.page.slug) || 'page',
          },
          anchor: b.anchor || {},
        };
        const arr = JSON.parse((await kv.get(keyFor(path))) || '[]');
        arr.push(rec);
        await kv.put(keyFor(path), JSON.stringify(arr));
        return json(rec, 201, cors);
      }

      // ---- list comments ----
      if (request.method === 'GET' && url.pathname === '/comments') {
        const path = url.searchParams.get('path');
        if (path) {
          const arr = JSON.parse((await kv.get(keyFor(path))) || '[]');
          return json(arr, 200, cors);
        }
        // all comments, for the dashboard
        const out = [];
        let cursor;
        do {
          const page = await kv.list({ prefix: 'page:', cursor });
          for (const k of page.keys) {
            const arr = JSON.parse((await kv.get(k.name)) || '[]');
            out.push(...arr);
          }
          cursor = page.list_complete ? null : page.cursor;
        } while (cursor);
        out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        return json(out, 200, cors);
      }

      // ---- delete a whole thread (dashboard admin) ----
      if (request.method === 'POST' && url.pathname === '/delete') {
        const b = await request.json();
        const path = b.path || '/';
        let arr = JSON.parse((await kv.get(keyFor(path))) || '[]');
        const before = arr.length;
        arr = arr.filter((r) => r.id !== b.id && r.parentId !== b.id); // root + its replies
        await kv.put(keyFor(path), JSON.stringify(arr));
        return json({ ok: true, removed: before - arr.length }, 200, cors);
      }

      // ---- resolve / reopen (dashboard admin) ----
      if (request.method === 'POST' && url.pathname === '/resolve') {
        const b = await request.json();
        const path = b.path || '/';
        const arr = JSON.parse((await kv.get(keyFor(path))) || '[]');
        const rec = arr.find((r) => r.id === b.id);
        if (!rec) return json({ error: 'not found' }, 404, cors);
        rec.status = b.status === 'resolved' ? 'resolved' : 'open';
        await kv.put(keyFor(path), JSON.stringify(arr));
        return json(rec, 200, cors);
      }

      return json({ error: 'not found' }, 404, cors);
    } catch (err) {
      return json({ error: 'server error', detail: String(err && err.message) }, 500, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
