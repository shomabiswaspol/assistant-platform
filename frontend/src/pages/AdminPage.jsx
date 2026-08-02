import { useState, useEffect, useMemo } from 'react';
import { Search, Check, X, MoreVertical } from 'lucide-react';
import { api } from '../services/api.js';
import { Card, CardHeader } from '../components/ui/Card.jsx';
import Badge from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';

const STATUS_COLOR = { pending: 'yellow', approved: 'green', denied: 'red', suspended: 'red' };

function initials(name) {
  return name ? name.slice(0, 2).toUpperCase() : '?';
}

function UserActionMenu({ user, onSetStatus }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg py-1">
          {user.status !== 'suspended' && (
            <button
              onClick={() => { onSetStatus(user.id, 'suspended'); setOpen(false); }}
              className="w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Suspend
            </button>
          )}
          {user.status === 'suspended' && (
            <button
              onClick={() => { onSetStatus(user.id, 'approved'); setOpen(false); }}
              className="w-full px-3 py-1.5 text-left text-sm text-green-600 dark:text-green-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Reactivate
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');

  async function refresh() {
    setRequests(await api.adminRequests('pending'));
    setUsers(await api.adminUsers());
  }

  useEffect(() => { refresh(); }, []);

  async function decide(id, decision) {
    await api.adminDecide(id, decision);
    refresh();
  }

  async function setStatus(id, status) {
    await api.adminSetUserStatus(id, status);
    refresh();
  }

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, search]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Admin</h1>

      <Card>
        <CardHeader title="Pending membership requests" subtitle={`${requests.length} awaiting review`} />
        {requests.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Nothing pending.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {initials(r.username)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{r.username}</p>
                    <p className="text-xs text-slate-400">{r.email}{r.whatsapp_number ? ` · ${r.whatsapp_number}` : ''}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => decide(r.id, 'approved')}>
                    <Check size={14} /> Approve
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => decide(r.id, 'denied')}>
                    <X size={14} /> Deny
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="All users"
          subtitle={`${filteredUsers.length} of ${users.length}`}
          action={
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 py-1.5 w-40" />
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 font-medium">User</th>
                <th className="py-2 font-medium">Role</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Last login</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 dark:border-slate-800/50">
                  <td className="py-2">
                    <p className="font-medium text-slate-800 dark:text-slate-200">{u.username}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">{u.role}</td>
                  <td className="py-2"><Badge color={STATUS_COLOR[u.status] || 'gray'}>{u.status}</Badge></td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">
                    {u.last_login ? new Date(u.last_login).toLocaleString() : '—'}
                  </td>
                  <td className="py-2 text-right">
                    {u.role !== 'admin' && <UserActionMenu user={u} onSetStatus={setStatus} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
