/**
 * Content-review Worker - KV-backed comment store for the ReviewOverlay tool,
 * the /review page, the admin /reviewdash and the per-team /teamdash.
 *
 * Storage model:
 *   page:<encoded path>  - JSON array of comment records for that page.
 *   notifications        - JSON array of notification records (created on Deploy).
 * The dashboard lists every `page:` key.
 *
 * Auth: every request sends header `X-Review-Pass: <key>`.
 *   Reviewer key -> add a comment, read a page's pins, read+notifications for OWN team.
 *     - a per-team key from TEAM_KEYS (a JSON var: {"Product":"...","SEO":"..."})
 *     - REVIEW_PASS (a single shared reviewer key; optional fallback)
 *   Admin (ADMIN_PASS) -> the dashboard: read ALL, status, deploy, delete, all notifications.
 *   Admin is a superset of reviewer. A team's key ALSO scopes team-only reads to that team.
 *
 * The lifecycle (deploy gate):
 *   open --Mark Complete--> completed (validated, in the deploy BUCKET, still team-invisible)
 *        --Deploy (batch)--> published=true, publishedStatus=status, notifications fire.
 *   The team only ever sees `published ? publishedStatus : 'open'`.
 *
 * Bindings (wrangler.toml):
 *   COMMENTS      - KV namespace (the store).
 *   ADMIN_PASS    - secret, the admin passcode.
 *   TEAM_KEYS     - JSON of per-team reviewer keys.
 *   REVIEW_PASS   - optional single shared reviewer key (fallback).
 *   ALLOW_ORIGIN  - the exact site origin (CORS lock) AND the base used to fetch live
 *                   pages for content validation (e.g. "https://owner.github.io").
 *
 * Endpoints (see ./worker/CONTRACT or the package CONTRACT for the full table):
 *   POST /comments             add a comment                   -> the saved record
 *   GET  /comments?path=/x     one page's comments (reviewer)  -> record[]
 *   GET  /comments             ALL comments (admin)            -> record[]
 *   GET  /comments?team=X      team-scoped, masked             -> record[]
 *   POST /status               set working status (+validate)  -> the updated record
 *   POST /resolve              back-compat alias of /status    -> the updated record
 *   POST /deploy               publish the bucket + notify     -> {deployed, notifications}
 *   POST /delete               delete a whole thread (admin)   -> {ok, removed}
 *   GET  /notifications        all (admin) / ?team=X (team)    -> notification[]
 *   POST /notifications/read   mark notifications read         -> {ok, updated}
 */
