# Phantom Escape: mini-game art (APPROVED by Hriday, 2026-11-24)

Everything is a PNG at 1x art px, in the v2 12-colour palette plus the approved console-shell plum ramp (#22182A / #36263F / #4C3757). Edges are hard, with no anti-aliasing, and there is no fake text.
The only words are the title plates (SLIDE, MAZE, LOCK, MEMORY, CHASE) and USE, in the same hand-made 5 px font as the console labels.
Generator: `final/tools/minigames.py`. Previews: `final/tools/minigames_preview.py` and `minigames_preview2.py`. The file list with sizes and keys is in `manifest.json`; texture key = file name without `.png`.

## Approved defaults (decided 2026-11-24)
- **TV highlight colour: #FFD98A** (palette pale gold), not the code's #FFE14D.
- **Popup scale: x3** CSS px per art px on every phone.
- **Timer: 30 s.** The fill is cyan (`mg_timer_fill`). At **10 s or less** it switches to crimson (`mg_timer_fill_low`). At **5 s or less** it blinks (toggle visibility about every 250 ms).
- **Chase:** keep the classic rows of dots (`mg_chase_spark`).
- **Wisp colours:** ember (crimson #B03A5B), **violet (#9B6BFF, the player-colour violet; renamed from frost/cyan)** and pale (silver #A9B4C8).
- **Memory faces:** item icons (stun gun, wire cutter, room key, battery). The toy-car faces were removed.

## Scales
- **World sprites** (controller item, TV highlight/glow, USE badge): 1 art px = 2 world units, like the rest of the game.
- **Popup and mini-game art**: screen space. The recommended scale is **x3 CSS px per art px**: the popup is 336x360 CSS for the default 96x80 screen, and the close button is 54 CSS. It fits a 360-wide portrait phone and a 390-tall landscape phone inside the safe area.
  - Use x2 only on very small viewports. There the close button is 36 CSS, so give it a 48+ CSS hit area.

## 1. Game controller
- `item_game_controller` (16x16) uses the same auto D0 outline and shading as `final/items/*`.
- The other items have no separate in-world pickup sprite (the 16x16 icon is used both on the floor and in the slot), so the controller doesn't have one either.

## 2. Use TV
- **`fx_tv_use_highlight`**: 2 frames of 24x59. Draw at tv_unit (-2,-2) art (= -4,-4 world).
  - It matches the in-game interact highlight: a dark 1 art px shadow, a 1 art px pale-gold line, a faint fill, and a 2-frame pulse.
  - It uses palette #FFD98A. This is the approved colour.
- **`fx_tv_screen_glow`**: 2 frames of 40x55. Draw at tv_unit (-20,0) art. It lights the screen cyan and spills light toward the sofa.
- **`ui_prompt_use_tv`**: an optional badge showing a mini controller and the word USE.

## 3. Popup frame
- **`mg_popup_frame`**: 9-slice, insets **left 8, right 8, top 26, bottom 14**, with a transparent screen. The default screen is 96x80, and it can stretch to any size (e.g. 120x80 on landscape, shown in the preview).
- **Top strip**: the `mg_title_*` plate at (8,8), and `mg_btn_close` / `_pressed` (18x18) at (width-26, 3).
- **Bottom strip**:
  - `mg_timer_icon` sits at (8, h-11).
  - `mg_timer_track` (9-slice 3/3/1/1) runs from x=15 to width-8 at y=h-10, 6 tall.
  - `mg_timer_fill` (cyan) or `mg_timer_fill_low` (crimson; switch at 10 s or less, blink at 5 s or less) is a 9-slice (1/1/1/1) inside the track, 4 tall, with width = (trackW-2) * remaining/30.

## 4. Mini-games (all fit the 96x80 screen)
- **a. Slide** (3x3, 24 px tiles, 26 px pitch = 76): `mg_slide_picture` is an original haunted house at night with a moon, bats, a bare tree, a fence, and the Phantom's eyes in the right window.
  - `mg_slide_tile_1..9` follow reading order (manifest `home`). Tile 9 is shown only when solved; `mg_slide_empty` is the gap.
  - Every tile has a different feature, so the puzzle is solvable.
- **b. Maze** (8 px tiles, 12x10): `mg_maze_wall`, `_floor`, `_start` (cyan ring), `_exit` (pale-gold doorway), and `mg_maze_dot` (6x6, neutral white, setTint-able).
- **c. Lock** (64x64, rotate around the centre):
  - `mg_lock_dial` (24 ticks).
  - `mg_lock_target_zone`: a 30-degree green arc, centred on up.
  - `mg_lock_pick`: points up, pivot = centre.
  - `mg_lock_flash_success` (green) and `mg_lock_flash_fail` (crimson): overlays to blink 2–3 times.
- **d. Memory** (20x26 cards, 4x2 with 24/30 px pitch):
  - `mg_memory_back`: Phantom-eyes emblem.
  - `mg_memory_face_stun_gun` / `_wire_cutter` / `_room_key` / `_battery`: the existing item icons from `final/items/`.
  - `mg_memory_matched`: green overlay.
  - `mg_memory_edge`: optional mid-flip.
- **e. Chase** (8 px tiles, characters 10–12 px centred on the tile):
  - `mg_chase_walls`: 16-frame 4-bit autotile; frame = N*1 + E*2 + S*4 + W*8.
  - `mg_chase_spark`: dots.
  - `mg_chase_candle`: power dot, 2 frames.
  - `mg_chase_lumo`: the eater, 3x4 frames of 10x10; rows right/left/up/down, cols shutter closed/half/open; play 0,1,2,1.
  - `mg_chase_wisp_ember` / `_violet` / `_pale`: 2x4 frames of 12x12, 2-frame flicker, eyes look in the travel direction.
  - `mg_chase_wisp_frightened`: 4 frames; 0–1 dark scared, 2–3 pale flashing for the last 2 s.

### Original designs (no Namco likeness)
- **Lumo**, the eater, is a living lantern: a tan cage with a dark bar, a glowing flame core, one big eye and a little handle on its back.
  - It "eats" by sliding open a front shutter so light pours out. It is not a round yellow wedge and has no mouth cut-out.
  - The dots are light sparks, and the power dot is a candle.
- **The wisps** are small flame spirits: a pointed, flickering tip, a curling ember tail, and tall slit eyes with no whites. There is no skirt or wavy hem.
- **The frightened wisp** turns dark with worried slanted eyes and no wavy mouth.

## Files
All files: status **approved**, approvedDate **2026-11-24** (see manifest.json).

| file | size | group | notes |
|---|---|---|---|
| `item_game_controller.png` | 16x16 | item | retro gamepad: d-pad, cyan + crimson buttons, cable stub; same auto-outline as other items; used for pickup in world and in the item slot |
| `fx_tv_use_highlight.png` | 48x59 | tv | same look as the in-game interact highlight (dark 1 art px shadow, 1 art px pale gold line, faint fill); 2-frame pulse. Code may keep drawing its own #FFE14D highlight instead |
| `fx_tv_screen_glow.png` | 80x55 | tv | TV switched on while a mini-game is open; flicker 2 frames |
| `ui_prompt_use_tv.png` | 25x11 | tv | optional badge shown above the TV when holding the controller; label matches the console USE label |
| `mg_popup_frame.png` | 24x48 | popup | centre transparent = mini-game screen; top strip holds title plate + close button, bottom strip holds the timer |
| `mg_btn_close.png` | 18x18 | popup | 18 art px = 54 CSS at x3 (recommended); give it a 54-60 CSS hit area |
| `mg_btn_close_pressed.png` | 18x18 | popup |  |
| `mg_timer_track.png` | 8x6 | popup | empty 30 s bar; inner fill area = inset 1 px |
| `mg_timer_fill.png` | 4x4 | popup | stretch horizontally to remaining/30 of the inner track width |
| `mg_timer_fill_low.png` | 4x4 | popup | stretch horizontally to remaining/30 of the inner track width; switch to this at <= 10 s and blink at <= 5 s |
| `mg_timer_icon.png` | 5x7 | popup | small hourglass at the left of the bar |
| `mg_title_slide.png` | 27x10 | popup | title plate in the logo-plate style |
| `mg_title_maze.png` | 25x10 | popup | title plate in the logo-plate style |
| `mg_title_lock.png` | 25x10 | popup | title plate in the logo-plate style |
| `mg_title_memory.png` | 36x10 | popup | title plate in the logo-plate style |
| `mg_title_chase.png` | 27x10 | popup | title plate in the logo-plate style |
| `mg_slide_picture.png` | 72x72 | slide | solved picture 72x72 (3x3 of 24) |
| `mg_slide_tile_1.png` | 24x24 | slide |  |
| `mg_slide_tile_2.png` | 24x24 | slide |  |
| `mg_slide_tile_3.png` | 24x24 | slide |  |
| `mg_slide_tile_4.png` | 24x24 | slide |  |
| `mg_slide_tile_5.png` | 24x24 | slide |  |
| `mg_slide_tile_6.png` | 24x24 | slide |  |
| `mg_slide_tile_7.png` | 24x24 | slide |  |
| `mg_slide_tile_8.png` | 24x24 | slide |  |
| `mg_slide_tile_9.png` | 24x24 | slide | tile 9 is only shown when solved |
| `mg_slide_empty.png` | 24x24 | slide | empty slot (home = bottom-right) |
| `mg_maze_wall.png` | 8x8 | maze | top face + a little front showing |
| `mg_maze_floor.png` | 8x8 | maze |  |
| `mg_maze_start.png` | 8x8 | maze |  |
| `mg_maze_exit.png` | 8x8 | maze | pale-gold doorway |
| `mg_maze_dot.png` | 6x6 | maze | neutral white (setTint-able to the lobby colour) |
| `mg_lock_dial.png` | 64x64 | lock |  |
| `mg_lock_target_zone.png` | 64x64 | lock | green arc centred on 'up' (30 deg wide); rotate (origin 0.5) to place the zone |
| `mg_lock_pick.png` | 64x64 | lock | points up; rotate with origin 0.5 (pivot = dial centre) |
| `mg_lock_flash_success.png` | 64x64 | lock | overlay on the dial; blink 2-3 times |
| `mg_lock_flash_fail.png` | 64x64 | lock | overlay on the dial; blink 2-3 times |
| `mg_memory_back.png` | 20x26 | memory | Phantom eyes emblem |
| `mg_memory_face_stun_gun.png` | 20x26 | memory | uses the existing item_stun_gun icon |
| `mg_memory_face_wire_cutter.png` | 20x26 | memory | uses the existing item_wire_cutter icon |
| `mg_memory_face_room_key.png` | 20x26 | memory | uses the existing item_room_key icon |
| `mg_memory_face_battery.png` | 20x26 | memory | uses the existing item_battery icon |
| `mg_memory_matched.png` | 20x26 | memory | overlay on a face card once its pair is found |
| `mg_memory_edge.png` | 4x26 | memory | mid-flip frame (scale X of the card to 0 and swap, or show this) |
| `mg_chase_walls.png` | 128x8 | chase | 4-bit autotile: frame = N*1 + E*2 + S*4 + W*8 (neighbouring wall cells) |
| `mg_chase_spark.png` | 8x8 | chase | the dots: little light sparks |
| `mg_chase_candle.png` | 16x8 | chase | power dot: a candle; eating it frightens the wisps |
| `mg_chase_lumo.png` | 30x40 | chase | original eater 'Lumo', a living lantern; rotate-friendly (row 0 can be rotated instead of using rows 1-3) |
| `mg_chase_wisp_ember.png` | 24x48 | chase | original wisp enemy: a small flame spirit: pointed flickering tip, ember tail, slit eyes (no skirt, no white eyes) |
| `mg_chase_wisp_violet.png` | 24x48 | chase | original wisp enemy: a small flame spirit: pointed flickering tip, ember tail, slit eyes (no skirt, no white eyes) |
| `mg_chase_wisp_pale.png` | 24x48 | chase | original wisp enemy: a small flame spirit: pointed flickering tip, ember tail, slit eyes (no skirt, no white eyes) |
| `mg_chase_wisp_frightened.png` | 48x12 | chase |  |
