/**
 * Per-drawer / per-door / per-cushion sections of multi-section hiding-spot units.
 *
 * Imported verbatim from the designer's slices.json (phantom-escape-art/new-drawers):
 * one entry per section, rect in 1x art px from the unit sprite's top-left (x2 for world units).
 * Art per unit `{texture}`: `{texture}_base.png` (all closed) and `{texture}_d{N}_open.png`
 * (same canvas, only section N open). To add or change a unit: drop the PNGs in
 * client/public/assets/furniture/, list them in manifest.json (status "approved") and add / edit
 * its entry here. The unit itself stays ONE solid body in houseLayout (gap rule / containment
 * geometry is unchanged); sections only add interaction rects and open state.
 */

export interface DrawerSection {
  /** 1-based section number (matches `_d{N}_open`). */
  drawer: number;
  /** Rect in 1x art px relative to the unit sprite's top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Prompt text, e.g. "Closet - Drawer 3". */
  label: string;
}

export interface DrawerUnit {
  /** Art key prefix: `{texture}_base`, `{texture}_d{N}_open`. */
  texture: string;
  sections: DrawerSection[];
}

/** houseLayout hiding-spot id -> its sections. Spots not listed here open as one piece. */
export const DRAWER_UNITS: Record<string, DrawerUnit> = {
  closet_drawers: {
    texture: 'closet',
    sections: [
      { drawer: 1, x: 2, y: 1, w: 14, h: 7, label: 'Closet - Drawer 1' },
      { drawer: 2, x: 16, y: 1, w: 14, h: 7, label: 'Closet - Drawer 2' },
      { drawer: 3, x: 30, y: 1, w: 14, h: 7, label: 'Closet - Drawer 3' },
      { drawer: 4, x: 44, y: 1, w: 14, h: 7, label: 'Closet - Drawer 4' },
      { drawer: 5, x: 58, y: 1, w: 14, h: 7, label: 'Closet - Drawer 5' },
    ],
  },
  stove_drawers: {
    texture: 'kitchen_drawer',
    sections: [
      { drawer: 1, x: 2, y: 10, w: 15, h: 7, label: 'Kitchen Drawers - Drawer 1' },
      { drawer: 2, x: 17, y: 10, w: 15, h: 7, label: 'Kitchen Drawers - Drawer 2' },
      { drawer: 3, x: 32, y: 10, w: 15, h: 7, label: 'Kitchen Drawers - Drawer 3' },
    ],
  },
  microwave_unit: {
    texture: 'microwave_unit',
    sections: [
      { drawer: 1, x: 2, y: 10, w: 12, h: 6, label: 'Microwave Unit - Door 1' },
      { drawer: 2, x: 14, y: 10, w: 12, h: 6, label: 'Microwave Unit - Door 2' },
      { drawer: 3, x: 26, y: 10, w: 12, h: 6, label: 'Microwave Unit - Door 3' },
      { drawer: 4, x: 38, y: 10, w: 12, h: 6, label: 'Microwave Unit - Door 4' },
    ],
  },
  sink_cabinet: {
    texture: 'sink_cabinet',
    sections: [
      { drawer: 1, x: 2, y: 8, w: 13, h: 6, label: 'Bathroom Sink Cabinet - Door 1' },
      { drawer: 2, x: 15, y: 8, w: 13, h: 6, label: 'Bathroom Sink Cabinet - Door 2' },
    ],
  },
  tv_unit: {
    texture: 'tv_unit',
    sections: [
      { drawer: 1, x: 1, y: 2, w: 6, h: 25, label: 'TV Unit - Door 1' },
      { drawer: 2, x: 1, y: 27, w: 6, h: 25, label: 'TV Unit - Door 2' },
    ],
  },
  sideboard: {
    texture: 'sideboard',
    sections: [
      { drawer: 1, x: 1, y: 2, w: 6, h: 23, label: 'Sideboard - Door 1' },
      { drawer: 2, x: 1, y: 25, w: 6, h: 23, label: 'Sideboard - Door 2' },
      { drawer: 3, x: 1, y: 48, w: 6, h: 23, label: 'Sideboard - Door 3' },
    ],
  },
  kitchen_sink_cabinet: {
    texture: 'kitchen_sink',
    sections: [
      { drawer: 1, x: 1, y: 2, w: 6, h: 17, label: 'Kitchen Sink Cabinet - Door 1' },
      { drawer: 2, x: 1, y: 19, w: 6, h: 17, label: 'Kitchen Sink Cabinet - Door 2' },
      { drawer: 3, x: 1, y: 36, w: 6, h: 17, label: 'Kitchen Sink Cabinet - Door 3' },
      { drawer: 4, x: 1, y: 53, w: 6, h: 17, label: 'Kitchen Sink Cabinet - Door 4' },
    ],
  },
  wall_shelf: {
    texture: 'wall_shelf',
    sections: [
      { drawer: 1, x: 2, y: 2, w: 15, h: 4, label: 'Wall Shelf - Door 1' },
      { drawer: 2, x: 18, y: 2, w: 15, h: 4, label: 'Wall Shelf - Door 2' },
    ],
  },
  sofa: {
    texture: 'sofa',
    sections: [
      { drawer: 1, x: 7, y: 6, w: 16, h: 22, label: 'Sofa - Cushion 1' },
      { drawer: 2, x: 7, y: 29, w: 16, h: 22, label: 'Sofa - Cushion 2' },
      { drawer: 3, x: 7, y: 52, w: 16, h: 22, label: 'Sofa - Cushion 3' },
    ],
  },
};

export const baseTextureKey = (unit: DrawerUnit): string => `${unit.texture}_base`;
export const sectionOpenTextureKey = (unit: DrawerUnit, drawer: number): string => `${unit.texture}_d${drawer}_open`;
