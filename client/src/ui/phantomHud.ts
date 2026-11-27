/**
 * Phantom hide item picker (overlay) and the search-start reveal banner for non-Phantoms.
 */
import './phantomHud.css';
import type { WorldItem } from '../logic/items';
import { hideInstanceAlreadyPlaced } from '../logic/hidePlacement';
import {
  BEDROOM_HIDE_LIMIT, BEDROOM_KEY_ERROR, BEDROOM_LIMIT_ERROR, bedroomItemCount,
} from '../logic/bedroomHide';
import {
  type HideMenuSlot,
  hideSlotById,
  itemIconSrc,
  remainingHideSlots,
} from './phantomHideItems';

export { hidePlacementErrorMessage } from './phantomHideItems';

function el<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
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

let menuPickId: string | null = null;
let confirmedSlot: HideMenuSlot | null = null;
let bound = false;
let lastError: string | null = null;

function syncOpenButton(): void {
  const open = el('pe-hide-open');
  const picked = el('pe-hide-picked');
  if (!open) return;
  if (confirmedSlot) {
    open.textContent = `Holding: ${confirmedSlot.label}`;
    if (picked) {
      picked.hidden = false;
      picked.textContent = `Selected: ${confirmedSlot.label}. Use a hiding spot to place it.`;
    }
  } else {
    open.textContent = 'Choose item';
    if (picked) picked.hidden = true;
  }
}

function setMenuOpen(open: boolean): void {
  const backdrop = el('pe-hide-backdrop');
  if (!backdrop) return;
  backdrop.hidden = !open;
  if (open) syncSelectEnabled();
}

function syncSelectEnabled(): void {
  const select = el('pe-hide-select');
  if (select) select.disabled = menuPickId == null;
}

function refreshKindButtons(): void {
  const kinds = el('pe-hide-kinds');
  if (!kinds) return;
  for (const btn of kinds.querySelectorAll<HTMLButtonElement>('button[data-slot-id]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.slotId === menuPickId));
  }
}

function renderHideSlots(items: readonly WorldItem[]): void {
  const kinds = el('pe-hide-kinds');
  if (!kinds) return;
  const slots = remainingHideSlots(items);
  kinds.replaceChildren();
  for (const slot of slots) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pe-hide-item';
    b.dataset.slotId = slot.slotId;
    b.dataset.kind = slot.kind;
    if (slot.variant) b.dataset.variant = slot.variant;
    const img = document.createElement('img');
    img.src = itemIconSrc(slot.artKey);
    img.alt = '';
    img.width = 32;
    img.height = 32;
    const label = document.createElement('span');
    label.textContent = slot.label;
    b.append(img, label);
    kinds.appendChild(b);
  }
  if (menuPickId && !slots.some((s) => s.slotId === menuPickId)) {
    menuPickId = slots[0]?.slotId ?? null;
  }
  if (confirmedSlot && hideInstanceAlreadyPlaced(confirmedSlot.kind, confirmedSlot.variant, items)) {
    confirmedSlot = null;
  }
  refreshKindButtons();
  syncSelectEnabled();
  syncOpenButton();
}

function bindHideMenu(): void {
  if (bound) return;
  const kinds = el('pe-hide-kinds');
  const openBtn = el('pe-hide-open');
  const backdrop = el('pe-hide-backdrop');
  const select = el('pe-hide-select');
  const cancel = el('pe-hide-cancel');
  if (!kinds || !openBtn || !backdrop || !select || !cancel) return;
  bound = true;

  openBtn.addEventListener('click', () => {
    lastError = null;
    setMenuOpen(true);
  });

  cancel.addEventListener('click', () => setMenuOpen(false));

  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) setMenuOpen(false);
  });

  kinds.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest('button[data-slot-id]') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    menuPickId = btn.dataset.slotId!;
    refreshKindButtons();
    syncSelectEnabled();
  });

  select.addEventListener('click', () => {
    const slot = menuPickId ? hideSlotById(menuPickId) : null;
    if (!slot) return;
    confirmedSlot = slot;
    syncOpenButton();
    setMenuOpen(false);
    const err = el('pe-hide-error');
    if (err) err.textContent = '';
    lastError = null;
  });
}

export function getSelectedHideSlot(): HideMenuSlot | null {
  return confirmedSlot;
}

/** @deprecated Use getSelectedHideSlot */
export function getSelectedHideKind(): HideMenuSlot['kind'] | null {
  return confirmedSlot?.kind ?? null;
}

export function showPhantomHideControls(items: readonly WorldItem[]): void {
  bindHideMenu();
  const open = el('pe-hide-open');
  const rules = el('pe-hide-rules');
  if (!open) return;
  if (rules) rules.textContent = `${BEDROOM_LIMIT_ERROR} ${BEDROOM_KEY_ERROR}`;
  open.hidden = false;
  updateHideMenu(items);
}

export function updateHideMenu(items: readonly WorldItem[], error?: string | null): void {
  if (error !== undefined) lastError = error;
  renderHideSlots(items);
  const count = el('pe-hide-count');
  if (count) count.textContent = `Bedroom used: ${bedroomItemCount(items)}/${BEDROOM_HIDE_LIMIT}`;
  const err = el('pe-hide-error');
  if (err) err.textContent = lastError ?? '';
}

export function hidePhantomHideControls(): void {
  const open = el('pe-hide-open');
  const backdrop = el('pe-hide-backdrop');
  if (open) open.hidden = true;
  if (backdrop) backdrop.hidden = true;
  menuPickId = null;
  confirmedSlot = null;
  lastError = null;
}

/** @deprecated Use hidePhantomHideControls */
export const hideHideMenu = hidePhantomHideControls;