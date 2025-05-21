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

use std::sync::Arc;

use acars_vdlm2_parser::AcarsVdlm2Message;
use parking_lot::FairMutex;
use tokio::sync::mpsc::UnboundedReceiver;

use crate::AcarsHubDatabase;
pub struct DatabaseListener {
    database: Arc<FairMutex<AcarsHubDatabase>>,
}

impl DatabaseListener {
    /// Creates a new instance of `DatabaseListener`.
    /// # Arguments
    /// * `database` - A reference to the `AcarsHubDatabase` instance.
    /// * `sender` - An `UnboundedSender` for sending messages.
    pub const fn new(database: Arc<FairMutex<AcarsHubDatabase>>) -> Self {
        Self { database }
    }

    /// Starts the database listener.
    pub fn start(&self, mut receiver: UnboundedReceiver<AcarsVdlm2Message>) {
        let database = self.database.clone();
        tokio::spawn(async move {
            while let Some(message) = receiver.recv().await {
                // Process the message and store it in the database
                //let mut db = database.lock();
                info!("Received message: {:?}", message);
            }
        });
    }
}
