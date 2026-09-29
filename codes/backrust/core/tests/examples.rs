//! The four example templates in codes/content/contoh must pass the
//! validator, and the items built from them must carry answers that match
//! an independent calculation.

use foldlings_core::dsl::Value;
use foldlings_core::rational::Rational;
use foldlings_core::template::{AnswerKind, CompiledTemplate, ItemTemplate};
use foldlings_core::validate::{Options, SkillCatalog, validate};

const SKILLS: &str = include_str!("../../../content/skills.json");
const EXAMPLES: [(&str, &str); 4] = [
    (
        "tpl.dc.add.v1",
        include_str!("../../../content/contoh/tpl.dc.add.v1.json"),
    ),
    (
        "tpl.fr.add_like.v1",
        include_str!("../../../content/contoh/tpl.fr.add_like.v1.json"),
    ),
    (
        "tpl.md.multiples_sort.v1",
        include_str!("../../../content/contoh/tpl.md.multiples_sort.v1.json"),
    ),
    (
        "tpl.me.table_width.v1",
        include_str!("../../../content/contoh/tpl.me.table_width.v1.json"),
    ),
];

fn template(id: &str) -> ItemTemplate {
    let (_, text) = EXAMPLES
        .iter()
        .find(|(i, _)| *i == id)
        .expect("example exists");
    ItemTemplate::from_json(text).expect("example parses")
}

fn compiled(id: &str) -> CompiledTemplate {
    CompiledTemplate::compile(template(id)).expect("example compiles")
}

fn num(env: &foldlings_core::dsl::Env, name: &str) -> Rational {
    match env.get(name) {
        Some(Value::Num(r)) => *r,
        other => panic!("{name} is not a number: {other:?}"),
    }
}

#[test]
fn all_four_examples_pass_the_validator() {
    let skills = SkillCatalog::from_json(SKILLS).unwrap();
    for (id, text) in EXAMPLES {
        let t = ItemTemplate::from_json(text).unwrap();
        let report = validate(&t, &skills, &Options::default());
        assert_eq!(report.template_id, id);
        assert!(
            !report.not_checked.is_empty(),
            "skipped checks must be named"
        );
        assert!(report.passed, "{id} failed: {:#?}", report.issues);
    }
}

#[test]
fn validator_catches_broken_templates() {
    let skills = SkillCatalog::from_json(SKILLS).unwrap();
    let opts = Options {
        samples: 300,
        ..Options::default()
    };
    let codes = |t: &ItemTemplate| -> Vec<&'static str> {
        validate(t, &skills, &opts)
            .issues
            .iter()
            .map(|i| i.code)
            .collect()
    };

    let mut t = template("tpl.fr.add_like.v1");
    t.skill = "FR.NOPE".into();
    assert!(codes(&t).contains(&"skill_unknown"));

    let mut t = template("tpl.fr.add_like.v1");
    t.grades = vec![6];
    assert!(codes(&t).contains(&"grade_outside_skill"));

    let mut t = template("tpl.fr.add_like.v1");
    t.answer.expr = "frac(a + b, d - d)".into();
    assert!(codes(&t).contains(&"answer_error"));

    let mut t = template("tpl.fr.add_like.v1");
    t.answer.expr = "frac(a + q, d)".into();
    assert!(codes(&t).contains(&"unknown_variable"));

    let mut t = template("tpl.fr.add_like.v1");
    t.constraints = vec!["a + b < 3".into()];
    assert!(codes(&t).contains(&"constraint_rate"));

    // Two distractors equal to the answer leave only one distinct distractor.
    let mut t = template("tpl.fr.add_like.v1");
    t.distractors[0].expr = "frac(a + b, d)".into();
    t.distractors[1].expr = "frac(a + b, d)".into();
    let found = codes(&t);
    assert!(found.contains(&"distractor_rate"), "{found:?}");
    assert!(found.contains(&"distractor_useless"), "{found:?}");

    // Colliding distractors are dropped, not fatal, while two different ones remain.
    let mut t = template("tpl.fr.add_like.v1");
    t.distractors[0].expr = "frac(a + b, d)".into();
    assert!(!codes(&t).contains(&"distractor_rate"));

    let mut t = template("tpl.fr.add_like.v1");
    t.difficulty.features[0].when = "d > 100".into();
    assert!(codes(&t).contains(&"feature_dead"));

    let mut t = template("tpl.fr.add_like.v1");
    t.prompt.en = "{a}/{d} + {b}/{d} = ? \u{2014} think".into();
    assert!(codes(&t).contains(&"emdash"));

    let mut t = template("tpl.md.multiples_sort.v1");
    t.predicate.as_mut().unwrap().gates[1].rule = "x > 0".into();
    assert!(codes(&t).contains(&"gate_not_exclusive"));

    let mut t = template("tpl.dc.add.v1");
    t.answer.decimal_places = Some(1);
    assert!(codes(&t).contains(&"answer_format_fit"));
}

