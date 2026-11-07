'use client';

import {
  Briefcase,
  CalendarDays,
  FileText,
  ListChecks,
  LogIn,
  Package,
  Pencil,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ActivityItem } from './ui/bits';
import { Empty } from './ui/page';
import { Skeleton } from './ui/progress';
import type { Tone } from './ui/tone';
import { api, ApiError } from '@/lib/api';

export interface ActivityEntry {
  id: string;
  at: string;
  action: string;
  text: string;
  employeeId: string | null;
}

/** Icon and colour for a kind of change, from the first part of its action name. */
function look(action: string): [LucideIcon, Tone] {
  if (action === 'employee.created') return [UserPlus, 'success'];
  if (action.startsWith('employee.')) return [Pencil, 'info'];
  if (action.startsWith('attendance.')) return [LogIn, 'success'];
  if (action.startsWith('leave.')) return [CalendarDays, 'warning'];
  if (action.startsWith('document.')) return [FileText, 'detail'];
  if (action.startsWith('checklist.')) return [ListChecks, 'primary'];
  if (action.startsWith('asset.')) return [Package, 'info'];
  return [Briefcase, 'primary'];
}

function dayLabel(at: string) {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const time = (at: string) =>
  new Date(at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

/** Changes grouped under a day heading. */
export function ActivityLog({ events }: { events: ActivityEntry[] }) {
  if (!events.length) return <Empty className="py-10">Nothing has happened here yet.</Empty>;
  const days = [...new Set(events.map((e) => dayLabel(e.at)))];
  return (
    <div className="grid gap-5">
      {days.map((day) => (
        <section key={day} className="grid gap-3.5">
          <h4 className="text-xs font-bold tracking-[0.1em] text-detail uppercase">{day}</h4>
          {events
            .filter((e) => dayLabel(e.at) === day)
            .map((e) => {
              const [Icon, tone] = look(e.action);
              return (
                <ActivityItem
                  key={e.id}
                  icon={<Icon />}
                  tone={tone}
                  title={e.text}
                  caption={time(e.at)}
                />
              );
            })}
        </section>
      ))}
    </div>
  );
}

/** Loads and shows the activity feed: everyone's, or one person's. */
export function ActivityFeed({ employeeId, take = 30 }: { employeeId?: string; take?: number }) {
  const [events, setEvents] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const q = new URLSearchParams({ take: String(take), ...(employeeId ? { employeeId } : {}) });
    api<ActivityEntry[]>(`/dashboard/activity?${q}`)
      .then(setEvents)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load activity.'));
  }, [employeeId, take]);
  if (error) return <p className="text-[13px] text-muted-foreground">{error}</p>;
  if (!events) return <Skeleton className="h-48" />;
  return <ActivityLog events={events} />;
}
