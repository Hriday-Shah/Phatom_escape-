/**
 * Pull the local body onto the pose the server broadcast, which is the pose the
 * other phone draws. A pose that matches a recent send is an ack. A small disagreement
 * is a slide correction. A pose far from every recent send (the reconnect snapshot)
 * is left alone.
 */
export interface SentPose { x: number; y: number }

/** Further than one speed-capped step: not a correction of a pose we just sent. */
const MATCH_PX = 48;
/** Rounding and the slide epsilon. Closer than this needs no nudge. */
const SNAP_PX = 0.35;
/** First spawn broadcast, before any send: only adopt a pose we are already next to. */
const SPAWN_PX = 24;

export function reconcilePose(
  sent: readonly SentPose[],
  server: SentPose,
  here: SentPose,
): { dx: number; dy: number; pending: SentPose[] } {
  const start = Math.max(0, sent.length - 8);
  let idx = -1;
  let best = Infinity;
  for (let i = start; i < sent.length; i++) {
    const d = Math.hypot(sent[i].x - server.x, sent[i].y - server.y);
    if (d < best) { best = d; idx = i; }
  }
  if (idx >= 0 && best <= MATCH_PX) {
    const dx = best > SNAP_PX ? server.x - sent[idx].x : 0;
    const dy = best > SNAP_PX ? server.y - sent[idx].y : 0;
    const pending = sent.slice(idx + 1).map((p) => ({
      x: Math.round((p.x + dx) * 10) / 10,
      y: Math.round((p.y + dy) * 10) / 10,
    }));
    return { dx, dy, pending };
  }
  if (sent.length === 0) {
    const dx = server.x - here.x;
    const dy = server.y - here.y;
    if (Math.hypot(dx, dy) > SNAP_PX && Math.hypot(dx, dy) <= SPAWN_PX) return { dx, dy, pending: [] };
  }
  return { dx: 0, dy: 0, pending: sent.map((p) => ({ x: p.x, y: p.y })) };
}
