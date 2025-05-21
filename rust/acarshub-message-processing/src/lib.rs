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

use acars_vdlm2_parser::{AcarsVdlm2Message, DecodeMessage};
use core::fmt;
use tokio::sync::mpsc::UnboundedSender;
// #![warn(missing_docs)]
#[macro_use]
extern crate tracing;

#[derive(Debug, Clone, Copy)]
pub enum Protocols {
    Acars,
    Vdlm,
    Hfdl,
    Imsl,
    Irdm,
}

impl fmt::Display for Protocols {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Acars => write!(f, "ACARS"),
            Self::Vdlm => write!(f, "VDL-M2"),
            Self::Hfdl => write!(f, "HFDL"),
            Self::Imsl => write!(f, "Inmarsat L-Band"),
            Self::Irdm => write!(f, "Iridium"),
        }
    }
}

impl Protocols {
    const fn to_tcp_udp_port(self) -> u32 {
        match self {
            Self::Acars => 5550,
            Self::Vdlm => 5555,
            Self::Hfdl => 5556,
            Self::Imsl => 5557,
            Self::Irdm => 5558,
        }
    }
}

pub struct AcarsHubMessageProcessing {
    pub enabled_features: Vec<Protocols>,
}

impl AcarsHubMessageProcessing {
    #[must_use]
    pub const fn new(features: Vec<Protocols>) -> Self {
        Self {
            enabled_features: features,
        }
    }

    pub fn run_listener(&mut self, sender: &UnboundedSender<AcarsVdlm2Message>) {
        // for each enabled feature, spawn a task

        for feature in &self.enabled_features {
            start_udp_listener(*feature, sender.clone());
        }
    }
}

fn start_udp_listener(feature: Protocols, sender: UnboundedSender<AcarsVdlm2Message>) {
    tokio::spawn(async move {
        // spawn a UDP Tokio listener

        let port: u32 = feature.to_tcp_udp_port();

        info!("Starting {feature} UDP listener on port {port}");

        let socket = match tokio::net::UdpSocket::bind(format!("0.0.0.0:{port}")).await {
            Ok(sock) => sock,
            Err(e) => {
                error!("Failed to bind UDP {feature} socket: {e}");
                return;
            }
        };

        let mut buf = [0; 8192];
        loop {
            match socket.recv_from(&mut buf).await {
                Ok((len, addr)) => {
                    let message = String::from_utf8_lossy(&buf[..len]); // FIXME: I need to patch the parser to accept bytes and display
                    // serialize the message to JSON
                    let json_message = match message.decode_message() {
                        Ok(json) => json,
                        Err(e) => {
                            error!("Failed to decode message: {e}");
                            continue;
                        }
                    };

                    debug!("Received {feature} message from {addr}: {json_message:?}");
                    // send the message to the database listener
                    if let Err(e) = sender.send(json_message) {
                        error!("Failed to send message to database listener: {e}");
                    }
                }
                Err(e) => {
                    error!("Failed to receive data: {e}");
                    break;
                }
            }
        }
    });
}
