export interface Wall {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Door {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  locked: boolean;
  message?: string;
}

export interface Opening {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HidingSpot {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'drawer' | 'closet' | 'cabinet' | 'appliance' | 'furniture';
  contents: string[];
  interactRange: number;
  /**
   * Clockwise rotation of the unit art, in degrees. Layout width/height are the
   * axis-aligned body after rotation (and after any trim via spriteOffset).
   */
  rotation?: 0 | 90 | 180 | 270;
  /** Unrotated art size in 1x art px. Required when the layout is rotated or trimmed. */
  artSize?: { w: number; h: number };
  /**
   * World-px offset of the (possibly larger) art sprite relative to the layout
   * top-left. Used when a few pixels of art tuck under a neighbour so the
   * physics body still fits.
   */
  spriteOffset?: { x?: number; y?: number };
}

export interface Furniture {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  blocking: boolean;
  /** Manifest texture key when it is not the same as `id`. */
  texture?: string;
  /** Clockwise rotation of the art, in degrees. */
  rotation?: 0 | 90 | 180 | 270;
  /** Crop in unrotated 1x art px, when only part of the texture is used. */
  artCrop?: { x: number; y: number; w: number; h: number };
}

export interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  floorColor: number;
}

export interface HouseLayout {
  width: number;
  height: number;
  rooms: Room[];
  walls: Wall[];
  doors: Door[];
  openings: Opening[];
  /** Decorative windows drawn over (solid) wall segments. */
  windows: WindowRect[];
  hidingSpots: HidingSpot[];
  furniture: Furniture[];
}

export const houseLayout: HouseLayout = {
  width: 1130,
  height: 760,
  
  rooms: [
    { id: 'bedroom', name: 'Bedroom', x: 70, y: 140, width: 360, height: 240, floorColor: 0x8B7355 },
    { id: 'entrance', name: 'Entrance', x: 150, y: 380, width: 280, height: 110, floorColor: 0x9B8B7E },
    { id: 'living', name: 'Living Room', x: 430, y: 100, width: 380, height: 200, floorColor: 0xA0826D },
    { id: 'dining', name: 'Dining Area', x: 430, y: 300, width: 380, height: 190, floorColor: 0xA0826D },
    { id: 'bathroom', name: 'Bathroom', x: 810, y: 100, width: 160, height: 130, floorColor: 0xC0C0C0 },
    { id: 'foyer', name: 'Foyer', x: 810, y: 230, width: 160, height: 80, floorColor: 0x9B8B7E },
    { id: 'kitchen', name: 'Kitchen', x: 810, y: 310, width: 280, height: 300, floorColor: 0xB8B8B8 },
  ],

  walls: [
    // Bedroom outer walls (window at x=190-330, y=134-146 is decorative - solid wall behind)
    { x: 70, y: 140, width: 360, height: 10 }, // top (includes window area - solid)
    { x: 70, y: 140, width: 10, height: 240 }, // left
    { x: 70, y: 370, width: 240, height: 10 }, // bottom left (before door)
    { x: 390, y: 370, width: 40, height: 10 }, // bottom right (after door)
    { x: 420, y: 140, width: 10, height: 240 }, // right
    
    // Entrance outer walls (opening to living at x=430, y=386-484).
    // The entrance shares the bedroom's bottom wall (y 370-380) as its top wall, so there is
    // no separate entrance top wall (that drew the shared wall double-thick) and no
    // floating gap-closer stub outside the house at x 70-150.
    { x: 150, y: 380, width: 10, height: 110 }, // left
    { x: 150, y: 480, width: 140, height: 10 }, // bottom left (before main door)
    { x: 380, y: 480, width: 50, height: 10 }, // bottom right (after main door)
    { x: 420, y: 380, width: 10, height: 6 }, // right top (before opening to living)
    { x: 420, y: 484, width: 10, height: 6 }, // right bottom (after opening to living)
    
    // Living/Dining outer walls (stairs opening x=540-700, y=100 — no window tile; see houseFloors.ts)
    { x: 430, y: 100, width: 10, height: 286 }, // left top (before entrance opening)
    { x: 430, y: 484, width: 10, height: 6 }, // left bottom (after entrance opening)
    { x: 430, y: 100, width: 110, height: 10 }, // top left (before window)
    { x: 540, y: 100, width: 160, height: 10 }, // top window area (SOLID WALL)
    { x: 700, y: 100, width: 110, height: 10 }, // top right (after window)
    { x: 800, y: 100, width: 10, height: 140 }, // right top (before foyer opening)
    { x: 800, y: 300, width: 10, height: 190 }, // right bottom (after foyer opening)
    { x: 430, y: 480, width: 370, height: 10 }, // bottom
    
    // Bathroom outer walls
    { x: 810, y: 100, width: 160, height: 10 }, // top
    { x: 810, y: 100, width: 10, height: 130 }, // left
    { x: 810, y: 220, width: 90, height: 10 }, // bottom left (before door)
    { x: 950, y: 220, width: 20, height: 10 }, // bottom right (after door)
    { x: 960, y: 100, width: 10, height: 130 }, // right
    
    // Foyer walls (opening to living at x=800-810, y=240-300; opening to kitchen at x=830-890, y=300-310)
    { x: 810, y: 230, width: 10, height: 10 }, // left top (before living opening)
    { x: 810, y: 300, width: 10, height: 10 }, // left bottom (after living opening, before kitchen opening)
    { x: 810, y: 300, width: 20, height: 10 }, // bottom left (before kitchen opening)
    { x: 890, y: 300, width: 80, height: 10 }, // bottom right (after kitchen opening)
    { x: 960, y: 230, width: 10, height: 80 }, // right
    
    // Kitchen outer walls (window on bottom wall is decorative - solid wall behind).
    // Expanded east and south into empty world space; neighbouring rooms are unchanged.
    { x: 810, y: 310, width: 20, height: 10 }, // top left (before foyer opening)
    { x: 890, y: 310, width: 200, height: 10 }, // top right (after foyer opening)
    { x: 810, y: 310, width: 10, height: 300 }, // left
    { x: 810, y: 600, width: 280, height: 10 }, // bottom (includes window area - solid)
    { x: 1080, y: 310, width: 10, height: 300 }, // right
  ],

  doors: [
    {
      id: 'bedroom_door',
      x: 310,
      y: 374,
      width: 80,
      height: 12,
      locked: true,
      message: 'Locked. You need a key.',
    },
    {
      id: 'main_door',
      x: 290,
      y: 484,
      width: 90,
      height: 14,
      locked: true,
      message: "The door won't open yet.",
    },
  ],

  windows: [
    { x: 190, y: 140, width: 140, height: 10 }, // bedroom, top wall
    // Living-room top wall: stairs placeholder (S3-A) — no window tile here.
    { x: 916, y: 600, width: 64, height: 10 }, // kitchen, bottom wall (behind the south-wall sink)
  ],

  openings: [
    // Entrance to Living Room
    { x: 430, y: 386, width: 10, height: 98 },
    // Living/Dining to Foyer
    { x: 810, y: 240, width: 10, height: 60 },
    // Foyer to Kitchen
    { x: 830, y: 310, width: 60, height: 10 },
    // Bathroom door (open)
    { id: 'bathroom_door', x: 900, y: 224, width: 50, height: 12 },
  ],

  hidingSpots: [
    // Bedroom
    {
      id: 'study_drawer_1',
      name: 'Study Table - Top Drawer',
      x: 80,
      y: 150,
      width: 46,
      height: 50,
      type: 'drawer',
      contents: [],
      interactRange: 60,
    },
    {
      id: 'study_drawer_2',
      name: 'Study Table - Middle Drawer',
      x: 80,
      y: 200,
      width: 46,
      height: 50,
      type: 'drawer',
      contents: [],
      interactRange: 60,
    },
    {
      id: 'study_drawer_3',
      name: 'Study Table - Bottom Drawer',
      x: 80,
      y: 250,
      width: 46,
      height: 50,
      type: 'drawer',
      contents: [],
      interactRange: 60,
    },
    {
      id: 'bed',
      name: 'Bed',
      x: 310,
      y: 230,
      width: 110,
      height: 70,
      type: 'furniture',
      contents: [],
      interactRange: 70,
    },
    {
      id: 'bedside_drawer',
      name: 'Bedside Drawer',
      x: 370,
      y: 150,
      width: 50,
      height: 36,
      type: 'drawer',
      contents: [],
      interactRange: 60,
    },
    {
      id: 'closet_drawers',
      name: 'Closet Drawers',
      x: 80,
      y: 332,
      width: 150,
      height: 38,
      type: 'closet',
      contents: [],
      interactRange: 60,
    },
    
    // Living Room
    {
      id: 'sofa',
      name: 'Sofa',
      x: 440,
      y: 110,
      width: 50,
      height: 160,
      type: 'furniture',
      contents: [],
      interactRange: 70,
    },
    {
      id: 'ottoman',
      name: 'Ottoman',
      x: 440,
      y: 295,
      width: 50,
      height: 40,
      type: 'furniture',
      contents: [],
      interactRange: 60,
    },
    {
      id: 'tv_unit',
      name: 'TV Unit',
      x: 760,
      y: 110,
      width: 40,
      height: 110,
      type: 'cabinet',
      contents: [],
      interactRange: 60,
    },
    {
      id: 'sideboard',
      name: 'Sideboard',
      x: 760,
      y: 330,
      width: 40,
      height: 150,
      type: 'cabinet',
      contents: [],
      interactRange: 60,
    },
    
    // Bathroom
    {
      id: 'sink_cabinet',
      name: 'Sink Cabinet',
      x: 820,
      y: 190,
      width: 60,
      height: 30,
      type: 'cabinet',
      contents: [],
      interactRange: 60,
    },
    {
      id: 'wall_shelf',
      name: 'Wall Shelf',
      x: 890,
      y: 110,
      width: 70,
      height: 16,
      type: 'cabinet',
      contents: [],
      interactRange: 60,
    },
    
    // Kitchen. L-counter along the south and east walls, matching Hriday's sketch
    // with page-up = north. The doorway stays on the north-west / north-middle.
    // The room is expanded east and south (~1.67× inner floor) so the sink can
    // sit at its full 150 px width with no tuck under the fridge, and so the
    // sketch's plain empty counter can sit between the sink and the SE corner
    // (and continue a short way up the east wall to the stove). The empty
    // counter is blocking furniture, not a search spot.
    //
    // South wall, west to east: fridge (SW corner, 46x66, flush with the west
    // and south walls), full-width sink (rotated 90° CW so its doors face the
    // room), then the empty south counter to the SE corner.
    //
    // East wall, south to north: empty east-corner counter, stove (rotated
    // 90° so the oven door and fronts face the room), then the 3-drawer unit
    // (rotated 90°) flush with
    // the north-east corner.
    //
    // Microwave: unchanged, west wall upper-middle (rotated 270° so the doors
    // face the room), 34 px south of the north wall so the foyer doorway stays
    // clear.
    {
      id: 'microwave_unit',
      name: 'Microwave Unit',
      x: 820,
      y: 354,
      width: 34,
      height: 110,
      type: 'cabinet',
      contents: [],
      interactRange: 60,
      rotation: 270,
      artSize: { w: 55, h: 17 },
    },
    {
      id: 'kitchen_sink_cabinet',
      name: 'Kitchen Sink Cabinet',
      x: 866,
      y: 564,
      width: 150,
      height: 36,
      type: 'cabinet',
      contents: [],
      interactRange: 60,
      rotation: 90,
      artSize: { w: 18, h: 75 },
    },
    {
      id: 'stove',
      name: 'Stove',
      x: 1044,
      y: 420,
      width: 36,
      height: 90,
      type: 'appliance',
      contents: [],
      interactRange: 60,
      rotation: 90,
      artSize: { w: 45, h: 18 },
    },
    {
      id: 'stove_drawers',
      name: 'Stove-side Drawers',
      x: 1044,
      y: 320,
      width: 36,
      height: 100,
      type: 'drawer',
      contents: [],
      interactRange: 60,
      rotation: 90,
      artSize: { w: 50, h: 18 },
    },
    {
      id: 'fridge',
      name: 'Fridge',
      x: 820,
      y: 534,
      width: 46,
      height: 66,
      type: 'appliance',
      contents: [],
      interactRange: 60,
    },
  ],

  furniture: [
    // Non-hiding-spot furniture that blocks movement
    {
      id: 'car_table',
      name: 'Car Table',
      x: 160,
      y: 380,
      width: 70,
      height: 28,
      blocking: true,
    },
    {
      id: 'dining_table',
      name: 'Dining Table',
      x: 560,
      y: 424,
      width: 120,
      height: 56,
      blocking: true,
    },
    // Plain empty L-counter: south run between the sink and the SE corner, then
    // a short east-wall run up to the stove. Cropped from kitchen_counter art.
    // Collides and occludes like other blocking furniture; not a search spot.
    {
      id: 'kitchen_south_counter',
      name: 'Kitchen Counter',
      x: 1016,
      y: 564,
      width: 64,
      height: 36,
      blocking: true,
      texture: 'kitchen_counter',
      artCrop: { x: 63, y: 0, w: 32, h: 18 },
    },
    {
      id: 'kitchen_east_counter',
      name: 'Kitchen Counter',
      x: 1044,
      y: 510,
      width: 36,
      height: 54,
      blocking: true,
      texture: 'kitchen_counter',
      rotation: 270,
      artCrop: { x: 0, y: 0, w: 27, h: 18 },
    },
  ],
};
