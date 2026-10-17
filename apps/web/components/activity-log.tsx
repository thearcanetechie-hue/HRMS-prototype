'use client';

import {
  Briefcase,
  CalendarDays,
  FileText,
  LogOut,
  MapPin,
  Pencil,
  UserCheck,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import type { LogEvent, LogIcon } from '@/lib/demo/employees';
import { ActivityItem } from './ui/bits';

export const LOG_ICON: Record<LogIcon, LucideIcon> = {
  'check-in': UserCheck,
  edit: Pencil,
  file: FileText,
  promotion: Briefcase,
  leave: CalendarDays,
  field: MapPin,
  joined: UserPlus,
  exit: LogOut,
};

/** Log events grouped under a day eyebrow. */
export function ActivityLog({ events }: { events: LogEvent[] }) {
  const days = [...new Set(events.map((e) => e.day))];
  return (
    <div className="grid gap-5">
      {days.map((day) => (
        <section key={day} className="grid gap-3.5">
          <h4 className="text-xs font-bold tracking-[0.1em] text-detail uppercase">{day}</h4>
          {events
            .filter((e) => e.day === day)
            .map((e) => {
              const Icon = LOG_ICON[e.icon];
              return (
                <ActivityItem
                  key={e.id}
                  icon={<Icon />}
                  tone={e.tone}
                  title={e.title}
                  caption={[e.detail, e.at].filter(Boolean).join(' · ')}
                />
              );
            })}
        </section>
      ))}
    </div>
  );
}
