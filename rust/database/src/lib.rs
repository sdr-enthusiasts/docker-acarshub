//

#![deny(
    clippy::pedantic,
    //clippy::cargo,
    clippy::nursery,
    clippy::style,
    clippy::correctness,
    clippy::all,
    clippy::unwrap_used,
    clippy::expect_used
)]
// #![warn(missing_docs)]

extern crate diesel;

#[macro_use]
extern crate tracing;
use tracing::Level;
use tracing_subscriber::{
    EnvFilter,
    fmt::{self, layer},
    layer::SubscriberExt,
    util::SubscriberInitExt,
};

use diesel::prelude::*;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use std::env;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("../../migrations");
fn establish_connection() -> SqliteConnection {
    let mut database_url =
        env::var("DATABASE_URL").unwrap_or_else(|_| "/opt/acarshub/messages.sqlite".to_string());

    // we need to see if we're on an old version of ACARS Hub. If /run/acarshub/messages.db exists, we need to use that and
    // inform the user that they need to migrate their database

    if std::path::Path::new("/run/acarshub/messages.db").exists() {
        database_url = "/run/acarshub/messages.db".to_string();
        warn!("Using old database at /run/acarshub/messages.db. Please migrate your database.");
    }

    info!("Connecting to database at {database_url}");

    SqliteConnection::establish(&database_url)
        .unwrap_or_else(|_| panic!("Error connecting to {database_url}"))
}

pub fn init_db() {
    let env_filter = EnvFilter::builder()
        .with_default_directive(Level::INFO.into())
        .from_env_lossy();

    let subscriber = tracing_subscriber::registry().with(env_filter);
    let std_out_layer = layer()
        .with_line_number(true)
        .with_span_events(fmt::format::FmtSpan::ACTIVE)
        .compact();

    subscriber.with(std_out_layer).init();

    let mut conn = establish_connection();

    // Run the migrations
    match conn.run_pending_migrations(MIGRATIONS) {
        Ok(info) => {
            if info.is_empty() {
                info!("No database migrations to run");
            } else {
                for migration in info {
                    info!("Database migration {migration} ran successfully");
                }
            }
        }
        Err(e) => error!("Error running database  migrations: {e}"),
    }
}
