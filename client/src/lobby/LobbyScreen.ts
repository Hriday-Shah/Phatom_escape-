/**
 * Placeholder lobby screen. Markup: #pe-lobby in index.html; theme: :root in home.css plus
 * lobby.css; this file only renders a LobbyService's state into those ids. Player names are
 * always set with textContent (never innerHTML).
 */
import './lobby.css';
import {
  ColourId, DRAWER_NOISE, DrawerNoise, LobbyPlayer, LobbyService, LobbySettings, LobbyState, NUMERIC_SETTINGS,
  NumericSettingDef, NumericSettingKey, PLAYER_COLOURS, maxPhantoms, parseSettingInput,
} from './lobby';
import { onlineInviteLink } from '../net/serverConfig';

export interface LobbyCallbacks {
  /** Leave pressed (the service has already been left). */
  onLeave(): void;
  /** The host started: stage 1 starts the house with this player's nickname and colour. */
  onStart(self: LobbyPlayer, settings: LobbySettings): void;
  /** Online only: the room ended for this player (kicked, connection lost). */
  onEnded?(reason: 'kicked' | 'disconnected'): void;
}

/** Online services can also end on their own (kicked / connection lost). */
type EndingService = LobbyService & { onEnd?(cb: (r: 'kicked' | 'disconnected') => void): () => void };

const NOISE_LABEL: Record<DrawerNoise, string> = { off: 'Off', quiet: 'Quiet', normal: 'Normal', loud: 'Loud' };
const numberText = (d: NumericSettingDef, v: number) => (d.unit ? `${v} ${d.unit}` : String(v));

/** Setting -> its <select> id in index.html (restyle hooks). */
export const SETTING_ELEMENT_IDS: Record<keyof LobbySettings, string> = {
  hidingMinutes: 'pe-set-hiding',
  searchMinutes: 'pe-set-search',
  chaseMinutes: 'pe-set-chase',
  stunSeconds: 'pe-set-stun',
  reloadMinutes: 'pe-set-reload',
  sneakSeconds: 'pe-set-sneak',
  sneakCooldownSeconds: 'pe-set-sneak-cd',
  phantoms: 'pe-set-phantoms',
  drawerNoise: 'pe-set-noise',
};

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`lobby element #${id} missing from index.html`);
  return e as T;
};

export class LobbyScreen {
  private root = $('pe-lobby');
  private list = $<HTMLUListElement>('pe-lobby-player-list');
  private grid = $('pe-lobby-colour-grid');
  private readyBtn = $<HTMLButtonElement>('pe-lobby-ready');
  private copyStatus = $('pe-lobby-copy-status');
  private linkBox = $<HTMLInputElement>('pe-lobby-link');
  private selects = Object.fromEntries(
    Object.entries(SETTING_ELEMENT_IDS).map(([k, id]) => [k, $<HTMLSelectElement>(id)]),
  ) as Record<keyof LobbySettings, HTMLSelectElement>;
  private confirm = $<HTMLDialogElement>('pe-lobby-confirm');
  private colourBtns = new Map<ColourId, HTMLButtonElement>();
  private unsub: () => void;
  private unsubEnd: () => void = () => {};
  private startedFired = false;
  /** R11-4: a Kick in flight (row index among the Kick buttons), focus moves on when it lands. */
  private pendingKick: { id: string; index: number } | null = null;
  private ac = new AbortController();

