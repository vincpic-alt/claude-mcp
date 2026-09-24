import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, hash, random } from '../src/store.js';
import { createApp, configFromEnv } from '../src/server.js';
import { Backend } from '../src/backend.js';
import { tools, validate } from '../src/tools.js';

const userId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const TOOL_NAMES = [
  'list_agents',
  'get_agent',
  'list_calls',
  'get_call',
  'get_call_transcript',
  'search_calls',
];

async function setup(t, { scope = 'account:read agents:read calls:read transcripts:read offline_access' } = {}) {
  const store = new Store(':memory:');
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((r) => reservation.close(r));
  const config = {
    issuer: `http://127.0.0.1:${port}`,
    appOrigin: 'https://app.callin.test',
    redirects: ['https://claude.ai/api/mcp/auth_callback'],
  };
  const { server } = createApp(config, {
    store,
    backend: {
      user: async (token) => {
        assert.equal(token, 'supabase-user-token');
        return { id: userId };
      },
      run: async (name, args, uid) => ({ name, args, userId: uid }),
    },
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  const resource = config.issuer + '/mcp';
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  });
  const call = async (path, { method = 'GET', data, headers = {}, redirect = 'follow' } = {}) => {
    const r = await fetch(config.issuer + path, {
      method,
      headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: data ? JSON.stringify(data) : undefined,
      redirect,
    });
    const text = await r.text();
    return { status: r.status, headers: r.headers, data: text ? JSON.parse(text) : null };
  };
  const c = await call('/oauth/register', {
    method: 'POST',
    data: { client_name: 'Claude', redirect_uris: config.redirects },
  });
  assert.equal(c.status, 201);
  const client_id = c.data.client_id;
  const verifier = random();
  async function authorize(approve = true) {
    const q = new URLSearchParams({
      client_id,
      redirect_uri: config.redirects[0],
      response_type: 'code',
      code_challenge_method: 'S256',
      code_challenge: hash(verifier),
      resource,
      state: 'test-state',
      scope,
    });
    const r = await call('/oauth/authorize?' + q, { redirect: 'manual' });
    assert.equal(r.status, 302);
    const request = new URL(r.headers.get('location')).searchParams.get('request');
    const cookie = r.headers.get('set-cookie').split(';')[0];
    return {
      request,
      cookie,
      finish: () =>
        call('/oauth/consent', {
          method: 'POST',
          data: { request, approve },
          headers: {
            Origin: config.appOrigin,
            Cookie: cookie,
            Authorization: 'Bearer supabase-user-token',
          },
        }),
    };
  }
  async function login() {
    const a = await authorize();
    const consent = await a.finish();
    assert.equal(consent.status, 200);
    const callback = new URL(consent.data.redirect);
    assert.equal(callback.searchParams.get('state'), 'test-state');
    const code = callback.searchParams.get('code');
    const tokenData = {
      client_id,
      resource,
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: config.redirects[0],
    };
    const result = await call('/oauth/token', { method: 'POST', data: tokenData });
    assert.equal(result.status, 200);
    return { ...result.data, tokenData };
  }
  const rpc = (token, method, params = {}) =>
    call('/mcp', {
      method: 'POST',
      data: { jsonrpc: '2.0', id: 1, method, params },
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-11-25',
      },
    });
  return { store, call, config, resource, client_id, authorize, login, rpc };
}

function toolArgs(name) {
  if (name === 'get_agent') return { agentId: userId };
  if (name === 'get_call' || name === 'get_call_transcript') return { callId: userId };
  return {};
}

test('OAuth consent -> token -> MCP initialize, tools/list, all tools', async (t) => {
  const f = await setup(t);
  const tokens = await f.login();
  assert.ok(tokens.refresh_token);
  const init = await f.rpc(tokens.access_token, 'initialize', { protocolVersion: '2025-11-25' });
  assert.equal(init.data.result.serverInfo.name, 'callin');
  const list = await f.rpc(tokens.access_token, 'tools/list');
  assert.equal(list.data.result.tools.length, 6);
  assert.deepEqual(
    list.data.result.tools.map((x) => x.name).sort(),
    [...TOOL_NAMES].sort()
  );
  for (const tool of list.data.result.tools) {
    assert.ok(tool.title);
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.ok(!('scope' in tool));
    const result = await f.rpc(tokens.access_token, 'tools/call', {
      name: tool.name,
      arguments: toolArgs(tool.name),
    });
    assert.equal(result.data.result.isError, false);
    assert.equal(JSON.parse(result.data.result.content[0].text).userId, userId);
  }
});

