import { useState, useEffect } from 'react';
import { Trash2, Plus, Key } from 'lucide-react';
import { api } from '../services/api.js';
import { Card, CardHeader } from '../components/ui/Card.jsx';
import { StatusDot } from '../components/ui/Badge.jsx';
import Input from '../components/ui/Input.jsx';
import Button from '../components/ui/Button.jsx';

const TIERS = [
  { key: 'priority_1_free', label: 'Free', color: 'border-green-300 dark:border-green-800' },
  { key: 'priority_2_local', label: 'Local', color: 'border-brand-300 dark:border-brand-800' },
  { key: 'priority_3_paid', label: 'Paid', color: 'border-yellow-300 dark:border-yellow-800' },
];

// Hermes customer-dispatch Phase 1 (2026-08-12, Minimal Modification Plan
// item 9). Labels match the categories the Minimal Modification Plan and
// message_router's own tier comments use, not fazle-core's internal flag
// names, so this reads the same way to an Admin who hasn't seen the code.
const HERMES_CUSTOMER_CATEGORIES = [
  { flag: 'hermes_customer_employee', label: 'Employee', hint: 'salary / payroll questions (message_router Tier 10)' },
  { flag: 'hermes_customer_recruitment', label: 'Recruitment', hint: 'job applicant / candidate replies' },
  { flag: 'hermes_customer_route_b', label: 'Route B / General chat', hint: 'escort, security guard, candidate, unknown-sender chit-chat' },
  { flag: 'hermes_customer_general', label: 'General fallback', hint: 'company policy / unrecognized intent (Tier 15)' },
  // 2026-08-17 (Hermes-only-AI-architecture session, Owner-directed):
  { flag: 'hermes_customer_kb_fallback', label: 'Knowledge Base fallback', hint: 'KB semantic/RAG fallback replies — was the one ungated Ollama call site' },
  { flag: 'hermes_customer_social', label: 'Social (Messenger/FB)', hint: 'Messenger DMs + Facebook Page comments' },
  { flag: 'hermes_admin_console', label: 'Admin AI Console', hint: 'WhatsApp "AI <question>" command + /chat/message Chat Lab' },
  { flag: 'hermes_intent_classification', label: 'Intent classification', hint: 'WhatsApp message-intent labeling (routes to the right tier)' },
];

function maskKey(provider) {
  return `${provider}-••••••••`;
}