  /** `server`: the online game server (the invite link carries it), or null when offline. */
  constructor(private svc: EndingService, private cb: LobbyCallbacks, private server: string | null = null) {
    const on = (el: EventTarget, ev: string, f: (e: Event) => void) => el.addEventListener(ev, f, { signal: this.ac.signal });
    // Colour buttons (built once).
    this.grid.replaceChildren();
    for (const c of PLAYER_COLOURS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pe-colour'; b.dataset.colour = c.id;
      b.style.setProperty('--pe-swatch', c.hex);
      b.setAttribute('aria-label', c.name); b.title = c.name;
      on(b, 'click', () => this.svc.setColour(c.id));
      this.grid.append(b);
      this.colourBtns.set(c.id, b);
    }
    // Settings selects (options built once from the placeholder limits).
    const fill = (sel: HTMLSelectElement, values: (string | number)[], text: (v: any) => string) => {
      sel.replaceChildren(...values.map((v) => { const o = document.createElement('option'); o.value = String(v); o.textContent = text(v); return o; }));
    };
    const range = (l: { min: number; max: number; step: number }) => { const r: number[] = []; for (let v = l.min; v <= l.max; v += l.step) r.push(v); return r; };
    for (const d of NUMERIC_SETTINGS) {
      const sel = this.selects[d.key];
      fill(sel, range(d), (v: number) => numberText(d, v));
      // '' / junk (or a refused value) reverts to the room's current value; never clamps to the min.
      on(sel, 'change', () => {
        const v = parseSettingInput(sel.value);
        if (v === null || !this.svc.updateSettings({ [d.key]: v }).ok) this.render(this.svc.getState());
      });
    }
    fill(this.selects.drawerNoise, [...DRAWER_NOISE.options], (v: DrawerNoise) => NOISE_LABEL[v]);
    on(this.selects.drawerNoise, 'change', () => {
      if (!this.svc.updateSettings({ drawerNoise: this.selects.drawerNoise.value as DrawerNoise }).ok) this.render(this.svc.getState());
    });

    on(this.readyBtn, 'click', () => { const me = this.self(); if (me) this.svc.setReady(!me.ready); });
    on($('pe-lobby-start'), 'click', () => {
      if (this.svc.allReady()) { this.start(); return; }
      // Not everyone is ready: ask first (HTML dialog, restyle via #pe-lobby-confirm).
      const s = this.svc.getState();
      const waiting = s.players.filter((p) => !p.ready && p.id !== s.hostId).map((p) => p.nickname);
      $('pe-lobby-confirm-detail').textContent = `Not ready: ${waiting.join(', ')}`;
      this.confirm.returnValue = '';
      this.confirm.showModal();
      $('pe-lobby-confirm-cancel').focus();
    });
    // Closing the dialog (buttons, Escape) resolves it; only "ok" starts.
    on(this.confirm, 'close', () => { if (this.confirm.returnValue === 'ok') this.start(); });
    on($('pe-lobby-leave'), 'click', () => this.leave());
    on($('pe-lobby-copy'), 'click', () => this.copyLink());
    const share = $<HTMLButtonElement>('pe-lobby-share');
    share.hidden = typeof navigator.share !== 'function';
    on(share, 'click', () => navigator.share?.({ title: 'Phantom Escape', text: `Join my Phantom Escape room ${this.svc.getState().code}`, url: this.link() }).catch(() => {}));
    on(this.list, 'click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.pe-lobby-kick');
      if (!b?.dataset.playerId) return;
      const index = [...this.list.querySelectorAll('.pe-lobby-kick')].indexOf(b);
      this.pendingKick = { id: b.dataset.playerId, index };
      if (!this.svc.kick(b.dataset.playerId).ok) this.pendingKick = null;
    });

    this.unsub = this.svc.onChange((s) => this.render(s));
    if (this.svc.onEnd) {
      this.unsubEnd = this.svc.onEnd((reason) => {
        if (this.confirm.open) this.confirm.close();
        this.destroy();
        this.cb.onEnded?.(reason);
      });
    }
    // Online rooms are real: replace the offline "only on this device" notice.
    if (server) $('pe-lobby-notice').textContent = 'Online trial room: friends with the invite link can join (up to 8).';
    this.render(this.svc.getState());
  }

  /** Host: ask to start. The game starts for everyone once the room says it started (render). */
  private start(): void {
    this.svc.start();
  }

  /** ?room=CODE, plus &server= when online (a friend only has to open it). */
  private link(): string {
    return onlineInviteLink(this.svc.getState().code, this.server, window.location);
  }

  /** Leave the room (Leave button, browser Back). */
  leave(): void {
    if (this.confirm.open) this.confirm.close();
    this.svc.leave();
    this.destroy();
    this.cb.onLeave();
  }

  destroy(): void {
    this.unsub();
    this.unsubEnd();
    this.ac.abort();
  }

  private self(): LobbyPlayer | undefined {
    const s = this.svc.getState();
    return s.players.find((p) => p.id === s.selfId);
  }

  private render(s: LobbyState): void {
    if (s.started && !this.startedFired) {
      // Started (by this host, or online by the room's host): everyone goes into the house.
      this.startedFired = true;
      const self = s.players.find((p) => p.id === s.selfId);
      if (self) this.cb.onStart(self, s.settings);
      return;
    }
    const me = s.players.find((p) => p.id === s.selfId);
    const isHost = s.selfId === s.hostId;
    this.root.dataset.role = isHost ? 'host' : 'player';
    $('pe-lobby-role').textContent = isHost ? '(host)' : '(player)';
    $('pe-lobby-code').textContent = s.code;

    // Player list (textContent only: nicknames are untrusted). The host is always ready (R11-2):
    // its row says only "Host", and the count is of the other players.
    const others = s.players.filter((p) => p.id !== s.hostId);
    const ready = others.filter((p) => p.ready).length;
    $('pe-lobby-ready-count').textContent = others.length ? `${ready}/${others.length} ready` : 'waiting for players';
    const focusedKick = (document.activeElement as HTMLElement | null)?.closest?.('.pe-lobby-kick') as HTMLElement | null;
    const keepFocusOn = focusedKick && this.list.contains(focusedKick) ? focusedKick.dataset.playerId : undefined;
    this.list.replaceChildren(...s.players.map((p) => {
      const li = document.createElement('li');
      li.className = 'pe-lobby-player'; li.dataset.playerId = p.id;
      if (p.id === s.selfId) li.classList.add('pe-self');
      const sw = document.createElement('span'); sw.className = 'pe-lobby-swatch';
      sw.style.setProperty('--pe-swatch', PLAYER_COLOURS.find((c) => c.id === p.colour)!.hex);
      sw.title = PLAYER_COLOURS.find((c) => c.id === p.colour)!.name;
      const name = document.createElement('span'); name.className = 'pe-lobby-name';
      name.textContent = p.nickname + (p.id === s.selfId ? ' (you)' : '');
      const tags = document.createElement('span'); tags.className = 'pe-lobby-tags';
      if (p.isHost) { const h = document.createElement('span'); h.className = 'pe-lobby-host-badge'; h.textContent = 'Host'; tags.append(h); }
      if (!p.isHost) {
        const r = document.createElement('span'); r.className = 'pe-lobby-ready-state'; r.dataset.ready = String(p.ready);
        r.textContent = p.ready ? 'Ready' : 'Not ready'; tags.append(r);
      }
      li.append(sw, name, tags);
      if (isHost && p.id !== s.selfId) {
        const k = document.createElement('button'); k.type = 'button'; k.className = 'pe-lobby-kick'; k.dataset.playerId = p.id;
        k.textContent = 'Kick'; k.setAttribute('aria-label', `Kick ${p.nickname}`);
        li.append(k);
      }
      return li;
    }));
    this.restoreKickFocus(s, keepFocusOn);

    // Colours: mine pressed, taken ones disabled.
    for (const [id, b] of this.colourBtns) {
      const owner = s.players.find((p) => p.colour === id);
      b.setAttribute('aria-pressed', String(owner?.id === s.selfId));
      b.disabled = !!owner && owner.id !== s.selfId;
      b.setAttribute('aria-label', `${PLAYER_COLOURS.find((c) => c.id === id)!.name}${b.disabled ? ' (taken)' : ''}`);
    }

    // Settings: editable for the host, read-only text for players.
    $('pe-lobby-host-settings').hidden = !isHost;
    $('pe-lobby-settings-readonly').hidden = isHost;
    $('pe-lobby-settings-note').textContent = isHost ? '' : '(set by the host)';
    for (const k of Object.keys(this.selects) as (keyof LobbySettings)[]) this.selects[k].value = String(s.settings[k]);
    // Phantoms: at most one fewer than the players (the room re-clamps as players come and go).
    const cap = maxPhantoms(s.players.length);
    for (const o of this.selects.phantoms.options) o.disabled = Number(o.value) > cap;
    const dl = $('pe-lobby-settings-readonly');
    dl.replaceChildren(...[
      ...NUMERIC_SETTINGS.map((d) => [d.label, numberText(d, s.settings[d.key as NumericSettingKey])] as const),
      ['Drawer noise', NOISE_LABEL[s.settings.drawerNoise]] as const,
    ].flatMap(([k, v]) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; return [dt, dd]; }));

    // Actions. The host has no Ready toggle (always ready).
    this.readyBtn.hidden = isHost;
    this.readyBtn.setAttribute('aria-pressed', String(!!me?.ready));
    this.readyBtn.textContent = me?.ready ? 'Ready ✓' : 'Ready';
    $('pe-lobby-start').hidden = !isHost;
    $('pe-lobby-wait').hidden = isHost;
  }

  /**
   * R11-4: after a Kick lands, focus the next row's Kick, else the previous row's, else Start.
   * Any other re-render keeps focus on the Kick button that had it.
   */
  private restoreKickFocus(s: LobbyState, keep: string | undefined): void {
    const kicks = [...this.list.querySelectorAll<HTMLButtonElement>('.pe-lobby-kick')];
    const pk = this.pendingKick;
    if (pk && !s.players.some((p) => p.id === pk.id)) {
      this.pendingKick = null;
      const target = kicks[pk.index] ?? kicks[pk.index - 1] ?? $<HTMLButtonElement>('pe-lobby-start');
      target.focus({ preventScroll: false });
      return;
    }
    if (keep) kicks.find((k) => k.dataset.playerId === keep)?.focus({ preventScroll: true });
  }

  /** Copy the invite link: Clipboard API, then execCommand, then show it selected. */
  private async copyLink(): Promise<void> {
    const link = this.link();
    let copied = false;
    try { await navigator.clipboard.writeText(link); copied = true; } catch { /* no permission / insecure context */ }
    if (!copied) {
      this.linkBox.value = link; this.linkBox.hidden = false;
      this.linkBox.focus(); this.linkBox.select();
      try { copied = document.execCommand('copy'); } catch { copied = false; }
    }
    if (copied) this.linkBox.hidden = true;
    this.copyStatus.textContent = copied ? 'Invite link copied.' : 'Copy the link above to invite players.';
  }
}
