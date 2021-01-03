
var pause = false;
var socket;
var msgs_received = [];


$(document).ready(function(){
    //connect to the socket server.
    socket = io.connect('http://' + document.domain + ':' + location.port + '/main');

    //receive details from server
    socket.on('newmsg', function(msg) {
        //console.log("Received msg" + msg.msghtml);
        console.log("Received msg");
        //maintain a list of 50 msgs
        if (msgs_received.length >= 50){
            msgs_received.shift()
        }            
        msgs_received.push(msg.msghtml);
        if(!pause)
            display_messages()
        else
            console.log("Message received, but updates paused")
    });

    //noop
    socket.on('noop', function(noop) {
        console.log("Received noop");
    });

});

function pause_updates() {
    if(pause) {
        pause = false;
        id = document.getElementById("pause_updates");
        id.innerHTML = "";
        txt = document.createTextNode("Pause updates");
        id.appendChild(txt);
        display_messages()
    }
    else {
        pause = true;

        id = document.getElementById("pause_updates");
        id.innerHTML = "";
        txt = document.createTextNode("Updates Paused");
        id.appendChild(txt);
    }
}

function display_messages() {
    var msgs_string = '';
    for (var i = 0; i < msgs_received.length; i++){
        //console.log(msgs_received[i]);
        //msgs_string = '<p>' + msgs_received[i].toString() + '</p>' + msgs_string;
        var message = msgs_received[i];
        var html_output = "<p><table id=\"shadow\">";

        // Clean up any useless keys

        if(message.hasOwnProperty('_sa_instance_state')) {
            delete message['_sa_instance_state'];
        }

        if(message.hasOwnProperty('id')) {
            delete message['id'];
        }

        if(message.hasOwnProperty('channel')) {
            delete message['channel'];
        }

        if(message.hasOwnProperty('level')) {
            delete message['level'];
        }

        if(message.hasOwnProperty('end')) {
            delete message['end'];
        }

        // iterate over json and remove blank keys

        for (var key in message) {
            if(message[key] == null)
                delete message[key];
        }

        html_output += "<tr>";
        html_output += `<td><strong>${message['msgtype']}</strong> from <strong>${message['station_id']}</strong></td>`;

        var timestamp;

        if(message.hasOwnProperty('timestamp'))
            timestamp = new Date(message['timestamp'] * 1000);
        else
            timestamp = new Date(message['time'] * 1000);

        html_output += `<td style=\"text-align: right\"><strong>${timestamp}</strong></td>`;
        html_output += "</tr>";
        // Table content
        html_output += "<tr><td colspan=\"2\">";

        if(message.hasOwnProperty('toaddr')) {
            html_output += `<p>To Address: <strong>${message['toaddr']}</strong></p>`;
        }

        if(message.hasOwnProperty('fromaddr')) {
            html_output += `<p>From Address: <strong>${message['fromaddr']}</strong></p>`;
        }

        if(message.hasOwnProperty('depa')) {
            html_output += `<p>Departing: <strong>${message['depa']}</strong></p>`;
        }

        if(message.hasOwnProperty('dsta')) {
            html_output += `Destination: <strong>${message['dsta']}</strong></p>`;
        }

        if(message.hasOwnProperty('eta')) {
            html_output += `<p>Estimated time of arrival: <strong>${message['eta']}</strong> hours</p>`;
        }

        if(message.hasOwnProperty('gtout')) {
            html_output += `<p>Pushback from gate: <strong>${message['gtout']}</strong> hours</p>`;
        }

        if(message.hasOwnProperty('gtin')) {
            html_output += `<p>Arriving at gate: <strong>${message['gtin']}</strong> hours</p>`;
        }

        if(message.hasOwnProperty("wloff")) {
            html_output += `<p>Wheels off: <strong>${message['wloff']}</strong> hours</p>`;
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

            html_output += "<p>";
            html_output += `<pre id=\"shadow\"><strong>${text}</strong></pre>`;

            html_output += "</p>";
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
            html_output += "<p>Decoded:</p>";
            html_output += "<p>";
            html_output += `<pre id=\"shadow\"><strong>${message['libacars']}<strong></pre>"`;
            html_output += "</p>";
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
            html_output += `ICAO: <strong>${message['icao']}</strong> `;
        }

        html_output += "</td>";

        // Table footer row, metadata
        html_output += "<td style=\"text-align: right\">";
        if(message.hasOwnProperty('freq')) {
            html_output += `<span class=\"wrapper\">F: <strong>${message['freq']}</strong><span class=\"tooltip\">The frequency this message was received on</span></span> `;
        }

        if(message.hasOwnProperty("ack")) {
            if(!message['ack'])
                html_output += `<span class=\"wrapper\">A: <strong>${message['ack']}</strong><span class=\"tooltip\">Acknolwedgement</span></span> `;
        }

        if(message.hasOwnProperty("mode")) {
            html_output += `<span class=\"wrapper\">M: <strong>${message['mode']}</strong><span class=\"tooltip\">Mode</span></span> `;
        }

        if(message.hasOwnProperty("label")) {
            html_output += `<span class=\"wrapper\">L: <strong>${message['label']}</strong><span class=\"tooltip\">Label</span></span> `;
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
        html_output += "</table></p>";

        msgs_string = html_output + msgs_string;
    }
    $('#log').html(msgs_string);
}