export default function SettingsPage() {
  const [models, setModels] = useState(null);
  const [keys, setKeys] = useState([]);
  const [omni, setOmni] = useState(null);
  const [newKey, setNewKey] = useState({ provider: '', key: '', label: '' });
  const [showAddKey, setShowAddKey] = useState(false);
  const [hermesFlags, setHermesFlags] = useState(null);
  const [hermesFlagsError, setHermesFlagsError] = useState('');
  const [hermesFlagBusy, setHermesFlagBusy] = useState('');
  // FIX 3: refresh() previously had no error handling — if any of the three
  // calls below failed (expired token, transient network issue), the page
  // would silently stay half-loaded with no indication why. Route/imports
  // themselves were already correct (verified: /settings route, Sidebar
  // link, and this component's export are all fine) — this is a genuine
  // resilience gap, not the reported "broken navigation."
  const [loadError, setLoadError] = useState('');

  async function refresh() {
    try {
      setLoadError('');
      setModels(await api.models());
      setKeys(await api.apiKeys());
      setOmni(await api.omnirouteStatus());
    } catch (err) {
      setLoadError(err.message || 'Failed to load settings — please try refreshing the page.');
    }
    // Kept separate from the block above: the fazle-ops bridge being
    // unconfigured (fresh install, credential not yet provisioned) is the
    // expected default state, not a page-load failure — it gets its own
    // inline notice in the panel below, not the top-level loadError banner.
    try {
      setHermesFlagsError('');
      const { flags } = await api.hermesCustomerFlags();
      setHermesFlags(flags);
    } catch (err) {
      setHermesFlags(null);
      setHermesFlagsError(err.message || 'Failed to load Earth customer-reply status.');
    }
  }

  useEffect(() => { refresh(); }, []);

  async function toggleHermesFlag(flag, nextEnabled) {
    setHermesFlagBusy(flag);
    try {
      if (nextEnabled) {
        await api.activateHermesCustomerFlag(flag);
      } else {
        await api.killSwitchHermesCustomerFlag(flag);
      }
      const { flags } = await api.hermesCustomerFlags();
      setHermesFlags(flags);
    } catch (err) {
      setHermesFlagsError(err.message || 'Failed to update the flag.');
    } finally {
      setHermesFlagBusy('');
    }
  }

  async function addKey(e) {
    e.preventDefault();
    if (!newKey.provider || !newKey.key) return;
    try {
      await api.addApiKey(newKey);
      setNewKey({ provider: '', key: '', label: '' });
      setShowAddKey(false);
      refresh();
    } catch (err) {
      setLoadError(err.message || 'Failed to save the key.');
    }
  }

  async function removeKey(id) {
    if (!confirm('Remove this API key?')) return;
    try {
      await api.deleteApiKey(id);
      refresh();
    } catch (err) {
      setLoadError(err.message || 'Failed to remove the key.');
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Settings</h1>

      {loadError && (
        <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {loadError}
        </div>
      )}

      <Card>
        <CardHeader title="AI Gateway" subtitle="OmniRoute routes chat requests across free, local, and paid providers." />
        {omni ? <StatusDot ok={omni.reachable} /> : <p className="text-sm text-slate-400">Checking…</p>}
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Start/stop is a host-level operation, not exposed here.
        </p>
        {/* FIX 5: web search provider status. Reads a real boolean the
            backend reports (tavilyConfigured on /settings/omniroute-status)
            rather than a fake/static indicator — see settings.js. */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-sm text-slate-600 dark:text-slate-400">Web Search (Tavily)</span>
          {omni ? (
            <span
              className={
                omni.tavilyConfigured
                  ? 'text-xs font-medium text-green-700 dark:text-green-400'
                  : 'text-xs font-medium text-slate-400 dark:text-slate-500'
              }
            >
              {omni.tavilyConfigured ? 'Configured' : 'Not configured'}
            </span>
          ) : (
            <span className="text-xs text-slate-400">Checking…</span>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Models" subtitle="Routing priority — free and local models are tried before paid ones." />
        {models && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TIERS.map(({ key, label, color }) => (
              <div key={key} className={`rounded-lg border ${color} p-3`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">{label}</p>
                <ul className="space-y-1">
                  {models[key].map((m) => (
                    <li key={m} className="text-xs text-slate-700 dark:text-slate-300 truncate" title={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="WhatsApp Earth Conversation"
          subtitle="Let Earth generate the AI reply for these customer categories, instead of the existing chain."
        />
        {hermesFlagsError && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
            {hermesFlagsError.includes('not configured')
              ? 'Not configured yet — set FAZLE_CORE_INTERNAL_API_KEY in the backend to enable this panel.'
              : hermesFlagsError}
          </p>
        )}
        {hermesFlags && (
          <div className="flex flex-col gap-2">
            {HERMES_CUSTOMER_CATEGORIES.map(({ flag, label, hint }) => {
              const state = hermesFlags.find((f) => f.feature_name === flag);
              const on = Boolean(state?.effective_enabled);
              const busy = hermesFlagBusy === flag;
              return (
                <div key={flag} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>
                  </div>
                  <Button
                    variant={on ? 'danger' : 'secondary'}
                    size="sm"
                    disabled={busy}
                    onClick={() => toggleHermesFlag(flag, !on)}
                  >
                    {busy ? '…' : on ? 'ON — turn off' : 'OFF — turn on'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Accountant &amp; Escort Client</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Protected — Earth never generates these replies, by design. Not controlled here.
              </p>
            </div>
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Not applicable</span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Your API keys"
          subtitle="Bring your own provider keys for higher rate limits."
          action={
            <Button variant="secondary" size="sm" onClick={() => setShowAddKey((v) => !v)}>
              <Plus size={14} /> Add key
            </Button>
          }
        />
        {keys.length === 0 && !showAddKey && (
          <p className="text-sm text-slate-400 dark:text-slate-500">No custom keys added yet.</p>
        )}
        <div className="flex flex-col gap-2">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2">
              <div className="flex items-center gap-2.5">
                <Key size={15} className="text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {k.provider} {k.label && <span className="text-slate-400 font-normal">({k.label})</span>}
                  </p>
                  <p className="text-xs text-slate-400 font-mono">{maskKey(k.provider)}</p>
                </div>
              </div>
              <button onClick={() => removeKey(k.id)} className="text-slate-400 hover:text-red-500 p-1">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        {/* FIX 4: the field was already correctly named/spelled "label" in
            code (no "lebel" typo found anywhere in this project) — what it
            genuinely lacked was required/optional marking and an
            explanation of what the label is for. Added below. */}
        {showAddKey && (
          <form onSubmit={addKey} className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-start rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
            <Input
              label={<>Provider <span className="text-red-500">*</span></>}
              placeholder="e.g. groq"
              value={newKey.provider}
              onChange={(e) => setNewKey({ ...newKey, provider: e.target.value })}
              required
            />
            <Input
              label={<>API key <span className="text-red-500">*</span></>}
              placeholder="Paste your key"
              value={newKey.key}
              onChange={(e) => setNewKey({ ...newKey, key: e.target.value })}
              required
            />
            <Input
              label={<>Label <span className="text-slate-400 font-normal">(optional)</span></>}
              placeholder="My Groq Key / Work API"
              hint="Key name/tag — e.g. 'My Groq Key' or 'Work API' — এটি ঐচ্ছিক, শুধু নিজের সুবিধার জন্য একটি নাম দিন"
              value={newKey.label}
              onChange={(e) => setNewKey({ ...newKey, label: e.target.value })}
            />
            <Button type="submit" size="sm" className="sm:col-span-3">Save key</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
