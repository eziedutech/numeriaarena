//! What of a practice plan may be shown, and how its skills are linked back.

use super::*;
use crate::insight::insight_input;

fn report() -> Value {
    json!({
        "label": "5A Mawar",
        "skills": { "fraction_add": { "en": "Adding fractions", "id": "Menjumlah pecahan" },
                    "place_value": { "en": "Place value", "id": "Nilai tempat" } },
        "rows": [
            { "seat": 1, "source": "own", "template_id": "t1", "skill": "fraction_add", "right": 1, "total": 6 },
            { "seat": 1, "source": "own", "template_id": "t2", "skill": "place_value", "right": 12, "total": 14 },
        ],
        "mistakes": [
            { "seat": 1, "source": "own", "skill": "fraction_add", "misconception": "added_denominators", "count": 3 },
        ],
        "misconceptions": { "added_denominators": {
            "title": { "en": "Adds the denominators", "id": "Menjumlah penyebut" },
            "note": { "en": "Adds the bottoms as well as the tops.", "id": "Ikut menjumlah penyebut." } } },
    })
}

fn plan(skill: &str, why: &str) -> Value {
    let side = json!({ "note": "Place value is strong, 12 of 14 right.",
                       "plan": [{ "skill": skill, "why": why, "do": "Play a few untimed rounds of PRACTICE ON MY OWN." }] });
    json!({ "en": side, "id": side })
}

#[test]
fn a_plan_names_input_skills_and_only_input_numbers() {
    let input = insight_input(&report(), 1);
    let ok = plan("Adding fractions", "Only 1 of 6 right; adds the denominators.");
    assert_eq!(check_plan(&input, &ok), Ok(()));
    assert!(check_plan(&input, &plan("Fractions", "Needs work.")).is_err());
    assert!(check_plan(&input, &plan("fraction_add", "Needs work.")).is_err());
    assert_eq!(
        check_plan(&input, &plan("Adding fractions", "Only 40 percent right.")),
        Err("number 40".into())
    );
    assert!(check_plan(&input, &plan("Adding fractions", "Needs work \u{2014} soon.")).is_err());
    let mut empty = ok.clone();
    empty["id"]["plan"] = json!([]);
    assert_eq!(check_plan(&input, &empty), Err("plan size".into()));
    let mut many = ok.clone();
    many["en"]["plan"] = json!([ok["en"]["plan"][0], ok["en"]["plan"][0], ok["en"]["plan"][0], ok["en"]["plan"][0]]);
    assert_eq!(check_plan(&input, &many), Err("plan size".into()));
    let mut no_note = ok.clone();
    no_note["en"]["note"] = json!("");
    assert!(check_plan(&input, &no_note).is_err());
}

#[test]
fn a_shown_plan_carries_skill_codes_and_drops_extra_fields() {
    let mut out = plan("Adding fractions", "Only 1 of 6 right.");
    out["en"]["extra"] = json!("x");
    let s = shown(&out, &report());
    assert_eq!(s["en"]["plan"][0]["skill"], "fraction_add");
    assert_eq!(s["id"]["plan"][0]["do"], "Play a few untimed rounds of PRACTICE ON MY OWN.");
    assert!(s["en"].get("extra").is_none());
}

#[test]
fn a_plan_is_hashed_apart_from_an_insight() {
    let input = insight_input(&report(), 1);
    assert_ne!(hash_of(&input), crate::insight::hash_of(&input));
}
