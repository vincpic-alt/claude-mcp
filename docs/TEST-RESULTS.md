# Verification record

Date: 2026-09-23
Runtime: Node.js 24.x
Package version: 0.2.0

## Automated suite

Command: `npm test`

Result: **20 passed**, **0 failed**, **1 skipped** (SDK interop unless `RUN_SDK_TESTS=1`)

Also: `npm run lint` and `npm run build` — pass (`node --check` on all modules).

Coverage includes:

- OAuth discovery, DCR redirect allowlist, consent CSRF, deny path
- Authorization code exchange, PKCE failure, code replay, expired code
- Refresh rotation / replay-family revocation, invalid refresh
- Token revocation, grant disconnect, expired access
- MCP initialize, tools/list (6 tools), tools/call for all tools
- Scope enforcement and invalid tool arguments (including injected user_id)
- Backend ownership filters, get_call / search_calls / date filters
- External transcript URL fetch blocking
- `configFromEnv` fail-fast and required Claude callback URI
- SQLite hashed-token persistence

## Not verified in this environment

Real Supabase login/schema/RLS, production DNS/TLS/Nginx, live Claude Desktop/Cowork, Anthropic submission/approval, frontend TypeScript production build of consent UI.