test('healthz and discovery endpoints', async (t) => {
  const f = await setup(t);
  const h = await f.call('/healthz');
  assert.equal(h.status, 200);
  assert.equal(h.data.service, 'callin-mcp');
  assert.equal(h.data.status, 'ok');
  const m = await f.call('/.well-known/oauth-authorization-server');
  assert.deepEqual(m.data.code_challenge_methods_supported, ['S256']);
  assert.ok(m.data.scopes_supported.includes('account:read'));
  const p = await f.call('/.well-known/oauth-protected-resource/mcp');
  assert.equal(p.data.resource, f.resource);
});

test('discovery and authentication challenge', async (t) => {
  const f = await setup(t);
  const r = await f.call('/mcp', { method: 'POST', data: {} });
  assert.equal(r.status, 401);
  assert.match(r.headers.get('www-authenticate'), /resource_metadata/);
});

test('unregistered redirects and wrong origins are rejected', async (t) => {
  const f = await setup(t);
  assert.equal(
    (await f.call('/oauth/register', { method: 'POST', data: { redirect_uris: ['https://evil.test'] } }))
      .status,
    400
  );
  assert.equal(
    (
      await f.call('/oauth/register', {
        method: 'POST',
        data: { redirect_uris: f.config.redirects },
        headers: { Origin: 'https://evil.test' },
      })
    ).status,
    403
  );
});

test('consent requires browser binding and is single-use', async (t) => {
  const f = await setup(t);
  const a = await f.authorize();
  assert.equal(
    (
      await f.call('/oauth/consent', {
        method: 'POST',
        data: { request: a.request, approve: true },
        headers: { Origin: f.config.appOrigin, Authorization: 'Bearer supabase-user-token' },
      })
    ).status,
    403
  );
  assert.equal((await a.finish()).status, 200);
  assert.equal((await a.finish()).status, 400);
});

test('denied consent returns state and no authorization code', async (t) => {
  const f = await setup(t);
  const a = await f.authorize(false);
  const r = await a.finish();
  const u = new URL(r.data.redirect);
  assert.equal(u.searchParams.get('error'), 'access_denied');
  assert.equal(u.searchParams.get('state'), 'test-state');
  assert.equal(u.searchParams.get('code'), null);
});

test('authorization code replay and wrong PKCE are blocked', async (t) => {
  const f = await setup(t);
  const tokens = await f.login();
  assert.equal((await f.call('/oauth/token', { method: 'POST', data: tokens.tokenData })).status, 400);
  const a = await f.authorize();
  const r = await a.finish();
  const code = new URL(r.data.redirect).searchParams.get('code');
  assert.equal(
    (
      await f.call('/oauth/token', {
        method: 'POST',
        data: { ...tokens.tokenData, code, code_verifier: random() },
      })
    ).status,
    400
  );
});

test('expired authorization code is rejected', async (t) => {
  const f = await setup(t);
  const a = await f.authorize();
  const r = await a.finish();
  const code = new URL(r.data.redirect).searchParams.get('code');
  f.store.db.prepare("UPDATE records SET expires=0 WHERE kind='code'").run();
  assert.equal(
    (
      await f.call('/oauth/token', {
        method: 'POST',
        data: {
          client_id: f.client_id,
          resource: f.resource,
          grant_type: 'authorization_code',
          code,
          code_verifier: random(),
          redirect_uri: f.config.redirects[0],
        },
      })
    ).status,
    400
  );
});

test('refresh rotation, resource binding and replay revoke the family', async (t) => {
  const f = await setup(t);
  const tokens = await f.login();
  const data = {
    grant_type: 'refresh_token',
    client_id: f.client_id,
    resource: f.resource,
    refresh_token: tokens.refresh_token,
  };
  assert.equal(
    (await f.call('/oauth/token', { method: 'POST', data: { ...data, resource: 'https://evil.test/mcp' } }))
      .status,
    400
  );
  const rotated = await f.call('/oauth/token', { method: 'POST', data });
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.data.refresh_token, tokens.refresh_token);
  assert.equal((await f.call('/oauth/token', { method: 'POST', data })).status, 400);
  assert.equal((await f.rpc(rotated.data.access_token, 'tools/list')).status, 401);
});

test('invalid refresh token is rejected', async (t) => {
  const f = await setup(t);
  await f.login();
  assert.equal(
    (
      await f.call('/oauth/token', {
        method: 'POST',
        data: {
          grant_type: 'refresh_token',
          client_id: f.client_id,
          resource: f.resource,
          refresh_token: random(),
        },
      })
    ).status,
    400
  );
});

