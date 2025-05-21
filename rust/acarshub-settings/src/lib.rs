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

pub extern crate clap as clap;
use tracing::Level;

use acarshub_message_processing::Protocols;
use clap::Parser;

#[allow(clippy::struct_excessive_bools)]
#[derive(Parser, Debug, Clone, Default)]
#[command(name = "ACARS Hub", author, version, about, long_about = None)]
pub struct Input {
    #[clap(
        long,
        env = "AH_DATABASE",
        value_parser,
        default_value = "/opt/acarshub-data/messages.sqlite"
    )]
    pub database: String,

    #[clap(
        long,
        env = "MIN_LOG_LEVEL",
        value_parser,
        default_value = "3",
        help = "Log level for the application. Options: 3, 4, 5"
    )]
    pub log_level: u8,

    // FIXME: do I want to do a custom parser to allow for the deprecation of "external"?
    #[clap(long, env = "ENABLE_ACARS", value_parser, default_value = "false")]
    pub enable_acars: bool,

    #[clap(long, env = "ENABLE_VDLM", value_parser, default_value = "false")]
    pub enable_vdlm: bool,

    #[clap(long, env = "ENABLE_HFDL", value_parser, default_value = "false")]
    pub enable_hfdl: bool,

    #[clap(long, env = "ENABLE_IMSL", value_parser, default_value = "false")]
    pub enable_imsl: bool,

    #[clap(long, env = "ENABLE_IRDM", value_parser, default_value = "false")]
    pub enable_irdm: bool,
}

impl Input {
    #[must_use]
    pub fn enabled_to_vec(&self) -> Vec<Protocols> {
        let mut enabled_features = Vec::new();
        if self.enable_acars {
            enabled_features.push(Protocols::Acars);
        }
        if self.enable_vdlm {
            enabled_features.push(Protocols::Vdlm);
        }
        if self.enable_hfdl {
            enabled_features.push(Protocols::Hfdl);
        }
        if self.enable_imsl {
            enabled_features.push(Protocols::Imsl);
        }
        if self.enable_irdm {
            enabled_features.push(Protocols::Irdm);
        }
        enabled_features
    }

    #[must_use]
    pub const fn log_level(&self) -> Level {
        match self.log_level {
            0..=1 => Level::ERROR,
            2 => Level::WARN,
            4 => Level::DEBUG,
            5 => Level::TRACE,
            _ => Level::INFO,
        }
    }
}
