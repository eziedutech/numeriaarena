//! Browser bindings. JSON strings cross the boundary so the TypeScript side
//! stays thin; typed bindings come with the protocol types.

use wasm_bindgen::prelude::*;

use crate::dsl::{Env, parse};
use crate::format::format_auto;
use crate::template::{CompiledTemplate, ItemTemplate};

#[wasm_bindgen(js_name = coreVersion)]
pub fn core_version() -> String {
    crate::CORE_VERSION.to_string()
}

/// Evaluates a DSL expression without variables and returns the formatted value.
#[wasm_bindgen(js_name = evaluate)]
pub fn evaluate(expr: &str) -> Result<String, JsError> {
    let value = parse(expr)
        .map_err(|e| JsError::new(&e.to_string()))?
        .eval(&Env::new())
        .map_err(|e| JsError::new(&e.to_string()))?;
    Ok(match value {
        crate::dsl::Value::Num(r) => format_auto(&r),
        other => other.to_string(),
    })
}

/// Builds one concrete item from a template (JSON) and a seed; returns the item as JSON.
#[wasm_bindgen(js_name = instantiateItem)]
pub fn instantiate_item(template_json: &str, seed: u32) -> Result<String, JsError> {
    let template =
        ItemTemplate::from_json(template_json).map_err(|e| JsError::new(&e.to_string()))?;
    let compiled = CompiledTemplate::compile(template).map_err(|issues| {
        JsError::new(
            &issues
                .iter()
                .map(|i| i.message.as_str())
                .collect::<Vec<_>>()
                .join("; "),
        )
    })?;
    let item = compiled
        .instantiate(u64::from(seed))
        .map_err(|e| JsError::new(&e.to_string()))?;
    serde_json::to_string(&item).map_err(|e| JsError::new(&e.to_string()))
}

fn js<E: std::fmt::Display>(e: E) -> JsError {
    JsError::new(&e.to_string())
}

/// Solo game session for the headset. Every call returns JSON.
#[wasm_bindgen]
pub struct GameSession {
    inner: crate::session::SoloSession,
    rejected: Vec<String>,
}

#[wasm_bindgen]
impl GameSession {
    /// `templates_json`: array of item templates. `config_json`: SessionConfig.
    #[wasm_bindgen(constructor)]
    pub fn new(templates_json: &str, config_json: &str) -> Result<GameSession, JsError> {
        let templates: Vec<ItemTemplate> = serde_json::from_str(templates_json).map_err(js)?;
        let cfg: crate::session::SessionConfig = serde_json::from_str(config_json).map_err(js)?;
        let (inner, rejected) = crate::session::SoloSession::new(
            templates,
            cfg,
            crate::fairness::FairnessParams::default(),
        )
        .map_err(js)?;
        Ok(GameSession { inner, rejected })
    }

    /// Ids of templates that did not compile (reported, never silently dropped).
    pub fn rejected(&self) -> String {
        serde_json::to_string(&self.rejected).unwrap_or_default()
    }

    /// `game`: "balloon_burst" or "orb_forge".
    pub fn next(&mut self, game: &str) -> Result<String, JsError> {
        let game: crate::fairness::GameType =
            serde_json::from_str(&format!("\"{game}\"")).map_err(js)?;
        serde_json::to_string(&self.inner.next(game).map_err(js)?).map_err(js)
    }

