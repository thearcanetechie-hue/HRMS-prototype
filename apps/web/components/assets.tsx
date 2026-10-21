'use client';

import {
  Armchair,
  Car,
  CreditCard,
  Headphones,
  IdCard,
  Laptop,
  Loader2,
  Monitor,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { Badge, type BadgeTone } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card';
import { DialogClose, DialogContent } from './ui/dialog';
import { Field, FormError, Input, Select } from './ui/input';
import { IconTile } from './ui/page';
import { Skeleton } from './ui/progress';
import type { Tone } from './ui/tone';
import { api, ApiError, type Employee, type Paged } from '@/lib/api';
import {
  addAsset,
  ASSET_CATEGORIES,
  assignAsset,
  CONDITION_LABEL,
  getAssetsFor,
  returnAsset,
  type Asset,
  type AssetCategory,
  type AssetCondition,
  type AssetStatus,
} from '@/lib/assets';
import { formatDate } from '@/lib/format';

export const ASSET_ICON: Record<AssetCategory, LucideIcon> = {
  Laptop,
  Monitor,
  Phone: Smartphone,
  'SIM card': CreditCard,
  'ID card': IdCard,
  'Access card': CreditCard,
  Headset: Headphones,
  Furniture: Armchair,
  Vehicle: Car,
};

export const ASSET_TONE: Record<AssetCategory, Tone> = {
  Laptop: 'primary',
  Monitor: 'info',
  Phone: 'success',
  'SIM card': 'success',
  'ID card': 'detail',
  'Access card': 'detail',
  Headset: 'info',
  Furniture: 'warning',
  Vehicle: 'warning',
};

export const ASSET_STATUS: Record<AssetStatus, [string, BadgeTone]> = {
  ASSIGNED: ['Assigned', 'accent'],
  IN_STOCK: ['In stock', 'success'],
  IN_REPAIR: ['In repair', 'warning'],
  RETIRED: ['Retired', 'neutral'],
  LOST: ['Lost', 'danger'],
};

export const dateOrDash = (iso: string | null) => (iso ? formatDate(iso) : '–');

export function AssetTile({
  category,
  size = 36,
}: {
  category: AssetCategory;
  size?: 32 | 36 | 40 | 44;
}) {
  const Icon = ASSET_ICON[category] ?? Laptop;
  return (
    <IconTile tone={ASSET_TONE[category] ?? 'primary'} size={size}>
      <Icon />
    </IconTile>
  );
}

const CONDITIONS = Object.keys(CONDITION_LABEL) as AssetCondition[];
const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

/** Hand an asset to someone. */
export function AssignDialog({ asset, onDone }: { asset: Asset; onDone: (a: Asset) => void }) {
  const [people, setPeople] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Paged<Employee>>('/employees?pageSize=100')
      .then((r) => {
        const list = r.items.filter((e) => e.status !== 'EXITED');
        setPeople(list);
        setEmployeeId(list[0]?.id ?? '');
      })
      .catch(() => setError('Could not load employees.'));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      onDone(await assignAsset(asset.id, employeeId, note.trim()));
    } catch (err) {
      setError(errorText(err, 'Could not assign'));
      setBusy(false);
    }
  }

  return (
    <DialogContent title={`Assign ${asset.name}`} aria-describedby={undefined}>
      <form onSubmit={submit} className="grid gap-4">
        <Field id="as-person" label="Give it to">
          <Select id="as-person" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName} · {p.employeeCode}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="as-note" label="Note (optional)">
          <Input
            id="as-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="With charger and bag"
          />
        </Field>
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit" disabled={!employeeId || busy}>
            {busy && <Loader2 className="animate-spin" />}
            Assign
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}

