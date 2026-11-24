import './minigame.css';
import type { EscapeCode } from '../logic/escapeCode';
import { CODE_COLOURS, CODE_GLYPH } from '../logic/escapeCode';
import { qaHooksAllowed } from '../config/debugFlags';
import {
  createMinigame, MINIGAME_SECONDS, MinigameEngine, MinigameId, MinigameInput, MinigameStatus,
  MEMORY_FACES, wallAutotile,
} from '../logic/minigames';
import type { ChaseState, LockPickState, MazeState, MemoryState, SlideState } from '../logic/minigames';
import { ArtCache, MG_ART_KEYS, drawNineSlice, mgUrl } from './art';

export interface MinigameHooks {
  /** Joystick direction in -1..1 (same as UIScene). */
  joystick(): { x: number; y: number };
  onWin(): void;
  onClose(): void;
}

const ART_H = 120;
const ART_W = 112;
const ART_W_WIDE = 136;
const TITLE_KEY: Record<MinigameId, string> = {
  slide: 'mg_title_slide',
  maze: 'mg_title_maze',
  lockpick: 'mg_title_lock',
  memory: 'mg_title_memory',
  chase: 'mg_title_chase',
};

/**
 * Compact pixel-art popup, centred in the console's game screen. Joystick and
 * action buttons stay free; the world does not pause.
 */
