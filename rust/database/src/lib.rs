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

// Import tracing macros directly
use tracing::{debug, error, info, warn};

use anyhow::Result;
use diesel::prelude::*;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use std::env;

pub struct AcarsHubDatabase {
    connection: SqliteConnection,
}

impl AcarsHubDatabase {
    #[must_use]
    pub const fn new(connection: SqliteConnection) -> Self {
        Self { connection }
    }
}

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("../../migrations");
fn establish_connection() -> Result<SqliteConnection> {
    let mut database_url =
        env::var("DATABASE_URL").unwrap_or_else(|_| "/opt/acarshub/messages.sqlite".to_string());

    // we need to see if we're on an old version of ACARS Hub. If /run/acarshub/messages.db exists, we need to use that and
    // inform the user that they need to migrate their database

    if std::path::Path::new("/run/acarshub/messages.db").exists() {
        database_url = "/run/acarshub/messages.db".to_string();
        warn!("Using old database at /run/acarshub/messages.db. Please migrate your database.");
    }

    info!("Connecting to database at {database_url}");

    match SqliteConnection::establish(&database_url) {
        Ok(conn) => {
            debug!("Connected to database at {database_url}");
            Ok(conn)
        }
        Err(e) => {
            error!("Error connecting to database: {e}");
            Err(e.into())
        }
    }
}

pub fn init_db() -> Result<AcarsHubDatabase> {
    let mut conn = establish_connection()?;

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
        Err(e) => {
            return Err(anyhow::anyhow!("Error running database migrations: {e}"));
        }
    }

    Ok(AcarsHubDatabase::new(conn))
}
