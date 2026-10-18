import { demoDelay } from '@/lib/format';

export const ASSET_CATEGORIES = [
  'Laptop',
  'Monitor',
  'Phone',
  'SIM card',
  'ID card',
  'Access card',
  'Headset',
  'Furniture',
  'Vehicle',
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export type AssetStatus = 'ASSIGNED' | 'IN_STOCK' | 'IN_REPAIR' | 'RETIRED' | 'LOST';
export type AssetCondition = 'New' | 'Good' | 'Fair' | 'Damaged';

export type AssetHolder = {
  /** Real employee id when assigned from the app; sample rows only carry a name. */
  employeeId?: string;
  name: string;
  initials: string;
  code?: string;
  /** Last working day when the holder is leaving, so HR knows to collect it. */
  leaving?: string;
};

export type AssetEvent = {
  at: string;
  text: string;
  kind: 'assigned' | 'returned' | 'repair' | 'added' | 'retired';
};

export type Asset = {
  id: string;
  tag: string;
  name: string;
  category: AssetCategory;
  serial: string;
  purchasedOn: string;
  cost: number;
  warrantyUntil: string | null;
  location: string;
  condition: AssetCondition;
  status: AssetStatus;
  holder: AssetHolder | null;
  since: string | null;
  history: AssetEvent[];
};

const today = () =>
  new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const h = (name: string, code?: string, leaving?: string): AssetHolder => ({
  name,
  code,
  leaving,
  initials: name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2),
});

let assets: Asset[] = [
  {
    id: 'a1',
    tag: 'AST-0101',
    name: 'MacBook Pro 14" M3',
    category: 'Laptop',
    serial: 'C02FK3XQMD6T',
    purchasedOn: '12 Jan 2025',
    cost: 189900,
    warrantyUntil: '12 Jan 2028',
    location: 'Bengaluru HQ',
    condition: 'Good',
    status: 'ASSIGNED',
    holder: h('Ananya Sharma', 'EMP-101'),
    since: '15 Jan 2025',
    history: [
      { at: '15 Jan 2025', text: 'Assigned to Ananya Sharma', kind: 'assigned' },
      { at: '12 Jan 2025', text: 'Added to the register', kind: 'added' },
    ],
  },
  {
    id: 'a2',
    tag: 'AST-0102',
    name: 'Dell Latitude 7440',
    category: 'Laptop',
    serial: 'DL7440-8H2K91',
    purchasedOn: '03 Mar 2024',
    cost: 112500,
    warrantyUntil: '03 Mar 2027',
    location: 'Pune office',
    condition: 'Good',
    status: 'ASSIGNED',
    holder: h('Ravi Kumar', 'EMP-102'),
    since: '04 Mar 2024',
    history: [{ at: '04 Mar 2024', text: 'Assigned to Ravi Kumar', kind: 'assigned' }],
  },
  {
    id: 'a3',
    tag: 'AST-0103',
    name: 'Lenovo ThinkPad E14',
    category: 'Laptop',
    serial: 'PF4ZK2M1',
    purchasedOn: '20 Jun 2023',
    cost: 74990,
    warrantyUntil: '20 Jun 2026',
    location: 'Kochi office',
    condition: 'Fair',
    status: 'ASSIGNED',
    holder: h('Priya Menon', 'EMP-103', '14 Nov 2026'),
    since: '21 Jun 2023',
    history: [{ at: '21 Jun 2023', text: 'Assigned to Priya Menon', kind: 'assigned' }],
  },
  {
    id: 'a4',
    tag: 'AST-0104',
    name: 'MacBook Air 13" M2',
    category: 'Laptop',
    serial: 'C02HQ8ZLQ6L4',
    purchasedOn: '10 Oct 2026',
    cost: 99900,
    warrantyUntil: '10 Oct 2027',
    location: 'Bengaluru HQ',
    condition: 'New',
    status: 'IN_STOCK',
    holder: null,
    since: null,
    history: [{ at: '10 Oct 2026', text: 'Added to the register', kind: 'added' }],
  },
  {
    id: 'a5',
    tag: 'AST-0201',
    name: 'Dell UltraSharp 27"',
    category: 'Monitor',
    serial: 'CN0U2723QE',
    purchasedOn: '15 Feb 2025',
    cost: 42999,
    warrantyUntil: '15 Feb 2028',
    location: 'Bengaluru HQ',
    condition: 'Good',
    status: 'ASSIGNED',
    holder: h('Neha Gupta', 'EMP-107'),
    since: '16 Feb 2025',
    history: [{ at: '16 Feb 2025', text: 'Assigned to Neha Gupta', kind: 'assigned' }],
  },
  {
    id: 'a6',
    tag: 'AST-0301',
    name: 'iPhone 15',
    category: 'Phone',
    serial: 'F2LXK9P0N72',
    purchasedOn: '01 Nov 2025',
    cost: 69900,
    warrantyUntil: '01 Nov 2026',
    location: 'Delhi office',
    condition: 'Damaged',
    status: 'IN_REPAIR',
    holder: null,
    since: '09 Oct 2026',
    history: [
      { at: '09 Oct 2026', text: 'Sent for repair · cracked screen', kind: 'repair' },
      { at: '08 Oct 2026', text: 'Returned by Kabir Singh · damaged', kind: 'returned' },
    ],
  },
  {
    id: 'a7',
    tag: 'AST-0401',
    name: 'Employee ID card',
    category: 'ID card',
    serial: 'ID-104',
    purchasedOn: '12 Oct 2026',
    cost: 150,
    warrantyUntil: null,
    location: 'Hyderabad office',
    condition: 'New',
    status: 'ASSIGNED',
    holder: h('Arjun Reddy', 'EMP-104'),
    since: '15 Oct 2026',
    history: [{ at: '15 Oct 2026', text: 'Assigned to Arjun Reddy', kind: 'assigned' }],
  },
  {
    id: 'a8',
    tag: 'AST-0501',
    name: 'Office access card',
    category: 'Access card',
    serial: 'HID-55291',
    purchasedOn: '21 Jun 2023',
    cost: 450,
    warrantyUntil: null,
    location: 'Kochi office',
    condition: 'Good',
    status: 'ASSIGNED',
    holder: h('Priya Menon', 'EMP-103', '14 Nov 2026'),
    since: '21 Jun 2023',
    history: [{ at: '21 Jun 2023', text: 'Assigned to Priya Menon', kind: 'assigned' }],
  },
  {
    id: 'a9',
    tag: 'AST-0601',
    name: 'Jabra Evolve2 65',
    category: 'Headset',
    serial: 'JB65-71820',
    purchasedOn: '05 May 2025',
    cost: 18500,
    warrantyUntil: '05 May 2027',
    location: 'Bengaluru HQ',
    condition: 'Good',
    status: 'IN_STOCK',
    holder: null,
    since: null,
    history: [{ at: '02 Sep 2026', text: 'Returned by Farhan Khan · good', kind: 'returned' }],
  },
  {
    id: 'a10',
    tag: 'AST-0105',
    name: 'HP EliteBook 840 G6',
    category: 'Laptop',
    serial: '5CG9452KXT',
    purchasedOn: '14 Aug 2020',
    cost: 98000,
    warrantyUntil: '14 Aug 2023',
    location: 'Mumbai office',
    condition: 'Damaged',
    status: 'RETIRED',
    holder: null,
    since: '30 Sep 2026',
    history: [{ at: '30 Sep 2026', text: 'Retired · battery and hinge failed', kind: 'retired' }],
  },
];

