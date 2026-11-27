/**
 * Phantom hide item picker (overlay) and the search-start reveal banner for non-Phantoms.
 */
import './phantomHud.css';
import { ITEM_INFO, type ItemKind, type WorldItem } from '../logic/items';
import {
  BEDROOM_HIDE_LIMIT, BEDROOM_KEY_ERROR, BEDROOM_LIMIT_ERROR, bedroomItemCount,
} from '../logic/bedroomHide';
import { HIDING_MENU_KINDS, itemIconSrc } from './phantomHideItems';

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

let menuPick: ItemKind | null = null;
let confirmedKind: ItemKind | null = null;
let bound = false;
let lastError: string | null = null;

function syncOpenButton(): void {
  const open = el('pe-hide-open');
  const picked = el('pe-hide-picked');
  if (!open) return;
  if (confirmedKind) {
    open.textContent = `Holding: ${ITEM_INFO[confirmedKind].label}`;
    if (picked) {
      picked.hidden = false;
      picked.textContent = `Selected: ${ITEM_INFO[confirmedKind].label}. Use a hiding spot to place it.`;
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
  if (open) {
    menuPick = menuPick ?? confirmedKind ?? HIDING_MENU_KINDS[0]!;
    refreshKindButtons();
    syncSelectEnabled();
  }
}

function syncSelectEnabled(): void {
  const select = el('pe-hide-select');
  if (select) select.disabled = menuPick == null;
}

function refreshKindButtons(): void {
  const kinds = el('pe-hide-kinds');
  if (!kinds) return;
  for (const btn of kinds.querySelectorAll<HTMLButtonElement>('button[data-kind]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.kind === menuPick));
  }
}

function buildKindList(): void {
  const kinds = el('pe-hide-kinds');
  if (!kinds || kinds.childElementCount) return;
  for (const kind of HIDING_MENU_KINDS) {
    const info = ITEM_INFO[kind];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pe-hide-item';
    b.dataset.kind = kind;
    const img = document.createElement('img');
    img.src = itemIconSrc(info.artKey);
    img.alt = '';
    img.width = 32;
    img.height = 32;
    const label = document.createElement('span');
    label.textContent = info.label;
    b.append(img, label);
    kinds.appendChild(b);
  }
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
  buildKindList();

  openBtn.addEventListener('click', () => {
    lastError = null;
    setMenuOpen(true);
  });

  cancel.addEventListener('click', () => setMenuOpen(false));

  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) setMenuOpen(false);
  });

  kinds.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest('button[data-kind]') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    menuPick = btn.dataset.kind as ItemKind;
    refreshKindButtons();
    syncSelectEnabled();
  });

  select.addEventListener('click', () => {
    if (!menuPick) return;
    confirmedKind = menuPick;
    syncOpenButton();
    setMenuOpen(false);
    const err = el('pe-hide-error');
    if (err) err.textContent = '';
    lastError = null;
  });
}

export function getSelectedHideKind(): ItemKind | null {
  return confirmedKind;
}

export function showPhantomHideControls(items: readonly WorldItem[]): void {
  bindHideMenu();
  const open = el('pe-hide-open');
  const rules = el('pe-hide-rules');
  if (!open) return;
  if (rules) rules.textContent = `${BEDROOM_LIMIT_ERROR} ${BEDROOM_KEY_ERROR}`;
  open.hidden = false;
  updateHideMenu(items);
  syncOpenButton();
}

export function updateHideMenu(items: readonly WorldItem[], error?: string | null): void {
  if (error !== undefined) lastError = error;
  const count = el('pe-hide-count');
  if (count) count.textContent = `Bedroom used: ${bedroomItemCount(items)}/${BEDROOM_HIDE_LIMIT}`;
  const err = el('pe-hide-error');
  if (err) err.textContent = lastError ?? '';
  syncOpenButton();
}

export function hidePhantomHideControls(): void {
  const open = el('pe-hide-open');
  const backdrop = el('pe-hide-backdrop');
  if (open) open.hidden = true;
  if (backdrop) backdrop.hidden = true;
  menuPick = null;
  confirmedKind = null;
  lastError = null;
}

/** @deprecated Use hidePhantomHideControls */
export const hideHideMenu = hidePhantomHideControls;