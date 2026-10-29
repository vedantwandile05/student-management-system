const express = require('express');

const PORT = process.env.PORT || 5001;
const TIMEOUT_MS = 15000; // Render free/starter instances can take a few seconds to wake

const strip = (url) => (url || '').trim().replace(/\/$/, '');

/* ---------- What to check (set the URLs as environment variables) ---------- */
const TARGETS = [
  { name: 'Frontend (Netlify)', url: strip(process.env.FRONTEND_URL), path: '/' },
  { name: 'Backend API (Render)', url: strip(process.env.API_BASE_URL), path: '/health', db: true },
  { name: 'MCP Server (Render)', url: strip(process.env.MCP_URL), path: '/health' },
  { name: 'Reports Service (Render)', url: strip(process.env.REPORTS_URL), path: '/health' }
].filter((t) => t.url);

async function check(target) {
  const started = Date.now();
  const result = { name: target.name, ok: false, detail: '', ms: 0 };
  try {
    const res = await fetch(target.url + target.path, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow'
    });
    result.ms = Date.now() - started;
    result.ok = res.ok;
    result.detail = `HTTP ${res.status}`;

    // The backend /health also reports MongoDB Atlas status: surface it as its own row.
    if (target.db) {
      const body = await res.json().catch(() => ({}));
      const dbUp = body.database === 'connected';
      return [
        result,
        {
          name: 'Database (MongoDB Atlas)',
          ok: dbUp,
          detail: body.database ? String(body.database) : 'unknown',
          ms: result.ms
        }
      ];
    }
  } catch (err) {
    result.ms = Date.now() - started;
    result.detail = err.name === 'TimeoutError' ? 'Timed out' : 'Unreachable';
    if (target.db) {
      return [result, { name: 'Database (MongoDB Atlas)', ok: false, detail: 'Unknown (API down)', ms: 0 }];
    }
  }
  return [result];
}

async function runChecks() {
  const groups = await Promise.all(TARGETS.map(check));
  const services = groups.flat();
  return {
    checkedAt: new Date().toISOString(),
    allSuccessful: services.length > 0 && services.every((s) => s.ok),
    services
  };
}

/* ---------- Page (all dynamic text is inserted with textContent) ---------- */
const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>System Status</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --text:#1c2430; --muted:#667085; --ok:#12805c; --okbg:#e3f6ee; --bad:#b42318; --badbg:#fdeceb; --line:#e4e7ec; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1319; --card:#171c24; --text:#e8ecf2; --muted:#98a2b3; --ok:#4ade9f; --okbg:#10291f; --bad:#f97066; --badbg:#2e1513; --line:#262d38; } }
  * { box-sizing:border-box; }
  body { margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--text); }
  main { max-width:720px; margin:0 auto; padding:32px 16px 48px; }
  h1 { font-size:1.5rem; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:.9rem; margin-bottom:20px; }
  .banner { padding:16px 18px; border-radius:12px; font-weight:600; margin-bottom:20px; background:var(--card); border:1px solid var(--line); }
  .banner.ok { background:var(--okbg); color:var(--ok); border-color:transparent; }
  .banner.bad { background:var(--badbg); color:var(--bad); border-color:transparent; }
  .row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; background:var(--card); border:1px solid var(--line); border-radius:12px; margin-bottom:10px; }
  .name { font-weight:600; }
  .detail { color:var(--muted); font-size:.85rem; margin-top:2px; }
  .badge { padding:4px 12px; border-radius:999px; font-size:.85rem; font-weight:600; white-space:nowrap; }
  .badge.ok { background:var(--okbg); color:var(--ok); }
  .badge.bad { background:var(--badbg); color:var(--bad); }
  button { font:inherit; padding:8px 14px; border-radius:8px; border:1px solid var(--line); background:var(--card); color:var(--text); cursor:pointer; }
</style>
</head>
<body>
<main>
  <h1>System Status</h1>
  <div class="sub" id="sub">Checking services…</div>
  <div class="banner" id="banner">Checking…</div>
  <div id="list"></div>
  <button id="refresh" type="button">Refresh now</button>
</main>
<script>
  const banner = document.getElementById('banner');
  const list = document.getElementById('list');
  const sub = document.getElementById('sub');

  function row(s) {
    const el = document.createElement('div');
    el.className = 'row';
    const left = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = s.name;
    const detail = document.createElement('div');
    detail.className = 'detail';
    detail.textContent = s.detail + (s.ms ? ' \u00b7 ' + s.ms + ' ms' : '');
    left.append(name, detail);
    const badge = document.createElement('span');
    badge.className = 'badge ' + (s.ok ? 'ok' : 'bad');
    badge.textContent = s.ok ? '\u2714 Successful' : '\u2716 Failed';
    el.append(left, badge);
    return el;
  }

  async function load() {
    banner.className = 'banner';
    banner.textContent = 'Checking\u2026';
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      list.replaceChildren(...data.services.map(row));
      if (!data.services.length) {
        banner.textContent = 'No services configured. Set the URL environment variables.';
      } else if (data.allSuccessful) {
        banner.className = 'banner ok';
        banner.textContent = '\u2714 All systems successful';
      } else {
        banner.className = 'banner bad';
        banner.textContent = '\u2716 One or more services failed';
      }
      sub.textContent = 'Last checked ' + new Date(data.checkedAt).toLocaleString();
    } catch (e) {
      banner.className = 'banner bad';
      banner.textContent = 'Could not load status';
    }
  }

  document.getElementById('refresh').addEventListener('click', load);
  load();
  setInterval(load, 60000);
</script>
</body>
</html>`;

/* ---------- Server ---------- */
const app = express();
app.disable('x-powered-by');

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/status', async (req, res) => res.json(await runChecks()));
app.get('/', (req, res) => res.type('html').send(PAGE));

app.listen(PORT, () => console.log(`Status service on port ${PORT}, monitoring ${TARGETS.length} target(s)`));
