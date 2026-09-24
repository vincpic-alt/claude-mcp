# Callin MCP Connector

Isolated remote MCP service for Claude ↔ Callin (read-only). Runs as its own Node process so failures cannot take down `app.callin.io`, `api.callin.io`, or the LiveKit worker.

**Not deployed / not Anthropic-approved by default.** This package does not bundle production secrets.

## Architecture

| Host | Role |
|------|------|
| `app.callin.io` | Callin frontend + `/mcp/authorize` consent UI |
| `api.callin.io` | Existing Express API (unchanged) |
| `claude-mcp.callin.io` | This MCP + OAuth service → `127.0.0.1:3100` |

Data access uses server-side Supabase (service role) with an **immutable `user_id` filter** taken from the OAuth grant — never from Claude tool arguments.

### Tools (v1, read-only)

| Tool | Scope |
|------|--------|
| `list_agents` | `agents:read` |
| `get_agent` | `agents:read` |
| `list_calls` | `calls:read` |
| `get_call` | `calls:read` |
| `search_calls` | `calls:read` |
| `get_call_transcript` | `transcripts:read` |

Scopes also include `account:read` and optional `offline_access` (refresh).

Schema verified against Callin `ai_agents` / `calls` (`user_id`, `transcription_url`, `contact_number`, `direction`, `status`, `agent_id`, …).

---

## Local development

Requires **Node.js 24+** (`node:sqlite`). No npm dependencies for production runtime.

```bash
# From the repo root (d:\claude-mcp or /opt/callin-mcp on the server)
cp .env.example .env
mkdir data   # Windows: mkdir data
# Edit .env — for local HTTP use:
#   NODE_ENV=development
#   MCP_PUBLIC_URL=http://127.0.0.1:3100
#   CALLIN_APP_ORIGIN=http://localhost:5173   # or your Vite origin
#   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
npm test
npm run lint
npm start
```

Verify:

```bash
curl http://127.0.0.1:3100/healthz
curl http://127.0.0.1:3100/.well-known/oauth-authorization-server
curl http://127.0.0.1:3100/.well-known/oauth-protected-resource/mcp
```

MCP endpoint: `http://127.0.0.1:3100/mcp` (requires Bearer token; unauthenticated POST returns `401` + `WWW-Authenticate`).

### Frontend consent page

```bash
python frontend/install.py /absolute/path/to/Callin.io-Team
```

Or apply `frontend/integration.patch` and copy `frontend/McpAuthorize.tsx` to `src/pages/McpAuthorize.tsx`.

Add to the frontend env:

```bash
VITE_MCP_ORIGIN=https://claude-mcp.callin.io   # or http://127.0.0.1:3100 locally
```

Rebuild/redeploy the Callin frontend. Keep `/mcp/authorize` public (signed-out users must reach it, then sign in via `/signin` in another tab).

---

## Production (Ubuntu + PM2 + Nginx)

Callin already uses PM2 (`ExpressJs-API-production`, `LiveKit-Worker-production`). MCP is a separate process: `Callin-MCP-production`.

### 1. Deploy code

```bash
sudo mkdir -p /opt/callin-mcp /var/lib/callin-mcp /var/log/callin-mcp /etc
sudo useradd --system --home /var/lib/callin-mcp --shell /usr/sbin/nologin callin-mcp || true
# upload/copy this package to /opt/callin-mcp
sudo chown -R callin-mcp:callin-mcp /opt/callin-mcp /var/lib/callin-mcp /var/log/callin-mcp
```

### 2. Environment

```bash
sudo cp /opt/callin-mcp/.env.example /etc/callin-mcp.env
sudo chmod 600 /etc/callin-mcp.env
sudo chown root:callin-mcp /etc/callin-mcp.env
# edit /etc/callin-mcp.env — set MCP_PUBLIC_URL=https://claude-mcp.callin.io,
# CALLIN_APP_ORIGIN=https://app.callin.io, Supabase keys,
# MCP_DB_PATH=/var/lib/callin-mcp/oauth.sqlite
```

### 3. Start with PM2

```bash
cd /opt/callin-mcp
# Load env into the process (pick one approach):
set -a; source /etc/callin-mcp.env; set +a
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # once per server
```

Or use the systemd unit in `deploy/callin-mcp.service` if you prefer systemd over PM2.

### 4. Nginx + TLS

```bash
sudo cp /opt/callin-mcp/deploy/nginx.conf.example /etc/nginx/sites-available/claude-mcp.callin.io
sudo ln -sf /etc/nginx/sites-available/claude-mcp.callin.io /etc/nginx/sites-enabled/
sudo certbot --nginx -d claude-mcp.callin.io   # or install certs another way
sudo nginx -t && sudo systemctl reload nginx
```

Do **not** change `app.callin.io` / `api.callin.io` blocks unless required.

### 5. Verify

```bash
curl -sS https://claude-mcp.callin.io/healthz
curl -sS https://claude-mcp.callin.io/.well-known/oauth-authorization-server
curl -sS https://claude-mcp.callin.io/.well-known/oauth-protected-resource/mcp
curl -sS -o /dev/null -w "%{http_code}\n" -X POST https://claude-mcp.callin.io/mcp \
  -H "Content-Type: application/json" -d '{}'
# expect 401
pm2 logs Callin-MCP-production --lines 100
```

---

## Connect in Claude

1. Claude → **Settings → Connectors** → add custom connector  
2. URL: `https://claude-mcp.callin.io/mcp`  
3. Complete Callin sign-in + **Allow** on the consent screen  
4. Try prompts in `docs/CLAUDE-TESTING.md`

OAuth callback supported: `https://claude.ai/api/mcp/auth_callback` (exact URI; no wildcards).

---

## Tests

```bash
npm test
npm run lint
npm run build
# optional SDK interop:
npm install --no-save --package-lock=false @modelcontextprotocol/sdk@1.30.0
RUN_SDK_TESTS=1 npm test
```

---

## Anthropic directory submission

See `docs/SUBMISSION.md` and `docs/submission-draft.json`. Nothing is submitted or approved until you complete those steps manually.
