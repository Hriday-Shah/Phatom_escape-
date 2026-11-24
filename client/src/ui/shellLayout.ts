/**
 * Handheld-console shell layout (console-shell/README.md), in CSS px. Pure, so the node tests
 * can check every aspect ratio. Art is 1x pixel art shown at an integer scale `s`; 9-slice
 * pieces (body, bezel) stretch without distortion, everything else is anchored.
 */
export interface Box { x: number; y: number; w: number; h: number; }
export interface Insets { top: number; right: number; bottom: number; left: number; }
export type ButtonId = 'shoot' | 'interact' | 'drop' | 'sneak';

export interface ShellLayout {
  s: number;
  portrait: boolean;
  /** Whole window: shell_body 9-slice (may extend under the notch / home bar). */
  body: Box;
  /** screen_bezel 9-slice. */
  bezel: Box;
  /** Game display (GameScene camera viewport): the bezel inset by BEZEL_BORDER * s. */
  screen: Box;
  well: Box;
  /** Max knob-centre travel from the well centre, CSS px. */
  knobTravel: number;
  /** Per button: its socket (28*s), the button (24*s, at +2,+2 in the socket) and the label anchor (top-centre). */
  buttons: Record<ButtonId, { socket: Box; button: Box; labelX: number; labelY: number }>;
  logo: Box;
  led: Box;
  grille: Box;
}

/** 1x art sizes (README). */
export const SHELL_ART = {
  bodyCorner: 8, bezelBorder: 6, well: 40, knob: 18, button: 24, socket: 28,
  colPitch: 30, rowPitch: 36, icon: 12, logo: { w: 66, h: 10 }, led: 5, grille: { w: 20, h: 12 },
  knobTravel: 11, labelGap: 1, labelH: 7,
} as const;

/**
 * Shell scale: portrait 3 when the short side is >= 390 CSS px, else 2 (4 on tablets, short
 * side >= 700). Landscape 2 (buttons exactly 48 CSS px), 3 when the short side is >= 600
 * (desktop / tablet), 4 when >= 1000. Never below 2, so buttons are never under 48 CSS px.
 */
export function shellScale(width: number, height: number): number {
  const short = Math.min(width, height);
  if (height > width) return short >= 700 ? 4 : short >= 390 ? 3 : 2;
  return short >= 1000 ? 4 : short >= 600 ? 3 : 2;
}

const R = Math.round;

export function computeShellLayout(width: number, height: number, insets: Insets): ShellLayout {
  // Narrow safe areas: step the scale down (never below 2) until the controls row fits.
  for (let s = shellScale(width, height); s > 2; s--) {
    const l = layoutAt(width, height, insets, s);
    const wellRight = l.well.x + l.well.w;
    if (!l.portrait || wellRight + 2 * s <= l.buttons.drop.socket.x) return l;
  }
  return layoutAt(width, height, insets, 2);
}

function layoutAt(width: number, height: number, insets: Insets, s: number): ShellLayout {
  const A = SHELL_ART;
  const portrait = height > width;
  const m = 4 * s;
  const L = R(insets.left), T = R(insets.top), Rt = R(width - insets.right), B = R(height - insets.bottom);
  const clusterW = (A.colPitch + A.socket) * s; // 58*s
  const clusterH = 2 * A.rowPitch * s; // 72*s
  const well = A.well * s;

  let clusterX: number, clusterY: number, wellBox: Box, logo: Box, led: Box, grille: Box, bezel: Box;
  if (portrait) {
    clusterX = Rt - m - clusterW;
    clusterY = B - m - clusterH;
    wellBox = { x: L + m, y: R(clusterY + clusterH / 2 - well / 2), w: well, h: well };
    const gw = A.grille.w * s, gh = A.grille.h * s;
    const between = (wellBox.x + well + clusterX) / 2;
    grille = { x: R(between - gw / 2), y: clusterY + clusterH - gh, w: gw, h: gh };
    // Decoration only: dropped when there is no room between the well and the cluster.
    if (grille.x < wellBox.x + well + s || grille.x + gw > clusterX - s) grille = { x: 0, y: 0, w: 0, h: 0 };
    const lw = A.logo.w * s, lh = A.logo.h * s;
    logo = { x: R(width / 2 - lw / 2), y: clusterY - m - lh, w: lw, h: lh };
    led = { x: L + m + 2 * s, y: R(logo.y + lh / 2 - (A.led * s) / 2), w: A.led * s, h: A.led * s };
    bezel = { x: L + m, y: T + m, w: Rt - m - (L + m), h: logo.y - m - (T + m) };
  } else {
    const wing = Math.max(clusterW, A.logo.w * s) + 2 * m;
    bezel = { x: L + wing, y: T + m, w: Rt - wing - (L + wing), h: B - m - (T + m) };
    const cy = R(T + (B - T) * 0.58);
    clusterX = Rt - m - clusterW;
    clusterY = R(cy - clusterH / 2);
    wellBox = { x: R(L + wing / 2 - well / 2), y: R(cy - well / 2), w: well, h: well };
    const lw = A.logo.w * s, lh = A.logo.h * s;
    logo = { x: R(L + wing / 2 - lw / 2), y: T + m, w: lw, h: lh };
    led = { x: R(Rt - wing / 2 - (A.led * s) / 2), y: T + m + 2 * s, w: A.led * s, h: A.led * s };
    const gw = A.grille.w * s, gh = A.grille.h * s;
    grille = { x: R(L + wing / 2 - gw / 2), y: B - m - gh, w: gw, h: gh };
  }

  const b = A.bezelBorder * s;
  const screen = { x: bezel.x + b, y: bezel.y + b, w: bezel.w - 2 * b, h: bezel.h - 2 * b };
  const sock = A.socket * s, btn = A.button * s;
  const at = (col: number, row: number) => {
    const socket = { x: clusterX + col * A.colPitch * s, y: clusterY + row * A.rowPitch * s, w: sock, h: sock };
    return {
      socket,
      button: { x: socket.x + 2 * s, y: socket.y + 2 * s, w: btn, h: btn },
      labelX: socket.x + sock / 2,
      labelY: socket.y + sock + A.labelGap * s,
    };
  };
  return {
    s, portrait,
    body: { x: 0, y: 0, w: width, h: height },
    bezel, screen, well: wellBox, knobTravel: A.knobTravel * s,
    // Order (README): Shoot top-right, Use bottom-right, Drop top-left, Sneak bottom-left.
    buttons: { drop: at(0, 0), shoot: at(1, 0), sneak: at(0, 1), interact: at(1, 1) },
    logo, led, grille,
  };
}
