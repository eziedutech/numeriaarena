import { createComponent, Types } from '@iwsdk/core';

/** Root of the play area on the real desk. Every game object is its child. */
export const DeskRoot = createComponent('DeskRoot', {
  placed: { type: Types.Boolean, default: false },
  /** How it was placed: 0 not yet, 1 detected table, 2 pinch, 3 browser preview, 4 in front of the player. */
  method: { type: Types.Int8, default: 0 },
});

export const Creature = createComponent('Creature', {
  offerId: { type: Types.Int32, default: 0 },
});

export const Balloon = createComponent('Balloon', {
  index: { type: Types.Int16, default: 0 },
});

export const Crystal = createComponent('Crystal', {
  index: { type: Types.Int16, default: 0 },
});

export const Orb = createComponent('Orb', {
  first: { type: Types.Int16, default: -1 },
  second: { type: Types.Int16, default: -1 },
});

/** What a desk button does: start a game, leave for the home page, or change a setting. */
const Games = {
  Race: 'race',
  BalloonBurst: 'balloon_burst',
  OrbForge: 'orb_forge',
  FactorySort: 'factory_sort',
  BridgeBuilder: 'bridge_builder',
  BalanceGate: 'balance_gate',
  Home: 'home',
  Language: 'lang',
  BigText: 'bigtext',
  /** ACCESSIBILITY on the desk menu: its own line of chips in place of the settings, and BACK out of it. */
  Access: 'access',
  AccessBack: 'access_back',
  NoTimer: 'no_timer',
  Contrast: 'contrast',
  ReadAloud: 'read_aloud',
  SteadyAim: 'steady_aim',
  HowtoAgain: 'howto_again',
  /** ROOM, floating over the desk menu in the headset: the room around the desk. */
  Room: 'room',
  /** SOUND and MUSIC in the desk menu's settings: sound effects and the quiet music on or off. */
  Sound: 'sound',
  Music: 'music',
  Town: 'town',
  /** MY FOLD TOWN on the desk: turning with A, B, X or Y, EXIT, the four kinds of a first land, and a building's card. */
  TownTurn: 'town_turn',
  TownDone: 'town_done',
  TownPlain: 'town_plain',
  TownRiver: 'town_river',
  TownHills: 'town_hills',
  TownBeach: 'town_beach',
  /** The three answers of FINISH NOW, and closing a building's card. */
  TownAnswer0: 'town_a0',
  TownAnswer1: 'town_a1',
  TownAnswer2: 'town_a2',
  TownCardClose: 'town_card',
  /** A chosen piece's card: turn it left or right, or remove it. */
  TownTurnLeft: 'town_left',
  TownTurnRight: 'town_right',
  TownRemove: 'town_remove',
  /** Zooming the land on the desk in and out, and the hand tool that drags it about. */
  TownZoomIn: 'town_zoom_in',
  TownZoomOut: 'town_zoom_out',
  TownPan: 'town_pan',
  /** The toolbar's ENLARGE: the shelf twice as big, or back. */
  TownShelfBig: 'town_shelf_big',
  /** The toolbar's SHELF: the shelf shown or hidden. */
  TownShelfShow: 'town_shelf_show',
  /** The toolbar's ROOM: the room around the desk, as the menu's ROOM card. */
  TownRoom: 'town_room',
  /** The toolbar's MUSIC: the music on or off, as the menu's MUSIC card. */
  TownMusic: 'town_music',
  /** The lands' toolbar: the land before or after, NEW LAND, and how Folds come. */
  TownLandBack: 'town_land_back',
  TownLandNext: 'town_land_next',
  TownLandNew: 'town_land_new',
  TownHow: 'town_how',
  /** BACK among the kinds of a new land: no new land after all. */
  TownKindsBack: 'town_kinds_back',
  /** OK on the notice of buildings sent back or changes refused. */
  TownNotice: 'town_notice',
  /** The grade a finished building's maths is written for, played alone. */
  TownGrade4: 'town_grade_4',
  TownGrade5: 'town_grade_5',
  TownGrade6: 'town_grade_6',
  /** MEASURE HUNT, game 6, in the headset only, and its own cards (see measure/measure-desk.ts). */
  MeasureHunt: 'measure_hunt',
  MeGrade4: 'me_grade_4',
  MeGrade5: 'me_grade_5',
  MeGrade6: 'me_grade_6',
  MeFlat: 'me_flat',
  MeSolid: 'me_solid',
  MePaper: 'me_paper',
  MeReal: 'me_real',
  MeStart: 'me_start',
  MeA0: 'me_a0',
  MeA1: 'me_a1',
  MeA2: 'me_a2',
  MeA3: 'me_a3',
  MeA4: 'me_a4',
  MeClear: 'me_clear',
  MeSkip: 'me_skip',
  MeAgain: 'me_again',
  MeDone: 'me_done',
  MeBack: 'me_back',
  MeZoom: 'me_zoom',
  MeTurnLeft: 'me_tl',
  MeTurnRight: 'me_tr',
  MeTurnUp: 'me_tu',
  MeTurnDown: 'me_td',
  MeNet: 'me_net',
  MeShSquare: 'me_sh_square',
  MeShRectangle: 'me_sh_rectangle',
  MeShTriangle: 'me_sh_triangle',
  MeShCircle: 'me_sh_circle',
  MeShCube: 'me_sh_cube',
  MeShCuboid: 'me_sh_cuboid',
  MeShPaper: 'me_sh_paper',
  /** BUILD, on any results: MY FOLD TOWN on the desk. */
  Build: 'build',
  /** PRACTICE AGAIN, on a practice's results. */
  Again: 'again',
  /** OTHER GAME, on a practice's results: back to the practice envelopes. */
  Games: 'games',
  /** Done, on any results: it only closes them, so a second touch can never start a game. */
  Done: 'done',
  /** QUIT, on the desk during a game in the headset. */
  Quit: 'quit',
} as const;

/** Every value a MenuButton can carry; the game's choices must be among them. */
export type MenuButtonValue = (typeof Games)[keyof typeof Games];

export const MenuButton = createComponent('MenuButton', {
  game: { type: Types.Enum, default: Games.BalloonBurst, enum: Games },
});
