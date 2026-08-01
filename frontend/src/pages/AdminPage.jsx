import { useState, useEffect } from 'react';
import { api } from '../services/api.js';

export default function AdminPage() {
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);

  async function refresh() {
    setRequests(await api.adminRequests('pending'));
    setUsers(await api.adminUsers());
  }

  useEffect(() => { refresh(); }, []);

  async function decide(id, decision) {
    await api.adminDecide(id, decision);
    refresh();
  }

  return (
    <div className="page">
      <h1>Admin</h1>

      <section>
        <h2>Pending membership requests</h2>
        {requests.length === 0 && <p>None pending.</p>}
        <ul>
          {requests.map((r) => (
            <li key={r.id}>
              {r.username} ({r.email}) {r.whatsapp_number ? `— ${r.whatsapp_number}` : ''}
              <button onClick={() => decide(r.id, 'approved')}>Approve</button>
              <button onClick={() => decide(r.id, 'denied')}>Deny</button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>All users</h2>
        <table>
          <thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td><td>{u.email}</td><td>{u.role}</td><td>{u.status}</td>
                <td>{u.last_login ? new Date(u.last_login).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
