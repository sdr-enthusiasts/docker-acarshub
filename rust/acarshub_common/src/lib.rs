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

use std::fmt;

use acars_vdlm2_parser::AcarsVdlm2Message;

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
    #[must_use]
    pub const fn to_tcp_udp_port(self) -> u32 {
        match self {
            Self::Acars => 5550,
            Self::Vdlm => 5555,
            Self::Hfdl => 5556,
            Self::Imsl => 5557,
            Self::Irdm => 5558,
        }
    }
}

pub struct FoundMessage {
    pub protocol: Protocols,
    pub message: AcarsVdlm2Message,
}
