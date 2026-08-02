import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api.js';
import { Card, CardHeader } from '../components/ui/Card.jsx';
import StatTile from '../components/usage/StatTile.jsx';
import ProviderBarChart from '../components/usage/ProviderBarChart.jsx';

export default function UsagePage() {
  const [daily, setDaily] = useState([]);
  const [monthly, setMonthly] = useState([]);

  useEffect(() => {
    api.usageDaily().then(setDaily);
    api.usageMonthly().then(setMonthly);
  }, []);

  const todayTokens = useMemo(() => daily.reduce((s, d) => s + Number(d.tokens_total || 0), 0), [daily]);
  const todayRequests = useMemo(() => daily.reduce((s, d) => s + Number(d.requests_count || 0), 0), [daily]);
  const monthCost = useMemo(() => monthly.reduce((s, m) => s + Number(m.cost || 0), 0), [monthly]);
  const freeShare = useMemo(() => {
    const total = monthly.reduce((s, m) => s + Number(m.tokens_total || 0), 0);
    const free = monthly.filter((m) => m.any_free).reduce((s, m) => s + Number(m.tokens_total || 0), 0);
    return total > 0 ? Math.round((free / total) * 100) : 0;
  }, [monthly]);

  const providerChartData = useMemo(
    () =>
      monthly
        .reduce((acc, m) => {
          const existing = acc.find((a) => a.label === m.provider);
          if (existing) existing.value += Number(m.tokens_total || 0);
          else acc.push({ label: m.provider, value: Number(m.tokens_total || 0) });
          return acc;
        }, [])
        .sort((a, b) => b.value - a.value),
    [monthly]
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Usage</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Tokens today" value={todayTokens.toLocaleString()} />
        <StatTile label="Requests today" value={todayRequests.toLocaleString()} />
        <StatTile label="Cost this month" value={`$${monthCost.toFixed(4)}`} />
        <StatTile label="Free-tier share" value={`${freeShare}%`} sub="of this month's tokens" />
      </div>

      <Card>
        <CardHeader title="Tokens by provider" subtitle="This month" />
        <ProviderBarChart data={providerChartData} />
      </Card>

      <Card>
        <CardHeader title="Today's detail" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 font-medium">Provider</th>
                <th className="py-2 font-medium">Model</th>
                <th className="py-2 font-medium text-right">Tokens</th>
                <th className="py-2 font-medium text-right">Requests</th>
                <th className="py-2 font-medium text-right">Free</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-800/50">
                  <td className="py-2 text-slate-700 dark:text-slate-300">{d.provider}</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400 font-mono text-xs">{d.model}</td>
                  <td className="py-2 text-right tabular-nums">{Number(d.tokens_total).toLocaleString()}</td>
                  <td className="py-2 text-right tabular-nums">{d.requests_count}</td>
                  <td className="py-2 text-right">{d.is_free ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {daily.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No usage yet today.</p>}
        </div>
      </Card>
    </div>
  );
}
