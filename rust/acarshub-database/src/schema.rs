// @generated automatically by Diesel CLI.

diesel::table! {
    alert_stats (id) {
        id -> Integer,
        term -> Nullable<Text>,
        count -> Nullable<Integer>,
    }
}

diesel::table! {
    count (id) {
        id -> Integer,
        total -> Nullable<Integer>,
        errors -> Nullable<Integer>,
        good -> Nullable<Integer>,
    }
}

diesel::table! {
    freqs (it) {
        it -> Integer,
        freq -> Nullable<Text>,
        freq_type -> Nullable<Text>,
        count -> Nullable<Integer>,
    }
}

diesel::table! {
    ignore_alert_terms (id) {
        id -> Integer,
        term -> Nullable<Text>,
    }
}

diesel::table! {
    level (id) {
        id -> Integer,
        level_data -> Nullable<Integer>,
        count -> Nullable<Integer>,
    }
}

diesel::table! {
    messages (id) {
        id -> Integer,
        message_type -> Text,
        msg_time -> Integer,
        station_id -> Text,
        toaddr -> Text,
        fromaddr -> Text,
        depa -> Text,
        dsta -> Text,
        eta -> Text,
        gtout -> Text,
        gtin -> Text,
        wloff -> Text,
        wlin -> Text,
        lat -> Text,
        lon -> Text,
        alt -> Text,
        msg_text -> Text,
        tail -> Text,
        flight -> Text,
        icao -> Text,
        freq -> Text,
        ack -> Text,
        mode -> Text,
        label -> Text,
        block_id -> Text,
        msgno -> Text,
        is_response -> Text,
        is_onground -> Text,
        error -> Text,
        libacars -> Text,
        level -> Text,
    }
}

diesel::table! {
    messages_fts (rowid) {
        rowid -> Integer,
        depa -> Nullable<Binary>,
        dsta -> Nullable<Binary>,
        msg_text -> Nullable<Binary>,
        tail -> Nullable<Binary>,
        flight -> Nullable<Binary>,
        icao -> Nullable<Binary>,
        freq -> Nullable<Binary>,
        label -> Nullable<Binary>,
        #[sql_name = "messages_fts"]
        messages_fts_data -> Nullable<Binary>,
        rank -> Nullable<Binary>,
    }
}

diesel::table! {
    messages_fts_config (k) {
        k -> Binary,
        v -> Nullable<Binary>,
    }
}

diesel::table! {
    messages_fts_data (id) {
        id -> Nullable<Integer>,
        block -> Nullable<Binary>,
    }
}

diesel::table! {
    messages_fts_docsize (id) {
        id -> Nullable<Integer>,
        sz -> Nullable<Binary>,
    }
}

diesel::table! {
    messages_fts_idx (segid, term) {
        segid -> Binary,
        term -> Binary,
        pgno -> Nullable<Binary>,
    }
}

diesel::table! {
    messages_saved (id) {
        id -> Integer,
        message_type -> Text,
        msg_time -> Integer,
        station_id -> Text,
        toaddr -> Text,
        fromaddr -> Text,
        depa -> Text,
        dsta -> Text,
        eta -> Text,
        gtout -> Text,
        gtin -> Text,
        wloff -> Text,
        wlin -> Text,
        lat -> Text,
        lon -> Text,
        alt -> Text,
        msg_text -> Text,
        tail -> Text,
        flight -> Text,
        icao -> Text,
        freq -> Text,
        ack -> Text,
        mode -> Text,
        label -> Text,
        block_id -> Text,
        msgno -> Text,
        is_response -> Text,
        is_onground -> Text,
        error -> Text,
        libacars -> Text,
        level -> Text,
        term -> Text,
        type_of_match -> Text,
    }
}

diesel::table! {
    nonlogged_count (id) {
        id -> Integer,
        errors -> Nullable<Integer>,
        good -> Nullable<Integer>,
    }
}

diesel::allow_tables_to_appear_in_same_query!(
    alert_stats,
    count,
    freqs,
    ignore_alert_terms,
    level,
    messages,
    messages_fts,
    messages_fts_config,
    messages_fts_data,
    messages_fts_docsize,
    messages_fts_idx,
    messages_saved,
    nonlogged_count,
);
