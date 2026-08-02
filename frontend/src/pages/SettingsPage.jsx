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

function maskKey(provider) {
  return `${provider}-••••••••`;
}

export default function SettingsPage() {
  const [models, setModels] = useState(null);
  const [keys, setKeys] = useState([]);
  const [omni, setOmni] = useState(null);
  const [newKey, setNewKey] = useState({ provider: '', key: '', label: '' });
  const [showAddKey, setShowAddKey] = useState(false);

  async function refresh() {
    setModels(await api.models());
    setKeys(await api.apiKeys());
    setOmni(await api.omnirouteStatus());
  }

  useEffect(() => { refresh(); }, []);

  async function addKey(e) {
    e.preventDefault();
    if (!newKey.provider || !newKey.key) return;
    await api.addApiKey(newKey);
    setNewKey({ provider: '', key: '', label: '' });
    setShowAddKey(false);
    refresh();
  }

  async function removeKey(id) {
    if (!confirm('Remove this API key?')) return;
    await api.deleteApiKey(id);
    refresh();
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Settings</h1>

      <Card>
        <CardHeader title="AI Gateway" subtitle="OmniRoute routes chat requests across free, local, and paid providers." />
        {omni ? <StatusDot ok={omni.reachable} /> : <p className="text-sm text-slate-400">Checking…</p>}
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Start/stop is a host-level operation, not exposed here.
        </p>
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
        {showAddKey && (
          <form onSubmit={addKey} className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
            <Input placeholder="Provider (e.g. groq)" value={newKey.provider} onChange={(e) => setNewKey({ ...newKey, provider: e.target.value })} />
            <Input placeholder="API key" value={newKey.key} onChange={(e) => setNewKey({ ...newKey, key: e.target.value })} />
            <Input placeholder="Label (optional)" value={newKey.label} onChange={(e) => setNewKey({ ...newKey, label: e.target.value })} />
            <Button type="submit" size="sm" className="sm:col-span-3">Save key</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
