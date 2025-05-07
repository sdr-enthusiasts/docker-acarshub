extern crate diesel;

use diesel::prelude::*;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use std::env;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("../../migrations");
fn establish_connection() -> SqliteConnection {
    let mut database_url = match env::var("DATABASE_URL") {
        Ok(url) => url,
        Err(_) => "/opt/acarshub/messages.sqlite".to_string(),
    };

    // we need to see if we're on an old version of ACARS Hub. If /run/acarshub/messages.db exists, we need to use that and
    // inform the user that they need to migrate their database

    if std::path::Path::new("/run/acarshub/messages.db").exists() {
        database_url = "/run/acarshub/messages.db".to_string();
        println!("Using old database at /run/acarshub/messages.db. Please migrate your database.");
    }

    SqliteConnection::establish(&database_url)
        .unwrap_or_else(|_| panic!("Error connecting to {}", database_url))
}

fn main() {
    let mut conn = establish_connection();

    // Run the migrations
    match conn.run_pending_migrations(MIGRATIONS) {
        Ok(_) => println!("Migrations ran successfully"),
        Err(e) => eprintln!("Error running migrations: {}", e),
    }
}
