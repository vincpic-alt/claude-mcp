import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Copy,
  ArrowLeft,
  Loader2,
  Unplug,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppLayout from '../AppLayout';
import { Button } from '../../design-system/primitives/button/Button';
import {
  disconnectClaudeIntegration,
  fetchClaudeIntegrationStatus,
  getClaudeAgentsDocUrl,
  getClaudeAppUrl,
  getMcpConnectorUrl,
  getMcpOrigin,
} from '../../lib/mcpOrigin';
import { useToast } from '../../design-system/feedback/Toast';
import { supabase } from '../../lib/supabase';

const EXAMPLE_PROMPT_KEYS = [
  'latestCalls',
  'summarizeCall',
  'showAgents',
  'inboundToday',
  'salesAgentWeek',
] as const;

type StatusState = 'loading' | 'unknown' | 'connected' | 'disconnected';

export function ClaudeIntegration() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { push } = useToast();
  const mcpOrigin = getMcpOrigin();
  const connectorUrl = getMcpConnectorUrl();
  const [status, setStatus] = useState<StatusState>('loading');
  const [scopes, setScopes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const capabilities = useMemo(
    () => [
      t('actions.integrations.claude.capabilities.agents'),
      t('actions.integrations.claude.capabilities.calls'),
      t('actions.integrations.claude.capabilities.transcripts'),
      t('actions.integrations.claude.capabilities.summarize'),
      t('actions.integrations.claude.capabilities.search'),
    ],
    [t]
  );

  const refreshStatus = useCallback(async () => {
    if (!mcpOrigin) {
      setStatus('unknown');
      setScopes([]);
      return;
    }
    setStatus('loading');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setStatus('unknown');
        setScopes([]);
        return;
      }
      const result = await fetchClaudeIntegrationStatus(session.access_token);
      setStatus(result.connected ? 'connected' : 'disconnected');
      setScopes(result.scopes);
    } catch {
      // Honest UI: do not claim Connected when status cannot be verified.
      setStatus('unknown');
      setScopes([]);
    }
  }, [mcpOrigin]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const copyConnectorUrl = async () => {
    if (!connectorUrl) return;
    try {
      await navigator.clipboard.writeText(connectorUrl);
      push({
        title: t('actions.integrations.claude.copiedTitle'),
        message: t('actions.integrations.claude.copiedMessage'),
        tone: 'success',
        duration: 3000,
      });
    } catch {
      push({
        title: t('common.error', 'Error'),
        message: t('actions.integrations.claude.copyFailed'),
        tone: 'error',
        duration: 4000,
      });
    }
  };

  const openClaude = () => {
    window.open(getClaudeAppUrl(), '_blank', 'noopener,noreferrer');
  };

  const openDocs = () => {
    window.open(getClaudeAgentsDocUrl(), '_blank', 'noopener,noreferrer');
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('not_signed_in');
      }
      await disconnectClaudeIntegration(session.access_token);
      setStatus('disconnected');
      setScopes([]);
      push({
        title: t('actions.integrations.claude.disconnectedTitle'),
        message: t('actions.integrations.claude.disconnectedMessage'),
        tone: 'success',
        duration: 4000,
      });
    } catch {
      push({
        title: t('common.error', 'Error'),
        message: t('actions.integrations.claude.disconnectFailed'),
        tone: 'error',
        duration: 4000,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppLayout
      title={t('actions.integrations.claude.pageTitle')}
      crumbs={[
        { label: t('actions.title', 'Actions'), to: '/actions' },
        { label: t('actions.integrations.claude.name') },
      ]}
    >
      <div className="space-y-6 max-w-3xl w-full min-w-0">
        <button
          type="button"
          onClick={() => navigate('/actions')}
          className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          {t('actions.integrations.claude.backToActions')}
        </button>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/70 backdrop-blur p-5 sm:p-8 space-y-6 overflow-hidden">
          <div className="flex items-start gap-4 min-w-0">
            <div className="h-12 w-12 shrink-0 rounded-2xl border border-gray-200 dark:border-gray-700 bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">
                  {t('actions.integrations.claude.heading')}
                </h1>
                {status === 'loading' && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('actions.integrations.claude.statusChecking')}
                  </span>
                )}
                {status === 'connected' && (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 text-xs font-medium">
                    {t('actions.integrations.claude.statusConnected')}
                  </span>
                )}
                {status === 'disconnected' && (
                  <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-2.5 py-0.5 text-xs font-medium">
                    {t('actions.integrations.claude.statusNotConnected')}
                  </span>
                )}
              </div>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                {t('actions.integrations.claude.description')}
              </p>
            </div>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-950/40 px-4 py-3">
            {t('actions.integrations.claude.securityNote')}
          </p>

          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
              {t('actions.integrations.claude.whatYouCanDo')}
            </h2>
            <ul className="space-y-2">
              {capabilities.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <Button
              type="button"
              onClick={openClaude}
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <MessageSquare className="h-4 w-4" />
              {t('actions.integrations.claude.connectCta')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={openDocs}
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <ExternalLink className="h-4 w-4" />
              {t('actions.integrations.claude.learnMore')}
            </Button>
            {status === 'connected' && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void handleDisconnect()}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto text-red-700 dark:text-red-400 border-red-200 dark:border-red-900"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                {t('actions.integrations.claude.disconnectCta')}
              </Button>
            )}
          </div>

          {status === 'connected' && scopes.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('actions.integrations.claude.authorizedScopes', { scopes: scopes.join(', ') })}
            </p>
          )}

          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-950/40 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t('actions.integrations.claude.howToConnectTitle')}
            </h3>
            <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
              <li>{t('actions.integrations.claude.howToConnect.step1')}</li>
              <li>{t('actions.integrations.claude.howToConnect.step2')}</li>
              <li>{t('actions.integrations.claude.howToConnect.step3')}</li>
              <li>{t('actions.integrations.claude.howToConnect.step4')}</li>
            </ol>
          </div>

          {connectorUrl ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-950/40 p-4 space-y-2 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t('actions.integrations.claude.connectorUrlTitle')}
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {t('actions.integrations.claude.connectorUrlHint')}
              </p>
              <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                <code className="flex-1 min-w-0 text-xs sm:text-sm break-all rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-3 py-2 text-gray-800 dark:text-gray-200">
                  {connectorUrl}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyConnectorUrl()}
                  className="shrink-0 w-full sm:w-auto"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {t('actions.integrations.claude.copyUrl')}
                </Button>
              </div>
              {!mcpOrigin?.startsWith('https://') && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t('actions.integrations.claude.httpsHint')}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
              {t('actions.integrations.claude.missingOrigin')}
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
              {t('actions.integrations.claude.examplePromptsTitle')}
            </h2>
            <ul className="space-y-2">
              {EXAMPLE_PROMPT_KEYS.map((key) => (
                <li
                  key={key}
                  className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/30 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 italic break-words"
                >
                  “{t(`actions.integrations.claude.prompts.${key}`)}”
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-500">
            {t('actions.integrations.claude.permissionsNote')}
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
