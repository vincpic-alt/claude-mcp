/** Central config for Callin ↔ Claude MCP connector (no secrets). */

const AGENTS_MD_URL = 'https://callin.io/agents.md';
const CLAUDE_APP_URL = 'https://claude.ai';
const AUTH_REDIRECT_KEY = 'callin_auth_redirect';

function normalizeOrigin(raw: string | undefined): string | null {
  const value = (raw || '').trim().replace(/\/$/, '');
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.origin !== value) return null;
    return value;
  } catch {
    return null;
  }
}

/** MCP server origin from env, e.g. https://claude-mcp.callin.io — no trailing slash. */
export function getMcpOrigin(): string | null {
  return normalizeOrigin(import.meta.env.VITE_MCP_ORIGIN);
}

/** Public Streamable HTTP MCP URL Claude should connect to. */
export function getMcpConnectorUrl(): string | null {
  const origin = getMcpOrigin();
  return origin ? `${origin}/mcp` : null;
}

export function getClaudeAgentsDocUrl(): string {
  return AGENTS_MD_URL;
}

export function getClaudeAppUrl(): string {
  return CLAUDE_APP_URL;
}

/** Allow only same-app relative redirects (no open redirects). */
export function getSafeInternalRedirect(candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null;
  const path = candidate.trim();
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  if (path.includes('://')) return null;
  return path;
}

/** Stash a safe post-auth path before external IdP redirects (e.g. Google). */
export function stashAuthRedirect(candidate: unknown): void {
  const path = getSafeInternalRedirect(candidate);
  if (!path) return;
  try {
    sessionStorage.setItem(AUTH_REDIRECT_KEY, path);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Read and clear a previously stashed post-auth path. */
export function consumeAuthRedirect(): string | null {
  try {
    const path = getSafeInternalRedirect(sessionStorage.getItem(AUTH_REDIRECT_KEY));
    sessionStorage.removeItem(AUTH_REDIRECT_KEY);
    return path;
  } catch {
    return null;
  }
}

export type ClaudeIntegrationStatus = {
  connected: boolean;
  scopes: string[];
};

/**
 * Ask the MCP service whether this Callin account has active Claude OAuth grants.
 * Uses the user's Supabase access token — never stores connector tokens in the browser.
 */
export async function fetchClaudeIntegrationStatus(
  accessToken: string
): Promise<ClaudeIntegrationStatus> {
  const origin = getMcpOrigin();
  if (!origin) {
    return { connected: false, scopes: [] };
  }
  const r = await fetch(`${origin}/api/integration/status`, {
    method: 'GET',
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) {
    throw new Error('status_unavailable');
  }
  const data = (await r.json()) as { connected?: unknown; scopes?: unknown };
  return {
    connected: data.connected === true,
    scopes: Array.isArray(data.scopes)
      ? data.scopes.filter((s): s is string => typeof s === 'string')
      : [],
  };
}

/** Revoke all MCP OAuth grants for the signed-in Callin user. */
export async function disconnectClaudeIntegration(accessToken: string): Promise<void> {
  const origin = getMcpOrigin();
  if (!origin) throw new Error('missing_origin');
  const r = await fetch(`${origin}/oauth/disconnect`, {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error('disconnect_failed');
}