export default {
  async fetch(request, env, ctx) {
    const origin = env.ALLOW_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Review-Pass',
      'Access-Control-Max-Age': '86400',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // ---- two-tier auth (header X-Review-Pass) ----
    const pass = request.headers.get('X-Review-Pass') || '';
    let TEAM_KEYS = {};
    try { TEAM_KEYS = JSON.parse(env.TEAM_KEYS || '{}'); } catch (e) {}
    const isAdmin = !!env.ADMIN_PASS && pass === env.ADMIN_PASS;
    // The team whose key equals this pass (null if none) - scopes team-only reads.
    const passTeam = pass ? (Object.keys(TEAM_KEYS).find((t) => TEAM_KEYS[t] && TEAM_KEYS[t] === pass) || null) : null;
    const isTeamKey = !!passTeam;
    const isReviewer = isAdmin || isTeamKey || (!!env.REVIEW_PASS && pass === env.REVIEW_PASS);
    const deny = () => json({ error: 'unauthorized' }, 401, cors);

    const url = new URL(request.url);
    const kv = env.COMMENTS;
    const keyFor = (path) => 'page:' + encodeURIComponent(path || '/');
    const NOTIF_KEY = 'notifications';

    try {
      // ---- add a comment (reviewer) ----
      if (request.method === 'POST' && url.pathname === '/comments') {
        if (!isReviewer) return deny();
        const b = await request.json();
        const comment = String(b.comment || '').trim();
        if (!comment) return json({ error: 'empty comment' }, 400, cors);
        const path = (b.page && b.page.path) || '/';
        const nowIso = new Date().toISOString();
        const rec = {
          id: crypto.randomUUID(),
          createdAt: nowIso,
          status: 'open',              // working status: open | completed | closed
          published: false,            // released to the team via Deploy?
          publishedStatus: '',         // snapshot of status at last Deploy (team-visible)
          completedAt: '', closedAt: '', publishedAt: '',
          validation: null,            // set on Mark Complete
          history: [{ status: 'open', at: nowIso, event: 'created', published: false }], // audit trail: current + past status
          parentId: b.parentId || null, // set on replies -> threads a comment
          sessionId: b.sessionId ? String(b.sessionId).slice(0, 64) : '', // groups a review sitting
          team: b.team ? String(b.team).slice(0, 40) : '',
          name: String(b.name || 'anonymous').slice(0, 80),
          comment: comment.slice(0, 4000),
          changeTo: b.changeTo ? String(b.changeTo).slice(0, 4000) : '', // Content: suggested new copy
          aiPrompt: '', // filled in the background (Workers AI) within seconds of submit
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
        // Generate the AI change-prompt in the background so it's ready in seconds.
        if (!rec.parentId) ctx.waitUntil(genPrompt(env, kv, keyFor, rec));
        return json(rec, 201, cors);
      }

      // ---- list comments ----
      if (request.method === 'GET' && url.pathname === '/comments') {
        const path = url.searchParams.get('path');
        const team = url.searchParams.get('team');
        if (path) {
          if (!isReviewer) return deny(); // one page's pins (reviewer)
          const arr = JSON.parse((await kv.get(keyFor(path))) || '[]');
          return json(arr, 200, cors);
        }
        if (team) {
          // Team-scoped: admin may read any team; a team key may read only its own.
          if (!isAdmin && passTeam !== team) return deny();
          const all = await readAll(kv);
          const masked = all.filter((r) => (r.team || '') === team).map(maskForTeam);
          masked.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
          return json(masked, 200, cors);
        }
        if (!isAdmin) return deny(); // ALL comments = dashboard (admin only)
        const out = await readAll(kv);
        out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        return json(out, 200, cors);
      }

      // ---- delete a whole thread (admin) ----
      if (request.method === 'POST' && url.pathname === '/delete') {
        if (!isAdmin) return deny();
        const b = await request.json();
        const path = b.path || '/';
        let arr = JSON.parse((await kv.get(keyFor(path))) || '[]');
        const before = arr.length;
        arr = arr.filter((r) => r.id !== b.id && r.parentId !== b.id); // root + its replies
        await kv.put(keyFor(path), JSON.stringify(arr));
        return json({ ok: true, removed: before - arr.length }, 200, cors);
      }

      // ---- set working status (admin) - open | completed | closed ----
      // /resolve is kept as a back-compat alias (maps legacy 'resolved' -> 'completed').
      if (request.method === 'POST' && (url.pathname === '/status' || url.pathname === '/resolve')) {
        if (!isAdmin) return deny();
        const b = await request.json();
        const path = b.path || '/';
        let status = b.status;
        if (status === 'resolved') status = 'completed';      // legacy alias
        if (status === 'reopen' || status === 'unresolve') status = 'open';
        if (!['open', 'completed', 'closed'].includes(status)) status = 'open';
        const arr = JSON.parse((await kv.get(keyFor(path))) || '[]');
        const rec = arr.find((r) => r.id === b.id);
        if (!rec) return json({ error: 'not found' }, 404, cors);
        const nowIso = new Date().toISOString();
        rec.status = status;
        if (status === 'completed') {
          rec.completedAt = nowIso;
          rec.validation = await validateCompletion(env, rec); // content-copy-match | manual
        } else if (status === 'closed') {
          rec.closedAt = nowIso;
        } else {
          // reopened: clear the completion validation
          rec.validation = null;
        }
        // audit trail: record every working-status transition (current + past status).
        if (!Array.isArray(rec.history)) rec.history = [];
        rec.history.push({ status, at: nowIso, event: 'status', published: !!rec.published });
        await kv.put(keyFor(path), JSON.stringify(arr));
        return json(rec, 200, cors);
      }

      // ---- Deploy: publish the whole bucket + fire notifications (admin) ----
      if (request.method === 'POST' && url.pathname === '/deploy') {
        if (!isAdmin) return deny();
        const now = new Date().toISOString();
        const created = [];
        // Walk every page, publish each unpublished completed/closed record.
        let cursor;
        do {
          const page = await kv.list({ prefix: 'page:', cursor });
          for (const k of page.keys) {
            const arr = JSON.parse((await kv.get(k.name)) || '[]');
            let dirty = false;
            for (const r of arr) {
              const ready = (r.status === 'completed' || r.status === 'closed');
              const alreadyLive = r.published && r.publishedStatus === r.status;
              if (ready && !alreadyLive) {
                r.published = true;
                r.publishedStatus = r.status;
                r.publishedAt = now;
                if (!Array.isArray(r.history)) r.history = [];
                r.history.push({ status: r.status, at: now, event: 'deployed', published: true });
                dirty = true;
                if (!r.parentId) created.push(makeNotif(r, now)); // notify per root comment
              }
            }
            if (dirty) await kv.put(k.name, JSON.stringify(arr));
          }
          cursor = page.list_complete ? null : page.cursor;
        } while (cursor);
        if (created.length) {
          const existing = JSON.parse((await kv.get(NOTIF_KEY)) || '[]');
          existing.push(...created);
          await kv.put(NOTIF_KEY, JSON.stringify(existing));
        }
        return json({ deployed: created.length, notifications: created }, 200, cors);
      }

      // ---- list notifications: all (admin) / own team (team key) ----
      if (request.method === 'GET' && url.pathname === '/notifications') {
        const team = url.searchParams.get('team');
        const all = JSON.parse((await kv.get(NOTIF_KEY)) || '[]');
        if (isAdmin && !team) { all.sort(byNewest); return json(all, 200, cors); }
        const t = team || passTeam;
        if (!t) return deny();
        if (!isAdmin && passTeam !== t) return deny();
        const mine = all.filter((n) => n.team === t).sort(byNewest);
        return json(mine, 200, cors);
      }

      // ---- mark notifications read/unread (admin or the owning team) ----
      // Body: { ids:[], read?:boolean (default true), team?:string }. read=false toggles back to unread.
      if (request.method === 'POST' && url.pathname === '/notifications/read') {
        if (!isReviewer) return deny();
        const b = await request.json();
        const ids = Array.isArray(b.ids) ? b.ids : [];
        const read = b.read === undefined ? true : !!b.read;
        const all = JSON.parse((await kv.get(NOTIF_KEY)) || '[]');
        let updated = 0;
        for (const n of all) {
          if (!ids.includes(n.id)) continue;
          if (isAdmin) { if (n.readAdmin !== read) { n.readAdmin = read; updated++; } }
          else if (passTeam && n.team === passTeam) { if (n.readTeam !== read) { n.readTeam = read; updated++; } }
        }
        if (updated) await kv.put(NOTIF_KEY, JSON.stringify(all));
        return json({ ok: true, updated }, 200, cors);
      }

      return json({ error: 'not found' }, 404, cors);
    } catch (err) {
      return json({ error: 'server error', detail: String(err && err.message) }, 500, cors);
    }
  },
};

// ---- helpers ----
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
const byNewest = (a, b) => (a.createdAt < b.createdAt ? 1 : -1);

// Read every comment across all page: keys.
async function readAll(kv) {
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
  return out;
}

// The team-visible projection: never leak the working status or admin-only fields.
function maskForTeam(r) {
  return {
    id: r.id,
    parentId: r.parentId || null,
    createdAt: r.createdAt,
    team: r.team || '',
    name: r.name || '',
    comment: r.comment,
    changeTo: r.changeTo || '',
    page: r.page,
    anchor: r.anchor || {},
    status: r.published ? (r.publishedStatus || 'open') : 'open', // masked
    publishedAt: r.publishedAt || '',
  };
}

// A notification for one just-published root comment.
function makeNotif(r, now) {
  const done = r.publishedStatus === 'closed' ? 'closed' : 'marked Done';
  const where = (r.page && r.page.title) || (r.page && r.page.path) || 'a page';
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    team: r.team || '',
    commentId: r.id,
    path: (r.page && r.page.path) || '/',
    pageName: where,
    publishedStatus: r.publishedStatus,
    summary: `Your comment on ${where} was ${done}.`,
    readTeam: false,
    readAdmin: false,
  };
}

