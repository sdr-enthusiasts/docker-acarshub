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
#[macro_use]
extern crate tracing;

use tracing::Level;
// use tracing::{debug, error, info, warn};
use tracing_subscriber::{
    EnvFilter,
    fmt::{self, layer},
    layer::SubscriberExt,
    util::SubscriberInitExt,
};

use acarshub_database::AcarsHubDatabase;

fn main() {
    // init logging
    let env_filter = EnvFilter::builder()
        .with_default_directive(Level::INFO.into())
        .from_env_lossy();

    let subscriber = tracing_subscriber::registry().with(env_filter);
    let std_out_layer = layer()
        .with_line_number(true)
        .with_span_events(fmt::format::FmtSpan::ACTIVE)
        .compact();

    subscriber.with(std_out_layer).init();

    let mut database = match AcarsHubDatabase::new() {
        Ok(db) => db,
        Err(_e) => {
            error!("Error creating db. Exiting");
            std::process::exit(69);
        }
    };
}
