/**
 * Semantic colour tones shared by icon tiles, progress bars, deltas and chips.
 * Class names are spelled out in full so Tailwind can find them.
 */
export type Tone = 'primary' | 'detail' | 'success' | 'warning' | 'danger' | 'info';

/** Soft tinted background with the tone's colour for text and icons. */
export const TONE_TINT: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary',
  detail: 'bg-detail/12 text-detail',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/12 text-info',
};

/** Solid fill, for bars and dots. */
export const TONE_FILL: Record<Tone, string> = {
  primary: 'bg-primary',
  detail: 'bg-detail',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

export const TONE_TEXT: Record<Tone, string> = {
  primary: 'text-primary',
  detail: 'text-detail',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};
