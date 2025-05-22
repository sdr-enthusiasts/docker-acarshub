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

use std::sync::Arc;

use acarshub_database::AcarsHubDatabase;
use anyhow::Result;
use axum::{Router, routing::get};
use parking_lot::FairMutex;
use tokio::net::TcpListener;

pub struct AcarsHubWebServer {
    database: Arc<FairMutex<AcarsHubDatabase>>,
}

impl AcarsHubWebServer {
    /// Create a new instance of the web server
    pub const fn new(database: Arc<FairMutex<AcarsHubDatabase>>) -> Self {
        Self { database }
    }

    pub async fn run(&mut self) -> Result<()> {
        info!("Starting web server...");
        // build our application with a single route
        let app = Router::new().route("/", get(|| async { "Hello, World!" }));

        // run our app with hyper, listening globally on port 3000
        let listener = TcpListener::bind("0.0.0.0:3000").await?;
        axum::serve(listener, app).await?;

        Ok(())
    }
}