export class MinigameOverlay {
  readonly el: HTMLElement;
  private stage: HTMLElement;
  private chrome: HTMLCanvasElement;
  private statusEl: HTMLElement;
  private closeBtn: HTMLButtonElement;
  private closeImg: HTMLImageElement;
  private engine: MinigameEngine | null = null;
  private hooks: MinigameHooks | null = null;
  private remaining = 0;
  private deadlineAt = 0;
  private lastTs = 0;
  private prevFocus: HTMLElement | null = null;
  private raf = 0;
  private ended: MinigameStatus = 'playing';
  private moveRepeat = 0;
  private lastJoy = { x: 0, y: 0 };
  private unsubs: (() => void)[] = [];
  private memoryWait: number | null = null;
  private id: MinigameId | null = null;
  private art = new ArtCache();
  private scale = 3;
  private artW = ART_W;
  private flashUntil = 0;
  private lastDir = { dx: 1, dy: 0 };
  private memoryCursor = false;
  private wispDirs = new Map<number, { dx: number; dy: number }>();

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'pe-minigame';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.innerHTML = `
      <div id="pe-minigame-panel">
        <div id="pe-minigame-stage"></div>
        <button id="pe-minigame-close" type="button" aria-label="Close"><img alt=""></button>
        <div id="pe-minigame-status"></div>
      </div>`;
    document.body.appendChild(this.el);
    this.stage = this.el.querySelector('#pe-minigame-stage')!;
    // Keep the chrome canvas off-DOM while the popup is closed so the game
    // page has only the Phaser canvas (stage-2 E2E counts document canvases).
    this.chrome = document.createElement('canvas');
    this.chrome.id = 'pe-minigame-chrome';
    this.chrome.width = 112;
    this.chrome.height = 120;
    this.statusEl = this.el.querySelector('#pe-minigame-status')!;
    this.closeBtn = this.el.querySelector('#pe-minigame-close')!;
    this.closeImg = this.closeBtn.querySelector('img')!;
    this.closeImg.src = mgUrl('mg_btn_close');
    this.closeBtn.addEventListener('click', () => this.close());
    const press = () => { this.closeImg.src = mgUrl('mg_btn_close_pressed'); };
    const unpress = () => { this.closeImg.src = mgUrl('mg_btn_close'); };
    this.closeBtn.addEventListener('pointerdown', press);
    this.closeBtn.addEventListener('pointerup', unpress);
    this.closeBtn.addEventListener('pointerleave', unpress);
    this.closeBtn.addEventListener('pointercancel', unpress);
    void this.art.load([...MG_ART_KEYS]).then(() => { if (!this.el.hidden) { this.render(true); this.paintChrome(); } });
  }

  isOpen(): boolean { return !this.el.hidden; }
  currentId(): MinigameId | null { return this.id; }
  remainingMs(): number { return this.deadlineAt ? Math.max(0, this.deadlineAt - performance.now()) : Math.max(0, this.remaining * 1000); }
  status(): MinigameStatus { return this.engine?.status() ?? this.ended; }

  /** Place the popup inside the shell's game screen (CSS px), centred. */
  place(screen: { x: number; y: number; w: number; h: number }): void {
    this.el.style.left = `${Math.round(screen.x)}px`;
    this.el.style.top = `${Math.round(screen.y)}px`;
    this.el.style.width = `${Math.round(screen.w)}px`;
    this.el.style.height = `${Math.round(screen.h)}px`;
    // README: ×3 is the default; ×2 only when the viewport short side is under 390 CSS px.
    const vw = typeof window !== 'undefined' ? window.innerWidth : screen.w;
    const vh = typeof window !== 'undefined' ? window.innerHeight : screen.h;
    let s: 2 | 3 = Math.min(vw, vh) < 390 ? 2 : 3;
    if (s === 3 && vh < ART_H * 3) s = 2;
    const landscape = vw > vh;
    const wide = landscape && vw >= ART_W_WIDE * s + 16;
    this.scale = s;
    this.artW = wide ? ART_W_WIDE : ART_W;
    this.el.style.setProperty('--pe-mg-s', String(s));
    this.el.style.setProperty('--pe-mg-aw', String(this.artW));
    this.chrome.width = this.artW;
    this.chrome.height = ART_H;
    if (!this.el.hidden) { this.render(true); this.paintChrome(); }
  }

  open(id: MinigameId, seed: number, hooks: MinigameHooks, seconds = MINIGAME_SECONDS): void {
    this.close(false);
    this.hooks = hooks;
    this.id = id;
    this.engine = createMinigame(id, seed);
    this.ended = 'playing';
    this.remaining = seconds;
    this.deadlineAt = performance.now() + seconds * 1000;
    this.lastTs = 0;
    this.moveRepeat = 0;
    this.flashUntil = 0;
    this.lastDir = { dx: 1, dy: 0 };
    this.wispDirs.clear();
    this.memoryCursor = false;
    this.el.dataset.game = id;
    this.el.dataset.status = 'playing';
    this.el.hidden = false;
    this.attachChrome();
    this.statusEl.textContent = '';
    this.render(true);
    this.paintChrome();
    this.bind();
    this.raf = requestAnimationFrame((t) => this.loop(t));
    this.focusInto();
    this.expose();
  }

  /** USE / Enter / Space. */
  confirm(): void { this.send({ type: 'confirm' }); }

  move(dx: number, dy: number): void { this.send({ type: 'move', dx, dy }); }

  close(notify = true): void {
    if (this.el.hidden && !this.engine) return;
    this.unbind();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.memoryWait) { clearTimeout(this.memoryWait); this.memoryWait = null; }
    this.el.hidden = true;
    this.chrome.remove();
    this.stage.replaceChildren();
    delete this.el.dataset.game;
    delete this.el.dataset.status;
    this.engine = null;
    this.id = null;
    const hooks = this.hooks;
    this.hooks = null;
    this.clearExpose();
    this.restoreFocus();
    if (notify) hooks?.onClose();
  }

  /** QA: run the legal solver and let the win path fire. */
  playWin(): void {
    if (!this.engine || this.ended !== 'playing') return;
    this.engine.solve();
    this.engine.tick?.(0);
    this.afterInput();
  }

  /** QA: expire the timer now (retry path). */
  expire(): void {
    this.remaining = 0;
    this.deadlineAt = performance.now();
    this.onTimeout();
  }

  private send(action: MinigameInput): void {
    if (!this.engine || this.ended !== 'playing') return;
    if (action.type === 'move' && (action.dx || action.dy)) {
      this.lastDir = { dx: Math.sign(action.dx) || this.lastDir.dx, dy: action.dx ? 0 : Math.sign(action.dy) };
      if (this.id === 'memory') this.memoryCursor = true;
    }
    this.engine.input(action);
    this.afterInput();
  }

  private afterInput(): void {
    if (!this.engine) return;
    const mem = this.engine.state() as MemoryState;
    if (this.id === 'memory' && mem.locked && !this.memoryWait) {
      this.memoryWait = window.setTimeout(() => {
        this.memoryWait = null;
        (this.engine as { flipBack?: () => void })?.flipBack?.();
        this.render();
        this.expose();
      }, 550);
    }
    if (this.id === 'lockpick') {
      const st = this.engine.state() as LockPickState;
      if (st.flash) this.flashUntil = performance.now() + 450;
    }
    this.render();
    const st = this.engine.status();
    if (st === 'won') this.finish('won');
    else if (st === 'lost') this.finish('lost');
    this.expose();
  }

  private loop(ts: number): void {
    if (!this.engine || this.el.hidden) return;
    if (!this.lastTs) this.lastTs = ts;
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    if (this.ended === 'playing') {
      this.remaining = this.remainingMs() / 1000;
      this.engine.tick?.(dt);
      this.pollJoystick(dt);
      const st = this.engine.status();
      if (st === 'won') this.finish('won');
      else if (st === 'lost') this.finish('lost');
      else if (this.remainingMs() <= 0) this.onTimeout();
      if (this.id === 'lockpick' || this.id === 'chase') this.render();
    }
    this.paintChrome();
    this.expose();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  private onTimeout(): void {
    if (this.ended !== 'playing') return;
    if (this.id === 'chase' && this.engine && this.engine.status() === 'playing') {
      (this.engine as { surviveWin?: () => void }).surviveWin?.();
      if (this.engine.status() === 'won') { this.finish('won'); return; }
    }
    this.finish('lost');
  }

  private finish(result: MinigameStatus): void {
    if (this.ended !== 'playing') return;
    this.ended = result;
    this.el.dataset.status = result;
    if (result === 'won') {
      this.statusEl.textContent = 'You got the paper code!';
      this.hooks?.onWin();
    } else {
      this.statusEl.textContent = this.id === 'chase' && this.engine?.status() === 'lost'
        ? 'Caught! Close and try again — you keep the controller.'
        : 'Time’s up. Close and try again — you keep the controller.';
    }
    this.render();
    this.paintChrome();
    this.expose();
  }

  private pollJoystick(dt: number): void {
    const j = this.hooks?.joystick() ?? { x: 0, y: 0 };
    const dead = 0.35;
    const dx = Math.abs(j.x) >= dead ? Math.sign(j.x) : 0;
    const dy = Math.abs(j.y) >= dead ? Math.sign(j.y) : 0;
    if (this.id === 'chase') {
      if (dx || dy) this.send({ type: 'move', dx, dy });
      return;
    }
    if (!dx && !dy) { this.moveRepeat = 0; this.lastJoy = { x: 0, y: 0 }; return; }
    const turned = dx !== this.lastJoy.x || dy !== this.lastJoy.y;
    this.lastJoy = { x: dx, y: dy };
    this.moveRepeat -= dt;
    if (turned || this.moveRepeat <= 0) {
      this.send({ type: 'move', dx, dy });
      this.moveRepeat = turned ? 0.22 : 0.12;
    }
  }

  private focusables(): HTMLElement[] {
    const list = [this.closeBtn, ...this.stage.querySelectorAll<HTMLElement>('button:not([disabled])')];
    return list.filter((el) => !!el && !el.hidden && (el.offsetParent !== null || el === this.closeBtn));
  }

  private focusInto(): void {
    this.prevFocus = (document.activeElement instanceof HTMLElement) ? document.activeElement : null;
    const first = this.focusables()[0] ?? this.closeBtn;
    first.focus({ preventScroll: true });
  }

  private restoreFocus(): void {
    const el = this.prevFocus;
    this.prevFocus = null;
    if (el && document.contains(el) && typeof el.focus === 'function') {
      try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
  }

  private bind(): void {
    const onKey = (e: KeyboardEvent) => {
      if (this.el.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
      if (e.key === 'Tab') {
        const items = this.focusables();
        if (!items.length) { e.preventDefault(); return; }
        const first = items[0]!, last = items[items.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !this.el.contains(active))) {
          e.preventDefault(); last.focus(); return;
        }
        if (!e.shiftKey && (active === last || !this.el.contains(active))) {
          e.preventDefault(); first.focus(); return;
        }
        return;
      }
      if (this.ended !== 'playing') return;
      const map: Record<string, MinigameInput> = {
        ArrowUp: { type: 'move', dx: 0, dy: -1 }, ArrowDown: { type: 'move', dx: 0, dy: 1 },
        ArrowLeft: { type: 'move', dx: -1, dy: 0 }, ArrowRight: { type: 'move', dx: 1, dy: 0 },
        w: { type: 'move', dx: 0, dy: -1 }, W: { type: 'move', dx: 0, dy: -1 },
        s: { type: 'move', dx: 0, dy: 1 }, S: { type: 'move', dx: 0, dy: 1 },
        a: { type: 'move', dx: -1, dy: 0 }, A: { type: 'move', dx: -1, dy: 0 },
        d: { type: 'move', dx: 1, dy: 0 }, D: { type: 'move', dx: 1, dy: 0 },
        Enter: { type: 'confirm' }, ' ': { type: 'confirm' }, e: { type: 'confirm' }, E: { type: 'confirm' },
      };
      const a = map[e.key];
      if (!a) return;
      e.preventDefault();
      this.send(a);
    };
    window.addEventListener('keydown', onKey, true);
    const onFocusIn = (e: FocusEvent) => {
      if (this.el.hidden) return;
      const t = e.target as Node | null;
      if (t && !this.el.contains(t)) {
        const first = this.focusables()[0] ?? this.closeBtn;
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener('focusin', onFocusIn);
    this.unsubs.push(() => window.removeEventListener('keydown', onKey, true));
    this.unsubs.push(() => document.removeEventListener('focusin', onFocusIn));
  }

  private unbind(): void { this.unsubs.forEach((u) => u()); this.unsubs = []; }

  private screenW(): number { return this.artW - 16; }

  private attachChrome(): void {
    if (this.chrome.isConnected) return;
    this.el.querySelector('#pe-minigame-panel')!.insertBefore(this.chrome, this.stage);
  }

  private paintChrome(): void {
    if (!this.el.hidden) this.attachChrome();
    const ctx = this.chrome.getContext('2d');
    if (!ctx) return;
    const w = this.artW, h = ART_H;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    const frame = this.art.get('mg_popup_frame');
    if (frame) drawNineSlice(ctx, frame, 0, 0, w, h, 8, 8, 26, 14);
    if (this.id) {
      const title = this.art.get(TITLE_KEY[this.id]);
      if (title) ctx.drawImage(title, 8, 8);
    }
    const icon = this.art.get('mg_timer_icon');
    if (icon) ctx.drawImage(icon, 8, h - 11);
    const trackW = (w - 8) - 15;
    const track = this.art.get('mg_timer_track');
    if (track) drawNineSlice(ctx, track, 15, h - 10, trackW, 6, 3, 3, 1, 1);
    const rem = Math.max(0, this.remaining);
    const fillW = Math.max(0, Math.round((trackW - 2) * (rem / MINIGAME_SECONDS)));
    const low = rem <= 10;
    const blink = rem <= 5 && Math.floor(performance.now() / 250) % 2 === 1;
    const fill = this.art.get(low ? 'mg_timer_fill_low' : 'mg_timer_fill');
    if (fill && fillW > 0 && !blink) drawNineSlice(ctx, fill, 16, h - 9, fillW, 4, 1, 1, 1, 1);
  }

  private render(rebuild = false): void {
    if (!this.engine) return;
    if (rebuild) this.stage.innerHTML = '';
    switch (this.id) {
      case 'slide': this.renderSlide(this.engine.state() as SlideState, rebuild); break;
      case 'maze': this.renderMaze(this.engine.state() as MazeState, rebuild); break;
      case 'lockpick': this.renderLock(this.engine.state() as LockPickState, rebuild); break;
      case 'memory': this.renderMemory(this.engine.state() as MemoryState, rebuild); break;
      case 'chase': this.renderChase(this.engine.state() as ChaseState, rebuild); break;
    }
  }

  private stageCanvas(rebuild: boolean, cssW: number, cssH: number, artW: number, artH: number): HTMLCanvasElement {
    let c = this.stage.querySelector('canvas') as HTMLCanvasElement | null;
    if (rebuild || !c) {
      this.stage.innerHTML = '';
      c = document.createElement('canvas');
      this.stage.appendChild(c);
    }
    c.width = artW;
    c.height = artH;
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
    c.style.position = 'absolute';
    c.style.left = '0';
    c.style.top = '0';
    return c;
  }

  private renderSlide(s: SlideState, rebuild: boolean): void {
    const scale = this.scale;
    const sw = this.screenW();
    const sh = 80;
    const pitch = 26, size = 24, grid = 76;
    const ox = Math.round((sw - grid) / 2);
    const oy = Math.round((sh - grid) / 2);
    let board = this.stage.querySelector('.pe-mg-board') as HTMLElement | null;
    if (rebuild || !board) {
      this.stage.innerHTML = '';
      board = document.createElement('div');
      board.className = 'pe-mg-board';
      board.style.left = '0';
      board.style.top = '0';
      board.style.width = '100%';
      board.style.height = '100%';
      for (let i = 0; i < 9; i++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'pe-mg-cell';
        cell.dataset.index = String(i);
        const img = document.createElement('img');
        img.alt = '';
        cell.appendChild(img);
        cell.addEventListener('click', () => this.send({ type: 'tap', index: i }));
        board.appendChild(cell);
      }
      this.stage.appendChild(board);
      let sx = 0, sy = 0, swiped = false;
      board.addEventListener('pointerdown', (e: PointerEvent) => { sx = e.clientX; sy = e.clientY; swiped = false; });
      board.addEventListener('pointerup', (e: PointerEvent) => {
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.hypot(dx, dy) < 20) return;
        swiped = true;
        if (Math.abs(dx) >= Math.abs(dy)) this.send({ type: 'move', dx: Math.sign(dx), dy: 0 });
        else this.send({ type: 'move', dx: 0, dy: Math.sign(dy) });
      });
      board.addEventListener('click', (e) => { if (swiped) { e.stopPropagation(); swiped = false; } }, true);
    }
    const solved = s.tiles.every((v, i) => v === (i === 8 ? 0 : i + 1)) || this.ended === 'won';
    [...board.children].forEach((el, i) => {
      const v = s.tiles[i]!;
      const col = i % 3, row = Math.floor(i / 3);
      const b = el as HTMLElement;
      b.style.left = `${(ox + col * pitch) * scale}px`;
      b.style.top = `${(oy + row * pitch) * scale}px`;
      b.style.width = `${size * scale}px`;
      b.style.height = `${size * scale}px`;
      const img = b.querySelector('img')!;
      const show9 = (v === 0 && solved);
      const key = v === 0 ? (show9 ? 'mg_slide_tile_9' : 'mg_slide_empty') : `mg_slide_tile_${v}`;
      img.src = mgUrl(key);
      b.classList.toggle('is-blank', v === 0 && !show9);
      (b as HTMLButtonElement).disabled = v === 0 && !show9;
    });
  }

  private renderMemory(s: MemoryState, rebuild: boolean): void {
    const scale = this.scale;
    const sw = this.screenW(), sh = 80;
    const pitchX = 24, pitchY = 30, cw = 20, ch = 26;
    const gridW = pitchX * 3 + cw, gridH = pitchY + ch;
    const ox = Math.round((sw - gridW) / 2);
    const oy = Math.round((sh - gridH) / 2);
    let board = this.stage.querySelector('.pe-mg-board') as HTMLElement | null;
    if (rebuild || !board) {
      this.stage.innerHTML = '';
      board = document.createElement('div');
      board.className = 'pe-mg-board';
      board.style.left = '0';
      board.style.top = '0';
      board.style.width = '100%';
      board.style.height = '100%';
      for (let i = 0; i < 8; i++) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'pe-mg-card';
        card.dataset.index = String(i);
        const img = document.createElement('img');
        img.alt = '';
        card.appendChild(img);
        const over = document.createElement('img');
        over.alt = '';
        over.className = 'pe-mg-matched';
        over.style.position = 'absolute';
        over.style.inset = '0';
        over.style.display = 'none';
        over.src = mgUrl('mg_memory_matched');
        card.appendChild(over);
        card.addEventListener('click', () => this.send({ type: 'tap', index: i }));
        board.appendChild(card);
      }
      this.stage.appendChild(board);
    }
    const cursor = (this.engine as { cursor?: number }).cursor;
    [...board.children].forEach((el, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const b = el as HTMLElement;
      b.style.left = `${(ox + col * pitchX) * scale}px`;
      b.style.top = `${(oy + row * pitchY) * scale}px`;
      b.style.width = `${cw * scale}px`;
      b.style.height = `${ch * scale}px`;
      const up = !!(s.faceUp[i] || s.matched[i]);
      const face = MEMORY_FACES[s.cards[i]!] ?? 'stun_gun';
      const img = b.querySelector('img')!;
      img.src = mgUrl(up ? `mg_memory_face_${face}` : 'mg_memory_back');
      const over = b.querySelector('.pe-mg-matched') as HTMLImageElement;
      over.style.display = s.matched[i] ? 'block' : 'none';
      const showCursor = this.memoryCursor && i === cursor;
      b.classList.toggle('is-cursor', showCursor);
      b.style.outline = showCursor ? '2px solid #f2d13a' : '';
    });
  }

  private renderMaze(s: MazeState, rebuild: boolean): void {
    const scale = this.scale;
    const sw = this.screenW(), sh = 80;
    const canvas = this.stageCanvas(rebuild, sw * scale, sh * scale, sw, sh);
    if (rebuild) {
      canvas.addEventListener('click', (ev) => {
        const r = canvas.getBoundingClientRect();
        const ox = (sw - s.w * 8) / 2;
        const col = Math.floor((ev.clientX - r.left) * sw / r.width - ox) >> 3;
        const row = Math.floor((ev.clientY - r.top) * sh / r.height) >> 3;
        this.send({ type: 'tap', col, row });
      });
    }
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, sw, sh);
    const ox = Math.round((sw - s.w * 8) / 2);
    const floor = this.art.get('mg_maze_floor');
    const wall = this.art.get('mg_maze_wall');
    const start = this.art.get('mg_maze_start');
    const exit = this.art.get('mg_maze_exit');
    const dot = this.art.get('mg_maze_dot');
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const open = s.grid[y * s.w + x] === 1;
      const dx = ox + x * 8, dy = y * 8;
      const tile = !open ? wall : (x === s.ex && y === s.ey ? exit : (x === 1 && y === 1 ? start : floor));
      if (tile) ctx.drawImage(tile, dx, dy);
    }
    if (dot) {
      const px = ox + s.px * 8 + 1, py = s.py * 8 + 1;
      this.drawTinted(ctx, dot, px, py, '#7EE0FF');
    }
  }

  private renderLock(s: LockPickState, rebuild: boolean): void {
    const scale = this.scale;
    const sw = this.screenW(), sh = 80;
    const canvas = this.stageCanvas(rebuild, sw * scale, sh * scale, sw, sh);
    if (rebuild) canvas.addEventListener('click', () => this.send({ type: 'confirm' }));
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, sw, sh);
    const dial = this.art.get('mg_lock_dial');
    const zone = this.art.get('mg_lock_target_zone');
    const pick = this.art.get('mg_lock_pick');
    const cx = sw / 2, cy = sh / 2;
    if (dial) ctx.drawImage(dial, cx - 32, cy - 32);
    if (zone) this.drawRotated(ctx, zone, cx, cy, s.zone * Math.PI * 2);
    if (pick) this.drawRotated(ctx, pick, cx, cy, s.pick * Math.PI * 2);
    if (s.flash && performance.now() < this.flashUntil) {
      const on = Math.floor(performance.now() / 80) % 2 === 0;
      const flash = this.art.get(s.flash === 'success' ? 'mg_lock_flash_success' : 'mg_lock_flash_fail');
      if (on && flash) ctx.drawImage(flash, cx - 32, cy - 32);
    } else if (s.flash && performance.now() >= this.flashUntil) {
      (this.engine as { clearFlash?: () => void })?.clearFlash?.();
    }
    ctx.save();
    ctx.fillStyle = '#f4f1ea';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${s.hits}/${s.needed}`, 2, 2);
    const pip = 4, gap = 2;
    let px = 2, py = 12;
    for (let i = 0; i < s.needed; i++) {
      ctx.fillStyle = i < s.hits ? '#5fd3e6' : '#3b3a44';
      ctx.fillRect(px, py, pip, pip);
      px += pip + gap;
    }
    ctx.restore();
  }

  private renderChase(s: ChaseState, rebuild: boolean): void {
    const scale = this.scale;
    const sw = this.screenW(), sh = 80;
    const canvas = this.stageCanvas(rebuild, sw * scale, sh * scale, sw, sh);
    if (rebuild) {
      canvas.addEventListener('click', (ev) => {
        const r = canvas.getBoundingClientRect();
        const ox = (sw - s.w * 8) / 2;
        const col = Math.floor((ev.clientX - r.left) * sw / r.width - ox) >> 3;
        const row = Math.floor((ev.clientY - r.top) * sh / r.height) >> 3;
        this.send({ type: 'tap', col, row });
      });
    }
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, sw, sh);
    const ox = Math.round((sw - s.w * 8) / 2);
    const walls = this.art.get('mg_chase_walls');
    const spark = this.art.get('mg_chase_spark');
    const candle = this.art.get('mg_chase_candle');
    const lumo = this.art.get('mg_chase_lumo');
    const frightened = this.art.get('mg_chase_wisp_frightened');
    const now = performance.now() / 1000;
    const candleFrame = Math.floor(now * 6) % 2;
    const lumoPhase = [0, 1, 2, 1][Math.floor(now * 10) % 4]!;
    const wispFlicker = Math.floor(now * 6) % 2;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x;
      const dx = ox + x * 8, dy = y * 8;
      if (s.grid[i] === 0) {
        if (walls) {
          const f = wallAutotile(s.grid, x, y, s.w, s.h);
          ctx.drawImage(walls, Math.max(0, f) * 8, 0, 8, 8, dx, dy, 8, 8);
        }
      } else {
        if (s.dots[i] && spark) ctx.drawImage(spark, dx, dy);
        if (s.candles[i] && candle) ctx.drawImage(candle, candleFrame * 8, 0, 8, 8, dx, dy, 8, 8);
      }
    }
    s.ghosts.forEach((g, gi) => {
      if (g.dead > 0) return;
      const dir = (g.dx || g.dy) ? { dx: g.dx, dy: g.dy } : (this.wispDirs.get(gi) ?? { dx: 1, dy: 0 });
      if (g.dx || g.dy) this.wispDirs.set(gi, { dx: g.dx, dy: g.dy });
      const gx = ox + (g.x + g.fx) * 8 + 4 - 6;
      const gy = (g.y + g.fy) * 8 + 4 - 6;
      if (s.frightened > 0 && frightened) {
        const flash = s.frightened <= 2;
        const col = flash ? 2 + wispFlicker : wispFlicker;
        ctx.drawImage(frightened, col * 12, 0, 12, 12, gx, gy, 12, 12);
      } else {
        const sheet = this.art.get(`mg_chase_wisp_${g.kind}`);
        if (!sheet) return;
        const row = dirRow(dir.dx, dir.dy);
        ctx.drawImage(sheet, wispFlicker * 12, row * 12, 12, 12, gx, gy, 12, 12);
      }
    });
    if (lumo) {
      const p = s.player;
      const dir = (p.dx || p.dy) ? { dx: p.dx, dy: p.dy } : this.lastDir;
      if (p.dx || p.dy) this.lastDir = { dx: p.dx, dy: p.dy };
      const row = dirRow(dir.dx, dir.dy);
      const lx = ox + (p.x + p.fx) * 8 + 4 - 5;
      const ly = (p.y + p.fy) * 8 + 4 - 5;
      ctx.drawImage(lumo, lumoPhase * 10, row * 10, 10, 10, lx, ly, 10, 10);
    }
  }

  private drawRotated(ctx: CanvasRenderingContext2D, img: CanvasImageSource, cx: number, cy: number, rad: number): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rad);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -32, -32);
    ctx.restore();
  }

  private drawTinted(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, color: string): void {
    const w = img.naturalWidth, h = img.naturalHeight;
    const t = document.createElement('canvas');
    t.width = w; t.height = h;
    const tctx = t.getContext('2d')!;
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(img, 0, 0);
    tctx.globalCompositeOperation = 'source-atop';
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, w, h);
    ctx.drawImage(t, x, y);
  }

  private expose(): void {
    if (!qaHooksAllowed()) return;
    (window as unknown as { __PE_MINIGAME__?: unknown }).__PE_MINIGAME__ = {
      id: this.id,
      status: this.ended === 'playing' ? (this.engine?.status() ?? 'playing') : this.ended,
      remainingMs: this.remainingMs(),
      state: this.engine?.state() ?? null,
      playWin: () => this.playWin(),
      expire: () => this.expire(),
      confirm: () => this.confirm(),
      move: (dx: number, dy: number) => this.move(dx, dy),
      close: () => this.close(),
      open: this.isOpen(),
    };
  }
  private clearExpose(): void {
    const w = window as unknown as { __PE_MINIGAME__?: unknown };
    if (w.__PE_MINIGAME__) delete w.__PE_MINIGAME__;
  }

  destroy(): void {
    this.close(false);
    this.el.remove();
  }
}

function dirRow(dx: number, dy: number): number {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 1 : 0; // L, R
  return dy < 0 ? 2 : 3; // U, D
}

/** Player-only paper-code reveal + a small persistent HUD. */
export class CodeReveal {
  readonly modal: HTMLElement;
  readonly hud: HTMLElement;
  private code: EscapeCode | null = null;

  constructor() {
    this.modal = document.createElement('div');
    this.modal.id = 'pe-code';
    this.modal.hidden = true;
    this.modal.innerHTML = `
      <div id="pe-code-panel">
        <div id="pe-code-title">Escape code</div>
        <div id="pe-code-slots"></div>
        <button id="pe-code-close" type="button">OK</button>
      </div>`;
    this.hud = document.createElement('div');
    this.hud.id = 'pe-code-hud';
    this.hud.hidden = true;
    document.body.appendChild(this.modal);
    document.body.appendChild(this.hud);
    this.modal.querySelector('#pe-code-close')!.addEventListener('click', () => this.hideModal());
  }

  known(): EscapeCode | null { return this.code; }

  place(screen: { x: number; y: number; w: number; h: number }, slot?: { x: number; y: number; width: number; height: number }): void {
    this.modal.style.left = `${Math.round(screen.x)}px`;
    this.modal.style.top = `${Math.round(screen.y)}px`;
    this.modal.style.width = `${Math.round(screen.w)}px`;
    this.modal.style.height = `${Math.round(screen.h)}px`;
    this.modal.style.justifyContent = 'center';
    // HUD under the item slot, clamped inside the game screen (R14-10, 393 px wide).
    const slotW = 18, gap = 3, pad = 4;
    const hudW = 4 * slotW + 3 * gap + pad;
    let left = slot ? slot.x + slot.width - hudW : screen.x + screen.w - hudW - 6;
    left = Math.max(screen.x + 4, Math.min(left, screen.x + screen.w - hudW - 4));
    let top = slot ? slot.y + slot.height + 4 : screen.y + 8;
    if (top + 22 > screen.y + screen.h - 4) top = Math.max(screen.y + 4, (slot ? slot.y - 24 : screen.y + 8));
    this.hud.style.position = 'fixed';
    this.hud.style.left = `${Math.round(left)}px`;
    this.hud.style.right = 'auto';
    this.hud.style.top = `${Math.round(top)}px`;
    this.hud.style.maxWidth = `${Math.round(Math.max(0, screen.x + screen.w - left - 4))}px`;
  }

  reveal(code: EscapeCode, showModal = true): void {
    this.code = code;
    const paint = (root: Element) => {
      root.innerHTML = '';
      for (const c of code) {
        const s = document.createElement('span');
        s.className = 'pe-code-slot';
        s.style.background = '#' + CODE_COLOURS[c].toString(16).padStart(6, '0');
        s.title = `${c} (${CODE_GLYPH[c]})`;
        s.setAttribute('aria-label', `${c} ${CODE_GLYPH[c]}`);
        s.textContent = CODE_GLYPH[c];
        root.appendChild(s);
      }
    };
    paint(this.modal.querySelector('#pe-code-slots')!);
    paint(this.hud);
    this.hud.hidden = false;
    if (showModal) {
      this.modal.hidden = false;
      (this.modal.querySelector('#pe-code-close') as HTMLButtonElement).focus();
    }
    if (qaHooksAllowed()) (window as unknown as { __PE_CODE__?: EscapeCode }).__PE_CODE__ = code;
  }

  hideModal(): void { this.modal.hidden = true; }

  destroy(): void {
    this.modal.remove();
    this.hud.remove();
    this.code = null;
    const w = window as unknown as { __PE_CODE__?: EscapeCode };
    delete w.__PE_CODE__;
  }
}
