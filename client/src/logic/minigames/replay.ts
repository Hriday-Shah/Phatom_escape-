/**
 * Server-side replay of a client's mini-game input log (R15-2).
 * The server holds the puzzle instance it generated; a win is accepted only
 * when replaying the log on that instance reaches a win (and, for Chase,
 * eats every dot). Zero-input logs are always rejected.
 */
import { ChaseGame, type ChasePuzzle } from './dotdash';
import { LockPickGame, inZone, type LockPuzzle } from './lockpick';
import { MazeGame, mazePath, mazeWalkable } from './maze';
import { MemoryGame } from './memory';
import { SlideGame, solvingMoves } from './slide';
import { MinigameEngine, MinigameId, MinigameInput, resolveMinigameId } from './types';

export type LogAction = MinigameInput | { type: 'flipBack' };
export interface LogEvent { t: number; action: LogAction }

export type PuzzleSnapshot =
  | { id: 'slide'; tiles: number[] }
  | { id: 'maze'; grid: number[]; px: number; py: number; ex: number; ey: number }
  | { id: 'lockpick'; speed: number; zones: number[] }
  | { id: 'memory'; cards: number[] }
  | { id: 'chase' } & ChasePuzzle;

/** What the client needs to play. Memory faces are omitted (revealed per flip). */
export type PlayView =
  | { id: 'slide'; tiles: number[] }
  | { id: 'maze'; grid: number[]; px: number; py: number; ex: number; ey: number }
  | { id: 'lockpick'; speed: number; zones: number[] }
  | { id: 'memory'; n: number }
  | { id: 'chase' } & ChasePuzzle;

export function snapshotOf(engine: MinigameEngine): PuzzleSnapshot {
  switch (engine.id) {
    case 'slide': return { id: 'slide', ...(engine as SlideGame).puzzle() };
    case 'maze': return { id: 'maze', ...(engine as MazeGame).puzzle() };
    case 'lockpick': return { id: 'lockpick', ...(engine as LockPickGame).puzzle() };
    case 'memory': return { id: 'memory', ...(engine as MemoryGame).puzzle() };
    case 'chase': return { id: 'chase', ...(engine as ChaseGame).puzzle() };
  }
}

export function playViewOf(snap: PuzzleSnapshot): PlayView {
  if (snap.id === 'memory') return { id: 'memory', n: snap.cards.length };
  return snap;
}

export function engineFromSnapshot(snap: PuzzleSnapshot): MinigameEngine {
  switch (snap.id) {
    case 'slide': return SlideGame.fromPuzzle(snap);
    case 'maze': return MazeGame.fromPuzzle(snap);
    case 'lockpick': return LockPickGame.fromPuzzle(snap);
    case 'memory': return MemoryGame.fromPuzzle(snap);
    case 'chase': return ChaseGame.fromPuzzle(snap);
  }
}

export function createPuzzle(id: MinigameId, seed: number): PuzzleSnapshot {
  const resolved = resolveMinigameId(id) ?? 'slide';
  switch (resolved) {
    case 'slide': return snapshotOf(new SlideGame(seed));
    case 'maze': return snapshotOf(new MazeGame(seed));
    case 'lockpick': return snapshotOf(new LockPickGame(seed));
    case 'memory': return snapshotOf(new MemoryGame(seed));
    case 'chase': return snapshotOf(new ChaseGame(seed));
  }
}

function parseLog(raw: unknown): LogEvent[] | null {
  if (!Array.isArray(raw) || raw.length > 4000) return null;
  const out: LogEvent[] = [];
  let last = -1;
  for (const ev of raw) {
    if (!ev || typeof ev !== 'object') return null;
    const t = (ev as LogEvent).t;
    const action = (ev as LogEvent).action;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > 35_000) return null;
    if (t + 1e-6 < last) return null;
    last = t;
    if (!action || typeof (action as { type?: string }).type !== 'string') return null;
    const typ = (action as { type: string }).type;
    if (!['move', 'confirm', 'tap', 'flipBack'].includes(typ)) return null;
    out.push({ t, action: action as LogAction });
  }
  return out;
}

