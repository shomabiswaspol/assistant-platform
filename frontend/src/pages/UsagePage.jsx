import { useState, useEffect } from 'react';
import { api } from '../services/api.js';

export default function UsagePage() {
  const [daily, setDaily] = useState([]);
  const [monthly, setMonthly] = useState([]);

  useEffect(() => {
    api.usageDaily().then(setDaily);
    api.usageMonthly().then(setMonthly);
  }, []);

  return (
    <div className="page">
      <h1>Token usage</h1>

      <section>
        <h2>Today</h2>
        <table>
          <thead><tr><th>Provider</th><th>Model</th><th>Tokens</th><th>Requests</th><th>Free</th></tr></thead>
          <tbody>
            {daily.map((d, i) => (
              <tr key={i}><td>{d.provider}</td><td>{d.model}</td><td>{d.tokens_total}</td><td>{d.requests_count}</td><td>{d.is_free ? 'yes' : 'no'}</td></tr>
            ))}
          </tbody>
        </table>
        {daily.length === 0 && <p>No usage yet today.</p>}
      </section>

      <section>
        <h2>This month</h2>
        <table>
          <thead><tr><th>Provider</th><th>Tokens</th><th>Requests</th><th>Cost</th></tr></thead>
          <tbody>
            {monthly.map((m, i) => (
              <tr key={i}><td>{m.provider}</td><td>{m.tokens_total}</td><td>{m.requests_count}</td><td>${m.cost}</td></tr>
            ))}
          </tbody>
        </table>
        {monthly.length === 0 && <p>No usage yet this month.</p>}
      </section>
    </div>
  );
}
