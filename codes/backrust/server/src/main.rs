//! Numeria Arena API: health, the adult side of sign-in (organizers and
//! admins), and Class Match rooms with their WebSocket.

mod admin;
mod answers;
mod auth;
mod classes;
mod demo_teacher;
mod organizer;
mod rooms;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::routing::{delete, get, post};
use sqlx::postgres::PgPoolOptions;

pub struct Config {
    /// Emails that become Global Admin when they sign in with a verified email.
    pub admin_emails: Vec<String>,
    /// School email domains approved without waiting for an admin.
    pub auto_approve_domains: Vec<String>,
    pub git_sha: String,
    /// `OPEN_ROOMS=1`: anyone may open a room, for local tests without sign-in.
    pub open_rooms: bool,
}

pub struct AppState {
    pub db: sqlx::PgPool,
    pub verifier: auth::Verifier,
    pub config: Config,
    pub rooms: Arc<rooms::Rooms>,
    /// Wrong picture passwords per class, to pause a class's sign-in.
    pub classes: classes::Guard,
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
        .route("/api/admin/organizers", get(admin::list))
        .route("/api/admin/organizers/{id}", post(admin::decide))
        .route("/api/rooms", post(rooms::create).get(rooms::mine))
        .route("/api/rooms/history", get(rooms::history))
        .route("/api/rooms/{id}", delete(rooms::close))
        .route("/api/ws", get(rooms::ws))
        .route("/api/classes", get(classes::list).post(classes::create))
        .route(
            "/api/classes/{id}",
            get(classes::detail).delete(classes::remove),
        )
        .route("/api/classes/{id}/seats", post(classes::add))
        .route("/api/classes/{id}/seats/{n}", delete(classes::reset))
        .route(
            "/api/classes/{id}/seats/{n}/picture",
            post(classes::picture),
        )
        .route("/api/classes/{id}/seats/{n}/unlock", post(classes::unlock))
        .route("/api/classes/{id}/seats/{n}/group", post(classes::group))
        .route("/api/classes/{id}/groups", delete(classes::ungroup))
        .route("/api/classes/{id}/report", get(answers::report))
        .route("/api/demo/teacher", post(demo_teacher::start))
        .route("/api/student/sign-in", post(classes::student_sign_in))
        .route("/api/student/me", get(classes::student_me))
        .route("/api/student/room", get(classes::student_room))
        .route("/api/student/rival", post(classes::student_rival))
        .route("/api/student/plays", post(classes::student_play))
        .route("/api/student/events", post(answers::student_events))
        .route("/api/student/sign-out", post(classes::student_sign_out))
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
        open_rooms: std::env::var("OPEN_ROOMS").is_ok_and(|v| v == "1"),
    };
    // The bank the headset bundles: ../content from codes/backrust, /srv/content in the image.
    let content_dir = std::env::var("CONTENT_DIR").unwrap_or_else(|_| "../content".into());
    let content = rooms::Content::load(std::path::Path::new(&content_dir))
        .unwrap_or_else(|e| panic!("content: {e}"));
    tracing::info!(
        "content {} ({} templates)",
        content.version,
        content.templates.len()
    );
    let rooms = rooms::Rooms::new(content, Some(db.clone()));
    rooms.open_demo();
    let state = Arc::new(AppState {
        db,
        verifier: auth::Verifier::new(required("FIREBASE_PROJECT_ID")),
        config,
        rooms,
        classes: classes::Guard::default(),
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
