extern crate diesel;

use diesel::prelude::*;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use std::env;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("../../migrations");
fn establish_connection() -> SqliteConnection {
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
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
