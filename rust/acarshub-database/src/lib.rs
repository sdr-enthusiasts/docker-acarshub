// Copyright (C) 2022-2025 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.

// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

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

use anyhow::Result;
use diesel::prelude::*;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use std::env;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("./migrations");

pub struct AcarsHubDatabase {
    connection: SqliteConnection,
}

impl AcarsHubDatabase {
    /// Creates a new instance of `AcarsHubDatabase` and establishes a connection to the `SQLite` database.
    /// # Returns
    /// Returns a `Result` containing the `AcarsHubDatabase` instance if successful, or an error if the connection fails.
    ///
    /// # Errors
    /// If the connection to the database fails, an error is returned.
    pub fn new() -> Result<Self> {
        let mut database_url = env::var("DATABASE_URL")
            .unwrap_or_else(|_| "/opt/acarshub/messages.sqlite".to_string());

        // we need to see if we're on an old version of ACARS Hub. If /run/acarshub/messages.db exists, we need to use that and
        // inform the user that they need to migrate their database

        if std::path::Path::new("/run/acarshub/messages.db").exists() {
            database_url = "/run/acarshub/messages.db".to_string();
            warn!("Using old database at /run/acarshub/messages.db. Please migrate your database.");
        }

        info!("Connecting to database at {database_url}");

        let mut conn = establish_connection(&database_url)?;

        // Run the migrations
        run_migrations(&mut conn)?;

        Ok(Self { connection: conn })
    }
}

fn establish_connection(database_url: &str) -> Result<SqliteConnection> {
    match SqliteConnection::establish(database_url) {
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

fn run_migrations(conn: &mut SqliteConnection) -> Result<()> {
    match conn.run_pending_migrations(MIGRATIONS) {
        Ok(info) => {
            if info.is_empty() {
                info!("No database migrations to run");
            } else {
                for migration in info {
                    info!("Database migration {migration} ran successfully");
                }
            }

            Ok(())
        }
        Err(e) => Err(anyhow::anyhow!("Error running database migrations: {e}")),
    }
}