/** Take an asset back and record the condition it came back in. */
export function ReturnDialog({ asset, onDone }: { asset: Asset; onDone: (a: Asset) => void }) {
  const [condition, setCondition] = useState<AssetCondition>(
    asset.condition === 'NEW' ? 'GOOD' : asset.condition,
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <DialogContent title={`Return ${asset.name}`} aria-describedby={undefined}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            onDone(await returnAsset(asset.id, condition, note.trim()));
          } catch (err) {
            setError(errorText(err, 'Could not record the return'));
            setBusy(false);
          }
        }}
        className="grid gap-4"
      >
        <p className="text-muted-foreground">
          From {asset.holder?.name}. Damaged items go straight to repair.
        </p>
        <Field id="rt-cond" label="Condition">
          <Select
            id="rt-cond"
            value={condition}
            onChange={(e) => setCondition(e.target.value as AssetCondition)}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="rt-note" label="Note (optional)">
          <Input
            id="rt-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Charger missing"
          />
        </Field>
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Mark as returned
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}

export function AddAssetDialog({ onDone }: { onDone: (a: Asset) => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<AssetCategory>('Laptop');
  const [serial, setSerial] = useState('');
  const [purchasedOn, setPurchasedOn] = useState(new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState('');
  const [warranty, setWarranty] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !serial.trim()) return setError('Add a name and a serial number.');
    setBusy(true);
    setError('');
    try {
      onDone(
        await addAsset({
          name: name.trim(),
          category,
          serial: serial.trim(),
          purchasedOn: purchasedOn || null,
          cost: Number(cost) || 0,
          warrantyUntil: warranty || null,
          location: location.trim() || null,
        }),
      );
    } catch (err) {
      setError(errorText(err, 'Could not add the asset'));
      setBusy(false);
    }
  }

  return (
    <DialogContent title="Add asset" side="right" aria-describedby={undefined}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field id="aa-name" label="Name" className="sm:col-span-2">
          <Input
            id="aa-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='MacBook Air 13"'
          />
        </Field>
        <Field id="aa-cat" label="Type">
          <Select
            id="aa-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value as AssetCategory)}
          >
            {ASSET_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field id="aa-serial" label="Serial number">
          <Input
            id="aa-serial"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            className="font-mono"
          />
        </Field>
        <Field id="aa-bought" label="Bought on">
          <Input
            id="aa-bought"
            type="date"
            value={purchasedOn}
            onChange={(e) => setPurchasedOn(e.target.value)}
          />
        </Field>
        <Field id="aa-cost" label="Cost (₹)">
          <Input
            id="aa-cost"
            type="number"
            min={0}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </Field>
        <Field id="aa-warranty" label="Warranty until">
          <Input
            id="aa-warranty"
            type="date"
            value={warranty}
            onChange={(e) => setWarranty(e.target.value)}
          />
        </Field>
        <Field id="aa-loc" label="Location">
          <Input
            id="aa-loc"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Bengaluru HQ"
          />
        </Field>
        <div className="sm:col-span-2">
          <FormError>{error}</FormError>
        </div>
        <div className="flex gap-3 sm:col-span-2">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Add to register
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}

/** Card on a person's page listing what they hold. */
export function ProfileAssetsCard({
  employeeId,
  canManage,
}: {
  employeeId: string;
  canManage: boolean;
}) {
  const [items, setItems] = useState<Asset[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    getAssetsFor(employeeId)
      .then(setItems)
      .catch(() => setFailed(true));
  }, [employeeId]);

  if (failed) return null;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Assets</CardTitle>
          <CardDescription>
            {items ? `${items.length} ${items.length === 1 ? 'item' : 'items'} held` : 'Loading…'}
          </CardDescription>
        </div>
      </CardHeader>
      {!items ? (
        <Skeleton className="h-24" />
      ) : items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nothing assigned.</p>
      ) : (
        <ul className="grid gap-3">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3">
              <AssetTile category={a.category} />
              <div className="min-w-0 grow">
                <div className="truncate font-semibold">{a.name}</div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono">{a.tag}</span> · since {dateOrDash(a.since)}
                </div>
              </div>
              <Badge tone={ASSET_STATUS[a.status][1]}>{ASSET_STATUS[a.status][0]}</Badge>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <Link href="/assets" className="mt-4 inline-block text-[13px] font-bold">
          Open the assets register
        </Link>
      )}
    </Card>
  );
}
