import { acars_msg } from "../interfaces";

export let html_functions = {
  start_message(uid: string) {
    return `<div class="acarshub-message-container" id="${uid}">`;
  },
  end_message() {
    return "</div>";
  },

  start_message_tabs: function (): string {
    return '<div class="tabinator">';
  },

  end_message_tabs: function (): string {
    return "</div><!-- tabs -->";
  },

  create_message_nav_arrows: function (
    tab_to_nav: string,
    unique_id: string,
    direction_back: boolean = true
  ): string {
    return (
      `<a href="javascript:handle_radio('` +
      tab_to_nav +
      `', '` +
      unique_id +
      `')" id = "tab${unique_id}_${
        direction_back ? "previous" : "next"
      }" class="boxed">${direction_back ? "&lt;&lt;" : "&gt;&gt;"}</a>`
    );
  },

  create_message_tab: function (
    tab_uid: string,
    unique_id: string,
    checked: boolean = true
  ): string {
    return (
      `<input type = "radio" id = "tab${tab_uid}_${unique_id}" class = "tabs_${unique_id}" ${
        checked ? "checked" : ""
      } onclick="handle_radio('` +
      tab_uid +
      `', '` +
      unique_id +
      `')">`
    );
  },

  message_tab_label: function (
    message_number: number,
    matched: boolean,
    tab_uid: string,
    unique_id: string
  ): string {
    return `<label for = "tab${tab_uid}_${unique_id}">${
      matched ? '<span class="red_body">' : ""
    }<span class="show_when_big">Message</span><span class="show_when_small">M#</span> ${
      message_number + 1
    }${matched ? "</span>" : ""}</label>`;
  },

  message_div: function (
    unique_id: string,
    tab_uid: string,
    checked: boolean = true
  ): string {
    return `<div id = "message_${unique_id}_${tab_uid}" class="sub_msg${unique_id}${
      checked ? " checked" : ""
    }">`;
  },

  end_message_div: function (): string {
    return "</div><!-- message -->";
  },

  start_message_box: function (): string {
    return '<div><table class="shadow">';
  },

  end_message_box: function (): string {
    return "</table></div><!-- table -->";
  },

  message_station_and_type: function (
    message_type: string,
    station_id: string,
    matched: boolean = false
  ): string {
    return `<tr${
      matched ? ' class="red_body"' : ""
    }><td><strong>${message_type}</strong> from <strong>${station_id}</strong></td>`;
  },

  message_timestamp: function (timestamp: Date): string {
    return `<td style=\"text-align: right\"><strong>${timestamp}</strong></td></tr>`;
  },

  start_message_body: function (): string {
    return '<tr><td class="text_top msg_body">';
  },

  add_message_field: function (
    field_name: string,
    field_value: string,
    use_br: boolean = true
  ): string {
    return `${field_name}:&nbsp;<strong>${field_value}</strong>${
      use_br ? "<br>" : ""
    }`;
  },

  message_text: function (message: acars_msg): string {
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
            ? this.replace_text(
                message.matched_text,
                this.loop_array(message["decodedText"].formatted)
              )
            : this.loop_array(message["decodedText"].formatted); // get the formatted html of the decoded text
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
          ? this.replace_text(message.matched_text, text)
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
  },

  replace_text: function (input: string[], text: string): string {
    for (let i = 0; i < input.length; i++) {
      text = text
        .split(`${input[i].toUpperCase()}`)
        .join(`<span class="red_body">${input[i].toUpperCase()}</span>`);
    }
    return text;
  },

  loop_array: function (input: any): string {
    let html_output: string = "";

    for (let m in input) {
      if (typeof input[m] === "object") {
        html_output += this.loop_array(input[m]);
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
  },

  show_footer_and_sidebar_text: function (
    message: acars_msg,
    footer: boolean = true
  ): string {
    let html_output = "";
    html_output += footer
      ? '<tr class="show_when_big"><td>'
      : '<td class="text_top">';

    html_output += !footer ? '<div class="show_when_small">' : "";

    if (typeof message.tail !== "undefined") {
      html_output += `<span class="tail-tooltip">Tail: <strong><a href=\"https://flightaware.com/live/flight/${
        message.tail
      }\" target=\"_blank\">${
        typeof message.matched_tail !== "undefined" &&
        typeof message.tail !== "undefined"
          ? this.replace_text(message.matched_tail, message.tail)
          : message.tail
      }</a></strong>${!footer ? "</span><br>" : "</span> "}`;
    }

    if (
      typeof message.flight !== "undefined" &&
      typeof message.flight !== "undefined"
    ) {
      html_output +=
        typeof message.matched_flight === "object"
          ? this.replace_text(message.matched_flight, message.flight) +
            `${!footer ? "<br>" : ""}`
          : message.flight + `${!footer ? "<br>" : " "}`;
    }

    if (typeof message.icao !== "undefined") {
      html_output += '<span class="icao-tooltip">ICAO: <strong>';
      html_output +=
        typeof message.icao_url !== "undefined"
          ? `<a href="${message.icao_url}" target="_blank">`
          : "";
      html_output +=
        typeof message.matched_icao === "object"
          ? this.replace_text(message.matched_icao, message.icao.toString()) +
            `${!footer ? "<br>" : ""}`
          : `${message.icao}`;
      html_output +=
        typeof message.icao_hex !== "undefined" &&
        typeof message.matched_icao === "undefined"
          ? `/${message.icao_hex}`
          : "";
      html_output +=
        typeof message.icao_hex !== "undefined" &&
        typeof message.matched_icao !== "undefined" &&
        typeof message.icao_hex !== "undefined"
          ? "/" +
            this.replace_text(
              message.matched_icao,
              message.icao_hex.toString()
            ) +
            `${!footer ? "<br>" : ""}`
          : "";
      html_output +=
        typeof message.icao_url !== "undefined"
          ? `</a></strong></span>${!footer ? "<br>" : " "}`
          : `</strong></span>${!footer ? "<br>" : " "}`;
    }

    html_output += footer ? '</td><td style="text-align: right">' : "";

    // Table footer row, metadata
    if (typeof message.freq !== "undefined") {
      html_output += `<span class="freq-tooltip">${
        footer ? "F" : "Frequency"
      }: <strong>${message.freq}</strong></span>${!footer ? "<br>" : " "}`;
    }

    if (typeof message.level !== "undefined") {
      let level = message.level;
      let circle = "";
      if (level >= -10.0) {
        circle = "circle_green";
      } else if (level >= -20.0) {
        circle = "circle_yellow";
      } else if (level >= -30.0) {
        circle = "circle_orange";
      } else {
        circle = "circle_red";
      }
      html_output += `<span class="level-tooltip" data-jbox-content="The signal level (${
        message.level
      }) of the received message.">${
        footer ? "L" : "Level"
      }: <strong>${level}</strong> <div class="${circle}"></div></span>${
        !footer ? "<br>" : " "
      }`;
    }

    if (typeof message.ack !== "undefined") {
      html_output += `<span class="ack-tooltip">${
        footer ? "A" : "Acknowledgement"
      }: <strong>${String(message.ack).toUpperCase()}</strong></span>${
        !footer ? "<br>" : " "
      }`;
    }

    if (typeof message.mode !== "undefined") {
      html_output += `<span class="mode-tooltip">${
        footer ? "M" : "Mode"
      }: <strong>${message.mode}</strong></span>${!footer ? "<br>" : " "}`;
    }

    if (typeof message.block_id !== "undefined") {
      html_output += `<span class="blockid-tooltip">${
        footer ? "B" : "Block ID"
      }: <strong>${message.block_id}</strong></span>${!footer ? "<br>" : " "}`;
    }

    if (typeof message.msgno !== "undefined") {
      html_output += `<span class="msgno-tooltip">${
        footer ? "M#" : "Message #"
      }: <strong>${message.msgno}</strong></span>${!footer ? "<br>" : " "}`;
    }

    if (typeof message.is_response !== "undefined") {
      html_output += `<span class="response-tooltip">${
        footer ? "R" : "Response"
      }: <strong>${message.is_response}</strong></span>${
        !footer ? "<br>" : " "
      }`;
    }

    if (typeof message.is_onground !== "undefined") {
      // We need to watch this to make sure I have this right. After spelunking through vdlm2dec source code
      // Input always appears to be a 0 or 2...for reasons I don't get. I could have this backwards
      // 0 indicates the plane is airborne
      // 2 indicates the plane is on the ground
      // https://github.com/TLeconte/vdlm2dec/blob/1ea300d40d66ecb969f1f463506859e36f62ef5c/out.c#L457
      // variable naming in vdlm2dec is inconsistent, but "ground" and "gnd" seem to be used
      let is_onground = message["is_onground"] === 0 ? "False" : "True";

      html_output += `<span class="ground-tooltip">${
        footer ? "G" : "Ground"
      }: <strong>${is_onground}</strong></span>${!footer ? "<br>" : " "}`;
    }

    if (typeof message.error !== "undefined") {
      if (Number(message.error) !== 0) {
        html_output += '<span class="error-tooltip"><span style="color:red;">';
        html_output += `<strong>${footer ? "E" : "Error"}: ${
          message["error"]
        }</strong> `;
        html_output += "</span></span>";
      }
    }
    html_output += !footer ? "</div>" : "";
    html_output += "</td></tr>";

    return html_output;
  },
};
