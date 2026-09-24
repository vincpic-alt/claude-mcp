import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { getMcpOrigin } from '../lib/mcpOrigin';
import { Button } from '../design-system/primitives/button/Button';
import { useBranding } from '../components/BrandingProvider';

const SCOPE_LABEL_KEYS: Record<string, string> = {
  'account:read': 'actions.integrations.claude.scopes.accountRead',
  'agents:read': 'actions.integrations.claude.scopes.agentsRead',
  'calls:read': 'actions.integrations.claude.scopes.callsRead',
  'transcripts:read': 'actions.integrations.claude.scopes.transcriptsRead',
  offline_access: 'actions.integrations.claude.scopes.offlineAccess',
};

const PRIMARY_SCOPES = ['account:read', 'agents:read', 'calls:read', 'transcripts:read'] as const;

export function McpAuthorize() {
  const { t } = useTranslation();
  const branding = useBranding();
  const origin = getMcpOrigin();
  const request = new URLSearchParams(window.location.search).get('request');
  const returnPath = `${window.location.pathname}${window.location.search}`;
  const signInHref = `/signin?redirect=${encodeURIComponent(returnPath)}`;

  const [details, setDetails] = useState<{
    client_name: string;
    scope: string;
    redirect_uri: string;
  } | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const update = () =>
      supabase.auth.getUser().then(({ data }) => {
        if (live) setEmail(data.user?.email || null);
      });
    update();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) =>
      setEmail(session?.user?.email || null)
    );
    window.addEventListener('focus', update);
    if (origin && request) {
      fetch(`${origin}/oauth/consent?request=${encodeURIComponent(request)}`, {
        credentials: 'include',
      })
        .then(async (r) => {
          if (!r.ok) {
            throw new Error(t('actions.integrations.claude.authorize.expired'));
          }
          return r.json();
        })
        .then((d) => {
          if (live) setDetails(d);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    } else {
      setError(
        request
          ? t('actions.integrations.claude.authorize.missingOrigin')
          : t('actions.integrations.claude.authorize.startFromClaude')
      );
    }
    return () => {
      live = false;
      listener.subscription.unsubscribe();
      window.removeEventListener('focus', update);
    };
  }, [request, origin, t]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (approve && !session) throw new Error(t('actions.integrations.claude.authorize.signInFirst'));
      const r = await fetch(`${origin}/oauth/consent`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ request, approve }),
      });
      if (!r.ok) {
        throw new Error(t('actions.integrations.claude.authorize.completeFailed'));
      }
      const data = await r.json();
      const target = new URL(data.redirect);
      const expected = new URL(details!.redirect_uri);
      if (target.origin !== expected.origin || target.pathname !== expected.pathname) {
        throw new Error(t('actions.integrations.claude.authorize.unexpectedCallback'));
      }
      window.location.assign(target.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('actions.integrations.claude.authorize.connectionFailed'));
      setBusy(false);
    }
  }

  const granted = details ? new Set(details.scope.split(' ')) : new Set<string>();
  const visibleScopes = PRIMARY_SCOPES.filter((s) => granted.has(s));
  const brandName = branding?.appName || 'Callin';

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4 sm:p-6">
      <section className="max-w-lg w-full min-w-0 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 sm:p-8 space-y-5">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{brandName}</p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {t('actions.integrations.claude.authorize.title')}
          </h1>
        </div>
        {email ? (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {t('actions.integrations.claude.authorize.signedInAs', { email })}
          </p>
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <Link className="text-primary underline" to={signInHref}>
              {t('actions.integrations.claude.authorize.signInLink')}
            </Link>
            {t('actions.integrations.claude.authorize.signInContinue')}
          </p>
        )}
        {details && (
          <>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t('actions.integrations.claude.authorize.client', { name: details.client_name })}
            </p>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                {t('actions.integrations.claude.authorize.requestedPermissions')}
              </p>
              <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300 space-y-1">
                {visibleScopes.map((s) => (
                  <li key={s}>{t(SCOPE_LABEL_KEYS[s] || s, s)}</li>
                ))}
                {granted.has('offline_access') && (
                  <li>{t(SCOPE_LABEL_KEYS.offline_access)}</li>
                )}
              </ul>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('actions.integrations.claude.authorize.readOnlyNote')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                disabled={!email || busy}
                onClick={() => void decide(true)}
                className="w-full sm:w-auto"
              >
                {t('actions.integrations.claude.authorize.allow')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void decide(false)}
                className="w-full sm:w-auto"
              >
                {t('actions.integrations.claude.authorize.cancel')}
              </Button>
            </div>
          </>
        )}
        {error && (
          <p role="status" className="text-sm text-gray-700 dark:text-gray-300 break-words">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
