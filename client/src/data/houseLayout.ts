export interface Wall {
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
}

export interface Furniture {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  blocking: boolean;
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
  hidingSpots: HidingSpot[];
  furniture: Furniture[];
}

export const houseLayout: HouseLayout = {
  width: 1060,
  height: 760,
  
  rooms: [
    { id: 'bedroom', name: 'Bedroom', x: 70, y: 140, width: 360, height: 240, floorColor: 0x8B7355 },
    { id: 'entrance', name: 'Entrance', x: 150, y: 380, width: 280, height: 110, floorColor: 0x9B8B7E },
    { id: 'living', name: 'Living Room', x: 430, y: 100, width: 380, height: 200, floorColor: 0xA0826D },
    { id: 'dining', name: 'Dining Area', x: 430, y: 300, width: 380, height: 190, floorColor: 0xA0826D },
    { id: 'bathroom', name: 'Bathroom', x: 810, y: 100, width: 160, height: 130, floorColor: 0xC0C0C0 },
    { id: 'foyer', name: 'Foyer', x: 810, y: 230, width: 160, height: 80, floorColor: 0x9B8B7E },
    { id: 'kitchen', name: 'Kitchen', x: 810, y: 310, width: 210, height: 250, floorColor: 0xB8B8B8 },
  ],

  walls: [
    // Bedroom outer walls (window at x=190-330, y=134-146 is decorative - solid wall behind)
    { x: 70, y: 140, width: 360, height: 10 }, // top (includes window area - solid)
    { x: 70, y: 140, width: 10, height: 240 }, // left
    { x: 70, y: 370, width: 240, height: 10 }, // bottom left (before door)
    { x: 390, y: 370, width: 40, height: 10 }, // bottom right (after door)
    { x: 420, y: 140, width: 10, height: 240 }, // right
    
    // Gap between bedroom and entrance (outer boundary)
    { x: 70, y: 380, width: 80, height: 10 }, // close gap bedroom-to-entrance
    
    // Entrance outer walls (opening to living at x=430, y=386-484)
    { x: 150, y: 380, width: 10, height: 110 }, // left
    { x: 150, y: 380, width: 140, height: 10 }, // top left (connects to gap above)
    { x: 350, y: 380, width: 80, height: 10 }, // top right
    { x: 150, y: 480, width: 140, height: 10 }, // bottom left (before main door)
    { x: 380, y: 480, width: 50, height: 10 }, // bottom right (after main door)
    { x: 420, y: 380, width: 10, height: 6 }, // right top (before opening to living)
    { x: 420, y: 484, width: 10, height: 6 }, // right bottom (after opening to living)
    
    // Living/Dining outer walls (window at x=540-700, y=94-106 is decorative - solid wall behind)
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
    
    // Kitchen outer walls (window on bottom wall is decorative - solid wall behind)
    { x: 810, y: 310, width: 20, height: 10 }, // top left (before foyer opening)
    { x: 890, y: 310, width: 130, height: 10 }, // top right (after foyer opening)
    { x: 810, y: 310, width: 10, height: 250 }, // left
    { x: 810, y: 550, width: 210, height: 10 }, // bottom (includes stove window area - solid)
    { x: 1010, y: 310, width: 10, height: 250 }, // right
    
    // Gap between bathroom/foyer and kitchen right edge (outer boundary)
    { x: 970, y: 230, width: 40, height: 10 }, // close gap bathroom-to-kitchen top
    { x: 1010, y: 240, width: 10, height: 70 }, // close gap kitchen right side
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

  openings: [
    // Entrance to Living Room
    { x: 430, y: 386, width: 10, height: 98 },
    // Living/Dining to Foyer
    { x: 810, y: 240, width: 10, height: 60 },
    // Foyer to Kitchen
    { x: 830, y: 310, width: 60, height: 10 },
    // Bathroom door (open)
    { x: 900, y: 224, width: 50, height: 12 },
  ],

  hidingSpots: [
    // Bedroom
    {
      id: 'study_drawer_1',
      name: 'Study Table - Top Drawer',
      x: 80,
      y: 170,
      width: 45,
      height: 50,
      type: 'drawer',
      contents: [],
      interactRange: 60,
    },
    {
      id: 'study_drawer_2',
      name: 'Study Table - Middle Drawer',
      x: 80,
      y: 220,
      width: 45,
      height: 50,
      type: 'drawer',
      contents: [],
      interactRange: 60,
    },
    {
      id: 'study_drawer_3',
      name: 'Study Table - Bottom Drawer',
      x: 80,
      y: 270,
      width: 45,
      height: 50,
      type: 'drawer',
      contents: [],
      interactRange: 60,
    },
    {
      id: 'bed',
      name: 'Bed',
      x: 290,
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
      x: 340,
      y: 155,
      width: 50,
      height: 35,
      type: 'drawer',
      contents: [],
      interactRange: 60,
    },
    {
      id: 'closet_drawers',
      name: 'Closet Drawers',
      x: 85,
      y: 335,
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
      y: 130,
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
      y: 120,
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
      y: 320,
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
      y: 170,
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
    
    // Kitchen
    {
      id: 'microwave_unit',
      name: 'Microwave Unit',
      x: 900,
      y: 320,
      width: 110,
      height: 34,
      type: 'cabinet',
      contents: [],
      interactRange: 60,
    },
    {
      id: 'kitchen_sink_cabinet',
      name: 'Kitchen Sink Cabinet',
      x: 975,
      y: 360,
      width: 35,
      height: 150,
      type: 'cabinet',
      contents: [],
      interactRange: 60,
    },
    {
      id: 'stove',
      name: 'Stove',
      x: 820,
      y: 515,
      width: 90,
      height: 35,
      type: 'appliance',
      contents: [],
      interactRange: 60,
    },
    {
      id: 'stove_drawers',
      name: 'Stove-side Drawers',
      x: 910,
      y: 515,
      width: 100,
      height: 35,
      type: 'drawer',
      contents: [],
      interactRange: 60,
    },
    {
      id: 'fridge',
      name: 'Fridge',
      x: 820,
      y: 440,
      width: 45,
      height: 65,
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
      y: 392,
      width: 70,
      height: 28,
      blocking: true,
    },
    {
      id: 'dining_table',
      name: 'Dining Table',
      x: 560,
      y: 415,
      width: 120,
      height: 55,
      blocking: true,
    },
  ],
};
