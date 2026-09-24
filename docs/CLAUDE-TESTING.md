# Live acceptance test — pending

Record tester, date, actual URLs, app version, account, and outcome for every step. Use populated test accounts with synthetic data, including one agent and a transcript-bearing call per account. Never place real customer data in review credentials or screenshots.

## Infrastructure

1. Confirm `https://claude-mcp.callin.io/healthz` returns `{"status":"ok","service":"callin-mcp",...}`.
2. Confirm OAuth metadata:
   - `https://claude-mcp.callin.io/.well-known/oauth-authorization-server`
   - `https://claude-mcp.callin.io/.well-known/oauth-protected-resource`
   - `https://claude-mcp.callin.io/.well-known/oauth-protected-resource/mcp`
3. POST `/mcp` without a token; expect `401` and `WWW-Authenticate` with the correct `resource_metadata` URL.
4. Confirm PM2 process `Callin-MCP-production` is online and independent of `ExpressJs-API-production` / `LiveKit-Worker-production`.

## Claude connection

5. In Claude Settings → Connectors, add custom connector URL: `https://claude-mcp.callin.io/mcp`. No API key.
6. Confirm redirect to Callin consent (`/mcp/authorize`), account identity, permissions (View agents / View calls / View call transcripts), Allow / Cancel.
7. Test signed-out → Sign in to Callin → return to consent tab → Allow. Test deny once, then reconnect and allow.

## Prompt checklist (tool selection)

| # | Prompt | Expected tools |
|---|--------|----------------|
| 1 | Show my Callin agents. | `list_agents` |
| 2 | Show my latest 10 calls. | `list_calls` (limit 10) |
| 3 | Show my latest inbound calls. | `list_calls` (direction=inbound) |
| 4 | Give me the details of my latest call. | `list_calls` then `get_call` |
| 5 | Show the transcript of my latest call. | `list_calls` then `get_call_transcript` |
| 6 | Summarize my latest customer call. | transcript tool + model summary |
| 7 | Find calls made by agent X today. | `search_calls` / `list_calls` with agent + date |

8. Verify results against Callin UI. Connect a second account and attempt to retrieve the first account's UUIDs; expect not found / empty.
9. Wait beyond the 15-minute access-token lifetime; confirm refresh works without another sign-in.
10. Disconnect in Claude and/or use Callin's “Disconnect all Callin MCP connections”; confirm old tokens fail.
11. Retest in Claude Desktop / Cowork if available.

Release gates: schema/ownership review, two-account isolation, all six live tools, end-to-end login, refresh, revocation, browser consent, public docs/privacy/support, populated reviewer account.