/**
 * Replay `log` against a fresh copy of `snap`. Rejects an empty log, a log
 * that does not win, and a Chase log that does not eat every dot.
 */
export function replayWin(snap: PuzzleSnapshot, logRaw: unknown): { ok: boolean; error?: string } {
  const log = parseLog(logRaw);
  if (!log) return { ok: false, error: 'bad-log' };
  if (!log.length) return { ok: false, error: 'no-play' };
  if (snap.id === 'chase') return replayChase(snap, log);
  const engine = engineFromSnapshot(snap);
  let time = 0; // seconds
  for (const ev of log) {
    const target = ev.t / 1000;
    const dt = Math.max(0, target - time);
    if (dt > 0 && engine.tick) {
      let left = dt;
      while (left > 0) {
        const step = Math.min(0.05, left);
        engine.tick(step);
        left -= step;
      }
    }
    time = target;
    if (engine.status() !== 'playing') break;
    if (ev.action.type === 'flipBack') {
      (engine as MemoryGame).flipBack?.();
    } else {
      engine.input(ev.action);
    }
  }
  if (engine.status() !== 'won') return { ok: false, error: 'no-win' };
  return { ok: true };
}

/**
 * Chase wins by a plausible, speed-limited walk that eats every dot (R15-2).
 * Wisps are not simulated: a log is accepted if every step is walkable and the
 * traveller never moves faster than CHASE_SPEED and finishes with no dots left.
 */
function replayChase(snap: PuzzleSnapshot, log: LogEvent[]): { ok: boolean; error?: string } {
  if (snap.id !== 'chase') return { ok: false, error: 'bad-log' };
  // Infer layout from a fresh engine copy of the server puzzle.
  const g = engineFromSnapshot(snap) as ChaseGame;
  const st = g.state();
  const dots = st.dots.slice();
  const candles = st.candles.slice();
  let left = st.dotsLeft;
  let x = st.player.x, y = st.player.y;
  let fx = 0, fy = 0;
  let dx = 0, dy = 0;
  let time = 0;
  const SPEED = 4;
  const eat = (cx: number, cy: number) => {
    const i = cy * st.w + cx;
    if (dots[i] || candles[i]) { dots[i] = false; candles[i] = false; left--; }
  };
  eat(x, y);
  const stepTo = (target: number) => {
    let t = time;
    while (t < target - 1e-9) {
      const dt = Math.min(0.05, target - t);
      if (!dx && !dy) { t += dt; continue; }
      fx += dx * SPEED * dt;
      fy += dy * SPEED * dt;
      if (Math.abs(fx) >= 1 - 1e-6 || Math.abs(fy) >= 1 - 1e-6) {
        const nx = x + dx, ny = y + dy;
        if (!mazeWalkable(st.grid, nx, ny, st.w, st.h)) { dx = dy = 0; fx = fy = 0; t += dt; continue; }
        x = nx; y = ny;
        fx = 0; fy = 0;
        eat(x, y);
      }
      t += dt;
    }
    time = target;
  };
  for (const ev of log) {
    stepTo(ev.t / 1000);
    if (ev.action.type === 'move') {
      const ndx = Math.sign(ev.action.dx), ndy = Math.sign(ev.action.dy);
      if (ndx && ndy) { dx = ndx; dy = 0; }
      else { dx = ndx; dy = ndy; }
    }
  }
  // Allow the last stretch to finish (one extra cell of travel after the last stamp).
  stepTo(time + 0.3);
  if (left > 0) return { ok: false, error: 'dots-left' };
  return { ok: true };
}



function inZoneNow(g: LockPickGame): boolean {
  return inZone(g.state().pick, g.state().zone, g.widthDeg());
}

