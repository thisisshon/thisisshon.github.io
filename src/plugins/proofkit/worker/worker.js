/**
 * Content-review Worker - KV-backed comment store for the ReviewOverlay tool,
 * the /review page, the admin /reviewdash and the per-team /teamdash.
 *
 * Storage model:
 *   page:<encoded path>  - JSON array of comment records for that page.
 *   notifications        - JSON array of notification records (status pushes + arrivals + replies).
 *   img:<uuid>           - a single screenshot dataURL string (Feature 4; ≤200KB, thin-infra).
 *   views:<team>         - a team's saved views (Feature 11); admin uses views:__admin.
 *   metrics              - rollup events array {at,event,page,commentType,iteration} (Feature 12),
 *                          FIFO-capped at 5000; metrics compute from this, not a full page scan.
 * The dashboard lists every `page:` key.
 *
 * Auth: every request sends header `X-Review-Pass: <key>`.
 *   Reviewer key -> add a comment, read a page's pins, read+notifications for OWN team.
 *     - a per-team key from TEAM_KEYS (a JSON var: {"Content":"...","Product":"..."})
 *     - REVIEW_PASS (a single shared reviewer key; optional fallback)
 *   Admin (ADMIN_PASS) = the Builder/Admin role -> read ALL, drive team-status, resubmit,
 *     delete, all notifications. Admin is a superset of reviewer. A team's key ALSO scopes
 *     team-only reads to that team.
 *   ENABLED_TEAMS (optional JSON array) config-gates which teams may authenticate at all;
 *     a key for a disabled team is rejected with 403 (defense-in-depth). Unset = all enabled.
 *
 * The status state machine (real-time, per ticket - NO deploy gate, NO delivery queue):
 *   `teamStatus` is the single source of truth. The receiver is always 'Builder' in Phase 1.
 *     to_be_initiated --start--> in_progress --complete--> deployed_live  (TERMINAL / live now)
 *     in_progress | deployed_live --reopen(reason)--> reopened
 *   Builder drives start | complete | reopen via POST /team-status.
 *   Content resubmits a 'reopened' ticket via POST /resubmit: this spawns a NEW sub-ticket
 *   (parentId -> origin root, ticket = base + '-<n>', iteration++) back at to_be_initiated;
 *   the prior iteration's record is retained for the timeline. Every transition is appended
 *   to `history[]` as {status, at, event, reason?, iteration} so both sides can render it.
 *
 * Bindings (wrangler.toml):
 *   COMMENTS      - KV namespace (the store).
 *   ADMIN_PASS    - secret, the admin (Builder) passcode.
 *   TEAM_KEYS     - JSON of per-team reviewer keys.
 *   REVIEW_PASS   - optional single shared reviewer key (fallback).
 *   ENABLED_TEAMS - optional JSON array of enabled team names (unset = all enabled).
 *   ALLOW_ORIGIN  - the exact site origin (CORS lock).
 *
 * Endpoints (see ./worker/CONTRACT or the package CONTRACT for the full table):
 *   POST /comments             add a comment (object OR array)  -> record | {results:[{ok,rec?,error?}]}
 *   GET  /comments?path=/x     one page's comments (reviewer)  -> record[]
 *   GET  /comments             ALL comments (admin)            -> record[]
 *   GET  /comments?team=X      team-scoped, masked             -> record[]
 *   POST /team-status          Builder start|complete|reopen   -> the masked record
 *   POST /resubmit             Content re-raises a reopened    -> the masked sub-ticket
 *   POST /teams                admin re-routes From/To teams   -> the updated record
 *   POST /delete               delete a whole thread (admin)   -> {ok, removed}
 *   POST /image                store a screenshot dataURL (rev) -> {imageId}
 *   GET  /image?id=X           read a screenshot dataURL (rev)  -> {dataUrl} | 404
 *   GET  /views                caller's saved views (reviewer)  -> view[]
 *   POST /views                replace caller's saved views     -> {ok, views}
 *   GET  /metrics?from&to      aggregate insights (admin)       -> {deployedPerPage,...}
 *   GET  /notifications        all (admin) / ?team=X (team)    -> notification[]
 *   POST /notifications/read   mark notifications read         -> {ok, updated}
 *   GET  /settings             global settings (public)        -> {theme}
 *   POST /settings             set global theme (admin)        -> {ok, theme}
 *   GET  /events               SSE stream of theme changes     -> text/event-stream
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

    // ---- disabled-team config gate (defense-in-depth) ----
    // ENABLED_TEAMS is an optional JSON array of team names; unset/empty = every team is
    // enabled. A team-scoped read or a team key for a team NOT in the list is rejected
    // with a clear 403 (the UI gating is handled separately). Admin (Builder) is never
    // gated. In Phase 1 only 'Content' + the Builder/Admin role are enabled.
    const enabledTeams = parseEnabledTeams(env);
    const teamEnabled = (t) => !enabledTeams || enabledTeams.includes(t);
    const forbid = (team) => json({ error: 'team disabled', team: team || '' }, 403, cors);
    if (passTeam && !teamEnabled(passTeam)) return forbid(passTeam);

    const url = new URL(request.url);
    const kv = env.COMMENTS;
    const keyFor = (path) => 'page:' + encodeURIComponent(path || '/');
    const NOTIF_KEY = 'notifications';
    const SETTINGS_KEY = 'settings';
    const METRICS_KEY = 'metrics';   // rollup events for the Insights endpoint (Feature 12)

    try {
      // ---- global settings (theme) ----
      // GET is public: the dashboards need the theme before anyone signs in, and the
      // theme name is not sensitive. POST is admin-only — the admin's toggle sets the
      // GLOBAL theme for everyone (the client caches it locally for a no-flash paint).
      if (url.pathname === '/settings') {
        if (request.method === 'GET') {
          const s = JSON.parse((await kv.get(SETTINGS_KEY)) || '{}');
          return json({ theme: s.theme || '' }, 200, cors);
        }
        if (request.method === 'POST') {
          if (!isAdmin) return deny();
          const b = await request.json();
          const theme = String(b.theme || '').slice(0, 40);
          const s = JSON.parse((await kv.get(SETTINGS_KEY)) || '{}');
          s.theme = theme;
          await kv.put(SETTINGS_KEY, JSON.stringify(s));
          return json({ ok: true, theme }, 200, cors);
        }
      }

      // ---- live push (SSE): stream global-settings (theme) changes ----
      // KV gives no change events, so this POLLS it server-side and pushes a `theme`
      // event whenever it changes — the admin's flip reaches every open dashboard in
      // ~a second. Public (like GET /settings). Bounded to ~90s; the browser's
      // EventSource auto-reconnects, keeping each client's Worker time small.
      if (request.method === 'GET' && url.pathname === '/events') {
        const enc = new TextEncoder();
        const readTheme = async () => {
          const s = JSON.parse((await kv.get(SETTINGS_KEY)) || '{}');
          return s.theme || '';
        };
        let stop = false;
        const stream = new ReadableStream({
          async start(controller) {
            const send = (s) => { try { controller.enqueue(enc.encode(s)); } catch { stop = true; } };
            let last = await readTheme();
            send('retry: 3000\n\n');
            send('event: theme\ndata: ' + JSON.stringify({ theme: last }) + '\n\n');
            for (let i = 0; i < 30 && !stop; i++) {
              await new Promise((r) => setTimeout(r, 3000));
              let cur;
              try { cur = await readTheme(); } catch { cur = last; }
              if (cur !== last) { last = cur; send('event: theme\ndata: ' + JSON.stringify({ theme: cur }) + '\n\n'); }
              else send(': ping\n\n'); // heartbeat keeps intermediaries from closing the stream
            }
            try { controller.close(); } catch {}
          },
          cancel() { stop = true; },
        });
        return new Response(stream, {
          status: 200,
          headers: {
            ...cors,
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
          },
        });
      }

      // ---- add a comment (reviewer) ----
      // v3 (Feature 2): the body is a single record OBJECT **or an ARRAY** (one Submit-all
      // batch). An array is processed per-item — one bad item never blocks the rest — and
      // returns `201 { results: [{ ok, rec? , error? }] }` in input order. A single object
      // returns the saved record (201) or a 400 with the validation error, exactly as v2.
      if (request.method === 'POST' && url.pathname === '/comments') {
        if (!isReviewer) return deny();
        const body = await request.json();
        if (Array.isArray(body)) {
          const results = [];
          for (const item of body) {
            const r = await createComment(env, kv, ctx, keyFor, NOTIF_KEY, METRICS_KEY, TEAM_KEYS, item);
            results.push(r.ok ? { ok: true, rec: r.rec } : { ok: false, error: r.error });
          }
          return json({ results }, 201, cors);
        }
        const r = await createComment(env, kv, ctx, keyFor, NOTIF_KEY, METRICS_KEY, TEAM_KEYS, body);
        if (!r.ok) return json({ error: r.error }, 400, cors);
        return json(r.rec, 201, cors);
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
          // Team-scoped view: every task this team is part of — ones it RAISED (team)
          // AND ones DIRECTED to it (toTeam) — so the raiser and the receiver both see
          // it. Thread-aware: matching roots carry all their replies. Admin may read
          // any team; a team key may read only its own.
          if (!teamEnabled(team)) return forbid(team);
          if (!isAdmin && passTeam !== team) return deny();
          const all = await readAll(kv);
          const mine = new Set(
            all.filter((r) => !r.parentId && ((r.team || '') === team || (r.toTeam || '') === team)).map((r) => r.id)
          );
          const masked = all
            .filter((r) => (!r.parentId && mine.has(r.id)) || (r.parentId && mine.has(r.parentId)))
            .map(maskForTeam);
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

      // ---- edit the From/To teams of a comment (admin) ----
      // Body: { id, path, team?, toTeam? }. Updates the raising team and/or the directed
      // team on a root record — lets the admin re-route a comment after the fact.
      if (request.method === 'POST' && url.pathname === '/teams') {
        if (!isAdmin) return deny();
        const b = await request.json();
        const path = b.path || '/';
        const arr = JSON.parse((await kv.get(keyFor(path))) || '[]');
        const rec = arr.find((r) => r.id === b.id);
        if (!rec) return json({ error: 'not found' }, 404, cors);
        if (b.team !== undefined) rec.team = String(b.team || '').slice(0, 40);
        if (b.toTeam !== undefined) rec.toTeam = String(b.toTeam || '').slice(0, 40);
        await kv.put(keyFor(path), JSON.stringify(arr));
        return json(rec, 200, cors);
      }

      // ---- Builder drives the status state machine ----
      // Body: { id, action:'start'|'complete'|'reopen', reason?, note? }. No `path` — the
      // record is located by id. The receiver (toTeam, i.e. Builder) or admin may drive it.
      //   start    : to_be_initiated -> in_progress
      //   complete : in_progress     -> deployed_live   (manual, unvalidated self-attestation)
      //   reopen   : in_progress|deployed_live -> reopened
      // v3 (Feature 3): reopen `reason` is an ENUM (needs-clarification|wrong-element|
      // design-mismatch|other); a non-enum reason is rejected 400. `note` is REQUIRED iff
      // reason === 'other' (400 otherwise), and is stored on the record + history entry.
      // The change is pushed to the RAISER (Content) debounced 5s (see pushStatusNotif).
      if (request.method === 'POST' && url.pathname === '/team-status') {
        if (!isReviewer) return deny();
        const b = await request.json();
        const action = b.action;
        if (!['start', 'complete', 'reopen'].includes(action)) return json({ error: 'bad action' }, 400, cors);
        let reason = '';
        let note = '';
        if (action === 'reopen') {
          reason = String(b.reason || '').trim();
          if (!REOPEN_REASONS[reason]) return json({ error: 'bad reason' }, 400, cors);
          note = String(b.note || '').trim().slice(0, 2000);
          if (reason === 'other' && !note) return json({ error: 'note required' }, 400, cors);
        }
        const found = await findById(kv, b.id);
        if (!found) return json({ error: 'not found' }, 404, cors);
        const { key, arr, rec } = found;
        if (!isAdmin && passTeam !== (rec.toTeam || '')) return deny(); // only the receiver (Builder)
        const cur = rec.teamStatus || 'to_be_initiated';
        let next;
        if (action === 'start') {
          if (cur !== 'to_be_initiated') return json({ error: 'bad transition', from: cur }, 409, cors);
          next = 'in_progress';
        } else if (action === 'complete') {
          if (cur !== 'in_progress') return json({ error: 'bad transition', from: cur }, 409, cors);
          next = 'deployed_live';
        } else { // reopen
          if (cur !== 'in_progress' && cur !== 'deployed_live') return json({ error: 'bad transition', from: cur }, 409, cors);
          next = 'reopened';
        }
        const nowIso = new Date().toISOString();
        const iter = rec.iteration || 1;
        rec.teamStatus = next; rec.teamStatusAt = nowIso;
        if (action === 'reopen') { rec.reopenReason = reason; rec.reopenNote = note; }
        if (!Array.isArray(rec.history)) rec.history = [];
        const h = { status: next, at: nowIso, event: 'team-' + action, iteration: iter };
        if (action === 'reopen') { h.reason = reason; if (note) h.note = note; }
        rec.history.push(h);
        await kv.put(key, JSON.stringify(arr));
        // append a rollup event for the Insights endpoint (Feature 12) — best-effort
        ctx.waitUntil(appendRollup(kv, METRICS_KEY, {
          at: nowIso, event: 'team-' + action, page: (rec.page && rec.page.path) || '/',
          commentType: rec.commentType || 'general', iteration: iter,
        }));
        // the human label backs the notification summary; the enum stays on `reason`
        const reasonLabel = action === 'reopen' ? (REOPEN_REASONS[reason] || reason) : '';
        // push the change to the raiser (Content), coalesced within a 5s window
        ctx.waitUntil(pushStatusNotif(kv, NOTIF_KEY, {
          chainId: rec.parentId || rec.id, commentId: rec.id, ticket: rec.ticket || '',
          team: rec.team || '', fromTeam: rec.toTeam || '', teamStatus: next, iteration: iter,
          reason: action === 'reopen' ? reason : '', reasonLabel, note,
          path: (rec.page && rec.page.path) || '/', pageName: pageNameOf(rec),
          summary: statusSummary(rec, next, reasonLabel),
        }));
        return json(maskForTeam(rec), 200, cors);
      }

      // ---- Content re-raises a reopened ticket -> spawns the next iteration ----
      // Body: { id }. The ticket must be 'reopened'. Creates a NEW sub-ticket that shares
      // the origin's base ticket with a '-<n>' suffix, chains to the origin root via
      // parentId, bumps `iteration`, and starts back at to_be_initiated in Builder's queue.
      // The prior iteration's record is retained untouched for the timeline. Only the raiser
      // (Content, rec.team) or admin may resubmit. The new iteration is pushed to Builder (5s).
      if (request.method === 'POST' && url.pathname === '/resubmit') {
        if (!isReviewer) return deny();
        const b = await request.json();
        const found = await findById(kv, b.id);
        if (!found) return json({ error: 'not found' }, 404, cors);
        const { key, arr, rec } = found;
        if (!isAdmin && passTeam !== (rec.team || '')) return deny(); // only the raiser (Content)
        if ((rec.teamStatus || '') !== 'reopened') return json({ error: 'not reopened', teamStatus: rec.teamStatus || '' }, 409, cors);
        const nowIso = new Date().toISOString();
        const rootId = rec.parentId || rec.id;                 // the origin (iteration 1) record
        // base ticket + current max iteration across the whole chain (all live in this page)
        let maxIter = 1;
        let baseTicket = '';
        for (const r of arr) {
          if (r.id === rootId || r.parentId === rootId) {
            if ((r.iteration || 1) > maxIter) maxIter = r.iteration || 1;
          }
          if (r.id === rootId) baseTicket = String(r.ticket || '').replace(/-\d+$/, '');
        }
        const nextIter = maxIter + 1;
        const newTicket = baseTicket ? baseTicket + '-' + (nextIter - 1) : '';
        const sub = {
          id: crypto.randomUUID(),
          ticket: newTicket,
          createdAt: nowIso,
          teamStatus: 'to_be_initiated', teamStatusAt: nowIso,
          iteration: nextIter,
          reopenReason: '', reopenNote: '',
          parentId: rootId,            // chains the sub-ticket to the origin root (reuses parentId)
          sessionId: rec.sessionId || '',
          team: rec.team || '', toTeam: rec.toTeam || '',
          name: rec.name || 'anonymous',
          comment: rec.comment || '',
          changeTo: rec.changeTo || '',
          // v3: carry the structured Feature-1/8/4 fields forward onto the new iteration
          commentType: rec.commentType || 'general',
          templateFields: rec.templateFields || {},
          summary: rec.summary || '',
          expectedOutcome: rec.expectedOutcome || '',
          imageId: rec.imageId || '',
          batchId: rec.batchId || '',
          aiPrompt: rec.aiPrompt || '',
          page: rec.page,
          anchor: rec.anchor || {},
          history: [{ status: 'to_be_initiated', at: nowIso, event: 'resubmitted', iteration: nextIter }],
        };
        arr.push(sub);
        await kv.put(key, JSON.stringify(arr));
        // append a rollup event for the Insights endpoint (Feature 12) — best-effort
        ctx.waitUntil(appendRollup(kv, METRICS_KEY, {
          at: nowIso, event: 'resubmitted', page: (sub.page && sub.page.path) || '/',
          commentType: sub.commentType || 'general', iteration: nextIter,
        }));
        // push the fresh iteration to the receiver (Builder), coalesced within a 5s window
        ctx.waitUntil(pushStatusNotif(kv, NOTIF_KEY, {
          chainId: rootId, commentId: sub.id, ticket: sub.ticket, team: sub.toTeam || '',
          fromTeam: sub.team || '', teamStatus: 'to_be_initiated', iteration: nextIter, reason: '',
          path: (sub.page && sub.page.path) || '/', pageName: pageNameOf(sub),
          summary: `Resubmitted ${sub.ticket ? '#' + sub.ticket + ' ' : ''}for another pass.`,
        }));
        return json(maskForTeam(sub), 200, cors);
      }

      // ---- list notifications: all (admin) / own team (team key) ----
      // Sorted by recency (coalesced status pushes bump `updatedAt`, so they resurface).
      if (request.method === 'GET' && url.pathname === '/notifications') {
        const team = url.searchParams.get('team');
        const all = JSON.parse((await kv.get(NOTIF_KEY)) || '[]');
        if (isAdmin && !team) { all.sort(byRecent); return json(all, 200, cors); }
        const t = team || passTeam;
        if (!t) return deny();
        if (!teamEnabled(t)) return forbid(t);
        if (!isAdmin && passTeam !== t) return deny();
        const mine = all.filter((n) => n.team === t).sort(byRecent);
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

      // ---- screenshot store (Feature 4, thin-infra) ----
      // Images live OUTSIDE the page array (which is re-read on every overlay/dashboard load)
      // — each is a single KV `img:<uuid>` holding the raw dataURL string. POST stores one
      // (≤200KB after the client's downscale) and returns its id; the comment record only ever
      // carries `imageId`. Reviewer auth; never required to create a comment.
      if (url.pathname === '/image') {
        if (!isReviewer) return deny();
        if (request.method === 'POST') {
          const b = await request.json();
          const dataUrl = String(b.dataUrl || '');
          if (!dataUrl) return json({ error: 'no image' }, 400, cors);
          if (dataUrl.length > IMAGE_MAX_BYTES) return json({ error: 'image too large' }, 413, cors);
          const imageId = b.id ? String(b.id).slice(0, 64) : crypto.randomUUID();
          await kv.put('img:' + imageId, dataUrl);
          return json({ imageId }, 201, cors);
        }
        if (request.method === 'GET') {
          const id = url.searchParams.get('id');
          if (!id) return json({ error: 'id required' }, 400, cors);
          const dataUrl = await kv.get('img:' + String(id).slice(0, 64));
          if (!dataUrl) return json({ error: 'not found' }, 404, cors);
          return json({ dataUrl }, 200, cors);
        }
      }

      // ---- saved "team views" (Feature 11) ----
      // Views are shared per team key (not per person — see the caveat in the plan). KV key
      // is `views:<team>` for a team key and `views:__admin` for the admin. POST replaces the
      // caller's whole set (simple CRUD-by-replace). Scoped strictly to the caller's auth: a
      // team key only ever touches its own team's views. A keyless shared reviewer (REVIEW_PASS,
      // no team) has no scope, so it is denied.
      if (url.pathname === '/views') {
        if (!isReviewer) return deny();
        const scopeKey = isTeamKey ? ('views:' + passTeam) : (isAdmin ? 'views:__admin' : null);
        if (!scopeKey) return deny();
        if (request.method === 'GET') {
          const v = JSON.parse((await kv.get(scopeKey)) || '[]');
          return json(Array.isArray(v) ? v : [], 200, cors);
        }
        if (request.method === 'POST') {
          const b = await request.json();
          const views = sanitizeViews(b.views);
          await kv.put(scopeKey, JSON.stringify(views));
          return json({ ok: true, views }, 200, cors);
        }
      }

      // ---- aggregate insights (Feature 12, admin only) ----
      // Computes the five aggregates from the `metrics` rollup (an events array maintained on
      // every state transition), NOT by scanning every page: key. Falls back to a full scan
      // (deriving the same events from each record's history[]) when the rollup key is absent.
      if (request.method === 'GET' && url.pathname === '/metrics') {
        if (!isAdmin) return deny();
        const from = url.searchParams.get('from') || '';
        const to = url.searchParams.get('to') || '';
        const events = await metricsEvents(kv, METRICS_KEY);
        return json(computeMetrics(events, from, to), 200, cors);
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
// Sort notifications newest-first by last activity — a coalesced status push updates
// `updatedAt` (see pushStatusNotif), so freshly-changed tickets resurface to the top.
const byRecent = (a, b) => ((a.updatedAt || a.createdAt) < (b.updatedAt || b.createdAt) ? 1 : -1);
const pageNameOf = (r) => (r.page && r.page.title) || (r.page && r.page.path) || 'a page';

// ---- v3 shared vocab (single source in the Worker; mirrored client-side in core/config.js) ----
// The change-type enum (Feature 1). 'general' == the exact v2 freeform behaviour.
const COMMENT_TYPES = ['copy-fix', 'image-swap', 'link-fix', 'layout-tweak', 'general'];
// The whitelisted template-field keys per type (§3). Unknown keys are dropped, values capped.
const TYPE_FIELD_KEYS = {
  'copy-fix': ['currentText', 'newText'],
  'image-swap': ['currentImage', 'replacementDesc'],
  'link-fix': ['currentUrl', 'newUrl'],
  'layout-tweak': ['whatToChange'],
  'general': [],
};
// Types that MUST carry an expectedOutcome (Feature 8) — enforced client + server.
const OUTCOME_REQUIRED = new Set(['layout-tweak', 'image-swap']);
// The reopen-reason enum -> human label (Feature 3). The enum is stored; the label backs the UI.
const REOPEN_REASONS = {
  'needs-clarification': 'Needs clarification',
  'wrong-element': 'Wrong element',
  'design-mismatch': 'Design mismatch',
  'other': 'Other',
};
const IMAGE_MAX_BYTES = 200 * 1024;   // dataURL length cap after the client downscale (Feature 4)
const METRICS_CAP = 5000;             // FIFO cap on the rollup events array (Feature 12)

// ENABLED_TEAMS is an optional JSON array of enabled team names. Returns null when it is
// unset / empty / malformed (meaning "all teams enabled"), else the array of names.
function parseEnabledTeams(env) {
  const raw = (env.ENABLED_TEAMS || '').trim();
  if (!raw) return null;
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) && a.length ? a.map(String) : null;
  } catch (e) { return null; }
}

// Locate a single record by id across every page: key. The status endpoints work by id
// alone (no path), so we scan; returns { key, arr, rec } or null. Mutate `arr` in place
// then `kv.put(key, JSON.stringify(arr))` to persist.
async function findById(kv, id) {
  if (!id) return null;
  let cursor;
  do {
    const page = await kv.list({ prefix: 'page:', cursor });
    for (const k of page.keys) {
      const arr = JSON.parse((await kv.get(k.name)) || '[]');
      const rec = arr.find((r) => r.id === id);
      if (rec) return { key: k.name, arr, rec };
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return null;
}

// One-line human summary of a status transition (for the notification card).
function statusSummary(r, next, reason) {
  const where = pageNameOf(r);
  const tick = r.ticket ? '#' + r.ticket + ' ' : '';
  if (next === 'in_progress') return `Builder started ${tick}on ${where}.`;
  if (next === 'deployed_live') return `${tick}on ${where} was deployed live.`;
  if (next === 'reopened') return `Builder reopened ${tick}on ${where}${reason ? ': ' + reason : ''}.`;
  if (next === 'to_be_initiated') return `${tick}on ${where} is back with Builder (TBI).`;
  return `Status changed on ${where}.`;
}

// Debounced (5s) status push to the OTHER side. KV has no timers and the dashboards poll
// on a ~5s cadence, so instead of appending one notification per change we COALESCE
// server-side: a status change for a ticket-chain (chainId = the origin root id) targeting
// a given team UPDATES that chain's latest status notification in place when it was written
// less than 5s ago — so a burst of changes inside one 5s window collapses to a single record
// carrying only the LATEST state. Older, settled notifications are left as history. The
// notification's `updatedAt` (bumped on coalesce) drives the recency sort. Read-modify-write
// on the notifications key is not atomic, matching the rest of the store's posture; at
// review-tool volume the race is negligible and worst case is a duplicate card.
const DEBOUNCE_MS = 5000;
async function pushStatusNotif(kv, NOTIF_KEY, info) {
  try {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const all = JSON.parse((await kv.get(NOTIF_KEY)) || '[]');
    let latest = null;
    for (const n of all) {
      if (n.kind !== 'status') continue;
      if (n.chainId !== info.chainId || n.team !== info.team) continue;
      if (!latest || (n.updatedAt || n.createdAt) > (latest.updatedAt || latest.createdAt)) latest = n;
    }
    const within = latest && (now - Date.parse(latest.updatedAt || latest.createdAt)) < DEBOUNCE_MS;
    if (within) {
      // coalesce: overwrite the in-window record with the latest state
      latest.updatedAt = nowIso;
      latest.commentId = info.commentId;
      latest.ticket = info.ticket || '';
      latest.teamStatus = info.teamStatus;
      latest.iteration = info.iteration || 1;
      latest.reason = info.reason || '';
      latest.reasonLabel = info.reasonLabel || '';
      latest.note = info.note || '';
      latest.fromTeam = info.fromTeam || '';
      latest.path = info.path || '/';
      latest.pageName = info.pageName || 'a page';
      latest.summary = info.summary || '';
      latest.readTeam = false;
      latest.readAdmin = false;
    } else {
      all.push({
        id: crypto.randomUUID(),
        createdAt: nowIso,
        updatedAt: nowIso,
        team: info.team,             // who should see it (the OTHER side)
        kind: 'status',
        chainId: info.chainId,       // the origin root id — coalescing key
        commentId: info.commentId,   // the specific iteration record that changed
        ticket: info.ticket || '',
        teamStatus: info.teamStatus,
        iteration: info.iteration || 1,
        reason: info.reason || '',
        reasonLabel: info.reasonLabel || '',
        note: info.note || '',
        fromTeam: info.fromTeam || '',
        path: info.path || '/',
        pageName: info.pageName || 'a page',
        summary: info.summary || '',
        readTeam: false,
        readAdmin: false,
      });
    }
    await kv.put(NOTIF_KEY, JSON.stringify(all));
  } catch (e) { /* best-effort; a missed notification never blocks the state change */ }
}

