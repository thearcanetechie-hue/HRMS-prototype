'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, Employee } from '@/lib/api';
import { PersonCell } from '@/components/person-cell';
import { Badge } from '@/components/ui/badge';
import { Banner, PageHeader } from '@/components/ui/page';
import { Table, TableEmpty, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate, STATUS_TONE, titleCase } from '@/lib/format';

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
      <PageHeader
        title="My team"
        description={
          items ? `${direct} direct, ${items.length - direct} through your reports` : 'Loading…'
        }
      />
      {error && <Banner>{error}</Banner>}
      <Table>
        <THead>
          <tr>
            <TH>Employee</TH>
            <TH>Designation</TH>
            <TH>Reports to</TH>
            <TH>Joined</TH>
            <TH>Status</TH>
          </tr>
        </THead>
        <TBody>
          {items?.map((e) => (
            <TR key={e.id}>
              <TD>
                <PersonCell employee={e} />
              </TD>
              <TD>{e.designation?.name ?? '–'}</TD>
              <TD>
                {e.direct ? (
                  <Badge tone="accent">You</Badge>
                ) : e.manager ? (
                  `${e.manager.firstName} ${e.manager.lastName}`
                ) : (
                  '–'
                )}
              </TD>
              <TD className="whitespace-nowrap tabular">
                {e.dateOfJoining ? formatDate(e.dateOfJoining) : '–'}
              </TD>
              <TD>
                {e.status && <Badge tone={STATUS_TONE[e.status]}>{titleCase(e.status)}</Badge>}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {items?.length === 0 && <TableEmpty>Nobody reports to you yet.</TableEmpty>}
    </>
  );
}
