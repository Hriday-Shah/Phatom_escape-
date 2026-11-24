/** Asset helpers for the approved mini-game art (1 art px, scaled in CSS). */

export function assetUrl(file: string): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/';
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}assets/${file}`;
}

export function mgUrl(key: string): string {
  return assetUrl(`ui/minigames/${key}.png`);
}

export function drawNineSlice(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number, y: number, w: number, h: number,
  l: number, r: number, t: number, b: number,
): void {
  const iw = (img as { naturalWidth?: number; width?: number }).naturalWidth
    ?? (img as { width: number }).width;
  const ih = (img as { naturalHeight?: number; height?: number }).naturalHeight
    ?? (img as { height: number }).height;
  const midW = Math.max(0, iw - l - r);
  const midH = Math.max(0, ih - t - b);
  const destMidW = Math.max(0, w - l - r);
  const destMidH = Math.max(0, h - t - b);
  // corners
  if (l && t) ctx.drawImage(img, 0, 0, l, t, x, y, l, t);
  if (r && t) ctx.drawImage(img, iw - r, 0, r, t, x + w - r, y, r, t);
  if (l && b) ctx.drawImage(img, 0, ih - b, l, b, x, y + h - b, l, b);
  if (r && b) ctx.drawImage(img, iw - r, ih - b, r, b, x + w - r, y + h - b, r, b);
  // edges
  if (midW && t && destMidW) ctx.drawImage(img, l, 0, midW, t, x + l, y, destMidW, t);
  if (midW && b && destMidW) ctx.drawImage(img, l, ih - b, midW, b, x + l, y + h - b, destMidW, b);
  if (midH && l && destMidH) ctx.drawImage(img, 0, t, l, midH, x, y + t, l, destMidH);
  if (midH && r && destMidH) ctx.drawImage(img, iw - r, t, r, midH, x + w - r, y + t, r, destMidH);
  // centre (frame centre is transparent; still draw so other 9-slices work)
  if (midW && midH && destMidW && destMidH) {
    ctx.drawImage(img, l, t, midW, midH, x + l, y + t, destMidW, destMidH);
  }
}

export class ArtCache {
  private imgs = new Map<string, HTMLImageElement>();
  private pending: Promise<void> | null = null;

  get(key: string): HTMLImageElement | null {
    const img = this.imgs.get(key);
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  }

  load(keys: string[]): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const key of keys) {
      if (this.imgs.has(key)) continue;
      const img = new Image();
      img.decoding = 'sync';
      const path = key.includes('/') ? assetUrl(`${key}.png`) : mgUrl(key);
      img.src = path;
      this.imgs.set(key, img);
      jobs.push(new Promise((resolve) => {
        if (img.complete && img.naturalWidth > 0) { resolve(); return; }
        img.onload = () => resolve();
        img.onerror = () => resolve();
      }));
    }
    this.pending = Promise.all(jobs).then(() => undefined);
    return this.pending;
  }
}

export const MG_ART_KEYS = [
  'mg_popup_frame', 'mg_btn_close', 'mg_btn_close_pressed',
  'mg_title_slide', 'mg_title_maze', 'mg_title_lock', 'mg_title_memory', 'mg_title_chase',
  'mg_timer_icon', 'mg_timer_track', 'mg_timer_fill', 'mg_timer_fill_low',
  'mg_slide_empty', 'mg_slide_picture',
  'mg_slide_tile_1', 'mg_slide_tile_2', 'mg_slide_tile_3',
  'mg_slide_tile_4', 'mg_slide_tile_5', 'mg_slide_tile_6',
  'mg_slide_tile_7', 'mg_slide_tile_8', 'mg_slide_tile_9',
  'mg_maze_wall', 'mg_maze_floor', 'mg_maze_start', 'mg_maze_exit', 'mg_maze_dot',
  'mg_lock_dial', 'mg_lock_pick', 'mg_lock_target_zone', 'mg_lock_flash_success', 'mg_lock_flash_fail',
  'mg_memory_back', 'mg_memory_edge', 'mg_memory_matched',
  'mg_memory_face_stun_gun', 'mg_memory_face_wire_cutter', 'mg_memory_face_room_key', 'mg_memory_face_battery',
  'mg_chase_walls', 'mg_chase_spark', 'mg_chase_candle', 'mg_chase_lumo',
  'mg_chase_wisp_ember', 'mg_chase_wisp_violet', 'mg_chase_wisp_pale', 'mg_chase_wisp_frightened',
] as const;