// Content validation - only meaningful when the change carries replacement copy.
// Fetches the live page and confirms the new copy is present. Non-content changes
// are 'manual' (the admin's Mark-Complete action is the confirmation).
async function validateCompletion(env, rec) {
  const checkedAt = new Date().toISOString();
  const changeTo = (rec.changeTo || '').trim();
  if (!changeTo) return { ok: true, method: 'manual', detail: 'No copy change to verify.', checkedAt };
  const base = (env.ALLOW_ORIGIN && env.ALLOW_ORIGIN !== '*') ? env.ALLOW_ORIGIN.replace(/\/$/, '') : '';
  if (!base) return { ok: true, method: 'manual', detail: 'No live origin configured; not auto-verified.', checkedAt };
  const target = base + ((rec.page && rec.page.path) || '/');
  try {
    const res = await fetch(target, { headers: { 'User-Agent': 'ProofkitValidator/1.0' } });
    if (!res.ok) return { ok: false, method: 'content-copy-match', detail: `Live page returned ${res.status}.`, checkedAt };
    const html = await res.text();
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const found = norm(html).includes(norm(changeTo));
    return {
      ok: found,
      method: 'content-copy-match',
      detail: found ? 'New copy found on the live page.' : 'New copy NOT found on the live page yet.',
      checkedAt,
    };
  } catch (e) {
    return { ok: false, method: 'content-copy-match', detail: 'Could not fetch the live page: ' + String(e && e.message), checkedAt };
  }
}