test('scopes limit discovery and execution; invalid arguments rejected', async (t) => {
  const f = await setup(t, { scope: 'agents:read' });
  const tokens = await f.login();
  assert.equal(tokens.refresh_token, undefined);
  assert.equal((await f.rpc(tokens.access_token, 'tools/list')).data.result.tools.length, 2);
  assert.equal((await f.rpc(tokens.access_token, 'tools/call', { name: 'list_calls' })).status, 403);
  assert.equal(
    (await f.rpc(tokens.access_token, 'tools/call', { name: 'list_agents', arguments: { limit: 999 } }))
      .data.error.code,
    -32602
  );
  assert.equal(
    (
      await f.rpc(tokens.access_token, 'tools/call', {
        name: 'list_agents',
        arguments: { user_id: 'someone-else' },
      })
    ).data.error.code,
    -32602
  );
});

test('revocation and expiry reject access', async (t) => {
  const f = await setup(t);
  const tokens = await f.login();
  assert.equal(
    (
      await f.call('/oauth/revoke', {
        method: 'POST',
        data: { client_id: f.client_id, token: tokens.refresh_token },
      })
    ).status,
    200
  );
  assert.equal((await f.rpc(tokens.access_token, 'tools/list')).status, 401);
  const other = await f.login();
  f.store.db.prepare("UPDATE records SET expires=0 WHERE kind='access'").run();
  assert.equal((await f.rpc(other.access_token, 'tools/list')).status, 401);
});

test('disconnect revokes all account grants', async (t) => {
  const f = await setup(t);
  const a = await f.login();
  const b = await f.login();
  assert.equal(
    (
      await f.call('/oauth/disconnect', {
        method: 'POST',
        headers: { Origin: f.config.appOrigin, Authorization: 'Bearer supabase-user-token' },
      })
    ).status,
    200
  );
  assert.equal((await f.rpc(a.access_token, 'tools/list')).status, 401);
  assert.equal((await f.rpc(b.access_token, 'tools/list')).status, 401);
});

test('integration status reports connected scopes without exposing tokens', async (t) => {
  const f = await setup(t);
  const before = await f.call('/api/integration/status', {
    headers: { Origin: f.config.appOrigin, Authorization: 'Bearer supabase-user-token' },
  });
  assert.equal(before.status, 200);
  assert.equal(before.data.connected, false);
  assert.deepEqual(before.data.scopes, []);

  await f.login();
  const after = await f.call('/oauth/status', {
    headers: { Origin: f.config.appOrigin, Authorization: 'Bearer supabase-user-token' },
  });
  assert.equal(after.status, 200);
  assert.equal(after.data.connected, true);
  assert.ok(after.data.scopes.includes('agents:read'));
  assert.ok(after.data.scopes.includes('calls:read'));
  assert.ok(!JSON.stringify(after.data).includes('access_token'));
  assert.ok(!JSON.stringify(after.data).includes('refresh'));

  assert.equal(
    (await f.call('/api/integration/status', { headers: { Origin: f.config.appOrigin } })).status,
    401
  );
  assert.equal(
    (
      await f.call('/api/integration/status', {
        headers: { Origin: 'https://evil.test', Authorization: 'Bearer supabase-user-token' },
      })
    ).status,
    403
  );
});

test('adapter applies immutable ownership filters and excludes secrets', async () => {
  const seen = [];
  const backend = new Backend(
    { supabase: 'https://example.supabase.co', serviceKey: 'test-only' },
    async (url) => {
      seen.push(new URL(url));
      return new Response(JSON.stringify([{ id: userId }]));
    }
  );
  await backend.run('list_agents', {}, userId);
  await backend.run('list_calls', {}, userId);
  await backend.run('get_agent', { agentId: userId }, userId);
  await backend.run('get_call', { callId: userId }, userId);
  await backend.run('get_call_transcript', { callId: userId }, userId);
  await backend.run('search_calls', { contactNumber: '+15551212', direction: 'inbound' }, userId);
  for (const u of seen) {
    assert.equal(u.searchParams.get('user_id'), `eq.${userId}`);
    assert.ok(!u.searchParams.get('select').includes('*'));
    assert.ok(!u.searchParams.get('select').includes('webhook'));
  }
  await backend.query('calls', userId, 'id', { user_id: 'eq.victim' });
  assert.equal(seen.at(-1).searchParams.get('user_id'), `eq.${userId}`);
});

test('cross-account records produce not found; external transcript URLs are never fetched', async () => {
  const config = { supabase: 'https://example.supabase.co', serviceKey: 'test-only' };
  const absent = new Backend(config, async () => new Response('[]'));
  await assert.rejects(
    () => absent.run('get_agent', { agentId: userId }, userId),
    /not found/
  );
  await assert.rejects(() => absent.run('get_call', { callId: userId }, userId), /not found/);
  let requests = 0;
  const backend = new Backend(config, async () => {
    requests++;
    return new Response(
      JSON.stringify([{ id: userId, transcription_url: 'http://169.254.169.254/latest/meta-data' }])
    );
  });
  const result = await backend.run('get_call_transcript', { callId: userId }, userId);
  assert.equal(result.transcript, null);
  assert.equal(requests, 1);
});

