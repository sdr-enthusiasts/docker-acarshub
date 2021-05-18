export interface database_size {
  size: string,
  count: number
}

export interface system_status {
  status: {
    error_state: boolean
  }
}

export interface terms {
  terms: string[]
}

export interface html_msg {
    msghtml: acars_msg,
    loading?: boolean,
  }

export interface search_html_msg {
  msghtml: acars_msg,
  query_time?: number,
  num_results?: number
}

export interface acars_msg {
    timestamp: number,
    station_id: string
    toaddr?: string,
    fromaddr?: string,
    depa?: string,
    dsta?: string,
    eta?: string,
    gtout?: string,
    gtin?: string,
    wloff?: string,
    wlin?: string,
    lat?: number,
    lon?: number,
    alt?: number,
    text?: string,
    tail?: string,
    flight?: string,
    icao?: number,
    freq?: number,
    ack?: string,
    mode?: string,
    label?: string,
    block_id?: string,
    msgno?: string,
    is_response?: number,
    is_onground?: number,
    error?: number,
    libacars?: any,
    level?: number,
    matched?: boolean,  // This line and below are custom parameters injected by javascript or from the backend
    matched_text?: string[],
    matched_icao?: string[],
    matched_flight?: string[],
    matched_tail?: string[],
    uid: string,
    decodedText?: any, // no type for typescript acars decoder, so set to any
    data?: string,
    message_type: string,
    msg_time?: number,
    duplicates?: string,
    msgno_parts?: string,
    label_type?: string,
    toaddr_decoded?: string,
    toaddr_hex?: string,
    fromaddr_hex?: string,
    fromaddr_decoded?: string,
    icao_url?: string,
    icao_hex?: string,
    decoded_msg?: string
}