// Deterministic prompt - always available even if the AI call fails.
function fallbackPrompt(rec) {
  const a = rec.anchor || {};
  const where = a.snippet ? `the “${a.snippet}” ${a.tag || 'element'}` : (a.tag || 'the element');
  let s = `On page ${rec.page.path}, in ${where}: ${rec.comment}`;
  if (rec.changeTo) s += `\n\nChange the content to exactly (preserve casing/punctuation): “${rec.changeTo}”`;
  return s;
}

// Generate a developer-ready change instruction via Workers AI, then persist it
// onto the record. Runs in the background (ctx.waitUntil) so submit stays fast.
async function genPrompt(env, kv, keyFor, rec) {
  const a = rec.anchor || {};
  // NOTE: team/reviewer are deliberately NOT sent - the prompt is pasted into a
  // coding agent, so reviewer attribution is noise. Keep it to the change itself.
  const facts = {
    page: rec.page.path,
    element: a.tag || 'unknown',
    section_or_text: a.snippet || '',
    css_selector: a.selector || '',
    reviewer_note: rec.comment || '',
    exact_new_content: rec.changeTo || '',
  };
  const system =
    'You convert a website content-review note into ONE precise, developer-ready change instruction to paste into a coding agent. ' +
    'State the exact page path, the specific section/element, the current text if given, and the exact new content. ' +
    'Preserve casing, spacing and punctuation of any provided replacement copy VERBATIM and put it in quotes. ' +
    'Be crisp and self-contained (1-3 imperative sentences) so several instructions can be stacked one after another. ' +
    'Output ONLY the change instruction - no preamble, no reviewer/author attribution or sign-off, no options, no markdown headers.';
  let prompt = '';
  try {
    // Pluggable provider: Anthropic (Claude) when ANTHROPIC_API_KEY is set, else
    // Cloudflare Workers AI (model overridable via the AI_MODEL var). Either way it
    // falls back to a deterministic instruction if the call errors / is unavailable.
    if (env.ANTHROPIC_API_KEY) {
      prompt = await genAnthropic(env, system, facts);
    } else if (env.AI) {
      const model = env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
      const out = await env.AI.run(model, {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(facts) },
        ],
        max_tokens: 300,
      });
      prompt = String((out && (out.response || out.result || out.text)) || '').trim();
    }
  } catch (e) {
    prompt = '';
  }
  if (!prompt) prompt = fallbackPrompt(rec);
  // persist onto the record (read-modify-write of the page array)
  try {
    const key = keyFor(rec.page.path);
    const arr = JSON.parse((await kv.get(key)) || '[]');
    const r = arr.find((x) => x.id === rec.id);
    if (r) { r.aiPrompt = prompt.slice(0, 4000); await kv.put(key, JSON.stringify(arr)); }
  } catch (e) { /* leave aiPrompt empty; dashboard shows "generating" */ }
}

// Anthropic Messages API - Claude generates the change instruction. Enabled by
// setting the ANTHROPIC_API_KEY secret (`wrangler secret put ANTHROPIC_API_KEY`);
// model overridable via the ANTHROPIC_MODEL var (default: Haiku - fast + cheap).
async function genAnthropic(env, system, facts) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system,
      messages: [{ role: 'user', content: JSON.stringify(facts) }],
    }),
  });
  if (!res.ok) throw new Error('anthropic ' + res.status);
  const j = await res.json();
  return String((j.content && j.content[0] && j.content[0].text) || '').trim();
}
