export interface database_size {
  size: string;
  count: number;
}

export interface system_status {
  status: {
    error_state: boolean;
    decoders: status_decoder;
    servers: status_server;
    feeders: status_decoder;
    global: status_global;
    stats: status_decoder;
  };
}

export interface status_server {
  [index: string]: {
    Status: string;
    Web: string;
  };
}

export interface status_decoder {
  [index: string]: {
    Status: string;
  };
}

export interface status_global {
  [index: string]: {
    Status: string;
    Count: number;
  };
}

export interface terms {
  terms: string[];
}

export interface decoders {
  acars: boolean;
  vdlm: boolean;
  adsb: {
    enabled: boolean;
    lat: number;
    lon: number;
  };
}

export interface signal {
  levels: {
    [index: number]: {
      count: number;
      id: number;
      level: number;
    };
  };
}

export interface alert_term {
  data: {
    [index: number]: {
      count: number;
      id: number;
      term: string;
    };
  };
}

export interface signal_freq_data {
  freqs: Array<signal_data>;
}

interface signal_data {
  freq_type: string;
  freq: string;
  count: number;
}

export interface signal_count_data {
  count: {
    non_empty_total: number;
    non_empty_errors: number;
    empty_total: number;
    empty_errors: number;
  };
}

export interface current_search {
  flight: string;
  depa: string;
  dsta: string;
  freq: string;
  label: string;
  msgno: string;
  tail: string;
  msg_text: string;
}

export interface labels {
  [index: string]: {
    [index: string]: {
      name: string;
    };
  };
}

export interface html_msg {
  msghtml: acars_msg;
  loading?: boolean;
  done_loading?: boolean;
}

export interface search_html_msg {
  msghtml: acars_msg[];
  query_time: number;
  num_results: number;
}

export interface acars_msg {
  timestamp: number;
  station_id: string;
  toaddr?: string;
  fromaddr?: string;
  depa?: string;
  dsta?: string;
  eta?: string;
  gtout?: string;
  gtin?: string;
  wloff?: string;
  wlin?: string;
  lat?: number;
  lon?: number;
  alt?: number;
  text?: string;
  tail?: string;
  flight?: string;
  icao?: number;
  freq?: number;
  ack?: string;
  mode?: string;
  label?: string;
  block_id?: string;
  msgno?: string;
  is_response?: number;
  is_onground?: number;
  error?: number;
  libacars?: any;
  level?: number;
  matched?: boolean; // This line and below are custom parameters injected by javascript or from the backend
  matched_text?: string[];
  matched_icao?: string[];
  matched_flight?: string[];
  matched_tail?: string[];
  uid: string;
  decodedText?: any; // no type for typescript acars decoder; so set to any
  data?: string;
  message_type: string;
  msg_time?: number;
  duplicates?: string;
  msgno_parts?: string;
  label_type?: string;
  toaddr_decoded?: string;
  toaddr_hex?: string;
  fromaddr_hex?: string;
  fromaddr_decoded?: string;
  icao_url?: string;
  icao_hex?: string;
  decoded_msg?: string;
}

export interface adsb {
  planes: adsb_plane[];
}

export interface adsb_plane {
  live: number;
  call: string;
  lat: number;
  lon: number;
  alt: number;
  gs: number;
  trk: number;
  roc: number;
  tas: number;
  roll: number;
  rtrk: number;
  ias: number;
  mach: number;
  hdg: number;
  ver: number;
  HPL: number;
  RCu: number;
  RCv: number;
  HVE: number;
  VVE: number;
  Rc: number;
  VPL: number;
  EPU: number;
  VEPU: number;
  HFOMr: number;
  VFOMr: number;
  PE_RCu: number;
  PE_VPL: number;
}