    #[wasm_bindgen(js_name = answerBalloon)]
    pub fn answer_balloon(
        &mut self,
        offer_id: u32,
        index: u32,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<String, JsError> {
        let v = self
            .inner
            .answer_balloon(offer_id, index as usize, time_ms, now_ms)
            .map_err(js)?;
        serde_json::to_string(&v).map_err(js)
    }

    #[wasm_bindgen(js_name = answerOrb)]
    pub fn answer_orb(
        &mut self,
        offer_id: u32,
        crystals: Vec<u32>,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<String, JsError> {
        let picks: Vec<usize> = crystals.into_iter().map(|c| c as usize).collect();
        let v = self
            .inner
            .answer_orb(offer_id, &picks, time_ms, now_ms)
            .map_err(js)?;
        serde_json::to_string(&v).map_err(js)
    }

    #[wasm_bindgen(js_name = answerBalance)]
    pub fn answer_balance(
        &mut self,
        offer_id: u32,
        index: u32,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<String, JsError> {
        let v = self
            .inner
            .answer_balance(offer_id, index as usize, time_ms, now_ms)
            .map_err(js)?;
        serde_json::to_string(&v).map_err(js)
    }

    #[wasm_bindgen(js_name = answerSort)]
    pub fn answer_sort(
        &mut self,
        offer_id: u32,
        gate: u32,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<String, JsError> {
        let v = self
            .inner
            .answer_sort(offer_id, gate as usize, time_ms, now_ms)
            .map_err(js)?;
        serde_json::to_string(&v).map_err(js)
    }

    #[wasm_bindgen(js_name = answerBridge)]
    pub fn answer_bridge(
        &mut self,
        offer_id: u32,
        planks: Vec<u32>,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<String, JsError> {
        let picks: Vec<usize> = planks.into_iter().map(|c| c as usize).collect();
        let v = self
            .inner
            .answer_bridge(offer_id, &picks, time_ms, now_ms)
            .map_err(js)?;
        serde_json::to_string(&v).map_err(js)
    }

    pub fn close(&mut self, offer_id: u32) -> bool {
        self.inner.close(offer_id)
    }

    #[wasm_bindgen(js_name = drainEvents)]
    pub fn drain_events(&mut self) -> String {
        serde_json::to_string(&self.inner.drain_events()).unwrap_or_default()
    }

    #[wasm_bindgen(js_name = totalPoints)]
    pub fn total_points(&self) -> u32 {
        self.inner.total_points()
    }

    /// The practice how-to's right answer (balloon, weight or gate index, or
    /// crystal or plank indices), once per game; empty when there is none.
    #[wasm_bindgen(js_name = howToKey)]
    pub fn how_to_key(&mut self, offer_id: u32) -> Vec<u32> {
        self.inner
            .how_to_key(offer_id)
            .map(|k| k.into_iter().map(|i| i as u32).collect())
            .unwrap_or_default()
    }
}

/// Race for the headset: the player against two rival bots.
#[wasm_bindgen]
pub struct RaceGame {
    inner: crate::race::RaceMatch,
    rejected: Vec<String>,
}

#[wasm_bindgen]
impl RaceGame {
    /// `templates_json`: array of item templates. `config_json`: RaceConfig.
    #[wasm_bindgen(constructor)]
    pub fn new(templates_json: &str, config_json: &str) -> Result<RaceGame, JsError> {
        let templates: Vec<ItemTemplate> = serde_json::from_str(templates_json).map_err(js)?;
        let cfg: crate::race::RaceConfig = serde_json::from_str(config_json).map_err(js)?;
        let (inner, rejected) =
            crate::race::RaceMatch::new(templates, cfg, crate::fairness::FairnessParams::default())
                .map_err(js)?;
        Ok(RaceGame { inner, rejected })
    }

    pub fn rejected(&self) -> String {
        serde_json::to_string(&self.rejected).unwrap_or_default()
    }

    pub fn start(&mut self, now_ms: f64) {
        self.inner.start(now_ms);
    }

    /// Events since the last tick, as a JSON array.
    pub fn tick(&mut self, now_ms: f64) -> String {
        serde_json::to_string(&self.inner.tick(now_ms)).unwrap_or_default()
    }

    /// The next creature for the player's desk as JSON, or "null".
    #[wasm_bindgen(js_name = playerNext)]
    pub fn player_next(&mut self) -> Result<String, JsError> {
        serde_json::to_string(&self.inner.player_next().map_err(js)?).map_err(js)
    }

    #[wasm_bindgen(js_name = answerBalloon)]
    pub fn answer_balloon(
        &mut self,
        offer_id: u32,
        index: u32,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<String, JsError> {
        let v = self
            .inner
            .answer_balloon(offer_id, index as usize, time_ms, now_ms)
            .map_err(js)?;
        serde_json::to_string(&v).map_err(js)
    }

    #[wasm_bindgen(js_name = answerOrb)]
    pub fn answer_orb(
        &mut self,
        offer_id: u32,
        crystals: Vec<u32>,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<String, JsError> {
        let picks: Vec<usize> = crystals.into_iter().map(|c| c as usize).collect();
        let v = self
            .inner
            .answer_orb(offer_id, &picks, time_ms, now_ms)
            .map_err(js)?;
        serde_json::to_string(&v).map_err(js)
    }

    #[wasm_bindgen(js_name = answerBalance)]
    pub fn answer_balance(
        &mut self,
        offer_id: u32,
        index: u32,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<String, JsError> {
        let v = self
            .inner
            .answer_balance(offer_id, index as usize, time_ms, now_ms)
            .map_err(js)?;
        serde_json::to_string(&v).map_err(js)
    }

    #[wasm_bindgen(js_name = answerSort)]
    pub fn answer_sort(
        &mut self,
        offer_id: u32,
        gate: u32,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<String, JsError> {
        let v = self
            .inner
            .answer_sort(offer_id, gate as usize, time_ms, now_ms)
            .map_err(js)?;
        serde_json::to_string(&v).map_err(js)
    }

    #[wasm_bindgen(js_name = answerBridge)]
    pub fn answer_bridge(
        &mut self,
        offer_id: u32,
        planks: Vec<u32>,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<String, JsError> {
        let picks: Vec<usize> = planks.into_iter().map(|c| c as usize).collect();
        let v = self
            .inner
            .answer_bridge(offer_id, &picks, time_ms, now_ms)
            .map_err(js)?;
        serde_json::to_string(&v).map_err(js)
    }

    pub fn view(&self) -> String {
        serde_json::to_string(&self.inner.view()).unwrap_or_default()
    }

    pub fn recap(&self) -> String {
        serde_json::to_string(&self.inner.recap()).unwrap_or_default()
    }

    #[wasm_bindgen(js_name = drainEvents)]
    pub fn drain_events(&mut self) -> String {
        serde_json::to_string(&self.inner.drain_answer_events()).unwrap_or_default()
    }
}

/// What the shop sells and the rules of Fold Town, as JSON.
#[wasm_bindgen(js_name = townRules)]
pub fn town_rules() -> String {
    use crate::town::*;
    serde_json::json!({
        "catalog": &CATALOG[..],
        "aliases": &ALIASES[..],
        "small": &SMALL[..],
        "spots": SPOTS,
        "cols": COLS,
        "rows": ROWS,
        "full_tenths": FULL_TENTHS,
        "points_per_fold": POINTS_PER_FOLD,
        "session_bonus": SESSION_BONUS,
        "streak_step": STREAK_STEP,
        "streak_max": STREAK_MAX,
        "welcome": WELCOME_FOLDS,
        "device_daily_cap": DEVICE_DAILY_CAP,
        "lands": LAND_KINDS
            .iter()
            .map(|k| serde_json::json!({ "kind": k, "plot": k.plot(), "layout": k.layout() }))
            .collect::<Vec<_>>(),
        "map_cols": MAP_COLS,
        "map_rows": MAP_ROWS,
    })
    .to_string()
}

/// Folds earned from plays (`[{day, points, source}]`), as JSON.
#[wasm_bindgen(js_name = townEarnings)]
pub fn town_earnings(plays_json: &str) -> Result<String, JsError> {
    let plays: Vec<crate::town::Play> = serde_json::from_str(plays_json).map_err(js)?;
    serde_json::to_string(&crate::town::earnings(&plays)).map_err(js)
}

/// A town replayed from its events, kept to try and apply new ones.
#[wasm_bindgen]
pub struct TownBook {
    town: crate::town::Town,
    earned: u32,
    refused: Vec<(String, crate::town::Refusal)>,
}

#[wasm_bindgen]
impl TownBook {
    /// `events_json`: town events in order. Refused ones are kept in `refused`.
    #[wasm_bindgen(constructor)]
    pub fn new(events_json: &str, earned: u32) -> Result<TownBook, JsError> {
        let events: Vec<crate::town::TownEvent> = serde_json::from_str(events_json).map_err(js)?;
        let (town, refused) = crate::town::Town::replay(&events, earned);
        Ok(TownBook {
            town,
            earned,
            refused,
        })
    }

    /// Events the replay refused, as `[[event_id, reason], ...]`.
    pub fn refused(&self) -> String {
        let list: Vec<(&str, &str)> = self
            .refused
            .iter()
            .map(|(id, r)| (id.as_str(), r.code()))
            .collect();
        serde_json::to_string(&list).unwrap_or_default()
    }

    #[wasm_bindgen(js_name = setEarned)]
    pub fn set_earned(&mut self, earned: u32) {
        self.earned = earned;
    }

    /// Applies one event; returns "" or the reason it was refused.
    pub fn apply(&mut self, event_json: &str) -> Result<String, JsError> {
        let ev: crate::town::TownEvent = serde_json::from_str(event_json).map_err(js)?;
        Ok(match self.town.apply(&ev, self.earned) {
            Ok(()) => String::new(),
            Err(r) => r.code().to_string(),
        })
    }

    /// Whether an asset fits: "" or the reason, for the placing shadow.
    /// `spot` is the quarter asked for a small piece, -1 for any.
    #[allow(clippy::too_many_arguments)]
    pub fn fits(
        &self,
        asset: &str,
        land: u16,
        x: u8,
        y: u8,
        rot: u16,
        spot: i16,
        ignore: &str,
    ) -> String {
        match self.fits_at(asset, land, x, y, rot, spot, ignore) {
            Ok(_) => String::new(),
            Err(r) => r.code().to_string(),
        }
    }

    /// The quarter a small piece would stand on there, -1 when it is not
    /// small or does not fit.
    #[wasm_bindgen(js_name = spotFor)]
    #[allow(clippy::too_many_arguments)]
    pub fn spot_for(
        &self,
        asset: &str,
        land: u16,
        x: u8,
        y: u8,
        rot: u16,
        spot: i16,
        ignore: &str,
    ) -> i16 {
        match self.fits_at(asset, land, x, y, rot, spot, ignore) {
            Ok(Some(s)) => i16::from(s),
            _ => -1,
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn fits_at(
        &self,
        asset: &str,
        land: u16,
        x: u8,
        y: u8,
        rot: u16,
        spot: i16,
        ignore: &str,
    ) -> Result<Option<u8>, crate::town::Refusal> {
        let a = crate::town::asset_by_id(asset).ok_or(crate::town::Refusal::UnknownAsset)?;
        let ignore = (!ignore.is_empty()).then_some(ignore);
        let spot = u8::try_from(spot).ok();
        self.town.fits_at(a, land, x, y, rot, spot, ignore)
    }

    pub fn view(&self, now_ms: f64) -> String {
        serde_json::to_string(&self.town.view(self.earned, now_ms as i64)).unwrap_or_default()
    }
}

/// Skill stars and the landmarks they raise, from judged answers
/// (`[{skill, game_type, p_final, result, assisted, at_ms}]`), as JSON.
#[wasm_bindgen(js_name = skillStars)]
pub fn skill_stars(answers_json: &str, grade: u8, now_ms: f64) -> Result<String, JsError> {
    let answers: Vec<crate::stars::SkillAnswer> = serde_json::from_str(answers_json).map_err(js)?;
    let grade = (grade > 0).then_some(grade);
    let stars = crate::stars::skill_stars(
        &answers,
        grade,
        now_ms as i64,
        &crate::fairness::FairnessParams::default(),
    );
    let landmarks = crate::stars::landmarks(&stars);
    serde_json::to_string(&serde_json::json!({ "stars": stars, "landmarks": landmarks }))
        .map_err(js)
}

/// Measure Hunt for the headset: pins and threads on the real desk. Every
/// call returns JSON.
#[wasm_bindgen]
pub struct MeasureHunt {
    inner: crate::measure::Hunt,
    rejected: Vec<String>,
}

#[wasm_bindgen]
impl MeasureHunt {
    /// `templates_json`: array of item templates (the others are ignored).
    /// `config_json`: HuntConfig.
    #[wasm_bindgen(constructor)]
    pub fn new(templates_json: &str, config_json: &str) -> Result<MeasureHunt, JsError> {
        let templates: Vec<ItemTemplate> = serde_json::from_str(templates_json).map_err(js)?;
        let cfg: crate::measure::HuntConfig = serde_json::from_str(config_json).map_err(js)?;
        let (inner, rejected) = crate::measure::Hunt::new(
            templates,
            cfg,
            crate::fairness::FairnessParams::default(),
        )
        .map_err(js)?;
        Ok(MeasureHunt { inner, rejected })
    }

    pub fn rejected(&self) -> String {
        serde_json::to_string(&self.rejected).unwrap_or_default()
    }

    /// The questions of the grade, flat shapes or solids.
    pub fn tasks(&self, solid: bool) -> String {
        serde_json::to_string(&self.inner.tasks(solid)).unwrap_or_default()
    }

    /// `template_id` from `tasks`, or "" for a random one. `source`: "paper" or "real".
    pub fn next(
        &mut self,
        template_id: &str,
        solid: bool,
        source: &str,
        now_ms: f64,
    ) -> Result<String, JsError> {
        let source: crate::measure::Source =
            serde_json::from_str(&format!("\"{source}\"")).map_err(js)?;
        let offer = self
            .inner
            .next(template_id, solid, source, now_ms)
            .map_err(js)?;
        serde_json::to_string(&offer).map_err(js)
    }

    /// `pins_json`: `{"points": [[x, y, z], ...]}` in cm.
    pub fn measure(&mut self, offer_id: u32, pins_json: &str) -> Result<String, JsError> {
        let pins: crate::measure::Pins = serde_json::from_str(pins_json).map_err(js)?;
        serde_json::to_string(&self.inner.measure(offer_id, &pins).map_err(js)?).map_err(js)
    }

    pub fn answer(&mut self, offer_id: u32, index: u32, now_ms: f64) -> Result<String, JsError> {
        let v = self
            .inner
            .answer(offer_id, index as usize, now_ms)
            .map_err(js)?;
        serde_json::to_string(&v).map_err(js)
    }

    pub fn close(&mut self, offer_id: u32) -> bool {
        self.inner.close(offer_id)
    }

    #[wasm_bindgen(js_name = drainEvents)]
    pub fn drain_events(&mut self) -> String {
        serde_json::to_string(&self.inner.drain_events()).unwrap_or_default()
    }

    #[wasm_bindgen(js_name = totalPoints)]
    pub fn total_points(&self) -> u32 {
        self.inner.total_points()
    }
}