#[test]
fn fraction_items_match_hand_calculation() {
    let ct = compiled("tpl.fr.add_like.v1");
    for seed in 0..500 {
        let item = ct.instantiate(seed).unwrap();
        let get = |n: &str| {
            item.params
                .iter()
                .find(|p| p.name == n)
                .unwrap()
                .value
                .parse::<i128>()
                .unwrap()
        };
        let (a, b, d) = (get("a"), get("b"), get("d"));
        assert!(
            a >= 1 && b >= 1 && a + b < d && (3..=12).contains(&d),
            "seed {seed}: {a} {b} {d}"
        );
        let answer = item.answer.as_ref().unwrap();
        // simplify: false keeps the like denominator, as the skill teaches.
        assert_eq!(answer.text, format!("{}/{}", a + b, d), "seed {seed}");
        assert_eq!(item.prompt.en, format!("{a}/{d} + {b}/{d} = ?"));
        for dis in &item.distractors {
            assert_ne!(dis.text, answer.text);
        }
    }
}

#[test]
fn decimal_items_match_hand_calculation() {
    let ct = compiled("tpl.dc.add.v1");
    for seed in 0..500 {
        let item = ct.instantiate(seed).unwrap();
        let get = |n: &str| {
            item.params
                .iter()
                .find(|p| p.name == n)
                .unwrap()
                .value
                .clone()
        };
        let (x, y) = (get("x"), get("y"));
        let (xf, yf) = (x.parse::<f64>().unwrap(), y.parse::<f64>().unwrap());
        let hundredths = ((xf + yf) * 100.0).round() as i64;
        let expected = format!("{}.{:02}", hundredths / 100, hundredths % 100);
        let expected = expected
            .trim_end_matches('0')
            .trim_end_matches('.')
            .to_string();
        let answer = &item.answer.as_ref().unwrap().text;
        assert_eq!(answer, &expected, "seed {seed}: {x} + {y}");
        assert!(!answer.contains(','), "no thousands or decimal comma");
        assert!(xf + yf < 15.0);
    }
}

#[test]
fn prompts_use_point_decimals() {
    let ct = compiled("tpl.dc.add.v1");
    let mut rng = foldlings_core::rng::Rng::new(3);
    for _ in 0..200 {
        let env = ct.sample_valid(&mut rng, 50).unwrap();
        let p = ct.render_prompt(&env).unwrap();
        let x = num(&env, "x");
        let y = num(&env, "y");
        assert!(x.fits_decimal_places(1) && y.fits_decimal_places(2));
        assert!(!p.en.contains(',') && !p.id.contains(','), "{}", p.en);
        assert_eq!(p.en, p.id);
    }
}

#[test]
fn sort_items_go_to_the_right_gate() {
    let ct = compiled("tpl.md.multiples_sort.v1");
    for seed in 0..300 {
        let item = ct.instantiate(seed).unwrap();
        let k: i64 = item.params[0].value.parse().unwrap();
        assert_eq!(item.gates.len(), 2);
        assert_eq!(item.gates[0].en, format!("Multiple of {k}"));
        assert_eq!(item.gates[0].id, format!("Kelipatan {k}"));
        assert_eq!(item.sort_items.len(), 10);
        for s in &item.sort_items {
            let x: i64 = s.text.parse().unwrap();
            assert!((10..=k * 12).contains(&x));
            assert_eq!(s.gate, if x % k == 0 { 0 } else { 1 }, "k={k} x={x}");
        }
    }
}

#[test]
fn estimate_items_wait_for_the_measurement() {
    let ct = compiled("tpl.me.table_width.v1");
    let item = ct.instantiate(1).unwrap();
    assert_eq!(item.answer_kind, AnswerKind::Estimate);
    assert!(item.answer.is_none());
    assert_eq!(item.prompt.en, "How wide is your table in cm?");
}

#[test]
fn same_seed_gives_the_same_item() {
    for (id, _) in EXAMPLES {
        let ct = compiled(id);
        assert_eq!(
            ct.instantiate(99).unwrap(),
            ct.instantiate(99).unwrap(),
            "{id}"
        );
    }
    let ct = compiled("tpl.fr.add_like.v1");
    let hashes: std::collections::BTreeSet<String> = (0..50)
        .map(|s| ct.instantiate(s).unwrap().params_hash)
        .collect();
    assert!(
        hashes.len() > 20,
        "different seeds should give different items"
    );
}

#[test]
fn equivalent_answers_follow_the_template_rule() {
    let ct = compiled("tpl.fr.add_like.v1");
    let expected = Rational::raw(4, 8).unwrap();
    assert!(ct.is_correct(&expected, &Rational::raw(1, 2).unwrap()));
    assert!(ct.is_correct(&expected, &Rational::raw(4, 8).unwrap()));
    assert!(!ct.is_correct(&expected, &Rational::raw(3, 8).unwrap()));

    let mut strict = template("tpl.fr.add_like.v1");
    strict.answer.accept_equivalent = false;
    strict.answer.simplify = true;
    let ct = CompiledTemplate::compile(strict).unwrap();
    assert!(ct.is_correct(&expected, &Rational::raw(1, 2).unwrap()));
    assert!(!ct.is_correct(&expected, &Rational::raw(4, 8).unwrap()));
}
