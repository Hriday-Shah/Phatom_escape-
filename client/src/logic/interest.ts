/**
 * Who may learn an exact pose (stage 3 interest). Same floor and same role are
 * required, and a teammate must stand inside this phone's light. A doorway does
 * not hide someone who is still in that circle: there is no wall ray.
 * Players never receive a Phantom pose. Phantoms never receive a player pose.
 * The minimap wire is a bearing sector only (no x, no y, no distance).
 */
import { LIGHT_MASK_RADIUS, scaledLightRadius } from '../config/lightConfig';
import type { RoundPhase, RoundRole } from './roundPhase';
import { isWaiting } from './roundPhase';

/** Eight compass steps. Coarse on purpose: a precise angle plus motion can be triangulated. */
export const BEARING_SECTORS = 8;

export interface InterestActor {
  id: string;
  role: RoundRole;
  x: number;
  y: number;
  f: number;
  d?: number;
  m?: number;
}

export interface InterestPhase {
  phase: RoundPhase;
  roles: readonly { id: string; role: RoundRole }[];
}

/** [id, x, y, dir, moving, floor]. Floor is always present on the wire. */
export type WirePose = [string, number, number, number, number, number];

export function lightRadiusFor(role: RoundRole, phase: RoundPhase): number {
  return scaledLightRadius(LIGHT_MASK_RADIUS, role, phase);
}

/**
 * Exact x,y of `subject` may be sent to `viewer`. Own pose is always allowed
 * (the phone is already standing there). Everyone else needs the same role,
 * the same floor, and to be inside the viewer's light.
 */
export function mayShareExactPose(viewer: InterestActor, subject: InterestActor, phase: RoundPhase): boolean {
  if (viewer.id === subject.id) return true;
  if (isWaiting(viewer.role, phase) || isWaiting(subject.role, phase)) return false;
  if (phase === 'search' && (viewer.role === 'phantom' || subject.role === 'phantom')) return false;
  if (viewer.role !== subject.role) return false;
  if ((viewer.f ?? 0) !== (subject.f ?? 0)) return false;
  const dist = Math.hypot(subject.x - viewer.x, subject.y - viewer.y);
  return dist <= lightRadiusFor(viewer.role, phase);
}

/** Sector 0 is east (+x), then clockwise in screen space (y grows down). Null when there is no direction. */
export function bearingSector(dx: number, dy: number, sectors = BEARING_SECTORS): number | null {
  if (dx === 0 && dy === 0) return null;
  const step = (Math.PI * 2) / sectors;
  let s = Math.round(Math.atan2(dy, dx) / step);
  s = ((s % sectors) + sectors) % sectors;
  return s;
}

/**
 * Bearings toward other players on this floor. Phantoms get none. No coordinates.
 * People on another floor are omitted. Opposite roles are omitted.
 */
export function teammateBearings(viewer: InterestActor, others: readonly InterestActor[], phase: RoundPhase): [string, number][] {
  if (viewer.role !== 'player') return [];
  if (isWaiting(viewer.role, phase)) return [];
  const out: [string, number][] = [];
  for (const s of others) {
    if (s.id === viewer.id) continue;
    if (s.role !== 'player') continue;
    if (isWaiting(s.role, phase)) continue;
    if ((s.f ?? 0) !== (viewer.f ?? 0)) continue;
    const sector = bearingSector(s.x - viewer.x, s.y - viewer.y);
    if (sector == null) continue;
    out.push([s.id, sector]);
  }
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out;
}

export function interestSignature(poses: readonly WirePose[]): string {
  return poses.map((row) => row.join(',')).sort().join('|');
}

export function wirePose(a: InterestActor): WirePose {
  return [a.id, a.x, a.y, a.d ?? 0, a.m ?? 0, a.f ?? 0];
}

export function posesForViewer(viewer: InterestActor, actors: readonly InterestActor[], phase: RoundPhase): WirePose[] {
  return actors.filter((a) => mayShareExactPose(viewer, a, phase)).map(wirePose);
}

/** Pose broadcast. `drop` is ids to forget, never coordinates. */
export function poseWire(p: readonly WirePose[], drop: readonly string[]): { p: WirePose[]; drop?: string[] } {
  const msg: { p: WirePose[]; drop?: string[] } = { p: p.map((row) => [row[0], row[1], row[2], row[3], row[4], row[5]]) };
  if (drop.length) msg.drop = [...drop];
  return msg;
}