test('search_calls resolves agent title without raw SQL and respects ownership', async () => {
  const seen = [];
  const backend = new Backend(
    { supabase: 'https://example.supabase.co', serviceKey: 'test-only' },
    async (url) => {
      const u = new URL(url);
      seen.push(u);
      if (u.pathname.endsWith('/ai_agents')) {
        return new Response(JSON.stringify([{ id: userId }]));
      }
      return new Response(JSON.stringify([{ id: otherId, contact_number: '+1555' }]));
    }
  );
  const result = await backend.run('search_calls', { agentTitle: 'Sales%,drop' }, userId);
  assert.equal(result.items.length, 1);
  const agentQuery = seen.find((u) => u.pathname.endsWith('/ai_agents'));
  const callQuery = seen.find((u) => u.pathname.endsWith('/calls'));
  assert.ok(agentQuery.searchParams.get('title').includes('Sales'));
  assert.ok(!agentQuery.searchParams.get('title').includes('%'));
  assert.equal(callQuery.searchParams.get('user_id'), `eq.${userId}`);
  assert.equal(callQuery.searchParams.get('agent_id'), `in.(${userId})`);
});

test('list_calls date and status filters are applied safely', async () => {
  const seen = [];
  const backend = new Backend(
    { supabase: 'https://example.supabase.co', serviceKey: 'test-only' },
    async (url) => {
      seen.push(new URL(url));
      return new Response('[]');
    }
  );
  await backend.run(
    'list_calls',
    {
      status: 'completed',
      agentId: userId,
      startDate: '2026-01-01T00:00:00Z',
      endDate: '2026-01-31T23:59:59Z',
    },
    userId
  );
  const u = seen[0];
  assert.equal(u.searchParams.get('status'), 'eq.completed');
  assert.equal(u.searchParams.get('agent_id'), `eq.${userId}`);
  assert.deepEqual(u.searchParams.getAll('started_at'), [
    'gte.2026-01-01T00:00:00Z',
    'lte.2026-01-31T23:59:59Z',
  ]);
});

test('tool argument validation rejects unsafe shapes', () => {
  const list = tools.find((t) => t.name === 'list_calls');
  assert.equal(validate(list, { limit: 20 }), true);
  assert.equal(validate(list, { userId }), false);
  assert.equal(validate(list, { status: 'hacked' }), false);
  assert.equal(validate(tools.find((t) => t.name === 'get_call'), { callId: 'not-a-uuid' }), false);
  assert.equal(validate(tools.find((t) => t.name === 'search_calls'), { contactNumber: 'ab' }), false);
});

test('configFromEnv fails fast on missing secrets and requires Claude callback', () => {
  assert.throws(() => configFromEnv({ NODE_ENV: 'production' }), /MCP_PUBLIC_URL/);
  assert.throws(
    () =>
      configFromEnv({
        NODE_ENV: 'production',
        MCP_PUBLIC_URL: 'https://claude-mcp.callin.io',
        CALLIN_APP_ORIGIN: 'https://app.callin.io',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon',
        SUPABASE_SERVICE_ROLE_KEY: 'service',
        OAUTH_REDIRECT_URIS: 'https://evil.test/callback',
      }),
    /claude\.ai/
  );
});

test('SQLite state survives restart without storing raw tokens', () => {
  const dir = mkdtempSync(join(tmpdir(), 'callin-test-'));
  try {
    const path = join(dir, 'oauth.sqlite');
    const token = random();
    let s = new Store(path);
    s.put('access', hash(token), { gid: 'grant' }, 60);
    s.close();
    s = new Store(path);
    assert.deepEqual(s.get('access', hash(token)), { gid: 'grant' });
    assert.equal(s.get('access', token), null);
    s.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  'official MCP SDK client interoperates with the HTTP service',
  { skip: process.env.RUN_SDK_TESTS !== '1' },
  async (t) => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } = await import(
      '@modelcontextprotocol/sdk/client/streamableHttp.js'
    );
    const f = await setup(t);
    const tokens = await f.login();
    const client = new Client({ name: 'callin-interop-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(f.resource), {
      requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    });
    try {
      await client.connect(transport);
      const listed = await client.listTools();
      assert.equal(listed.tools.length, 6);
      const result = await client.callTool({ name: 'list_agents', arguments: { limit: 5 } });
      assert.equal(result.isError, false);
      assert.equal(JSON.parse(result.content[0].text).userId, userId);
    } finally {
      await client.close();
    }
  }
);
