//! content-cli validate [--skills PATH] [--schema PATH] [--json] FILE...
//! content-cli instantiate FILE SEED   (prints one concrete item as JSON)
//! content-cli simulate [LOW HIGH]     (Fairness Engine simulator report; optional item bank range)
//!
//! Step 1 checks each file against item-template.schema.json, step 2 runs the
//! core validator. Exit code 1 when any template fails, 2 on usage errors.

use std::path::PathBuf;
use std::process::ExitCode;

use foldlings_core::template::{CompiledTemplate, ItemTemplate};
use foldlings_core::validate::{Issue, Options, Report, SkillCatalog, validate};

fn content_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("content")
}

struct Args {
    skills: PathBuf,
    schema: PathBuf,
    json: bool,
    files: Vec<PathBuf>,
}

fn parse_args() -> Result<Args, String> {
    let mut it = std::env::args().skip(1);
    match it.next().as_deref() {
        Some("validate") => {}
        _ => {
            return Err(
                "usage: content-cli validate [--skills PATH] [--schema PATH] [--json] FILE..."
                    .into(),
            );
        }
    }
    let mut args = Args {
        skills: content_dir().join("skills.json"),
        schema: content_dir().join("item-template.schema.json"),
        json: false,
        files: Vec::new(),
    };
    while let Some(a) = it.next() {
        match a.as_str() {
            "--skills" => args.skills = it.next().ok_or("--skills needs a path")?.into(),
            "--schema" => args.schema = it.next().ok_or("--schema needs a path")?.into(),
            "--json" => args.json = true,
            _ if a.starts_with("--") => return Err(format!("unknown option {a}")),
            _ => args.files.push(a.into()),
        }
    }
    if args.files.is_empty() {
        return Err("no template files given".into());
    }
    Ok(args)
}

fn read(path: &PathBuf) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| format!("cannot read {}: {e}", path.display()))
}

fn schema_report(id: String, issues: Vec<Issue>) -> Report {
    let unreadable = issues
        .iter()
        .any(|i| i.code == "read_error" || i.code == "json_error");
    let skipped = if unreadable {
        "json_schema and core validator: skipped because the file could not be read as JSON"
    } else {
        "core validator: skipped because the file failed the JSON Schema"
    };
    Report {
        template_id: id,
        validator_version: foldlings_core::validate::VALIDATOR_VERSION,
        passed: false,
        issues,
        not_checked: vec![skipped],
        stats: Default::default(),
    }
}

fn check_file(
    path: &PathBuf,
    schema: &jsonschema::Validator,
    skills: &SkillCatalog,
    opts: &Options,
) -> Report {
    let name = path.display().to_string();
    let text = match read(path) {
        Ok(t) => t,
        Err(e) => {
            return schema_report(
                name,
                vec![Issue {
                    code: "read_error",
                    message: e,
                    example: None,
                }],
            );
        }
    };
    let value: serde_json::Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(e) => {
            return schema_report(
                name,
                vec![Issue {
                    code: "json_error",
                    message: e.to_string(),
                    example: None,
                }],
            );
        }
    };
    let schema_issues: Vec<Issue> = schema
        .iter_errors(&value)
        .map(|e| Issue {
            code: "json_schema",
            message: format!("{} at {}", e, e.instance_path()),
            example: None,
        })
        .collect();
    if !schema_issues.is_empty() {
        return schema_report(name, schema_issues);
    }
    match ItemTemplate::from_json(&text) {
        Ok(t) => {
            let mut report = validate(&t, skills, opts);
            // This tool has just checked the schema, so it is no longer an open item.
            report.not_checked.retain(|n| !n.starts_with("json_schema"));
            report
        }
        Err(e) => schema_report(
            name,
            vec![Issue {
                code: "model_error",
                message: e.to_string(),
                example: None,
            }],
        ),
    }
}

fn run() -> Result<bool, String> {
    let args = parse_args()?;
    let skills =
        SkillCatalog::from_json(&read(&args.skills)?).map_err(|e| format!("skills.json: {e}"))?;
    let schema_value: serde_json::Value =
        serde_json::from_str(&read(&args.schema)?).map_err(|e| format!("schema: {e}"))?;
    let schema = jsonschema::validator_for(&schema_value).map_err(|e| format!("schema: {e}"))?;
    let opts = Options::default();

    let reports: Vec<Report> = args
        .files
        .iter()
        .map(|f| check_file(f, &schema, &skills, &opts))
        .collect();
    let all_passed = reports.iter().all(|r| r.passed);
    if args.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&reports).map_err(|e| e.to_string())?
        );
    } else {
        for r in &reports {
            let s = &r.stats;
            println!(
                "{} {}  accepted {}/{} ({:.1}%), prompt max en {} id {}, b {:.2}..{:.2}",
                if r.passed { "PASS" } else { "FAIL" },
                r.template_id,
                s.accepted,
                s.attempts,
                s.constraint_rate * 100.0,
                s.longest_prompt_en,
                s.longest_prompt_id,
                s.b_min,
                s.b_max
            );
            for (m, rate) in &s.distractor_ok_rates {
                println!("     distractor {m}: usable in {:.1}%", rate * 100.0);
            }
            for i in &r.issues {
                match &i.example {
                    Some(ex) => println!("  [{}] {}  (example: {ex})", i.code, i.message),
                    None => println!("  [{}] {}", i.code, i.message),
                }
            }
            for n in &r.not_checked {
                println!("     not checked: {n}");
            }
        }
        let failed = reports.iter().filter(|r| !r.passed).count();
        println!(
            "{} templates, {} passed, {} failed",
            reports.len(),
            reports.len() - failed,
            failed
        );
    }
    Ok(all_passed)
}

fn instantiate(file: &str, seed: &str) -> Result<bool, String> {
    let seed: u64 = seed
        .parse()
        .map_err(|_| format!("seed must be a whole number: {seed}"))?;
    let template =
        ItemTemplate::from_json(&read(&PathBuf::from(file))?).map_err(|e| e.to_string())?;
    let compiled = CompiledTemplate::compile(template).map_err(|issues| {
        issues
            .iter()
            .map(|i| i.message.clone())
            .collect::<Vec<_>>()
            .join("; ")
    })?;
    let item = compiled.instantiate(seed).map_err(|e| e.to_string())?;
    println!(
        "{}",
        serde_json::to_string(&item).map_err(|e| e.to_string())?
    );
    Ok(true)
}

fn simulate(range: &[String]) -> Result<bool, String> {
    let params = foldlings_core::fairness::FairnessParams::default();
    let mut cfg = foldlings_core::sim::SimConfig::default();
    if let [low, high] = range {
        cfg.bank_low = low.parse().map_err(|_| format!("bad LOW {low}"))?;
        cfg.bank_high = high.parse().map_err(|_| format!("bad HIGH {high}"))?;
    }
    let report = foldlings_core::sim::run(&cfg, &params);
    println!(
        "{}",
        serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?
    );
    Ok(report.criteria.iter().all(|c| c.passed))
}

fn main() -> ExitCode {
    let argv: Vec<String> = std::env::args().collect();
    let result = match argv.get(1).map(String::as_str) {
        Some("instantiate") if argv.len() == 4 => instantiate(&argv[2], &argv[3]),
        Some("simulate") => simulate(&argv[2..]),
        _ => run(),
    };
    match result {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::from(1),
        Err(e) => {
            eprintln!("{e}");
            ExitCode::from(2)
        }
    }
}
