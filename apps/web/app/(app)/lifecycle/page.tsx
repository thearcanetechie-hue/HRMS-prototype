'use client';

import { AlertTriangle, LogOut, Settings2, UserPlus, Users } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import {
  ChecklistDetail,
  ChecklistRow,
  StartChecklistDialog,
  TemplatesDialog,
} from '@/components/checklists';
import { Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Empty, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError, type Checklist, type ChecklistKind } from '@/lib/api';
import { useSession } from '@/lib/session';

type Filter = 'joining' | 'leaving' | 'done';

export default function LifecyclePage() {
  return (
    <Suspense>
      <Lifecycle />
    </Suspense>
  );
}

function Lifecycle() {
  const { can } = useSession();
  const params = useSearchParams();
  const manage = can('lifecycle.manage');
  const [all, setAll] = useState<Checklist[] | null>(null);
  const [filter, setFilter] = useState<Filter>('joining');
  const [mineOnly, setMineOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('checklist'));
  const [starting, setStarting] = useState<ChecklistKind | null>(null);
  const [editingTemplates, setEditingTemplates] = useState(false);
  const [error, setError] = useState('');
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    try {
      setAll(await api<Checklist[]>('/checklists'));
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load checklists.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // Open the tab that holds a checklist linked from elsewhere.
  useEffect(() => {
    const linked = all?.find((c) => c.id === params.get('checklist'));
    if (linked)
      setFilter(
        linked.status !== 'OPEN' ? 'done' : linked.kind === 'ONBOARDING' ? 'joining' : 'leaving',
      );
  }, [all, params]);

  const waitingOnMe = (c: Checklist) => c.tasks.some((t) => t.canTick && !t.doneAt);
  const shown = (all ?? []).filter(
    (c) =>
      (filter === 'done'
        ? c.status !== 'OPEN'
        : c.status === 'OPEN' &&
          c.kind === (filter === 'joining' ? 'ONBOARDING' : 'OFFBOARDING')) &&
      (!mineOnly || waitingOnMe(c)),
  );
  const selected = all?.find((c) => c.id === selectedId) ?? shown[0] ?? null;

  const open = (all ?? []).filter((c) => c.status === 'OPEN');
  const overdue = open.reduce((n, c) => n + c.tasks.filter((t) => t.overdue).length, 0);
  const mine = open.filter(waitingOnMe).length;

  function replace(updated: Checklist) {
    setAll((list) => list && list.map((c) => (c.id === updated.id ? updated : c)));
  }

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Onboarding & offboarding"
        description={
          manage
            ? 'Every joiner and leaver, the tasks left, and who they’re waiting on.'
            : 'Your joining or exit tasks, and those for your team.'
        }
        actions={
          manage && (
            <>
              <Button onClick={() => setEditingTemplates(true)}>
                <Settings2 /> Templates
              </Button>
              <Button onClick={() => setStarting('ONBOARDING')}>
                <UserPlus /> Start onboarding
              </Button>
              <Button variant="primary" onClick={() => setStarting('OFFBOARDING')}>
                <LogOut /> Start offboarding
              </Button>
            </>
          )
        }
      />
      {error && <Banner>{error}</Banner>}

      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          <StatCard
            icon={<UserPlus />}
            tone="success"
            value={all ? open.filter((c) => c.kind === 'ONBOARDING').length : '–'}
            label="Joining now"
          />
          <StatCard
            icon={<LogOut />}
            tone="warning"
            value={all ? open.filter((c) => c.kind === 'OFFBOARDING').length : '–'}
            label="Leaving now"
          />
          <StatCard
            icon={<AlertTriangle />}
            tone="danger"
            value={all ? overdue : '–'}
            label="Overdue tasks"
          />
          <StatCard icon={<Users />} value={all ? mine : '–'} label="Waiting on you" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="joining">Joining</TabsTrigger>
              <TabsTrigger value="leaving">Leaving</TabsTrigger>
              <TabsTrigger value="done">Done</TabsTrigger>
            </TabsList>
          </Tabs>
          <Chip className="xl:ml-auto" active={mineOnly} onClick={() => setMineOnly((m) => !m)}>
            Waiting on me <span className="font-mono text-xs opacity-80">{mine}</span>
          </Chip>
        </div>

        <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
          <Card className="grid content-start gap-2 p-3 sm:p-3">
            {!all ? (
              <Skeleton className="h-64" />
            ) : shown.length === 0 ? (
              <Empty className="py-12">
                {filter === 'joining'
                  ? 'No one is joining right now.'
                  : filter === 'leaving'
                    ? 'No one is leaving right now.'
                    : 'No finished checklists yet.'}
              </Empty>
            ) : (
              shown.map((c) => (
                <ChecklistRow
                  key={c.id}
                  checklist={c}
                  active={selected?.id === c.id}
                  onClick={() => setSelectedId(c.id)}
                />
              ))
            )}
          </Card>
          <div className="min-w-0">
            {selected ? (
              <ChecklistDetail checklist={selected} onChange={replace} onToast={showToast} />
            ) : (
              all && (
                <Card>
                  <Empty>Pick someone to see their checklist.</Empty>
                </Card>
              )
            )}
          </div>
        </div>
      </div>

      <Dialog open={starting !== null} onOpenChange={(o) => !o && setStarting(null)}>
        {starting && (
          <StartChecklistDialog
            kind={starting}
            onStarted={(c) => {
              setStarting(null);
              setAll((list) => [c, ...(list ?? [])]);
              setFilter(c.kind === 'ONBOARDING' ? 'joining' : 'leaving');
              setSelectedId(c.id);
              showToast(`Started ${c.kind === 'ONBOARDING' ? 'onboarding' : 'offboarding'}`);
            }}
          />
        )}
      </Dialog>
      <Dialog open={editingTemplates} onOpenChange={setEditingTemplates}>
        {editingTemplates && <TemplatesDialog onToast={showToast} />}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}
