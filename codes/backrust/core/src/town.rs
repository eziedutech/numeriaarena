//! Fold Town: the shop, a student's own town of paper buildings on the pages
//! of the pop-up book, and the Folds that pay for it.
//!
//! Nothing here is stored as a number: the balance and the town are always
//! worked out again from the plays and the town's own events, the same way on
//! the device and on the server. An event that breaks a rule is refused with
//! a reason, never dropped.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------- folds

/// Points for one Fold.
pub const POINTS_PER_FOLD: u32 = 10;
/// Every finished play, on top of its points.
pub const SESSION_BONUS: u32 = 10;
/// A day played gives this much for each day of the streak it ends.
pub const STREAK_STEP: u32 = 5;
pub const STREAK_MAX: u32 = 25;
/// Given once, so the first house and its road are bought in the first session.
// TEMP LOCAL TEST, never commit: 40 + 5000 for Zia to try the town; set back to 40.
pub const WELCOME_FOLDS: u32 = 40;
/// Folds a day from plays the device reports (practice, races with the
/// robots); plays the server judged have no limit.
pub const DEVICE_DAILY_CAP: u32 = 100;

/// Who judged a play's points.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlaySource {
    /// Practice and races with the robots: reported by the device.
    Device,
    /// Class races, rooms, FIND A RIVAL, a smartboard race the teacher saved.
    Server,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Play {
    /// Days since 1970-01-01 (UTC).
    pub day: u32,
    pub points: u32,
    pub source: PlaySource,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Earnings {
    /// From points and the bonus for each play, after the daily limit.
    pub plays: u32,
    pub streak: u32,
    pub welcome: u32,
    /// Folds the daily limit held back, shown so nothing vanishes unexplained.
    pub held_back: u32,
    pub total: u32,
}

/// Folds earned so far.
pub fn earnings(plays: &[Play]) -> Earnings {
    let mut days: Vec<u32> = plays.iter().map(|p| p.day).collect();
    days.sort_unstable();
    days.dedup();
    let mut e = Earnings {
        welcome: WELCOME_FOLDS,
        ..Earnings::default()
    };
    let mut run = 0u32;
    for (i, day) in days.iter().enumerate() {
        run = if i > 0 && days[i - 1] + 1 == *day {
            run + 1
        } else {
            1
        };
        e.streak += (STREAK_STEP * run).min(STREAK_MAX);
        let mut device = 0u32;
        for p in plays.iter().filter(|p| p.day == *day) {
            let folds = p.points / POINTS_PER_FOLD + SESSION_BONUS;
            match p.source {
                PlaySource::Server => e.plays += folds,
                PlaySource::Device => device += folds,
            }
        }
        let kept = device.min(DEVICE_DAILY_CAP);
        e.plays += kept;
        e.held_back += device - kept;
    }
    e.total = e.plays + e.streak + e.welcome;
    e
}

// ---------------------------------------------------------------- the shop

/// A page of the book is one district of COLS x ROWS tiles.
pub const COLS: u8 = 12;
pub const ROWS: u8 = 7;
/// A page was 10 tiles wide before it grew a column on each side. A place or
/// move that does not say it counts COLS columns is from then, and its tiles
/// stand one column further right now.
const OLD_SHIFT: u8 = 1;

/// The column an event's `x` means on the page as it is now.
fn page_x(x: u8, cols: Option<u8>) -> u8 {
    if cols == Some(COLS) {
        x
    } else {
        x.saturating_add(OLD_SHIFT)
    }
}
/// A new page opens once the last one is this full (tenths of its free tiles).
pub const FULL_TENTHS: u32 = 7;
pub const MAX_LANDS: usize = 24;

/// The kind of a page of land, chosen before building on it. Its nature
/// (water, hills, sand) stays and cannot be built on; every page keeps one
/// marked plot for a landmark.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LandKind {
    /// Every tile free.
    #[default]
    Plain,
    /// A river along one row; the landmark plot stands on the water.
    River,
    /// Hills in one corner.
    Hills,
    /// Sand along one side.
    Beach,
}

pub const LAND_KINDS: [LandKind; 4] = [
    LandKind::Plain,
    LandKind::River,
    LandKind::Hills,
    LandKind::Beach,
];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tile {
    Free,
    Water,
    Hill,
    Sand,
    /// Kept for a landmark.
    Plot,
}

impl Tile {
    /// One character per tile, for drawing a page from the rules.
    pub fn mark(self) -> char {
        match self {
            Tile::Free => '.',
            Tile::Water => '~',
            Tile::Hill => '^',
            Tile::Sand => ':',
            Tile::Plot => '*',
        }
    }
}

impl LandKind {
    pub fn code(self) -> &'static str {
        match self {
            LandKind::Plain => "plain",
            LandKind::River => "river",
            LandKind::Hills => "hills",
            LandKind::Beach => "beach",
        }
    }

    pub fn of_code(code: &str) -> Option<LandKind> {
        LAND_KINDS.into_iter().find(|k| k.code() == code)
    }

    /// The landmark plot of a page of this kind: this tile and the one to its right.
    pub fn plot(self) -> (u8, u8) {
        match self {
            LandKind::Plain => (9, 1),
            LandKind::River => (6, 3),
            LandKind::Hills => (9, 0),
            LandKind::Beach => (9, 5),
        }
    }

    pub fn tile(self, x: u8, y: u8) -> Tile {
        let (px, py) = self.plot();
        if y == py && (x == px || x == px + 1) {
            return Tile::Plot;
        }
        match self {
            LandKind::River if y == 3 => Tile::Water,
            LandKind::Hills if (x >= 8 && y <= 1) || (x >= 10 && y == 2) => Tile::Hill,
            LandKind::Beach if y == ROWS - 1 => Tile::Sand,
            _ => Tile::Free,
        }
    }

    /// Tiles a building could stand on.
    pub fn free_tiles(self) -> u32 {
        (0..ROWS)
            .flat_map(|y| (0..COLS).map(move |x| (x, y)))
            .filter(|&(x, y)| self.tile(x, y) == Tile::Free)
            .count() as u32
    }

    /// The page as rows of tile marks.
    pub fn layout(self) -> Vec<String> {
        (0..ROWS)
            .map(|y| (0..COLS).map(|x| self.tile(x, y).mark()).collect())
            .collect()
    }
}

/// The class map: every seat's land as one cell of MAP_COLS x MAP_ROWS. A
/// student picks a free cell for their first land; each later land joins
/// beside their own when there is room, else it is only a new page.
pub const MAP_COLS: u8 = 10;
pub const MAP_ROWS: u8 = 8;

pub fn on_map(x: u8, y: u8) -> bool {
    x < MAP_COLS && y < MAP_ROWS
}