/** Minimap broadcast. Sectors only. */
export function minimapWire(bearings: readonly [string, number][]): { b: [string, number][] } {
  return { b: bearings.map(([id, sector]) => [id, sector]) };
}

export function liveMessages(poses: readonly WirePose[], drop: readonly string[], bearings: readonly [string, number][]): {
  poses: { p: WirePose[]; drop?: string[] };
  map: { b: [string, number][] };
} {
  return { poses: poseWire(poses, drop), map: minimapWire(bearings) };
}

function jsonHasNumber(text: string, n: number): boolean {
  const body = String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\d.-])${body}(?![\\d.])`).test(text);
}

/** True when both coordinates appear as JSON numbers anywhere in the payload. */
export function messageLeaksPoint(payload: unknown, x: number, y: number): boolean {
  const text = JSON.stringify(payload);
  return jsonHasNumber(text, x) && jsonHasNumber(text, y);
}

/**
 * Keep a bearing list and nothing else. Extra numbers on a row (a hidden x,y
 * tacked on by mistake) are discarded, not stored.
 */
export function readBearings(raw: unknown): [string, number][] {
  const rows = raw && typeof raw === 'object' && Array.isArray((raw as { b?: unknown }).b)
    ? (raw as { b: unknown[] }).b
    : [];
  const out: [string, number][] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || typeof row[0] !== 'string') continue;
    const sector = row[1];
    if (typeof sector !== 'number' || !Number.isInteger(sector) || sector < 0 || sector >= BEARING_SECTORS) continue;
    out.push([row[0], sector]);
  }
  return out;
}

type LoosePose = readonly [string, number, number, number?, number?, number?];

function asWire(row: LoosePose): WirePose {
  return [row[0], row[1], row[2], row[3] ?? 0, row[4] ?? 0, row[5] ?? 0];
}

/** Drop poses this phone must not remember. Own pose is kept. */
export function filterIncomingPoses(
  rows: readonly LoosePose[],
  selfId: string,
  phase: InterestPhase | null,
): WirePose[] {
  const self = rows.find((r) => r[0] === selfId);
  const kept: WirePose[] = [];
  for (const row of rows) {
    if (row[0] === selfId) { kept.push(asWire(row)); continue; }
    if (!self || !phase) continue;
    const myRole = phase.roles.find((r) => r.id === selfId)?.role;
    const theirRole = phase.roles.find((r) => r.id === row[0])?.role;
    if (!myRole || !theirRole) continue;
    const viewer: InterestActor = { id: selfId, role: myRole, x: self[1], y: self[2], f: self[5] ?? 0 };
    const subject: InterestActor = { id: row[0], role: theirRole, x: row[1], y: row[2], f: row[5] ?? 0 };
    if (!mayShareExactPose(viewer, subject, phase.phase)) continue;
    kept.push(asWire(row));
  }
  return kept;
}

/**
 * Client pose memory after one server message. A snapshot that includes this
 * phone replaces every other id: anyone omitted is forgotten, coordinates and all.
 */
export function authoritativePoseMap(
  prev: ReadonlyMap<string, WirePose>,
  msg: { p?: readonly LoosePose[]; drop?: readonly string[] },
  selfId: string,
  phase: InterestPhase | null,
): Map<string, WirePose> {
  const next = new Map(prev);
  for (const id of msg.drop ?? []) if (id !== selfId) next.delete(id);
  const rows = msg.p ?? [];
  const allowed = filterIncomingPoses(rows, selfId, phase);
  const hasSelf = rows.some((r) => r[0] === selfId);
  if (hasSelf) {
    const keep = new Set(allowed.map((r) => r[0]));
    for (const id of [...next.keys()]) if (id !== selfId && !keep.has(id)) next.delete(id);
  }
  for (const row of allowed) next.set(row[0], row);
  return next;
}

/** Phase payload for one phone: entrance coordinates are only that phone's. */
export function phaseEntriesFor<T extends { entries?: { id: string }[] }>(viewerId: string, view: T): T {
  if (!view.entries?.length) return view;
  const mine = viewerId ? view.entries.filter((e) => e.id === viewerId) : [];
  if (!mine.length) {
    const copy = { ...view };
    delete copy.entries;
    return copy;
  }
  return { ...view, entries: mine };
}
