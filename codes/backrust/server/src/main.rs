//! Numeria Arena API. For now: health, and the adult side of sign-in
//! (organizers and admins, docs/SKEMA-PENGGUNA.md). Rooms come later.

mod auth;
mod organizer;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::routing::{get, post};
use sqlx::postgres::PgPoolOptions;

pub struct Config {
    /// Emails that become Global Admin when they sign in with a verified email.
    pub admin_emails: Vec<String>,
    /// School email domains approved without waiting for an admin.
    pub auto_approve_domains: Vec<String>,
    pub git_sha: String,
}

pub struct AppState {
    pub db: sqlx::PgPool,
    pub verifier: auth::Verifier,
    pub config: Config,
}

pub type State = Arc<AppState>;

fn env_list(name: &str) -> Vec<String> {
    std::env::var(name)
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect()
}

fn required(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("{name} must be set"))
}

pub fn router(state: State) -> Router {
    Router::new()
        .route("/health", get(organizer::health))
        // The public domain sends only /api here, so the deploy proof lives there too.
        .route("/api/health", get(organizer::health))
        .route("/api/me", get(organizer::me))
        .route("/api/organizer", post(organizer::register))
        .with_state(state)
}

/// Ctrl+C here, or SIGTERM from Docker (the container's PID 1 ignores it otherwise).
async fn stopped() {
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("SIGTERM");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = term.recv() => {}
        }
    }
    #[cfg(not(unix))]
    let _ = tokio::signal::ctrl_c().await;
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,sqlx=warn".into()),
        )
        .init();
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("the only TLS provider");

    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&required("DATABASE_URL"))
        .await
        .expect("connect to Postgres");
    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("run migrations");

    let config = Config {
        admin_emails: env_list("ADMIN_EMAILS"),
        auto_approve_domains: env_list("AUTO_APPROVE_DOMAINS"),
        git_sha: std::env::var("GIT_SHA").unwrap_or_else(|_| "dev".into()),
    };
    let state = Arc::new(AppState {
        db,
        verifier: auth::Verifier::new(required("FIREBASE_PROJECT_ID")),
        config,
    });

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3321);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind the port");
    tracing::info!("numeria-server {} on {addr}", state.config.git_sha);
    axum::serve(listener, router(state))
        .with_graceful_shutdown(stopped())
        .await
        .expect("serve");
}
