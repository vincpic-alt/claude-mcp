# Anthropic directory submission — draft, not submitted

Checked against official documentation (see Claude connector auth / submission docs). This file is a **preparation package only**.

**Do not claim Anthropic has approved or listed this connector.**

## Connector identity

| Field | Value |
|-------|--------|
| Connector name | Callin |
| Company / provider | **OWNER_TO_PROVIDE** (legal entity that owns Callin) |
| MCP URL | `https://claude-mcp.callin.io/mcp` |
| Website | `https://callin.io` (confirm) |
| Support URL / email | **OWNER_TO_PROVIDE** |
| Privacy policy URL | **OWNER_TO_PROVIDE** (must cover connector + call data) |
| Terms URL | **OWNER_TO_PROVIDE** |
| Documentation / setup URL | **OWNER_TO_PROVIDE** (or point to your help center once published) |

## Listing text

**Tagline:** Explore your voice agents, calls, and transcripts

**Description:** Connect Claude to your Callin account to review voice agents, explore recent inbound and outbound call history, and read call transcripts. Ask natural-language questions about your own call records and use Claude to summarize available transcript text. The connector requests read-only access and cannot place calls, change agent settings, or update billing. A Callin account with existing agents or calls is required. Callin hosts the connector and you can revoke access from Callin at any time.

**Primary use cases:**

- Review your voice agents and their basic settings.
- Find recent inbound or outbound calls.
- Read and summarize an existing call transcript.

## Authentication

- OAuth 2.0 authorization code + S256 PKCE
- Dynamic Client Registration (`oauth_dcr`) with exact redirect allowlist
- Required Claude callback: `https://claude.ai/api/mcp/auth_callback`
- Consent UI on `https://app.callin.io/mcp/authorize`
- Scopes: `account:read`, `agents:read`, `calls:read`, `transcripts:read`, optional `offline_access`

## Transport

Streamable HTTP, universal URL: `https://claude-mcp.callin.io/mcp`

## Tools exposed

1. `list_agents` — list owned agents (filters: type, language, agent_type)
2. `get_agent` — agent metadata by `agentId`
3. `list_calls` — call history (filters: direction, status, agentId, dates; bounded limit)
4. `get_call` — call metadata by `callId`
5. `get_call_transcript` — transcript by `callId` (ownership enforced)
6. `search_calls` — structured search (contact number, agent, status, dates)

All tools are read-only. No outbound calling, agent edits, billing, or account mutation.

## Data access

Reads only rows owned by the OAuth-authenticated Callin user (`ai_agents.user_id` / `calls.user_id`). Transcripts and contact phone numbers may be returned. Treat transcript text as untrusted customer data.

## Icon

Source logo: `assets/callin-logo-source.png`. Export a final asset matching Anthropic's current portal requirements (**OWNER_TO_PROVIDE** final file).

## Reviewer test account

**OWNER_TO_PROVIDE:**

- Synthetic agent + at least one completed call with transcript
- Credentials shared only through Anthropic's secure process
- Instructions for expected prompts in `docs/CLAUDE-TESTING.md`

## Installation instructions (for listing)

1. Open Claude → Settings → Connectors  
2. Add custom connector → `https://claude-mcp.callin.io/mcp`  
3. Sign in to Callin and click **Allow**  
4. Ask Claude about your agents or calls  

## Submission steps

1. Complete production deploy + `docs/CLAUDE-TESTING.md` gates.  
2. Fill every **OWNER_TO_PROVIDE** field with real URLs/contacts.  
3. Open Anthropic's official connector submission portal with Team/Enterprise directory permissions.  
4. Connect the live HTTPS MCP URL; confirm all six tools sync.  
5. Enter listing text, OAuth/DCR settings, privacy/support/docs URLs, icon, reviewer account.  
6. Submit and track the submission ID. Do not mark `approved` until Anthropic confirms.

Approval timeline is not guaranteed.
