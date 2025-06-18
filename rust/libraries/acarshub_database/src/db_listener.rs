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

use acars_vdlm2_parser::{AcarsVdlm2Message, acars::AcarsMessage, vdlm2::Vdlm2Message};
use acarshub_common::{FoundMessage, Protocols};
use conv::ConvUtil;
use parking_lot::FairMutex;
use tokio::sync::mpsc::UnboundedReceiver;

use crate::{AcarsHubDatabase, models::NewMessage};
pub struct DatabaseListener {
    database: Arc<FairMutex<AcarsHubDatabase>>,
}

impl DatabaseListener {
    /// Creates a new instance of `DatabaseListener`.
    /// # Arguments
    /// * `database` - A reference to the `AcarsHubDatabase` instance.
    pub const fn new(database: Arc<FairMutex<AcarsHubDatabase>>) -> Self {
        Self { database }
    }

    /// Starts the database listener.
    pub fn start(&self, mut receiver: UnboundedReceiver<FoundMessage>) {
        let database = self.database.clone();
        tokio::spawn(async move {
            while let Some(message) = receiver.recv().await {
                // Process the message and store it in the database

                let message_processed = message.to_message();
                if let Some(ref message) = message_processed {
                    let mut db: parking_lot::lock_api::MutexGuard<
                        '_,
                        parking_lot::RawFairMutex,
                        AcarsHubDatabase,
                    > = database.lock();
                    db.insert_message(message);
                }
            }
        });
    }
}

pub trait IntoMessage {
    fn to_message(&self) -> Option<NewMessage>;
}

pub trait MessageDetails {
    fn get_message_time(&self) -> i32;
    fn get_station_id(&self) -> String;
    fn get_ack(&self) -> String;
}

impl MessageDetails for AcarsVdlm2Message {
    fn get_ack(&self) -> String {
        match self {
            AcarsVdlm2Message::AcarsMessage(msg) => msg.ack.map_or_else(String::new, |ack| match ack {
                acars_vdlm2_parser::acars::AckType::String(ack) => ack,
                acars_vdlm2_parser::acars::AckType::Bool(ack) => ack.to_string(),
            }),
            AcarsVdlm2Message::Vdlm2Message(msg) => {}
            AcarsVdlm2Message::HfdlMessage(msg) => {
                if let Some(lpdu) = &msg.hfdl.lpdu {
                    if let Some(acars) = &lpdu.hfnpdu {


                    }
                }

                String::new() // Return an empty string if no ACK is found
            }
            _ => unimplemented!("get_ack not implemented for this message type"),
        }
    }
    fn get_message_time(&self) -> i32 {
        match self {
            AcarsVdlm2Message::AcarsMessage(msg) => msg
                .timestamp
                .unwrap_or_default()
                .approx_as::<i32>()
                .unwrap_or_default(),
            AcarsVdlm2Message::Vdlm2Message(msg) => match &msg.vdl2.t {
                Some(vdl2) => vdl2.sec as i32,
                None => 0, // Default value if timestamp is not available
            },
            AcarsVdlm2Message::HfdlMessage(msg) => match &msg.hfdl.t {
                Some(hfdl) => hfdl.sec as i32,
                None => 0, // Default value if timestamp is not available
            },

            _ => unimplemented!("get_message_time not implemented for this message type"),
        }
    }

    fn get_station_id(&self) -> String {
        match self {
            AcarsVdlm2Message::AcarsMessage(msg) => msg.station_id.clone().unwrap_or_default(),
            AcarsVdlm2Message::Vdlm2Message(msg) => msg.vdl2.station.clone().unwrap_or_default(),
            AcarsVdlm2Message::HfdlMessage(msg) => msg.hfdl.station.clone().unwrap_or_default(),
            _ => unimplemented!("get_station_id not implemented for this message type"),
        }
    }
}

impl IntoMessage for FoundMessage {
    fn to_message(&self) -> Option<NewMessage> {
        let protocol = self.protocol.clone();
        let msg = self.message.clone();

        Some(NewMessage {
            message_type: protocol.to_string(),
            msg_time: msg.get_message_time(),
            station_id: msg.get_station_id(),
            ack: ,
            toaddr: msg.toaddr.unwrap_or_default().to_string(),
            fromaddr: String::new(),
            depa: String::new(),
            dsta: String::new(),
            eta: String::new(),
            gtout: String::new(),
            gtin: String::new(),
            wloff: String::new(),
            wlin: String::new(),
            lat: String::new(),
            lon: String::new(),
            alt: String::new(),
            msg_text: msg.text.unwrap_or_default(),
            tail: msg.tail.unwrap_or_default(),
            flight: msg.flight.unwrap_or_default(),
            icao: msg.icao.unwrap_or_default().to_string(), // FIXME: I think this needs processing to match the formatting we already have
            freq: msg.freq.to_string(), // FIXME: I think this needs processing to match the formatting we already have
            mode: msg.mode.unwrap_or_default(),
            label: msg.label.unwrap_or_default(),
            block_id: msg.block_id.unwrap_or_default(),
            msgno: msg.msgno.unwrap_or_default(),
            is_onground: msg.is_onground.unwrap_or_default().to_string(),
            is_response: msg.is_response.unwrap_or_default().to_string(),
            error: msg.error.unwrap_or_default().to_string(),
            libacars: String::new(),
            level: msg.level.map_or_else(String::new, |level| match level {
                acars_vdlm2_parser::acars::LevelType::I32(level) => level.to_string(),
                acars_vdlm2_parser::acars::LevelType::Float64(level) => level.to_string(),
            }),
        })
    }
}
