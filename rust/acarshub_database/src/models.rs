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

#![allow(unused)]
#![allow(clippy::all)]

use diesel::prelude::*;

#[derive(Queryable, Debug, Identifiable)]
#[diesel(table_name = crate::schema::alert_stats)]
#[diesel(check_for_backend(diesel::sqlite::SqLite))]
pub struct AlertStat {
    pub id: i32,
    pub term: Option<String>,
    pub count: Option<i32>,
}

#[derive(Queryable, Debug, Identifiable)]
#[diesel(table_name = crate::schema::count)]
#[diesel(check_for_backend(diesel::sqlite::SqLite))]
pub struct Count {
    pub id: i32,
    pub total: Option<i32>,
    pub errors: Option<i32>,
    pub good: Option<i32>,
}

#[derive(Queryable, Debug, Identifiable)]
#[diesel(primary_key(it))]
#[diesel(table_name = crate::schema::freqs)]
#[diesel(check_for_backend(diesel::sqlite::SqLite))]
pub struct Freq {
    pub it: i32,
    #[allow(clippy::struct_field_names)]
    pub freq: Option<String>,
    #[allow(clippy::struct_field_names)]
    pub freq_type: Option<String>,
    pub count: Option<i32>,
}

#[derive(Queryable, Debug, Identifiable)]
#[diesel(table_name = crate::schema::ignore_alert_terms)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct IgnoreAlertTerm {
    pub id: i32,
    pub term: Option<String>,
}

#[derive(Queryable, Debug, Identifiable)]
#[diesel(table_name = crate::schema::level)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct Level {
    pub id: i32,
    #[allow(clippy::struct_field_names)]
    pub level: Option<i32>,
    pub count: Option<i32>,
}

#[derive(Insertable)]
#[diesel(table_name = crate::schema::messages)]
pub struct NewMessage {
    pub message_type: String,
    pub msg_time: i32,
    pub station_id: String,
    pub toaddr: String,
    pub fromaddr: String,
    pub depa: String,
    pub dsta: String,
    pub eta: String,
    pub gtout: String,
    pub gtin: String,
    pub wloff: String,
    pub wlin: String,
    pub lat: String,
    pub lon: String,
    pub alt: String,
    pub msg_text: String,
    pub tail: String,
    pub flight: String,
    pub icao: String,
    pub freq: String,
    pub ack: String,
    pub mode: String,
    pub label: String,
    pub block_id: String,
    pub msgno: String,
    pub is_response: String,
    pub is_onground: String,
    pub error: String,
    pub libacars: String,
    pub level: String,
}

#[derive(Queryable, Selectable)]
#[diesel(table_name = crate::schema::messages)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct Messages {
    pub id: i32,
    pub message_type: String,
    pub msg_time: i32,
    pub station_id: String,
    pub toaddr: String,
    pub fromaddr: String,
    pub depa: String,
    pub dsta: String,
    pub eta: String,
    pub gtout: String,
    pub gtin: String,
    pub wloff: String,
    pub wlin: String,
    pub lat: String,
    pub lon: String,
    pub alt: String,
    pub msg_text: String,
    pub tail: String,
    pub flight: String,
    pub icao: String,
    pub freq: String,
    pub ack: String,
    pub mode: String,
    pub label: String,
    pub block_id: String,
    pub msgno: String,
    pub is_response: String,
    pub is_onground: String,
    pub error: String,
    pub libacars: String,
    pub level: String,
}

#[derive(Queryable, Debug, Identifiable)]
#[diesel(primary_key(rowid))]
#[diesel(table_name = crate::schema::messages_fts)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct MessagesFt {
    pub rowid: i32,
    pub depa: Option<Vec<u8>>,
    pub dsta: Option<Vec<u8>>,
    pub msg_text: Option<Vec<u8>>,
    pub tail: Option<Vec<u8>>,
    pub flight: Option<Vec<u8>>,
    pub icao: Option<Vec<u8>>,
    pub freq: Option<Vec<u8>>,
    pub label: Option<Vec<u8>>,
    pub messages_fts: Option<Vec<u8>>,
    pub rank: Option<Vec<u8>>,
}

#[derive(Queryable, Debug, Identifiable)]
#[diesel(primary_key(k))]
#[diesel(table_name = crate::schema::messages_fts_config)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct MessagesFtsConfig {
    pub k: Vec<u8>,
    pub v: Option<Vec<u8>>,
}

#[derive(Queryable, Debug, Identifiable)]
#[diesel(table_name = crate::schema::messages_fts_data)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct MessagesFtsData {
    pub id: Option<i32>,
    pub block: Option<Vec<u8>>,
}

#[derive(Queryable, Debug, Identifiable)]
#[diesel(table_name = crate::schema::messages_fts_docsize)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct MessagesFtsDocsize {
    pub id: Option<i32>,
    pub sz: Option<Vec<u8>>,
}

#[derive(Queryable, Debug, Identifiable)]
#[diesel(primary_key(segid, term))]
#[diesel(table_name = crate::schema::messages_fts_idx)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct MessagesFtsIdx {
    pub segid: Vec<u8>,
    pub term: Vec<u8>,
    pub pgno: Option<Vec<u8>>,
}

#[derive(Queryable, Debug)]
#[diesel(table_name = crate::schema::messages_saved)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct MessagesSaved {
    pub id: i32,
    pub message_type: String,
    pub msg_time: i32,
    pub station_id: String,
    pub toaddr: String,
    pub fromaddr: String,
    pub depa: String,
    pub dsta: String,
    pub eta: String,
    pub gtout: String,
    pub gtin: String,
    pub wloff: String,
    pub wlin: String,
    pub lat: String,
    pub lon: String,
    pub alt: String,
    pub msg_text: String,
    pub tail: String,
    pub flight: String,
    pub icao: String,
    pub freq: String,
    pub ack: String,
    pub mode: String,
    pub label: String,
    pub block_id: String,
    pub msgno: String,
    pub is_response: String,
    pub is_onground: String,
    pub error: String,
    pub libacars: String,
    pub level: String,
    pub term: String,
    pub type_of_match: String,
}

#[derive(Queryable, Debug)]
#[diesel(table_name = crate::schema::nonlogged_count)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct NonloggedCount {
    pub id: i32,
    pub errors: Option<i32>,
    pub good: Option<i32>,
}