// Ticket number = YYMMDD (from the comment's own timestamp) + a 4-digit serial that
// resets each day and runs 0001–9999. The serial lives in KV under `ticketseq:<YYMMDD>`
// as a plain integer; each new comment reads-increments-writes it. Read-modify-write on
// KV is not atomic, but at review-tool volume collisions are effectively nil (and worst
// case two same-day comments share a number — cosmetic, ids stay unique). The counter
// wraps 1→9999 so the serial is always 4 digits.
async function nextTicket(kv, iso) {
  const ymd = iso.slice(2, 10).replace(/-/g, ''); // "2026-07-14" -> "260714"
  const seqKey = 'ticketseq:' + ymd;
  const seq = (parseInt((await kv.get(seqKey)) || '0', 10) || 0) + 1;
  await kv.put(seqKey, String(seq));
  const serial = ((seq - 1) % 9999) + 1;          // keep it in 1..9999
  return ymd + String(serial).padStart(4, '0');
}

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

// The team-visible projection. `teamStatus` is the single, real-time status — shared
// verbatim with both the raiser (Content) and the receiver (Builder); there is no hidden
// admin lifecycle or deploy bucket to mask anymore. The full `history[]` is included so
// both sides can render the iteration timeline (-1, -2, -3…).
function maskForTeam(r) {
  return {
    id: r.id,
    ticket: r.ticket || '',   // human-facing ticket number (base, or base-<n> for a sub-ticket)
    parentId: r.parentId || null, // chains sub-tickets (and replies) to the origin root
    iteration: r.iteration || 1,
    createdAt: r.createdAt,
    team: r.team || '',       // FROM: which team raised it (Content)
    toTeam: r.toTeam || '',   // TO: which team it is directed to (Builder)
    name: r.name || '',       // reviewer identity
    comment: r.comment,
    changeTo: r.changeTo || '',
    // v3 structured fields (Feature 1/8/4) — teams see their own typed data
    commentType: r.commentType || 'general',
    templateFields: r.templateFields || {},
    summary: r.summary || '',
    expectedOutcome: r.expectedOutcome || '',
    imageId: r.imageId || '',
    batchId: r.batchId || '',
    aiPrompt: r.aiPrompt || '',       // ready-to-hand-to-a-dev change instruction
    page: r.page,
    anchor: r.anchor || {},
    // the real-time state machine
    teamStatus: r.teamStatus || 'to_be_initiated',
    teamStatusAt: r.teamStatusAt || '',
    reopenReason: r.reopenReason || '', // last Builder bounce-back reason (enum value)
    reopenNote: r.reopenNote || '',     // free-text note (required only when reason === 'other')
    history: Array.isArray(r.history) ? r.history : [], // full transition trail for the timeline
  };
}

