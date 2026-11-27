/**
 * Lean Phantom hide menu and the search-start reveal banner for non-Phantoms.
 */
import './phantomHud.css';
import { ITEM_INFO, ITEM_KINDS, type ItemKind, type WorldItem } from '../logic/items';
import {
  BEDROOM_HIDE_LIMIT, BEDROOM_KEY_ERROR, BEDROOM_LIMIT_ERROR, bedroomHideError, bedroomItemCount,
} from '../logic/bedroomHide';
import { hidingSpotList } from '../logic/itemRound';

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function phantomRevealText(
  roles: readonly { id: string; role: string }[],
  players: readonly { id: string; nickname: string }[],
): string {
  const names = roles
    .filter((r) => r.role === 'phantom')
    .map((r) => players.find((p) => p.id === r.id)?.nickname || 'a Phantom');
  if (names.length === 0) return 'A Phantom is among you.';
  if (names.length === 1) return `${names[0]} is the Phantom.`;
  if (names.length === 2) return `The Phantoms are ${names[0]} and ${names[1]}.`;
  return `The Phantoms are ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
}

export function showPhantomReveal(text: string): void {
  const root = el('pe-reveal');
  if (!root) return;
  root.textContent = text;
  root.hidden = false;
}

export function hidePhantomReveal(): void {
  const root = el('pe-reveal');
  if (root) root.hidden = true;
}

export type HidePlaceFn = (kind: ItemKind, spotId: string) => void;

let selectedKind: ItemKind = 'battery';
let onPlace: HidePlaceFn | null = null;
let bound = false;

function bindHideMenu(): void {
  if (bound) return;
  const kinds = el('pe-hide-kinds');
  const spots = el('pe-hide-spots');
  if (!kinds || !spots) return;
  bound = true;
  kinds.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest('button[data-kind]') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    selectedKind = btn.dataset.kind as ItemKind;
    for (const b of kinds.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === btn));
    refreshSpotButtons();
  });
  spots.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest('button[data-spot]') as HTMLButtonElement | null;
    if (!btn || btn.disabled || !onPlace) return;
    onPlace(selectedKind, btn.dataset.spot!);
  });
}

let lastItems: readonly WorldItem[] = [];

function refreshSpotButtons(): void {
  const spots = el('pe-hide-spots');
  if (!spots) return;
  const taken = new Set(lastItems.map((i) => i.spotId).filter(Boolean) as string[]);
  for (const btn of spots.querySelectorAll('button')) {
    const id = (btn as HTMLButtonElement).dataset.spot!;
    if (taken.has(id)) {
      btn.setAttribute('disabled', '');
      (btn as HTMLButtonElement).title = 'This spot already holds an item.';
      continue;
    }
    const err = bedroomHideError(selectedKind, id, lastItems);
    if (err) {
      btn.setAttribute('disabled', '');
      (btn as HTMLButtonElement).title = err;
    } else {
      btn.removeAttribute('disabled');
      (btn as HTMLButtonElement).title = '';
    }
  }
}

export function showHideMenu(items: readonly WorldItem[], place: HidePlaceFn): void {
  bindHideMenu();
  onPlace = place;
  const root = el('pe-hide-menu');
  const kinds = el('pe-hide-kinds');
  const spots = el('pe-hide-spots');
  const rules = el('pe-hide-rules');
  if (!root || !kinds || !spots) return;
  if (rules) {
    rules.textContent = `${BEDROOM_LIMIT_ERROR} ${BEDROOM_KEY_ERROR}`;
  }
  if (!kinds.childElementCount) {
    for (const kind of ITEM_KINDS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.kind = kind;
      b.textContent = ITEM_INFO[kind].label;
      b.setAttribute('aria-pressed', String(kind === selectedKind));
      kinds.appendChild(b);
    }
  }
  if (!spots.childElementCount) {
    for (const s of hidingSpotList()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.spot = s.id;
      b.textContent = s.id.replace(/_/g, ' ');
      spots.appendChild(b);
    }
  }
  root.hidden = false;
  updateHideMenu(items);
}

export function updateHideMenu(items: readonly WorldItem[], error?: string | null): void {
  lastItems = items;
  const count = el('pe-hide-count');
  if (count) count.textContent = `Bedroom used: ${bedroomItemCount(items)}/${BEDROOM_HIDE_LIMIT}`;
  const err = el('pe-hide-error');
  if (err) err.textContent = error ?? '';
  refreshSpotButtons();
}

export function hideHideMenu(): void {
  const root = el('pe-hide-menu');
  if (root) root.hidden = true;
  onPlace = null;
}
