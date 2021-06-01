export function tab_ids() {}

export function start_message_tabs() {
  return '<div class="tabinator">';
}

export function create_message_nav_arrows(
  tab_to_nav: string,
  unique_id: string,
  direction_back: boolean = true
) {
  return (
    `<a href="javascript:handle_radio('` +
    tab_to_nav +
    `', '` +
    unique_id +
    `')" id = "tab${unique_id}_${
      direction_back ? "previous" : "next"
    }" name = "tabs_${unique_id}" class="boxed">${
      direction_back ? "&lt;&lt;" : "&gt;&gt;"
    }</a>`
  );
}

export function create_message_tab(
  tab_uid: string,
  unique_id: string,
  checked: boolean = true
) {
  return (
    `<input type = "radio" id = "tab${tab_uid}_${unique_id}" name = "tabs_${unique_id}" class = "tabs_${unique_id}" ${
      checked ? "checked" : ""
    } onclick="handle_radio('` +
    tab_uid +
    `', '` +
    unique_id +
    `')">`
  );
}

export function message_tab_label(
  message_number: number,
  matched: boolean,
  tab_uid: string,
  unique_id: string
) {
  return `<label for = "tab${tab_uid}_${unique_id}">${
    matched ? '<span class="red_body">' : ""
  }Message ${message_number + 1}${matched ? "</span>" : ""}</label>`;
}

export function message_div(
  unique_id: string,
  tab_uid: string,
  checked: boolean = true
) {
  return `<div id = "message_${unique_id}_${tab_uid}" class="sub_msg${unique_id}${
    checked ? " checked" : ""
  }">`;
}

export function start_message_box() {
  return '<div><table class="shadow">';
}

export function message_station_and_type(
  message_type: string,
  station_id: string,
  matched: boolean = false
) {
  return `<tr${
    matched ? ' class="red_body"' : ""
  }><td><strong>${message_type}</strong> from <strong>${station_id}</strong></td>`;
}

export function message_timestamp(timestamp: Date) {
  return `<td style=\"text-align: right\"><strong>${timestamp}</strong></td></tr>`;
}

export function start_message_body() {
  return '<tr><td class="text_top msg_body">';
}

export function add_message_field(field_name: string, field_value: string) {
  return `${field_name}:&nbsp;<strong>${field_value}</strong><br>`;
}