// Arrival notification: a new comment was DIRECTED to a team (fired on creation, so
// the directed team knows work landed in its /teamdash inbox). Distinguished from the
// deploy notification by `kind:'directed'`.
async function fireArrivalNotif(kv, NOTIF_KEY, rec) {
  try {
    const where = (rec.page && rec.page.title) || (rec.page && rec.page.path) || 'a page';
    const notif = {
      id: crypto.randomUUID(),
      createdAt: rec.createdAt,
      team: rec.toTeam,            // who should see it (the directed team)
      kind: 'directed',
      fromTeam: rec.team || '',
      commentId: rec.id,
      ticket: rec.ticket || '',
      path: (rec.page && rec.page.path) || '/',
      pageName: where,
      summary: `New comment ${rec.ticket ? '#' + rec.ticket + ' ' : ''}on ${where}` + (rec.team ? ` from ${rec.team}` : ''),
      readTeam: false,
      readAdmin: false,
    };
    const existing = JSON.parse((await kv.get(NOTIF_KEY)) || '[]');
    existing.push(notif);
    await kv.put(NOTIF_KEY, JSON.stringify(existing));
  } catch (e) { /* best-effort; never block the comment write */ }
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
    // v3 (Feature 1/8): the structured change-type context so the AI prompt improves,
    // never regresses, over the freeform baseline.
    comment_type: rec.commentType || 'general',
    template_fields: rec.templateFields || {},
    expected_outcome: rec.expectedOutcome || '',
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

// Validate + persist ONE comment record (root or reply). Returns { ok:true, rec } or
// { ok:false, error }. Shared by the single-object and the array (batch) POST /comments paths
// so one bad item in a batch never blocks the rest. Every new v3 field defaults when missing.
async function createComment(env, kv, ctx, keyFor, NOTIF_KEY, METRICS_KEY, TEAM_KEYS, b) {
  b = b || {};
  const comment = String(b.comment || '').trim();
  if (!comment) return { ok: false, error: 'empty comment' };
  // Feature 1: change-type + type-specific template fields.
  const commentType = b.commentType ? String(b.commentType) : 'general';
  if (!COMMENT_TYPES.includes(commentType)) return { ok: false, error: 'bad commentType' };
  const templateFields = sanitizeTemplateFields(commentType, b.templateFields);
  // Feature 8: expectedOutcome is required for layout-tweak / image-swap.
  const expectedOutcome = String(b.expectedOutcome || '').trim().slice(0, 4000);
  if (OUTCOME_REQUIRED.has(commentType) && !expectedOutcome) return { ok: false, error: 'expectedOutcome required' };
  const isReply = !!b.parentId;
  const path = (b.page && b.page.path) || '/';
  const nowIso = new Date().toISOString();
  // Feature 6 (replies): a reply is the Quick-questions channel — NO ticket number, NO arrival
  // notif, never changes status/iteration. Roots still get a per-day ticket serial.
  const ticket = isReply ? '' : await nextTicket(kv, nowIso);
  // copy-fix mirrors its newText into legacy `changeTo` so v2-era rendering + genPrompt keep working.
  const changeTo = commentType === 'copy-fix' && templateFields.newText
    ? String(templateFields.newText).slice(0, 4000)
    : (b.changeTo ? String(b.changeTo).slice(0, 4000) : '');
  // Server-render the one-line summary when the client omits it (§3).
  const summary = (b.summary ? String(b.summary) : renderSummary(commentType, templateFields, comment)).slice(0, 300);
  const rec = {
    id: crypto.randomUUID(),
    ticket,                       // '' for a reply; YYMMDD + 4-digit serial for a root
    createdAt: nowIso,
    teamStatus: 'to_be_initiated', teamStatusAt: '',
    iteration: 1,
    reopenReason: '', reopenNote: '',
    history: [{ status: 'to_be_initiated', at: nowIso, event: 'created', iteration: 1 }],
    parentId: b.parentId || null,
    sessionId: b.sessionId ? String(b.sessionId).slice(0, 64) : '',
    team: b.team ? String(b.team).slice(0, 40) : '',
    toTeam: b.toTeam ? String(b.toTeam).slice(0, 40) : '',
    name: String(b.name || 'anonymous').slice(0, 80),
    comment: comment.slice(0, 4000),
    changeTo,
    // v3 structured fields (Feature 1/8/2/4) — all default when missing
    commentType,
    templateFields,
    summary,
    expectedOutcome,
    batchId: b.batchId ? String(b.batchId).slice(0, 64) : '',   // groups one Submit-all (Feature 2)
    imageId: b.imageId ? String(b.imageId).slice(0, 64) : '',   // screenshot ref (Feature 4)
    aiPrompt: '',
    page: {
      path,
      url: (b.page && b.page.url) || '',
      title: (b.page && b.page.title) || '',
      slug: (b.page && b.page.slug) || 'page',
    },
    anchor: b.anchor || {},
  };
  const key = keyFor(path);
  const arr = JSON.parse((await kv.get(key)) || '[]');
  arr.push(rec);
  await kv.put(key, JSON.stringify(arr));
  if (!isReply) {
    // AI change-prompt in the background so it's ready in seconds.
    ctx.waitUntil(genPrompt(env, kv, keyFor, rec));
    // Arrival notification for the DIRECTED team (real team only — Builder/admin sees all).
    if (rec.toTeam && TEAM_KEYS[rec.toTeam]) ctx.waitUntil(fireArrivalNotif(kv, NOTIF_KEY, rec));
    // Rollup event for Insights (Feature 12) — only real tickets, not replies.
    ctx.waitUntil(appendRollup(kv, METRICS_KEY, {
      at: nowIso, event: 'created', page: path, commentType, iteration: 1,
    }));
  } else {
    // Feature 6: a reply fires a kind:'reply' notif to the OTHER side, coalesced 5s. The
    // target flips on who replied: the raiser's reply notifies the receiver (toTeam), the
    // receiver's reply notifies the raiser (team). Resolved off the reply's root record.
    const root = arr.find((r) => r.id === rec.parentId) || null;
    if (root) {
      const raiser = root.team || '';
      const target = (rec.team || '') === raiser ? (root.toTeam || '') : (root.team || '');
      if (target) {
        ctx.waitUntil(pushReplyNotif(kv, NOTIF_KEY, {
          chainId: root.parentId || root.id, commentId: rec.id, ticket: root.ticket || '',
          team: target, fromTeam: rec.team || '',
          path, pageName: pageNameOf(rec),
          summary: `New reply ${root.ticket ? '#' + root.ticket + ' ' : ''}on ${pageNameOf(rec)}` + (rec.team ? ` from ${rec.team}` : ''),
        }));
      }
    }
  }
  return { ok: true, rec };
}

// Whitelist + cap the per-type template fields (Feature 1, §3). Unknown types / keys collapse
// to {}; each value is coerced to a capped string. currentImage/currentUrl are client-auto-filled.
function sanitizeTemplateFields(commentType, tf) {
  const keys = TYPE_FIELD_KEYS[commentType] || [];
  const src = tf && typeof tf === 'object' ? tf : {};
  const out = {};
  for (const k of keys) {
    if (src[k] !== undefined && src[k] !== null) out[k] = String(src[k]).slice(0, 4000);
  }
  return out;
}

// Server-rendered one-line summary when the client omits it (§3). Plain text, no markup.
function renderSummary(commentType, tf, comment) {
  tf = tf || {};
  if (commentType === 'copy-fix') return `${tf.currentText || ''} → ${tf.newText || ''}`.trim();
  if (commentType === 'link-fix') return `${tf.currentUrl || ''} → ${tf.newUrl || ''}`.trim();
  if (commentType === 'image-swap') return `swap ${tf.currentImage || 'image'}: ${tf.replacementDesc || ''}`.trim();
  if (commentType === 'layout-tweak') return String(tf.whatToChange || '').trim();
  return String(comment || '').slice(0, 80);
}

// Feature 11: sanitise a saved-views set — cap the list length + each view's name; keep
// `filters` as an opaque object (the client owns its shape).
function sanitizeViews(views) {
  if (!Array.isArray(views)) return [];
  return views.slice(0, 50).map((v) => ({
    name: String((v && v.name) || '').slice(0, 80),
    filters: v && typeof v.filters === 'object' && v.filters ? v.filters : {},
  }));
}

// Feature 6: coalesced (5s) reply notification to the OTHER side. Mirrors pushStatusNotif's
// debounce so a burst of quick questions collapses to one card; keyed by chainId + team on
// kind:'reply'. Never changes status/iteration — it is the Quick-questions channel.
async function pushReplyNotif(kv, NOTIF_KEY, info) {
  try {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const all = JSON.parse((await kv.get(NOTIF_KEY)) || '[]');
    let latest = null;
    for (const n of all) {
      if (n.kind !== 'reply') continue;
      if (n.chainId !== info.chainId || n.team !== info.team) continue;
      if (!latest || (n.updatedAt || n.createdAt) > (latest.updatedAt || latest.createdAt)) latest = n;
    }
    const within = latest && (now - Date.parse(latest.updatedAt || latest.createdAt)) < DEBOUNCE_MS;
    if (within) {
      latest.updatedAt = nowIso;
      latest.commentId = info.commentId;
      latest.ticket = info.ticket || '';
      latest.fromTeam = info.fromTeam || '';
      latest.path = info.path || '/';
      latest.pageName = info.pageName || 'a page';
      latest.summary = info.summary || '';
      latest.readTeam = false;
      latest.readAdmin = false;
    } else {
      all.push({
        id: crypto.randomUUID(),
        createdAt: nowIso,
        updatedAt: nowIso,
        team: info.team,             // who should see it (the OTHER side)
        kind: 'reply',
        chainId: info.chainId,       // the origin root id — coalescing key
        commentId: info.commentId,   // the reply record
        ticket: info.ticket || '',
        fromTeam: info.fromTeam || '',
        path: info.path || '/',
        pageName: info.pageName || 'a page',
        summary: info.summary || '',
        readTeam: false,
        readAdmin: false,
      });
    }
    await kv.put(NOTIF_KEY, JSON.stringify(all));
  } catch (e) { /* best-effort; a missed reply notif never blocks the write */ }
}

// Feature 12: append one rollup event to the `metrics` key (read-modify-write, non-atomic,
// matching the store's posture). FIFO-capped at METRICS_CAP so the key stays bounded. Metrics
// compute from this instead of scanning every page: key. Best-effort — a dropped event only
// slightly skews aggregates, never blocks the state change.
async function appendRollup(kv, METRICS_KEY, event) {
  try {
    const arr = JSON.parse((await kv.get(METRICS_KEY)) || '[]');
    arr.push({
      at: event.at || new Date().toISOString(),
      event: event.event || '',
      page: event.page || '/',
      commentType: event.commentType || 'general',
      iteration: event.iteration || 1,
    });
    if (arr.length > METRICS_CAP) arr.splice(0, arr.length - METRICS_CAP);
    await kv.put(METRICS_KEY, JSON.stringify(arr));
  } catch (e) { /* best-effort */ }
}

// Return the rollup events array. Prefer the maintained `metrics` key; when it is absent
// (never written yet, or a store that predates v3) derive the same events by scanning every
// record's history[] — the documented one-time full-scan fallback. Replies (parentId set with
// no ticket) carry no metric-worthy history and are skipped.
async function metricsEvents(kv, METRICS_KEY) {
  const raw = await kv.get(METRICS_KEY);
  if (raw) {
    try { const a = JSON.parse(raw); if (Array.isArray(a)) return a; } catch (e) {}
  }
  const out = [];
  const all = await readAll(kv);
  for (const r of all) {
    if (r.parentId && !r.ticket) continue;   // a reply — not a ticket
    const hist = Array.isArray(r.history) ? r.history : [];
    const page = (r.page && r.page.path) || '/';
    const ct = r.commentType || 'general';
    for (const h of hist) {
      out.push({ at: h.at || r.createdAt, event: h.event || '', page, commentType: ct, iteration: h.iteration || r.iteration || 1 });
    }
  }
  out.sort((a, b) => (a.at < b.at ? -1 : 1));
  return out;
}

// Compute the five aggregates (Feature 12) from the events array, optionally windowed by
// [from,to] (ISO). Deterministic + dependency-free.
//   deployedPerPage  : # of deploys (team-complete) per page
//   volumeByType     : # of created tickets per commentType
//   avgHoursToDeploy : mean hours created->deploy, global + per page (FIFO-paired per page)
//   reopenRate       : team-reopen count / created count, global + per commentType
//   openTrend        : per-day open count = cumulative(created+resubmitted) - cumulative(deploys)
function computeMetrics(events, from, to) {
  const evs = (Array.isArray(events) ? events : [])
    .filter((e) => e && e.at && (!from || e.at >= from) && (!to || e.at <= to))
    .slice()
    .sort((a, b) => (a.at < b.at ? -1 : 1));

  const deployedPerPage = {};
  const volumeByType = {};
  const reopenByType = {};
  let createdTotal = 0, reopenTotal = 0;
  const pendingByPage = {};   // page -> FIFO queue of open timestamps, paired off on deploy
  const deployDeltas = [];    // hours, global
  const perPageDeltas = {};   // page -> [hours]
  const byDay = {};           // date -> { opened, deployed }

  for (const e of evs) {
    const page = e.page || '/';
    const ct = e.commentType || 'general';
    const day = String(e.at).slice(0, 10);
    if (!byDay[day]) byDay[day] = { opened: 0, deployed: 0 };
    if (e.event === 'created' || e.event === 'resubmitted') {
      if (e.event === 'created') { createdTotal++; volumeByType[ct] = (volumeByType[ct] || 0) + 1; }
      (pendingByPage[page] || (pendingByPage[page] = [])).push(e.at);
      byDay[day].opened++;
    } else if (e.event === 'team-complete') {
      deployedPerPage[page] = (deployedPerPage[page] || 0) + 1;
      byDay[day].deployed++;
      const q = pendingByPage[page];
      if (q && q.length) {
        const startAt = q.shift();
        const hours = (Date.parse(e.at) - Date.parse(startAt)) / 3600000;
        if (isFinite(hours) && hours >= 0) {
          deployDeltas.push(hours);
          (perPageDeltas[page] || (perPageDeltas[page] = [])).push(hours);
        }
      }
    } else if (e.event === 'team-reopen') {
      reopenTotal++;
      reopenByType[ct] = (reopenByType[ct] || 0) + 1;
    }
  }

  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const round2 = (n) => Math.round(n * 100) / 100;

  const avgPerPage = {};
  for (const p of Object.keys(perPageDeltas)) avgPerPage[p] = round2(mean(perPageDeltas[p]));

  const reopenPerType = {};
  for (const t of Object.keys(volumeByType)) reopenPerType[t] = volumeByType[t] ? round2((reopenByType[t] || 0) / volumeByType[t]) : 0;
  for (const t of Object.keys(reopenByType)) if (reopenPerType[t] === undefined) reopenPerType[t] = 0;

  let openRunning = 0;
  const openTrend = Object.keys(byDay).sort().map((d) => {
    openRunning += byDay[d].opened - byDay[d].deployed;
    return { date: d, count: openRunning };
  });

  return {
    deployedPerPage,
    volumeByType,
    avgHoursToDeploy: { global: round2(mean(deployDeltas)), perPage: avgPerPage },
    reopenRate: { global: createdTotal ? round2(reopenTotal / createdTotal) : 0, perType: reopenPerType },
    openTrend,
  };
}
