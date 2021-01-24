function display_messages(msgs_to_process, selected_tabs, live_page=false) {
    var msgs_string = '';
    var message_tab_splits = "";
    if(selected_tabs)
        message_tab_splits = selected_tabs.split(",") // the individual tabs with selections

    for (var i = 0; i < msgs_to_process.length; i++){
        var sub_messages = msgs_to_process[i];
        var unique_id = "";
        var active_tab = 0;
        msgs_string += "<br>";

        if(live_page) {
            if(sub_messages[0].hasOwnProperty('timestamp'))
                unique_id = Math.trunc(sub_messages[sub_messages.length - 1]['timestamp']);
            else
                unique_id = Math.trunc(sub_messages[sub_messages.length - 1]['time']);

            if(message_tab_splits.length > 0) {
                for(var q = 0; q < message_tab_splits.length; q++) {
                    if(message_tab_splits[q].startsWith(unique_id.toString())) {
                        var split = message_tab_splits[q].split(";");
                        active_tab = Number(split[1]);
                    }
                }
            }
            
            if(sub_messages.length > 1) {
                msgs_string += '<div class = "tabinator">';
                for(var j = 0; j < sub_messages.length; j++) {
                    var tab_uid = unique_id;

                    if(sub_messages[j].hasOwnProperty('timestamp'))
                        tab_uid = Math.trunc(sub_messages[j]['timestamp']);
                    else
                        tab_uid = Math.trunc(sub_messages[j]['time']);

                    if(active_tab == 0 && j == 0) {
                        msgs_string += `<input type = "radio" id = "tab${tab_uid}_${unique_id}" name = "tabs_${unique_id}" checked onclick="handle_radio(` + tab_uid + `, ` + unique_id + `)">`;
                    }
                    else if(tab_uid == active_tab) {
                        msgs_string += `<input type = "radio" id = "tab${tab_uid}_${unique_id}" name = "tabs_${unique_id}" checked onclick="handle_radio(` + tab_uid + `, ` + unique_id + `)">`;
                    }
                    else {
                        msgs_string += `<input type = "radio" id = "tab${tab_uid}_${unique_id}" name = "tabs_${unique_id}" onclick="handle_radio(` + tab_uid + `, ` + unique_id + `)">`;
                    }
                    msgs_string += `<label for = "tab${tab_uid}_${unique_id}">Message ${j + 1}</label>`;
                }
            }
        }

        for(var u = 0; u < sub_messages.length; u++) {
            var html_output = "";
            if(sub_messages.length > 1) {
                var tab_uid = unique_id;

                if(sub_messages[u].hasOwnProperty('timestamp'))
                    tab_uid = Math.trunc(sub_messages[u]['timestamp']);
                else
                    tab_uid = Math.trunc(sub_messages[u]['time']);

                if(active_tab == 0 && u == 0)
                    html_output += `<div id = "message_${unique_id}_${tab_uid}" class="sub_msg${unique_id} checked">`;
                else if(tab_uid == active_tab)
                    html_output += `<div id = "message_${unique_id}_${tab_uid}" class="sub_msg${unique_id} checked">`;
                else
                    html_output += `<div id = "message_${unique_id}_${tab_uid}" class="sub_msg${unique_id}">`;
            }
            //msgs_string = '<p>' + msgs_received[i].toString() + '</p>' + msgs_string;
            var message = sub_messages[u];
            html_output += "<div><table id=\"shadow\">";

            // Clean up any useless keys

            if(message.hasOwnProperty('_sa_instance_state')) {
                delete message['_sa_instance_state'];
            }

            if(message.hasOwnProperty('id')) {
                delete message['id'];
            }

            // iterate over json and remove blank keys

            for (var key in message) {
                if(message[key] == null)
                    delete message[key];
            }

            html_output += "<tr>";
            html_output += `<td><strong>${message['message_type']}</strong> from <strong>${message['station_id']}</strong></td>`;

            var timestamp;

            if(message.hasOwnProperty('timestamp'))
                timestamp = new Date(message['timestamp'] * 1000);
            else
                timestamp = new Date(message['time'] * 1000);

            html_output += `<td style=\"text-align: right\"><strong>${timestamp}</strong></td>`;
            html_output += "</tr>";
            // Table content
            html_output += "<tr><td colspan=\"2\">";

            if(message.hasOwnProperty("label")) {
                var label_type = "";
                if(message.hasOwnProperty("label_type")) {
                    label_type = message['label_type'];
                }
                html_output += `<p>Message Label: <strong>(${message['label']}) ${label_type}</strong></p>`;
            }

            if(message.hasOwnProperty('toaddr')) {
                var toaddr_decoded = "";

                if(message.hasOwnProperty('toaddr_decoded')) {
                    toaddr_decoded = `<br>To Address Station ID: <strong>${message['toaddr_decoded']}</strong>`;
                }
                if(message.hasOwnProperty('toaddr_hex')) {
                    html_output += `<p>To Address: <strong>${message['toaddr']}/${message['toaddr_hex']}</strong>${toaddr_decoded}</p>`;
                } else {
                    html_output += `<p>To Address: <strong>${message['toaddr']}/?</strong></p>`;
                }
            }

            if(message.hasOwnProperty('fromaddr')) {
                var fromaddr_decoded = "";

                if(message.hasOwnProperty('fromaddr_decoded')) {
                    fromaddr_decoded = `<br>From Address Station ID: <strong>${message['fromaddr_decoded']}</strong>`;
                }
                if(message.hasOwnProperty('fromaddr_hex')) {
                    html_output += `<p>From Address: <strong>${message['fromaddr']}/${message['fromaddr_hex']}</strong>${fromaddr_decoded}</p>`;
                } else {
                    html_output += `<p>From Address: <strong>${message['fromaddr']}/?</strong></p>`;
                }
            }

            if(message.hasOwnProperty('depa')) {
                html_output += `<p>Departing: <strong>${message['depa']}</strong></p>`;
            }

            if(message.hasOwnProperty('dsta')) {
                html_output += `Destination: <strong>${message['dsta']}</strong></p>`;
            }

            if(message.hasOwnProperty('eta')) {
                html_output += `<p>Estimated time of arrival: <strong>${message['eta']}</strong> hours</strong></p>`;
            }

            if(message.hasOwnProperty('gtout')) {
                html_output += `<p>Pushback from gate: <strong>${message['gtout']}</strong> hours</strong></p>`;
            }

            if(message.hasOwnProperty('gtin')) {
                html_output += `<p>Arriving at gate: <strong>${message['gtin']}</strong> hours</strong></p>`;
            }

            if(message.hasOwnProperty("wloff")) {
                html_output += `<p>Wheels off: <strong>${message['wloff']}</strong> hours</strong></p>`;
            }

            if(message.hasOwnProperty("wlin")) {
                html_output += `<p>Wheels down: <strong>${message['wlin']}</strong></p>`;
            }

            if(message.hasOwnProperty("lat")) {
                html_output += `<p>Latitude: <strong>${message['lat']}</strong></p>`;
            }

            if(message.hasOwnProperty("lon")) {
                html_output += `<p>Longitude: <strong>${message['lon']}</strong></p>`;
            }


            if(message.hasOwnProperty("alt")) {
                html_output += `<p>Altitude: <strong>${message['alt']}</strong></p>`;
            }

            if(message.hasOwnProperty("text")) {
                var text = message['text'];
                text = text.replace("\\r\\n", "<br>");

                //html_output += "<p>";
                html_output += "<table class=\"message\">";
                
                //html_output += "</p>";
                if(message.hasOwnProperty("decodedText")) {
                    //html_output += "<p>";
                    var decodedStatus = "Full";
                    if(message['decodedText'].decoder.decodeLevel != "full")
                        decodedStatus = "Partial";
                    html_output += "<td class=\"text_top\">";
                    html_output += `<strong>Decoded Text (${decodedStatus}):</strong></p>`;
                    html_output += "<pre id=\"shadow\"><strong>";
                    html_output += loop_array(message['decodedText'].formatted);
                    //html_output += `${message['decodedText'].raw}`;
                    html_output += "</strong></pre>";
                    html_output += "</td>";
                    //html_output += "</p>";
                } else {
                    html_output += "<tr>"
                }

                html_output += "<td class=\"text_top\">";
                html_output += "<strong>Non-Decoded Text:</strong><p>";
                html_output += `<pre id=\"shadow\"><strong>${text}</strong></pre>`;
                html_output += "</td>";
                html_output += "</tr></table>";
            }
            else if(message.hasOwnProperty("data")) {
                var data = message['data'];
                data = data.replace("\\r\\n", "<br>");
                html_output += "<p>";
                html_output += `<pre id=\"shadow\"><strong>${data}</strong></pre>`;
                html_output += "</p>";
            }

            else {
                html_output += "<p><pre id=\"shadow\"><i><strong>No text</strong></i></pre></p>";
            }

            if(message.hasOwnProperty("libacars")) {
                html_output += message['libacars'];
            }

            html_output += "</td></tr>";

            // Table footer row, tail & flight info
            html_output += "<tr>";
            html_output += "<td>";
            if(message.hasOwnProperty("tail")) {
                html_output += `Tail: <strong><a href=\"https://flightaware.com/live/flight/${message['tail']}\" target=\"_blank\">${message['tail']}</a></strong> `;
            }

            if(message.hasOwnProperty("flight")) {
                html_output += message['flight'];
            }            

            if(message.hasOwnProperty("icao")) {
                if (message.hasOwnProperty("icao_hex") && message.hasOwnProperty('icao_url')) {
                    html_output += `ICAO: <strong><a href="${message['icao_url']}" target="_blank">${message['icao']}/${message['icao_hex']}</a></strong>`
                }
                else if(message.hasOwnProperty("icao_hex")) {
                    html_output += `ICAO: <strong>${message['icao']}/${message['icao_hex']}</strong> `;    
                } else {
                    html_output += `ICAO: <strong>${message['icao']}</strong> `;
                }
            }

            html_output += "</td>";

            // Table footer row, metadata
            html_output += "<td style=\"text-align: right\">";
            if(message.hasOwnProperty('freq')) {
                html_output += `<span class=\"wrapper\">F: <strong>${message['freq']}</strong><span class=\"tooltip\">The frequency this message was received on</span></span> `;
            }

            if(message.hasOwnProperty("level")) {
                var level = message["level"];
                var img = "";
                if(level >= -6 ) {
                    img = "5bar.png";
                } else if(level >= -12) {
                    img = "4bar.png";
                } else if(level >= -18) {
                    img = "3bar.png";
                } else if(level >= -24) {
                    img = "2bar.png";
                } else {
                    img = "1bar.png";
                }

                html_output += `<span class="wrapper">L: <img src="static/images/${img}" class="small_img" alt="${level}""><span class="tooltip">The signal level (${level}) of the received message.</span></span> `;
            }

            if(message.hasOwnProperty("ack")) {
                if(!message['ack'])
                    html_output += `<span class=\"wrapper\">A: <strong>${message['ack']}</strong><span class=\"tooltip\">Acknolwedgement</span></span> `;
            }

            if(message.hasOwnProperty("mode")) {
                html_output += `<span class=\"wrapper\">M: <strong>${message['mode']}</strong><span class=\"tooltip\">Mode</span></span> `;
            }

            if(message.hasOwnProperty("block_id")) {
                html_output += `<span class=\"wrapper\">B: <strong>${message['block_id']}</strong><span class=\"tooltip\">Block ID</span></span> `;
            }


            if(message.hasOwnProperty("msgno")) {
                html_output += `<span class=\"wrapper\">M#: <strong>${message['msgno']}</strong><span class=\"tooltip\">Message number. Used for multi-part messages.</span></span> `;
            }


            if(message.hasOwnProperty("is_response")) {
                html_output += `<span class=\"wrapper\">R: <strong>${message['is_response']}</strong><span class=\"tooltip\">Response</span></span> `;
            }

            if(message.hasOwnProperty("is_onground")) {
                // We need to watch this to make sure I have this right. After spelunking through vdlm2dec source code
                // Input always appears to be a 0 or 2...for reasons I don't get. I could have this backwards
                // 0 indicates the plane is airborne
                // 2 indicates the plane is on the ground
                // https://github.com/TLeconte/vdlm2dec/blob/1ea300d40d66ecb969f1f463506859e36f62ef5c/out.c#L457
                // variable naming in vdlm2dec is inconsistent, but "ground" and "gnd" seem to be used
                var is_onground = "True";

                if(message['is_onground'] == 0)
                    is_onground = "False";

                html_output += `<span class=\"wrapper\">G: <strong>${message['is_onground']}</strong><span class=\"tooltip\">Is on ground?</span></span> `;
            }

            if(message.hasOwnProperty("error")) {
                if(message['error'] != 0) {
                    html_output += '<span style="color:red;">';
                    html_output += `E: ${message['error']} `;
                    html_output += '</span>';
                }
            }

            html_output += "</td>";
            html_output += "</tr>";

            // Finish table html
            html_output += "</table></div><!-- table -->";

            if(sub_messages.length > 1) {
                html_output += "</div><!-- message -->";
            }

            msgs_string = msgs_string + html_output;
        }

        if(sub_messages.length > 1) {
            msgs_string += "</div><!-- tabs -->";
        }

    }

    return msgs_string;
}

function loop_array(input) {
    var html_output = "";
    
    for (var m in input) {
        // close to working
        //console.log(typeof(input[m]));
        if(typeof(input[m]) === "object") {
            html_output += loop_array(input[m]);
        } else {
            if(m == "label")
                html_output += input[m] + ": ";
            else if(m == "value") {
                html_output += input[m] + "<br>";
            } else if(m == "description") {
                html_output += "<p>Description: " + input[m] + "</p>";
            } /*else {
                console.log(`Unknown item ${m} ${input[m]}`);
            }*/
        }
    }

    return html_output;
}