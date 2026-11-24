/**
 * Placeholder lobby screen. Markup: #pe-lobby in index.html; theme: :root in home.css plus
 * lobby.css; this file only renders a LobbyService's state into those ids. Player names are
 * always set with textContent (never innerHTML).
 */
import './lobby.css';
import {
  ColourId, DrawerNoise, LobbyPlayer, LobbyService, LobbySettings, LobbyState, PLAYER_COLOURS, SETTING_LIMITS,
} from './lobby';
import { inviteLink } from '../home/settings';

export interface LobbyCallbacks {
  /** Leave pressed (the service has already been left). */
  onLeave(): void;
  /** The host started: stage 1 starts the house with this player's nickname and colour. */
  onStart(self: LobbyPlayer, settings: LobbySettings): void;
}

const NOISE_LABEL: Record<DrawerNoise, string> = { off: 'Off', quiet: 'Quiet', normal: 'Normal', loud: 'Loud' };
const SETTING_TEXT = {
  roundMinutes: (v: number) => `${v} min`,
  hideSeconds: (v: number) => `${v} s`,
  phantoms: (v: number) => String(v),
  drawerNoise: (v: DrawerNoise) => NOISE_LABEL[v],
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
  private selects = {
    roundMinutes: $<HTMLSelectElement>('pe-set-round'),
    hideSeconds: $<HTMLSelectElement>('pe-set-hide'),
    phantoms: $<HTMLSelectElement>('pe-set-phantoms'),
    drawerNoise: $<HTMLSelectElement>('pe-set-noise'),
  };
  private colourBtns = new Map<ColourId, HTMLButtonElement>();
  private unsub: () => void;
  private ac = new AbortController();

  constructor(private svc: LobbyService, private cb: LobbyCallbacks) {
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
    fill(this.selects.roundMinutes, range(SETTING_LIMITS.roundMinutes), SETTING_TEXT.roundMinutes);
    fill(this.selects.hideSeconds, range(SETTING_LIMITS.hideSeconds), SETTING_TEXT.hideSeconds);
    fill(this.selects.phantoms, range(SETTING_LIMITS.phantoms), SETTING_TEXT.phantoms);
    fill(this.selects.drawerNoise, [...SETTING_LIMITS.drawerNoise.options], SETTING_TEXT.drawerNoise);
    for (const k of ['roundMinutes', 'hideSeconds', 'phantoms'] as const) on(this.selects[k], 'change', () => this.svc.updateSettings({ [k]: Number(this.selects[k].value) }));
    on(this.selects.drawerNoise, 'change', () => this.svc.updateSettings({ drawerNoise: this.selects.drawerNoise.value as DrawerNoise }));

    on(this.readyBtn, 'click', () => { const me = this.self(); if (me) this.svc.setReady(!me.ready); });
    on($('pe-lobby-start'), 'click', () => {
      if (!this.svc.start().ok) return;
      const st = this.svc.getState(); const me = st.players.find((p) => p.id === st.selfId);
      if (me) this.cb.onStart(me, st.settings);
    });
    on($('pe-lobby-leave'), 'click', () => this.leave());
    on($('pe-lobby-copy'), 'click', () => this.copyLink());
    const share = $<HTMLButtonElement>('pe-lobby-share');
    share.hidden = typeof navigator.share !== 'function';
    on(share, 'click', () => navigator.share?.({ title: 'Phantom Escape', text: `Join my Phantom Escape room ${this.svc.getState().code}`, url: inviteLink(this.svc.getState().code) }).catch(() => {}));
    on(this.list, 'click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.pe-lobby-kick');
      if (b?.dataset.playerId) this.svc.kick(b.dataset.playerId);
    });

    this.unsub = this.svc.onChange((s) => this.render(s));
    this.render(this.svc.getState());
  }

  /** Leave the room (Leave button, browser Back). */
  leave(): void {
    this.svc.leave();
    this.destroy();
    this.cb.onLeave();
  }

  destroy(): void {
    this.unsub();
    this.ac.abort();
  }

  private self(): LobbyPlayer | undefined {
    const s = this.svc.getState();
    return s.players.find((p) => p.id === s.selfId);
  }

  private render(s: LobbyState): void {
    const me = s.players.find((p) => p.id === s.selfId);
    const isHost = s.selfId === s.hostId;
    this.root.dataset.role = isHost ? 'host' : 'player';
    $('pe-lobby-role').textContent = isHost ? '(host)' : '(player)';
    $('pe-lobby-code').textContent = s.code;

    // Player list (textContent only: nicknames are untrusted).
    const ready = s.players.filter((p) => p.ready).length;
    $('pe-lobby-ready-count').textContent = `${ready}/${s.players.length} ready`;
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
      const r = document.createElement('span'); r.className = 'pe-lobby-ready-state'; r.dataset.ready = String(p.ready);
      r.textContent = p.ready ? 'Ready' : 'Not ready'; tags.append(r);
      li.append(sw, name, tags);
      if (isHost && p.id !== s.selfId) {
        const k = document.createElement('button'); k.type = 'button'; k.className = 'pe-lobby-kick'; k.dataset.playerId = p.id;
        k.textContent = 'Kick'; k.setAttribute('aria-label', `Kick ${p.nickname}`);
        li.append(k);
      }
      return li;
    }));

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
    const dl = $('pe-lobby-settings-readonly');
    dl.replaceChildren(...([
      ['Round length', SETTING_TEXT.roundMinutes(s.settings.roundMinutes)],
      ['Hide time', SETTING_TEXT.hideSeconds(s.settings.hideSeconds)],
      ['Phantoms', SETTING_TEXT.phantoms(s.settings.phantoms)],
      ['Drawer noise', SETTING_TEXT.drawerNoise(s.settings.drawerNoise)],
    ] as const).flatMap(([k, v]) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; return [dt, dd]; }));

    // Actions.
    this.readyBtn.setAttribute('aria-pressed', String(!!me?.ready));
    this.readyBtn.textContent = me?.ready ? 'Ready ✓' : 'Ready';
    $('pe-lobby-start').hidden = !isHost;
    $('pe-lobby-wait').hidden = isHost;
  }

  /** Copy the ?room=CODE link: Clipboard API, then execCommand, then show it selected. */
  private async copyLink(): Promise<void> {
    const link = inviteLink(this.svc.getState().code);
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
