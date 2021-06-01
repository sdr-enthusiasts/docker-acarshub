import { acars_msg } from "./interfaces";

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

export function add_message_field(
  field_name: string,
  field_value: string,
  use_br: boolean = true
) {
  return `${field_name}:&nbsp;<strong>${field_value}</strong>${
    use_br ? "<br>" : ""
  }`;
}

export function start_message_text() {
  return;
}

export function message_text(message: acars_msg) {
  let html_output: string = '<tr><td colspan="2">';
  if (message.hasOwnProperty("text") && typeof message.text !== "undefined") {
    let text = message["text"];
    text = text.replace("\\r\\n", "<br>");
    //html_output += "<p>";
    html_output += '<table class="message">';

    //html_output += "</p>";
    if (message.hasOwnProperty("decodedText")) {
      //html_output += "<p>";
      let decodedStatus = "Full";
      if (message["decodedText"].decoder.decodeLevel != "full")
        decodedStatus = "Partial";
      html_output += '<td class="text_top">';
      html_output += `<strong>Decoded Text (${decodedStatus}):</strong></p>`;
      html_output += '<pre class="shadow show_strong">';
      html_output +=
        typeof message.matched_text === "object"
          ? replace_text(
              message.matched_text,
              loop_array(message["decodedText"].formatted)
            )
          : loop_array(message["decodedText"].formatted); // get the formatted html of the decoded text
      //html_output += `${message['decodedText'].raw}`;
      html_output += "</pre>";
      html_output += "</td>";
      //html_output += "</p>";
    } else {
      html_output += "<tr>";
    }

    html_output += message.hasOwnProperty("decodedText")
      ? '<td class="text_top dont_show">'
      : '<td class="text_top">'; // If screen size is too small, and we have decoded text, hide this element
    html_output += "<strong>Non-Decoded Text:</strong><p>";
    html_output += `<pre class="shadow show_strong">${
      typeof message.matched_text === "object"
        ? replace_text(message.matched_text, text)
        : text
    }</pre>`;
    html_output += "</td>";
    html_output += "</tr></table>";
  } else if (
    message.hasOwnProperty("data") &&
    typeof message.data !== "undefined"
  ) {
    let data = message["data"];
    data = data.replace("\\r\\n", "<br>");
    html_output += "<p>";
    html_output += `<pre class="shadow show_strong">${data}</pre>`;
    html_output += "</p>";
  } else {
    html_output +=
      '<p><pre class="shadow show_strong"><i>No text</i></pre></p>';
  }

  if (message.hasOwnProperty("libacars")) {
    html_output += message["libacars"];
  }

  html_output += "</td></tr>";

  return html_output;
}

export function replace_text(input: string[], text: string) {
  for (let i = 0; i < input.length; i++) {
    text = text
      .split(`${input[i].toUpperCase()}`)
      .join(`<span class="red_body">${input[i].toUpperCase()}</span>`);
  }
  return text;
}

export function loop_array(input: any) {
  let html_output: string = "";

  for (let m in input) {
    if (typeof input[m] === "object") {
      html_output += loop_array(input[m]);
    } else {
      if (m === "label") html_output += input[m] + ": ";
      else if (m === "value") {
        html_output += input[m] + "<br>";
      } else if (m === "description") {
        html_output += "Description: " + input[m] + "<br>";
      }
    }
  }

  return html_output;
}