/** Record a legal solve as a log the server would accept (tests + offline QA). */
export function solvingLog(snap: PuzzleSnapshot): LogEvent[] {
  const log: LogEvent[] = [];
  let t = 100;
  const stamp = (action: LogAction, dtMs = 80) => { log.push({ t, action }); t += dtMs; };

  if (snap.id === 'slide') {
    const g = engineFromSnapshot(snap) as SlideGame;
    for (const i of solvingMoves(g.state().tiles)) {
      stamp({ type: 'tap', index: i });
      g.input({ type: 'tap', index: i });
    }
    return log;
  }
  if (snap.id === 'maze') {
    const g = engineFromSnapshot(snap) as MazeGame;
    const st = g.state();
    const path = mazePath(st.grid, st.px, st.py, st.ex, st.ey, st.w, st.h);
    for (let i = 1; i < path.length; i++) {
      const [x, y] = path[i]!;
      const cur = g.state();
      const dx = x - cur.px, dy = y - cur.py;
      stamp({ type: 'move', dx, dy });
      g.input({ type: 'move', dx, dy });
    }
    return log;
  }
  if (snap.id === 'lockpick') {
    const g = engineFromSnapshot(snap) as LockPickGame;
    let time = 0;
    const dt = 0.02;
    while (g.status() === 'playing' && time < 20) {
      g.tick?.(dt);
      time += dt;
      if (g.status() === 'playing' && inZoneNow(g)) {
        log.push({ t: Math.round(time * 1000), action: { type: 'confirm' } });
        g.input({ type: 'confirm' });
      }
    }
    return log;
  }
  if (snap.id === 'memory') {
    const g = engineFromSnapshot(snap) as MemoryGame;
    const cards = g.puzzle().cards;
    const first = new Map<number, number>();
    for (let i = 0; i < cards.length; i++) {
      const id = cards[i]!;
      const a = first.get(id);
      if (a == null) { first.set(id, i); continue; }
      stamp({ type: 'tap', index: a });
      g.input({ type: 'tap', index: a });
      stamp({ type: 'tap', index: i });
      g.input({ type: 'tap', index: i });
    }
    return log;
  }
  const fresh = engineFromSnapshot(snap) as ChaseGame;
  const st = fresh.state();
  const leftover: [number, number][] = [];
  for (let i = 0; i < st.grid.length; i++) {
    if (st.dots[i] || st.candles[i]) leftover.push([i % st.w, Math.floor(i / st.w)]);
  }
  let x = st.player.x, y = st.player.y;
  let time = 0; // ms — first move starts immediately so cell times are exact
  // Nearest-neighbour covering path; 260 ms/cell (CHASE_SPEED is 4 cells/s).
  const CELL_MS = 250;
  const remaining = leftover.slice();
  const cells: [number, number][] = [[x, y]];
  while (remaining.length) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const [tx, ty] = remaining[i]!;
      const path = mazePath(st.grid, x, y, tx, ty, st.w, st.h);
      const d = path.length ? path.length : 9999;
      if (d < bestD) { bestD = d; best = i; }
    }
    const [tx, ty] = remaining.splice(best, 1)[0]!;
    const path = mazePath(st.grid, x, y, tx, ty, st.w, st.h);
    for (let i = 1; i < path.length; i++) {
      const [nx, ny] = path[i]!;
      cells.push([nx, ny]);
      x = nx; y = ny;
    }
  }
  let pdx = 0, pdy = 0;
  x = st.player.x; y = st.player.y;
  for (let i = 1; i < cells.length; i++) {
    const [nx, ny] = cells[i]!;
    const dx = nx - x, dy = ny - y;
    if (dx !== pdx || dy !== pdy) {
      log.push({ t: time, action: { type: 'move', dx, dy } });
      pdx = dx; pdy = dy;
    }
    time += CELL_MS;
    x = nx; y = ny;
  }
  // Final stamp at arrival so the last straight stretch is walked in replay.
  if (pdx || pdy) log.push({ t: Math.min(34_000, time), action: { type: 'move', dx: pdx, dy: pdy } });
  return log;
}

export type { ChasePuzzle, LockPuzzle };
