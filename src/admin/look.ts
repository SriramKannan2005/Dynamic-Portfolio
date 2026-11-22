/** Shared visual helpers for the admin: avatar initials/hue and category colours. */
import { MESSAGE_CATEGORIES } from '../shared/categories';

export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
/** Stable hue per address, so a person always gets the same avatar colour. */
export const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
/** Category -> its fixed categorical colour (--cat-1..5, validated for colour-blind separation). */
export const catVar = (c?: string) => {
  const i = MESSAGE_CATEGORIES.indexOf((c ?? 'General') as (typeof MESSAGE_CATEGORIES)[number]);
  return `var(--cat-${(i < 0 ? 4 : i) + 1})`;
};
