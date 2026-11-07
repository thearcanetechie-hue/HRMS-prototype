import Link from 'next/link';
import type { Employee } from '@/lib/api';
import { initials } from '@/lib/format';
import { Avatar } from './ui/avatar';

/** Avatar, name and work email linking to the person's page; the first column of people tables. */
export function PersonCell({ employee: e }: { employee: Employee }) {
  return (
    <Link
      href={`/employees/${e.id}`}
      className="group flex items-center gap-3 text-inherit no-underline"
    >
      <Avatar size="sm" initials={initials(e.firstName, e.lastName)} />
      <div className="min-w-0">
        <div className="font-bold whitespace-nowrap group-hover:text-primary-strong dark:group-hover:text-primary">
          {e.firstName} {e.lastName}
        </div>
        <div className="truncate text-xs text-muted-foreground">{e.workEmail}</div>
      </div>
    </Link>
  );
}