/** Sample register until the assets API exists. Changes last until the page is reloaded. */
export const getAssets = () => demoDelay(structuredClone(assets));

/** Assets a person holds, matched by employee id or, for sample rows, by name. */
export const getAssetsFor = (employeeId: string, name: string) =>
  demoDelay(
    structuredClone(
      assets.filter(
        (a) =>
          a.status === 'ASSIGNED' &&
          (a.holder?.employeeId === employeeId ||
            (!a.holder?.employeeId && a.holder?.name === name)),
      ),
    ),
  );

function update(id: string, patch: Partial<Asset>, event: AssetEvent) {
  assets = assets.map((a) =>
    a.id === id ? { ...a, ...patch, history: [event, ...a.history] } : a,
  );
  return demoDelay(structuredClone(assets.find((a) => a.id === id)!), 150);
}

export function assignAsset(id: string, holder: AssetHolder, note?: string) {
  return update(
    id,
    { status: 'ASSIGNED', holder, since: today() },
    {
      at: today(),
      text: `Assigned to ${holder.name}${note ? ` · ${note}` : ''}`,
      kind: 'assigned',
    },
  );
}

export function returnAsset(id: string, condition: AssetCondition, note?: string) {
  const a = assets.find((x) => x.id === id);
  return update(
    id,
    {
      status: condition === 'Damaged' ? 'IN_REPAIR' : 'IN_STOCK',
      holder: null,
      since: condition === 'Damaged' ? today() : null,
      condition,
    },
    {
      at: today(),
      text: `Returned by ${a?.holder?.name ?? 'someone'} · ${condition.toLowerCase()}${note ? ` · ${note}` : ''}`,
      kind: 'returned',
    },
  );
}

export function setAssetStatus(
  id: string,
  status: 'IN_REPAIR' | 'IN_STOCK' | 'RETIRED' | 'LOST',
  note?: string,
) {
  const text = {
    IN_REPAIR: 'Sent for repair',
    IN_STOCK: 'Back in stock',
    RETIRED: 'Retired',
    LOST: 'Marked as lost',
  }[status];
  return update(
    id,
    { status, holder: null, since: status === 'IN_STOCK' ? null : today() },
    {
      at: today(),
      text: note ? `${text} · ${note}` : text,
      kind: status === 'IN_REPAIR' ? 'repair' : status === 'IN_STOCK' ? 'returned' : 'retired',
    },
  );
}

export function addAsset(
  input: Omit<Asset, 'id' | 'tag' | 'history' | 'status' | 'holder' | 'since'>,
) {
  const n = assets.length + 1;
  const asset: Asset = {
    ...input,
    id: `a${Date.now()}`,
    tag: `AST-${String(900 + n).padStart(4, '0')}`,
    status: 'IN_STOCK',
    holder: null,
    since: null,
    history: [{ at: today(), text: 'Added to the register', kind: 'added' }],
  };
  assets = [asset, ...assets];
  return demoDelay(structuredClone(asset), 150);
}
