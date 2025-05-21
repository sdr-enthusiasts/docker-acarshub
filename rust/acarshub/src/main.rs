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
#[macro_use]
extern crate tracing;

use parking_lot::FairMutex;
use std::sync::Arc;
use tokio::sync::mpsc::unbounded_channel;
use tracing_subscriber::{
    EnvFilter,
    fmt::{self, layer},
    layer::SubscriberExt,
    util::SubscriberInitExt,
};

use acarshub_database::{AcarsHubDatabase, db_listener::DatabaseListener};
use acarshub_message_processing::AcarsHubMessageProcessing;
use acarshub_settings::{Input, clap::Parser};
use acarshub_webserver::AcarsHubWebServer;

#[tokio::main]
async fn main() {
    let input = Input::parse();

    // init logging
    let env_filter = EnvFilter::builder()
        .with_default_directive(input.log_level().into())
        .from_env_lossy();

    let subscriber = tracing_subscriber::registry().with(env_filter);
    let std_out_layer = layer()
        .with_line_number(true)
        .with_span_events(fmt::format::FmtSpan::ACTIVE)
        .compact();

    subscriber.with(std_out_layer).init();

    info!(
        "Starting ACARS Hub with log level {}",
        input.log_level().as_str()
    );

    let database = match AcarsHubDatabase::new(&input.database) {
        Ok(db) => Arc::new(FairMutex::new(db)),
        Err(_e) => {
            error!("Error creating db. Exiting");
            std::process::exit(69);
        }
    };

    // create the database listener
    let db_listener = DatabaseListener::new(database.clone());
    // create the channel for the database listener
    let (sender, receiver) = unbounded_channel();
    // start the database listener
    db_listener.start(receiver);

    let protocols = input.enabled_to_vec();

    if protocols.is_empty() {
        error!("No protocols enabled. Exiting");
        std::process::exit(420);
    }

    // create the message processing object
    let mut message_processing = AcarsHubMessageProcessing::new(protocols);
    // run the message processing
    message_processing.run_listener(&sender);

    let mut webserver = AcarsHubWebServer::new(database);

    // run the web server
    webserver.run().await.expect("Error running web server");
}
