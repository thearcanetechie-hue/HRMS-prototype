'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError, Employee } from '@/lib/api';
import { formatDate, initials, STATUS_PILL, titleCase } from '@/lib/format';

export default function TeamPage() {
  const [items, setItems] = useState<Employee[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ items: Employee[] }>('/employees/team')
      .then((r) => setItems(r.items))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load your team.'),
      );
  }, []);

  const direct = items?.filter((e) => e.direct).length ?? 0;
  return (
    <>
      <div className="page-h">
        <div>
          <h1>My team</h1>
          <p>
            {items ? `${direct} direct, ${items.length - direct} through your reports` : 'Loading…'}
          </p>
        </div>
      </div>
      {error && <div className="banner">{error}</div>}
      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Designation</th>
                <th>Reports to</th>
                <th>Joined</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items?.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link
                      href={`/employees/${e.id}`}
                      className="who"
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      <div className="avatar sm alt">{initials(e.firstName, e.lastName)}</div>
                      <div>
                        <div className="n">
                          {e.firstName} {e.lastName}
                        </div>
                        <div className="e">{e.workEmail}</div>
                      </div>
                    </Link>
                  </td>
                  <td>{e.designation?.name ?? '–'}</td>
                  <td>
                    {e.direct ? (
                      <span className="pill acc">You</span>
                    ) : e.manager ? (
                      `${e.manager.firstName} ${e.manager.lastName}`
                    ) : (
                      '–'
                    )}
                  </td>
                  <td className="num">{e.dateOfJoining ? formatDate(e.dateOfJoining) : '–'}</td>
                  <td>
                    {e.status && (
                      <span className={`pill ${STATUS_PILL[e.status]}`}>{titleCase(e.status)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items?.length === 0 && <div className="empty">Nobody reports to you yet.</div>}
        </div>
      </div>
    </>
  );
}