/// The cell a later land takes on the class map: the first free cell beside
/// one of the student's own (`own` in the order they were taken; right,
/// below, left, above), or None when every neighbour is taken.
pub fn next_cell(own: &[(u8, u8)], taken: impl Fn((u8, u8)) -> bool) -> Option<(u8, u8)> {
    for &(x, y) in own {
        let (x, y) = (i16::from(x), i16::from(y));
        for (nx, ny) in [(x + 1, y), (x, y + 1), (x - 1, y), (x, y - 1)] {
            if nx < 0 || ny < 0 {
                continue;
            }
            let cell = (nx as u8, ny as u8);
            if on_map(cell.0, cell.1) && !own.contains(&cell) && !taken(cell) {
                return Some(cell);
            }
        }
    }
    None
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Group {
    Road,
    /// Trees, plants, benches, lamps, signs.
    Nature,
    /// People, vehicles and animals: they may stand on a road.
    Decor,
    SmallHouse,
    /// Two-storey houses and parks.
    MediumHouse,
    /// Shops, the school, services.
    Public,
    Large,
}

impl Group {
    /// How long a building stands as a paper frame before it is done.
    pub fn build_seconds(self) -> u32 {
        match self {
            Group::Road | Group::Nature | Group::Decor => 0,
            Group::SmallHouse => 2 * 60,
            Group::MediumHouse => 5 * 60,
            Group::Public => 15 * 60,
            Group::Large => 60 * 60,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct Asset {
    pub id: &'static str,
    pub group: Group,
    pub price: u32,
    /// Footprint in tiles before turning.
    pub w: u8,
    pub h: u8,
    /// Buildings (not roads) standing in the town before it is sold.
    pub unlock_at: u32,
    /// Windows on the front, as rows x columns; 0 x 0 when it has none.
    pub windows: [u8; 2],
    /// Floors, each one tile high, for its volume.
    pub floors: u8,
}

pub(crate) const fn asset(
    id: &'static str,
    group: Group,
    price: u32,
    size: [u8; 2],
    unlock_at: u32,
    windows: [u8; 2],
    floors: u8,
) -> Asset {
    Asset {
        id,
        group,
        price,
        w: size[0],
        h: size[1],
        unlock_at,
        windows,
        floors,
    }
}

pub use crate::town_catalog::{ALIASES, CATALOG};

/// The only piece that stands on water: the page's own, or a stream laid on it.
pub const BRIDGE: &str = "bridge_road";

/// The shop's streams, which a bridge may cross.
pub const STREAMS: [&str; 2] = ["nature_river_straight", "nature_river_corner"];

/// Pieces small enough for a quarter of a tile (their models are under half
/// a tile across): up to four stand on one tile, also on a road's or a
/// footpath's. Every person, vehicle and animal, the plants but the banyan,
/// and the street's pieces but the wide billboard.
pub const SMALL: [&str; 79] = [
    "people_man",
    "people_woman",
    "people_child",
    "people_student",
    "people_hijab",
    "people_elderly",
    "people_jogger",
    "people_sitting",
    "people_umbrella",
    "people_office_worker",
    "people_cyclist",
    "people_police",
    "people_doctor",
    "people_worker",
    "people_vendor",
    "vehicle_bicycle",
    "vehicle_sedan",
    "vehicle_hatchback",
    "vehicle_motorcycle",
    "vehicle_becak",
    "vehicle_bajaj",
    "vehicle_taxi",
    "vehicle_suv",
    "vehicle_pickup",
    "vehicle_van",
    "vehicle_police",
    "vehicle_ambulance",
    "vehicle_bus",
    "vehicle_school_bus",
    "vehicle_fire_truck",
    "vehicle_truck",
    "vehicle_train_locomotive",
    "vehicle_train_carriage",
    "animal_cat",
    "animal_bird",
    "animal_cow",
    "animal_monkey",
    "animal_penguin",
    "animal_zebra",
    "animal_giraffe",
    "animal_lioness",
    "animal_lion",
    "animal_elephant",
    "tree_round",
    "tree_pine",
    "plant_bush",
    "plant_flower_bush",
    "plant_flower_pot",
    "plant_flower_bed",
    "tree_cypress",
    "plant_cactus",
    "plant_bamboo",
    "tree_sakura",
    "tree_palm",
    "tree_coconut",
    "tree_acacia",
    "plant_hedge",
    "prop_bench",
    "prop_street_lamp",
    "prop_trash_bins",
    "prop_mailbox",
    "prop_fountain",
    "prop_traffic_light",
    "prop_stop_sign",
    "prop_warning_sign",
    "prop_direction_sign",
    "prop_hydrant",
    "prop_cafe_table",
    "prop_beach_umbrella",
    "prop_phone_booth",
    "prop_vending_machine",
    "prop_flagpole",
    "prop_statue",
    "billboard_standing",
    "prop_fence",
    "prop_bus_stop",
    "billboard_pole",
    "billboard_digital",
    "billboard_rooftop",
];

/// Quarters of a tile: 0 and 1 along its back half, 2 and 3 along its front.
pub const SPOTS: u8 = 4;

pub fn is_small(a: &Asset) -> bool {
    SMALL.contains(&a.id)
}

/// A piece by its id, or by an id the town once used for it.
pub fn asset_by_id(id: &str) -> Option<&'static Asset> {
    let id = ALIASES
        .iter()
        .find(|(old, _)| *old == id)
        .map_or(id, |(_, now)| now);
    CATALOG.iter().find(|a| a.id == id)
}

/// Tiles covered when turned by `rot` degrees (0, 90, 180 or 270).
pub fn footprint(a: &Asset, rot: u16) -> (u8, u8) {
    if rot % 180 == 90 {
        (a.h, a.w)
    } else {
        (a.w, a.h)
    }
}

// ---------------------------------------------------------------- events

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TownEvent {
    /// Opens the next page of land, of the kind chosen.
    TownLand {
        event_id: String,
        at_ms: i64,
        #[serde(default)]
        kind: LandKind,
    },
    TownPlace {
        event_id: String,
        at_ms: i64,
        asset: String,
        land: u16,
        x: u8,
        y: u8,
        rot: u16,
        /// COLS when `x` counts on the page as wide as it is now; none from before.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cols: Option<u8>,
        /// The quarter a small piece stands on; none for the first free one.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        spot: Option<u8>,
    },
    /// Moves a building; a frame keeps building where it goes.
    TownMove {
        event_id: String,
        at_ms: i64,
        place_id: String,
        land: u16,
        x: u8,
        y: u8,
        rot: u16,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cols: Option<u8>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        spot: Option<u8>,
    },
    /// Takes a building away and gives back every Fold it cost.
    TownRemove {
        event_id: String,
        at_ms: i64,
        place_id: String,
    },
    /// A right answer to FINISH NOW: the frame is done at once.
    TownFinish {
        event_id: String,
        at_ms: i64,
        place_id: String,
    },
}

impl TownEvent {
    pub fn event_id(&self) -> &str {
        match self {
            TownEvent::TownLand { event_id, .. }
            | TownEvent::TownPlace { event_id, .. }
            | TownEvent::TownMove { event_id, .. }
            | TownEvent::TownRemove { event_id, .. }
            | TownEvent::TownFinish { event_id, .. } => event_id,
        }
    }

    pub fn at_ms(&self) -> i64 {
        match self {
            TownEvent::TownLand { at_ms, .. }
            | TownEvent::TownPlace { at_ms, .. }
            | TownEvent::TownMove { at_ms, .. }
            | TownEvent::TownRemove { at_ms, .. }
            | TownEvent::TownFinish { at_ms, .. } => *at_ms,
        }
    }

    /// The server keeps a device's clock within what it has seen.
    pub fn set_at_ms(&mut self, at: i64) {
        match self {
            TownEvent::TownLand { at_ms, .. }
            | TownEvent::TownPlace { at_ms, .. }
            | TownEvent::TownMove { at_ms, .. }
            | TownEvent::TownRemove { at_ms, .. }
            | TownEvent::TownFinish { at_ms, .. } => *at_ms = at,
        }
    }
}

/// Why an event was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Refusal {
    Duplicate,
    UnknownAsset,
    /// The shop does not sell it yet: more buildings first.
    Locked,
    NoLand,
    BadRotation,
    /// Part of it falls off the page.
    OffLand,
    /// Another building stands there.
    Taken,
    /// Water, a hill or sand: the page's own nature.
    Nature,
    /// Kept for a landmark.
    LandmarkPlot,
    /// A bridge stands only on water.
    NeedsWater,
    /// A stream with a bridge over it stays until the bridge is gone.
    UnderBridge,
    NotEnoughFolds,
    UnknownPlace,
    /// A new page opens only once the last one is full enough.
    LandNotFull,
    TooManyLands,
    AlreadyBuilt,
    /// A quarter of a tile asked for a piece that is not small, or off the tile.
    BadSpot,
}

impl Refusal {
    pub fn code(self) -> &'static str {
        match self {
            Refusal::Duplicate => "duplicate",
            Refusal::UnknownAsset => "unknown_asset",
            Refusal::Locked => "locked",
            Refusal::NoLand => "no_land",
            Refusal::BadRotation => "bad_rotation",
            Refusal::OffLand => "off_land",
            Refusal::Taken => "taken",
            Refusal::Nature => "nature",
            Refusal::LandmarkPlot => "landmark_plot",
            Refusal::NeedsWater => "needs_water",
            Refusal::UnderBridge => "under_bridge",
            Refusal::NotEnoughFolds => "not_enough_folds",
            Refusal::UnknownPlace => "unknown_place",
            Refusal::LandNotFull => "land_not_full",
            Refusal::TooManyLands => "too_many_lands",
            Refusal::AlreadyBuilt => "already_built",
            Refusal::BadSpot => "bad_spot",
        }
    }
}

// ---------------------------------------------------------------- the town

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Placed {
    /// The event that placed it.
    pub id: String,
    pub asset: String,
    pub price: u32,
    pub land: u16,
    pub x: u8,
    pub y: u8,
    pub rot: u16,
    /// The quarter of its tile a small piece stands on; none for the rest.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spot: Option<u8>,
    pub placed_at_ms: i64,
    /// Done before its time by a right answer to FINISH NOW.
    pub finished_at_ms: Option<i64>,
}

impl Placed {
    fn spec(&self) -> &'static Asset {
        asset_by_id(&self.asset).expect("placed assets are checked")
    }

    /// When the paper frame becomes the building.
    pub fn ready_at_ms(&self) -> i64 {
        let timer = self.placed_at_ms + i64::from(self.spec().group.build_seconds()) * 1000;
        self.finished_at_ms.map_or(timer, |f| f.min(timer))
    }

    pub fn is_ready(&self, now_ms: i64) -> bool {
        now_ms >= self.ready_at_ms()
    }

    fn covers(&self, land: u16, x: u8, y: u8) -> bool {
        let (w, h) = footprint(self.spec(), self.rot);
        self.land == land && x >= self.x && x < self.x + w && y >= self.y && y < self.y + h
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Town {
    /// Pages of land, in the order they were opened.
    pub lands: Vec<LandKind>,
    pub items: Vec<Placed>,
    #[serde(skip)]
    seen: BTreeSet<String>,
}

impl Town {
    /// Folds tied up in what stands; removing gives them all back.
    pub fn spent(&self) -> u32 {
        self.items.iter().map(|i| i.price).sum()
    }

    pub fn balance(&self, earned: u32) -> i64 {
        i64::from(earned) - i64::from(self.spent())
    }

    /// Buildings standing, roads, people, vehicles and animals not counted:
    /// what opens the shop's shelves.
    pub fn buildings(&self) -> u32 {
        self.items
            .iter()
            .filter(|i| !matches!(i.spec().group, Group::Road | Group::Decor))
            .count() as u32
    }

    pub fn is_unlocked(&self, a: &Asset) -> bool {
        self.buildings() >= a.unlock_at
    }

    pub fn item(&self, id: &str) -> Option<&Placed> {
        self.items.iter().find(|i| i.id == id)
    }

    /// The building on a tile, if any.
    pub fn at(&self, land: u16, x: u8, y: u8) -> Option<&Placed> {
        self.items.iter().find(|i| i.covers(land, x, y))
    }

    /// Tiles a building could stand on.
    pub fn free_tiles(&self, land: u16) -> u32 {
        self.lands
            .get(usize::from(land))
            .map_or(0, |k| k.free_tiles())
    }

    /// Tiles with something on them; a car on a road is one tile.
    pub fn used_tiles(&self, land: u16) -> u32 {
        let mut tiles = BTreeSet::new();
        for i in self.items.iter().filter(|i| i.land == land) {
            let (w, h) = footprint(i.spec(), i.rot);
            for y in i.y..i.y + h {
                for x in i.x..i.x + w {
                    tiles.insert((x, y));
                }
            }
        }
        tiles.len() as u32
    }

    pub fn is_full(&self, land: u16) -> bool {
        self.used_tiles(land) * 10 >= self.free_tiles(land) * FULL_TENTHS
    }

    /// A new page may open: the first one, or once the last is full enough.
    pub fn may_open_land(&self) -> Result<(), Refusal> {
        if self.lands.len() >= MAX_LANDS {
            return Err(Refusal::TooManyLands);
        }
        if !self.lands.is_empty() && !self.is_full(self.lands.len() as u16 - 1) {
            return Err(Refusal::LandNotFull);
        }
        Ok(())
    }

    /// Whether `a` fits at (x, y) turned by `rot`, leaving out `ignore` (a
    /// building being moved). Shown as a green or orange shadow while placing.
    pub fn fits(
        &self,
        a: &Asset,
        land: u16,
        x: u8,
        y: u8,
        rot: u16,
        ignore: Option<&str>,
    ) -> Result<(), Refusal> {
        self.fits_at(a, land, x, y, rot, None, ignore).map(|_| ())
    }

    /// As `fits`, for a small piece on quarter `spot` (or the first free one
    /// when none): the quarter it would take, none for any other piece.
    #[allow(clippy::too_many_arguments)]
    pub fn fits_at(
        &self,
        a: &Asset,
        land: u16,
        x: u8,
        y: u8,
        rot: u16,
        spot: Option<u8>,
        ignore: Option<&str>,
    ) -> Result<Option<u8>, Refusal> {
        if !rot.is_multiple_of(90) || rot >= 360 {
            return Err(Refusal::BadRotation);
        }
        let Some(kind) = self.lands.get(usize::from(land)) else {
            return Err(Refusal::NoLand);
        };
        let (w, h) = footprint(a, rot);
        if u16::from(x) + u16::from(w) > u16::from(COLS)
            || u16::from(y) + u16::from(h) > u16::from(ROWS)
        {
            return Err(Refusal::OffLand);
        }
        let bridge = a.id == BRIDGE;
        let small = is_small(a);
        if spot.is_some_and(|s| !small || s >= SPOTS) {
            return Err(Refusal::BadSpot);
        }
        // Quarters already taken on the tile, for a small piece.
        let mut quarters = [false; SPOTS as usize];
        for ty in y..y + h {
            for tx in x..x + w {
                match kind.tile(tx, ty) {
                    Tile::Water if bridge => {}
                    Tile::Free if !bridge => {}
                    Tile::Free if self.stream_at(land, tx, ty, ignore) => {}
                    Tile::Free => return Err(Refusal::NeedsWater),
                    Tile::Plot => return Err(Refusal::LandmarkPlot),
                    _ => return Err(Refusal::Nature),
                }
                for i in &self.items {
                    if Some(i.id.as_str()) == ignore || !i.covers(land, tx, ty) {
                        continue;
                    }
                    let b = i.spec();
                    let shares = match (a.group, b.group) {
                        _ if bridge && STREAMS.contains(&b.id) => true,
                        // A road or footpath takes small pieces on its quarters.
                        (Group::Road, _) => is_small(b),
                        (_, Group::Road) => small,
                        _ if small && is_small(b) => {
                            quarters[usize::from(i.spot.unwrap_or(0))] = true;
                            true
                        }
                        _ => false,
                    };
                    if !shares {
                        return Err(Refusal::Taken);
                    }
                }
            }
        }
        if !small {
            return Ok(None);
        }
        match spot {
            Some(s) if quarters[usize::from(s)] => Err(Refusal::Taken),
            Some(s) => Ok(Some(s)),
            None => (0..SPOTS)
                .find(|s| !quarters[usize::from(*s)])
                .map(Some)
                .ok_or(Refusal::Taken),
        }
    }

    /// Whether a stream from the shop lies on the tile.
    fn stream_at(&self, land: u16, x: u8, y: u8, ignore: Option<&str>) -> bool {
        self.items.iter().any(|i| {
            Some(i.id.as_str()) != ignore && i.covers(land, x, y) && STREAMS.contains(&i.spec().id)
        })
    }

    /// Whether a bridge stands over this stream.
    fn bridged(&self, it: &Placed) -> bool {
        STREAMS.contains(&it.spec().id)
            && self
                .items
                .iter()
                .any(|i| i.spec().id == BRIDGE && i.covers(it.land, it.x, it.y))
    }

    /// Applies one event, or says why not and leaves the town as it was.
    /// `earned` is every Fold earned so far.
    pub fn apply(&mut self, ev: &TownEvent, earned: u32) -> Result<(), Refusal> {
        if self.seen.contains(ev.event_id()) {
            return Err(Refusal::Duplicate);
        }
        match ev {
            TownEvent::TownLand { kind, .. } => {
                self.may_open_land()?;
                self.lands.push(*kind);
            }
            TownEvent::TownPlace {
                event_id,
                at_ms,
                asset,
                land,
                x,
                y,
                rot,
                cols,
                spot,
            } => {
                let a = asset_by_id(asset).ok_or(Refusal::UnknownAsset)?;
                if !self.is_unlocked(a) {
                    return Err(Refusal::Locked);
                }
                let x = page_x(*x, *cols);
                let spot = self.fits_at(a, *land, x, *y, *rot, *spot, None)?;
                if self.balance(earned) < i64::from(a.price) {
                    return Err(Refusal::NotEnoughFolds);
                }
                self.items.push(Placed {
                    id: event_id.clone(),
                    asset: a.id.to_string(),
                    price: a.price,
                    land: *land,
                    x,
                    y: *y,
                    rot: *rot,
                    spot,
                    placed_at_ms: *at_ms,
                    finished_at_ms: None,
                });
            }
            TownEvent::TownMove {
                place_id,
                land,
                x,
                y,
                rot,
                cols,
                spot,
                ..
            } => {
                let it = self.item(place_id).ok_or(Refusal::UnknownPlace)?;
                if self.bridged(it) {
                    return Err(Refusal::UnderBridge);
                }
                let a = it.spec();
                let x = page_x(*x, *cols);
                // Turned where it stands, a small piece keeps its quarter if it can.
                let same = it.land == *land && it.x == x && it.y == *y;
                let keep = spot.or(if same { it.spot } else { None });
                let spot = match self.fits_at(a, *land, x, *y, *rot, keep, Some(place_id)) {
                    Err(Refusal::Taken) if spot.is_none() && keep.is_some() => {
                        self.fits_at(a, *land, x, *y, *rot, None, Some(place_id))?
                    }
                    r => r?,
                };
                let item = self
                    .items
                    .iter_mut()
                    .find(|i| i.id == *place_id)
                    .expect("found above");
                item.land = *land;
                item.x = x;
                item.y = *y;
                item.rot = *rot;
                item.spot = spot;
            }
            TownEvent::TownRemove { place_id, .. } => {
                let at = self
                    .items
                    .iter()
                    .position(|i| i.id == *place_id)
                    .ok_or(Refusal::UnknownPlace)?;
                if self.bridged(&self.items[at]) {
                    return Err(Refusal::UnderBridge);
                }
                self.items.remove(at);
            }
            TownEvent::TownFinish {
                place_id, at_ms, ..
            } => {
                let item = self
                    .items
                    .iter_mut()
                    .find(|i| i.id == *place_id)
                    .ok_or(Refusal::UnknownPlace)?;
                if item.is_ready(*at_ms) {
                    return Err(Refusal::AlreadyBuilt);
                }
                item.finished_at_ms = Some(*at_ms);
            }
        }
        self.seen.insert(ev.event_id().to_string());
        Ok(())
    }

    /// Replays events in order with what was earned; refused ones are listed
    /// with their reason.
    pub fn replay(events: &[TownEvent], earned: u32) -> (Town, Vec<(String, Refusal)>) {
        let mut town = Town::default();
        let mut refused = Vec::new();
        for ev in events {
            if let Err(r) = town.apply(ev, earned) {
                refused.push((ev.event_id().to_string(), r));
            }
        }
        (town, refused)
    }

    /// City Builder: the price of every finished building that stands.
    /// With `since_ms`, only those finished from then on (this month's board).
    pub fn value(&self, now_ms: i64, since_ms: Option<i64>) -> u32 {
        self.items
            .iter()
            .filter(|i| i.is_ready(now_ms) && since_ms.is_none_or(|s| i.ready_at_ms() >= s))
            .map(|i| i.price)
            .sum()
    }
}

/// The town as the game draws it.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct TownView {
    pub lands: Vec<LandKind>,
    pub items: Vec<PlacedView>,
    pub earned: u32,
    pub balance: i64,
    pub buildings: u32,
    pub value: u32,
    /// Why no new page can open yet; None when one can.
    pub land_closed: Option<&'static str>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PlacedView {
    #[serde(flatten)]
    pub placed: Placed,
    pub ready_at_ms: i64,
    pub ready: bool,
}

impl Town {
    pub fn view(&self, earned: u32, now_ms: i64) -> TownView {
        TownView {
            lands: self.lands.clone(),
            items: self
                .items
                .iter()
                .map(|i| PlacedView {
                    placed: i.clone(),
                    ready_at_ms: i.ready_at_ms(),
                    ready: i.is_ready(now_ms),
                })
                .collect(),
            earned,
            balance: self.balance(earned),
            buildings: self.buildings(),
            value: self.value(now_ms, None),
            land_closed: self.may_open_land().err().map(Refusal::code),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn land(id: &str) -> TownEvent {
        land_of(id, LandKind::Plain)
    }

    fn land_of(id: &str, kind: LandKind) -> TownEvent {
        TownEvent::TownLand {
            event_id: id.into(),
            at_ms: 0,
            kind,
        }
    }

    fn place(id: &str, asset: &str, land: u16, x: u8, y: u8, rot: u16) -> TownEvent {
        TownEvent::TownPlace {
            event_id: id.into(),
            at_ms: 1_000,
            asset: asset.into(),
            land,
            x,
            y,
            rot,
            cols: Some(COLS),
            spot: None,
        }
    }

    fn remove(event: &str, id: &str) -> TownEvent {
        TownEvent::TownRemove {
            event_id: event.into(),
            at_ms: 1_000,
            place_id: id.into(),
        }
    }

    #[test]
    fn folds_come_from_points_bonus_streak_and_welcome() {
        let e = earnings(&[]);
        assert_eq!(e.total, WELCOME_FOLDS);
        let e = earnings(&[
            Play {
                day: 10,
                points: 95,
                source: PlaySource::Device,
            },
            Play {
                day: 11,
                points: 200,
                source: PlaySource::Server,
            },
        ]);
        // 9 + 10, then 20 + 10; streak 5 then 10.
        assert_eq!(e.plays, 49);
        assert_eq!(e.streak, 15);
        assert_eq!(e.total, 49 + 15 + WELCOME_FOLDS);
    }

    #[test]
    fn device_plays_stop_at_the_daily_limit_and_server_plays_do_not() {
        let device = |day| Play {
            day,
            points: 500,
            source: PlaySource::Device,
        };
        let e = earnings(&[device(3), device(3), device(3)]);
        assert_eq!(e.plays, DEVICE_DAILY_CAP);
        assert_eq!(e.held_back, 3 * 60 - DEVICE_DAILY_CAP);
        let server = Play {
            day: 3,
            points: 500,
            source: PlaySource::Server,
        };
        let e = earnings(&[device(3), device(3), server, server]);
        assert_eq!(e.plays, DEVICE_DAILY_CAP + 120);
        // A new day has its own limit.
        let e = earnings(&[device(3), device(3), device(4), device(4)]);
        assert_eq!(e.plays, 2 * DEVICE_DAILY_CAP);
    }

    #[test]
    fn the_streak_bonus_grows_to_its_cap_and_starts_again_after_a_gap() {
        let days = [1, 2, 3, 4, 5, 6, 7, 9];
        let plays: Vec<Play> = days
            .iter()
            .map(|d| Play {
                day: *d,
                points: 0,
                source: PlaySource::Device,
            })
            .collect();
        assert_eq!(earnings(&plays).streak, 5 + 10 + 15 + 20 + 25 + 25 + 25 + 5);
    }

    #[test]
    fn the_welcome_buys_a_hut_and_four_roads() {
        let mut t = Town::default();
        let earned = earnings(&[]).total;
        t.apply(&land("l0"), earned).unwrap();
        t.apply(&place("h", "house_hut", 0, 0, 0, 0), earned)
            .unwrap();
        for i in 1..=4 {
            t.apply(
                &place(&format!("r{i}"), "road_straight", 0, i, 0, 0),
                earned,
            )
            .unwrap();
        }
        assert_eq!(t.balance(earned), 0);
        assert_eq!(
            t.apply(&place("r5", "road_straight", 0, 5, 0, 0), earned),
            Err(Refusal::NotEnoughFolds)
        );
    }

    #[test]
    fn buildings_cannot_overlap_or_leave_the_page() {
        let mut t = Town::default();
        t.apply(&land("l0"), 1000).unwrap();
        assert_eq!(
            t.apply(&place("x", "house_hut", 1, 0, 0, 0), 1000),
            Err(Refusal::NoLand)
        );
        t.apply(&place("a", "house_duplex", 0, 2, 2, 0), 1000)
            .unwrap_err();
        // Semi-detached houses wait for nine buildings.
        for i in 0..9u8 {
            t.apply(&place(&format!("t{i}"), "tree_round", 0, i, 6, 0), 1000)
                .unwrap();
        }
        t.apply(&place("a", "house_duplex", 0, 2, 2, 0), 1000)
            .unwrap();
        assert_eq!(
            t.apply(&place("b", "house_hut", 0, 3, 2, 0), 1000),
            Err(Refusal::Taken)
        );
        // Turned, it covers (2, 1) and (2, 2).
        assert_eq!(
            t.apply(&place("c", "house_duplex", 0, 2, 1, 90), 1000),
            Err(Refusal::Taken)
        );
        assert_eq!(
            t.apply(&place("c", "house_duplex", 0, 11, 4, 0), 1000),
            Err(Refusal::OffLand)
        );
        t.apply(&place("c", "house_duplex", 0, 11, 4, 270), 1000)
            .unwrap();
        assert_eq!(t.at(0, 11, 5).map(|i| i.id.as_str()), Some("c"));
        assert_eq!(
            t.apply(&place("d", "house_hut", 0, 0, 0, 45), 1000),
            Err(Refusal::BadRotation)
        );
        assert_eq!(
            t.apply(&place("a", "house_hut", 0, 0, 0, 0), 1000),
            Err(Refusal::Duplicate)
        );
    }

    #[test]
    fn people_and_cars_may_stand_on_a_road_and_bridges_only_on_water() {
        let mut t = Town::default();
        t.apply(&land_of("l0", LandKind::River), 1000).unwrap();
        t.apply(&place("r", "road_straight", 0, 0, 2, 0), 1000)
            .unwrap();
        t.apply(&place("m", "people_man", 0, 0, 2, 0), 1000)
            .unwrap();
        // Small ones share the road's tile, a quarter each.
        t.apply(&place("w", "people_woman", 0, 0, 2, 0), 1000)
            .unwrap();
        assert_eq!(t.item("m").unwrap().spot, Some(0));
        assert_eq!(t.item("w").unwrap().spot, Some(1));
        // A cat shares it too, on the third quarter.
        t.apply(&place("be", "animal_cat", 0, 0, 2, 0), 1000)
            .unwrap();
        assert_eq!(t.item("be").unwrap().spot, Some(2));
        assert_eq!(
            t.apply(&place("h", "house_hut", 0, 0, 2, 0), 1000),
            Err(Refusal::Taken)
        );
        // A car first, then the road under it.
        t.apply(&place("c", "vehicle_bicycle", 0, 1, 2, 0), 1000)
            .unwrap();
        t.apply(&place("r2", "road_straight", 0, 1, 2, 0), 1000)
            .unwrap();
        assert_eq!(t.used_tiles(0), 2);
        // People, cars and roads open no shelves.
        assert_eq!(t.buildings(), 0);
        t.apply(&place("a", "tree_round", 0, 0, 0, 0), 1000)
            .unwrap();
        t.apply(&place("b", "tree_round", 0, 1, 0, 0), 1000)
            .unwrap();
        assert_eq!(
            t.apply(&place("br", "bridge_road", 0, 2, 2, 0), 1000),
            Err(Refusal::NeedsWater)
        );
        t.apply(&place("br", "bridge_road", 0, 0, 3, 90), 1000)
            .unwrap();
        assert_eq!(
            t.apply(&place("b2", "bridge_road", 0, 6, 3, 0), 1000),
            Err(Refusal::LandmarkPlot)
        );
        assert_eq!(Refusal::NeedsWater.code(), "needs_water");
    }

    #[test]
    fn a_bridge_crosses_a_stream_from_the_shop_which_then_stays() {
        let mut t = Town::default();
        t.apply(&land_of("l0", LandKind::Plain), 1000).unwrap();
        // Six pieces open the stream.
        for x in 0..6 {
            t.apply(&place(&format!("t{x}"), "tree_round", 0, x, 5, 0), 1000)
                .unwrap();
        }
        t.apply(&place("s", "nature_river_straight", 0, 0, 2, 0), 1000)
            .unwrap();
        t.apply(&place("br", "bridge_road", 0, 0, 2, 90), 1000)
            .unwrap();
        // Bridges need water still, and nothing else stands on one.
        assert_eq!(
            t.apply(&place("b2", "bridge_road", 0, 1, 2, 0), 1000),
            Err(Refusal::NeedsWater)
        );
        assert_eq!(t.apply(&remove("x1", "s"), 1000), Err(Refusal::UnderBridge));
        t.apply(&remove("x2", "br"), 1000).unwrap();
        t.apply(&remove("x3", "s"), 1000).unwrap();
        assert_eq!(Refusal::UnderBridge.code(), "under_bridge");
    }

    fn place_on(id: &str, asset: &str, x: u8, y: u8, spot: Option<u8>) -> TownEvent {
        match place(id, asset, 0, x, y, 0) {
            TownEvent::TownPlace {
                event_id,
                at_ms,
                asset,
                land,
                x,
                y,
                rot,
                cols,
                ..
            } => TownEvent::TownPlace {
                event_id,
                at_ms,
                asset,
                land,
                x,
                y,
                rot,
                cols,
                spot,
            },
            _ => unreachable!(),
        }
    }

    #[test]
    fn small_pieces_take_a_quarter_of_a_tile_and_large_ones_the_whole() {
        let mut t = Town::default();
        t.apply(&land("l0"), 1000).unwrap();
        // Six huts open the shelves of buses.
        for x in 0..6 {
            t.apply(&place_on(&format!("hut{x}"), "house_hut", x, 6, None), 1000)
                .unwrap();
        }
        // Four small ones on a tile, in the quarters asked for or the first free.
        t.apply(&place_on("a", "people_man", 0, 0, Some(3)), 1000)
            .unwrap();
        t.apply(&place_on("b", "vehicle_bicycle", 0, 0, None), 1000)
            .unwrap();
        t.apply(&place_on("c", "plant_flower_pot", 0, 0, None), 1000)
            .unwrap();
        assert_eq!(
            t.apply(&place_on("d", "animal_cat", 0, 0, Some(3)), 1000),
            Err(Refusal::Taken)
        );
        t.apply(&place_on("d", "animal_cat", 0, 0, None), 1000)
            .unwrap();
        let spots: Vec<_> = ["a", "b", "c", "d"]
            .iter()
            .map(|i| t.item(i).unwrap().spot)
            .collect();
        assert_eq!(spots, [Some(3), Some(0), Some(1), Some(2)]);
        assert_eq!(
            t.apply(&place_on("e", "people_woman", 0, 0, None), 1000),
            Err(Refusal::Taken)
        );
        assert_eq!(t.used_tiles(0), 7);
        // A house wants the whole tile; a large piece no quarter.
        assert_eq!(
            t.apply(&place_on("h", "house_hut", 0, 0, None), 1000),
            Err(Refusal::Taken)
        );
        assert_eq!(
            t.apply(&place_on("h", "house_hut", 1, 0, Some(0)), 1000),
            Err(Refusal::BadSpot)
        );
        assert_eq!(
            t.apply(&place_on("s", "people_man", 1, 0, Some(4)), 1000),
            Err(Refusal::BadSpot)
        );
        t.apply(&place_on("h", "house_hut", 1, 0, None), 1000)
            .unwrap();
        assert_eq!(t.item("h").unwrap().spot, None);
        assert_eq!(
            t.apply(&place_on("f", "people_man", 1, 0, None), 1000),
            Err(Refusal::Taken)
        );
        // Turned where it stands, a small one keeps its quarter.
        t.apply(
            &TownEvent::TownMove {
                event_id: "t".into(),
                at_ms: 2_000,
                place_id: "a".into(),
                land: 0,
                x: 0,
                y: 0,
                rot: 90,
                cols: Some(COLS),
                spot: None,
            },
            1000,
        )
        .unwrap();
        assert_eq!(t.item("a").unwrap().spot, Some(3));
        // A road takes a bus, a person, a lamp and a tree on its quarters,
        // and nothing more; the banyan is too wide for any quarter.
        t.apply(&place_on("r", "road_straight", 2, 0, None), 1000)
            .unwrap();
        for (id, asset) in [
            ("bus", "vehicle_bus"),
            ("g", "people_man"),
            ("l", "prop_street_lamp"),
            ("p", "tree_palm"),
        ] {
            t.apply(&place_on(id, asset, 2, 0, None), 1000).unwrap();
        }
        assert_eq!(
            t.apply(&place_on("cat", "animal_cat", 2, 0, None), 1000),
            Err(Refusal::Taken)
        );
        t.apply(&place_on("r2", "road_straight", 3, 0, None), 1000)
            .unwrap();
        assert_eq!(
            t.apply(&place_on("ban", "tree_banyan", 3, 0, None), 1000),
            Err(Refusal::Taken)
        );
        // Old events, without quarters, still read.
        let old: TownEvent = serde_json::from_str(
            r#"{"type":"town_place","event_id":"o","at_ms":1,"asset":"people_man","land":0,"x":4,"y":0,"rot":0,"cols":12}"#,
        )
        .unwrap();
        t.apply(&old, 1000).unwrap();
        assert_eq!(t.item("o").unwrap().spot, Some(0));
    }

    #[test]
    fn removing_gives_back_every_fold_and_moving_keeps_the_timer() {
        let mut t = Town::default();
        t.apply(&land("l0"), 100).unwrap();
        t.apply(&place("h", "house_cottage", 0, 0, 0, 0), 100)
            .unwrap();
        assert_eq!(t.balance(100), 70);
        let mv = TownEvent::TownMove {
            event_id: "m".into(),
            at_ms: 50_000,
            place_id: "h".into(),
            land: 0,
            x: 5,
            y: 5,
            rot: 90,
            cols: Some(COLS),
            spot: None,
        };
        t.apply(&mv, 100).unwrap();
        assert_eq!(t.item("h").unwrap().ready_at_ms(), 1_000 + 120_000);
        let rm = TownEvent::TownRemove {
            event_id: "rm".into(),
            at_ms: 60_000,
            place_id: "h".into(),
        };
        t.apply(&rm, 100).unwrap();
        assert_eq!(t.balance(100), 100);
        assert_eq!(t.apply(&rm, 100), Err(Refusal::Duplicate));
    }

    #[test]
    fn a_frame_is_done_after_its_time_or_at_once_with_finish_now() {
        let mut t = Town::default();
        t.apply(&land("l0"), 100).unwrap();
        t.apply(&place("r", "road_straight", 0, 0, 0, 0), 100)
            .unwrap();
        t.apply(&place("h", "house_hut", 0, 1, 0, 0), 100).unwrap();
        assert!(t.item("r").unwrap().is_ready(1_000));
        assert!(!t.item("h").unwrap().is_ready(60_000));
        assert!(t.item("h").unwrap().is_ready(121_000));
        assert_eq!(t.value(60_000, None), 5);
        let finish = |id: &str, at_ms| TownEvent::TownFinish {
            event_id: id.into(),
            at_ms,
            place_id: "h".into(),
        };
        t.apply(&finish("f", 30_000), 100).unwrap();
        assert!(t.item("h").unwrap().is_ready(30_000));
        assert_eq!(t.value(30_000, None), 25);
        assert_eq!(t.value(30_000, Some(20_000)), 20);
        assert_eq!(
            t.apply(&finish("g", 40_000), 100),
            Err(Refusal::AlreadyBuilt)
        );
    }

    #[test]
    fn a_new_page_opens_once_the_last_is_seven_tenths_full() {
        let mut t = Town::default();
        t.apply(&land("l0"), 10_000).unwrap();
        assert_eq!(t.apply(&land("l1"), 10_000), Err(Refusal::LandNotFull));
        // 57 roads cover 57 of the 82 free tiles: not yet 70%.
        let mut n = 0;
        for y in 0..ROWS {
            for x in 0..COLS {
                if n < 57 && LandKind::Plain.tile(x, y) == Tile::Free {
                    t.apply(&place(&format!("r{n}"), "road_cross", 0, x, y, 0), 10_000)
                        .unwrap();
                    n += 1;
                }
            }
        }
        assert!(!t.is_full(0));
        assert_eq!(t.apply(&land("l1"), 10_000), Err(Refusal::LandNotFull));
        t.apply(&place("r57", "road_cross", 0, 11, 4, 0), 10_000)
            .unwrap();
        assert!(t.is_full(0));
        t.apply(&land("l1"), 10_000).unwrap();
        assert_eq!(t.lands.len(), 2);
        t.apply(&place("h", "house_hut", 1, 0, 0, 0), 10_000)
            .unwrap();
    }

    #[test]
    fn the_shop_opens_shelves_as_buildings_go_up() {
        let mut t = Town::default();
        t.apply(&land("l0"), 10_000).unwrap();
        // An id the town once used still names its piece.
        let tower = asset_by_id("office_tower").unwrap();
        assert_eq!(tower.id, "office_glass_tower");
        assert!(!t.is_unlocked(tower));
        for i in 0..19u8 {
            t.apply(
                &place(&format!("t{i}"), "tree_pine", 0, i % 10, 2 * (i / 10), 0),
                10_000,
            )
            .unwrap();
        }
        // Roads and people do not count as buildings.
        t.apply(&place("r", "road_corner", 0, 0, 4, 0), 10_000)
            .unwrap();
        t.apply(&place("m", "people_man", 0, 1, 4, 0), 10_000)
            .unwrap();
        assert_eq!(
            t.apply(&place("o", "office_tower", 0, 0, 5, 0), 10_000),
            Err(Refusal::Locked)
        );
        t.apply(&place("t19", "tree_pine", 0, 9, 2, 0), 10_000)
            .unwrap();
        t.apply(&place("o", "office_tower", 0, 0, 5, 0), 10_000)
            .unwrap();
        assert_eq!(t.item("o").unwrap().asset, "office_glass_tower");
    }

    #[test]
    fn a_replay_lists_what_it_refused() {
        let events = vec![
            place("early", "house_hut", 0, 0, 0, 0),
            land("l0"),
            place("h", "house_hut", 0, 0, 0, 0),
            place("big", "stadium", 0, 3, 3, 0),
        ];
        let (town, refused) = Town::replay(&events, 40);
        assert_eq!(town.items.len(), 1);
        assert_eq!(
            refused,
            vec![
                ("early".to_string(), Refusal::NoLand),
                ("big".to_string(), Refusal::Locked)
            ]
        );
        let json = serde_json::to_string(&events[2]).unwrap();
        assert!(json.contains("\"type\":\"town_place\""));
        let back: TownEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(back, events[2]);
    }

    #[test]
    fn a_place_from_the_narrow_page_stands_a_column_further_right() {
        let old = r#"{"type":"town_place","event_id":"h","at_ms":1,"asset":"house_hut","land":0,"x":7,"y":1,"rot":0}"#;
        let old: TownEvent = serde_json::from_str(old).unwrap();
        let (town, refused) = Town::replay(&[land("l0"), old], 40);
        assert!(refused.is_empty());
        assert_eq!((town.items[0].x, town.items[0].y), (8, 1));
        // On the narrow page its plot was (8, 1) and (9, 1); now it is a column right.
        let old = r#"{"type":"town_move","event_id":"m","at_ms":2,"place_id":"h","land":0,"x":8,"y":1,"rot":0}"#;
        let old: TownEvent = serde_json::from_str(old).unwrap();
        let mut t = town;
        assert_eq!(t.apply(&old, 40), Err(Refusal::LandmarkPlot));
        let new = place("n", "road_straight", 0, 8, 1, 0);
        assert!(serde_json::to_string(&new).unwrap().contains("\"cols\":12"));
    }

    #[test]
    fn nature_and_the_landmark_plot_cannot_be_built_on() {
        let mut t = Town::default();
        t.apply(&land_of("l0", LandKind::River), 1000).unwrap();
        assert_eq!(t.free_tiles(0), 72);
        assert_eq!(
            t.apply(&place("w", "road_straight", 0, 0, 3, 0), 1000),
            Err(Refusal::Nature)
        );
        assert_eq!(
            t.apply(&place("p", "road_straight", 0, 6, 3, 0), 1000),
            Err(Refusal::LandmarkPlot)
        );
        // A turned house of two tiles would reach into the river.
        for i in 0..9u8 {
            t.apply(&place(&format!("t{i}"), "tree_round", 0, i, 0, 0), 1000)
                .unwrap();
        }
        assert_eq!(
            t.apply(&place("h", "house_duplex", 0, 4, 2, 90), 1000),
            Err(Refusal::Nature)
        );
        t.apply(&place("h", "house_duplex", 0, 4, 1, 90), 1000)
            .unwrap();
        assert_eq!(LandKind::Plain.free_tiles(), 82);
        assert_eq!(LandKind::Hills.free_tiles(), 74);
        assert_eq!(LandKind::Beach.free_tiles(), 70);
        assert_eq!(LandKind::Beach.layout()[6], "::::::::::::");
        assert_eq!(LandKind::Beach.layout()[5], ".........**.");
        assert_eq!(LandKind::Hills.layout()[0], "........^**^");
        assert_eq!(LandKind::Hills.layout()[2], "..........^^");
        assert_eq!(LandKind::River.layout()[3], "~~~~~~**~~~~");
        for k in LAND_KINDS {
            assert_eq!(LandKind::of_code(k.code()), Some(k));
            assert_eq!(serde_json::to_value(k).unwrap(), k.code());
        }
    }

    #[test]
    fn later_lands_may_be_of_another_kind() {
        let mut t = Town::default();
        t.apply(&land_of("l0", LandKind::Beach), 10_000).unwrap();
        // 49 of the 70 free tiles is 70%.
        let free: Vec<(u8, u8)> = (0..ROWS)
            .flat_map(|y| (0..COLS).map(move |x| (x, y)))
            .filter(|&(x, y)| LandKind::Beach.tile(x, y) == Tile::Free)
            .take(49)
            .collect();
        for (n, (x, y)) in free.into_iter().enumerate() {
            t.apply(&place(&format!("r{n}"), "road_cross", 0, x, y, 0), 10_000)
                .unwrap();
        }
        assert!(t.is_full(0));
        t.apply(&land_of("l1", LandKind::Hills), 10_000).unwrap();
        assert_eq!(t.lands, vec![LandKind::Beach, LandKind::Hills]);
        let json = r#"{"type":"town_land","event_id":"x","at_ms":1}"#;
        let ev: TownEvent = serde_json::from_str(json).unwrap();
        assert!(matches!(
            ev,
            TownEvent::TownLand {
                kind: LandKind::Plain,
                ..
            }
        ));
    }

    #[test]
    fn a_later_land_joins_beside_the_first_when_there_is_room() {
        let taken = [(4u8, 3u8), (3, 4)];
        let is_taken = |c| taken.contains(&c);
        assert_eq!(next_cell(&[(3, 3)], is_taken), Some((2, 3)));
        assert_eq!(next_cell(&[(9, 7)], |_| false), Some((8, 7)));
        assert_eq!(next_cell(&[(0, 0), (1, 0)], |_| false), Some((0, 1)));
        assert_eq!(next_cell(&[(0, 0)], |_| true), None);
        assert!(on_map(9, 7) && !on_map(10, 0) && !on_map(0, 8));
    }

    #[test]
    fn every_asset_fits_a_page_and_has_a_sensible_price() {
        let mut ids: Vec<&str> = CATALOG.iter().map(|a| a.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), CATALOG.len());
        for a in CATALOG.iter() {
            assert!(
                a.w >= 1 && a.h >= 1 && a.w <= COLS && a.h <= ROWS,
                "{}",
                a.id
            );
            assert!(a.price > 0 && a.price <= 500, "{}", a.id);
        }
        // The first shelf is open from the start.
        assert!(
            CATALOG
                .iter()
                .any(|a| a.unlock_at == 0 && a.group == Group::SmallHouse)
        );
    }
}
