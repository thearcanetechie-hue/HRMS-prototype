import { ASSET_CATEGORIES } from '@hrms/shared';
import { api } from './api';

export { ASSET_CATEGORIES };
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export type AssetStatus = 'ASSIGNED' | 'IN_STOCK' | 'IN_REPAIR' | 'RETIRED' | 'LOST';
export type AssetCondition = 'NEW' | 'GOOD' | 'FAIR' | 'DAMAGED';

export const CONDITION_LABEL: Record<AssetCondition, string> = {
  NEW: 'New',
  GOOD: 'Good',
  FAIR: 'Fair',
  DAMAGED: 'Damaged',
};

export type AssetEvent = { id: string; kind: string; text: string; at: string };

export type Asset = {
  id: string;
  tag: string;
  name: string;
  category: AssetCategory;
  serial: string;
  purchasedOn: string | null;
  cost: number;
  warrantyUntil: string | null;
  location: string | null;
  condition: AssetCondition;
  status: AssetStatus;
  since: string | null;
  notes: string | null;
  /** `leaving` is their last working day when they are on notice. */
  holder: { id: string; name: string; code: string; leaving: string | null } | null;
  history: AssetEvent[];
};

export type NewAsset = {
  name: string;
  category: AssetCategory;
  serial: string;
  purchasedOn: string | null;
  cost: number;
  warrantyUntil: string | null;
  location: string | null;
};

const post = <T>(path: string, body: object) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const getAssets = () => api<Asset[]>('/assets');
export const getAssetsFor = (employeeId: string) => api<Asset[]>(`/employees/${employeeId}/assets`);
export const addAsset = (input: NewAsset) => post<Asset>('/assets', input);
export const assignAsset = (id: string, employeeId: string, note?: string) =>
  post<Asset>(`/assets/${id}/assign`, { employeeId, note: note || null });
export const returnAsset = (id: string, condition: AssetCondition, note?: string) =>
  post<Asset>(`/assets/${id}/return`, { condition, note: note || null });
export const setAssetStatus = (
  id: string,
  status: 'IN_REPAIR' | 'IN_STOCK' | 'RETIRED' | 'LOST',
  note?: string,
) => post<Asset>(`/assets/${id}/status`, { status, note: note || null });
