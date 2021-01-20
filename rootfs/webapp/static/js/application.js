
var pause = false;
var text_filter = false;
var socket;
var msgs_received = [];
var exclude = [];

var filtered_messages = 0;
var received_messages = 0;

import { MessageDecoder } from '../airframes-acars-decoder/MessageDecoder.js'
const md = new MessageDecoder();

function increment_filtered() {
    var id = document.getElementById("filteredmessages");
    id.innerHTML = "";
    filtered_messages++;
    var txt = document.createTextNode(filtered_messages);
    id.appendChild(txt);
}

function increment_received() {
    var id = document.getElementById("receivedmessages");
    id.innerHTML = "";
    received_messages++;
    var txt = document.createTextNode(received_messages);
    id.appendChild(txt);
}

window.pause_updates = function() {
    if(pause) {
        pause = false;
        var id = document.getElementById("pause_updates");
        id.innerHTML = "";
        var txt = document.createTextNode("Pause updates");
        id.appendChild(txt);

        var id_filtered = document.getElementById("received");
        id_filtered.innerHTML = "";
        var txt_filtered = document.createTextNode("Received messages");
        id_filtered.appendChild(txt_filtered);

        $('#log').html(display_messages(msgs_received));
    }
    else {
        pause = true;

        var id = document.getElementById("pause_updates");
        id.innerHTML = "<span class=\"red\">Unpause Updates</span>";
        //var txt = document.createTextNode("Unpause Updates");
        //id.appendChild(txt);

        var id_filtered = document.getElementById("received");
        id_filtered.innerHTML = "";
        var txt_filtered = document.createTextNode("Received messages (paused)");
        id_filtered.appendChild(txt_filtered);
    }
}

window.filter_notext = function() {
    if(text_filter) {
        text_filter = false;
        document.getElementById("fixed_menu").classList.remove("fixed_menu");
        document.getElementById("fixed_menu").classList.add("fixed_menu_short");

        var id = document.getElementById("filter_notext");
        id.innerHTML = "Hide Empty Messages";
        //var txt = document.createTextNode("Hide Empty messages");
        //id.appendChild(txt);
        Cookies.set('filter', 'false', { expires: 365 });
        filtered_messages = 0;

        $('#filtered').html("");
    } else {
        text_filter = true;
        document.getElementById("fixed_menu").classList.remove("fixed_menu_short");
        document.getElementById("fixed_menu").classList.add("fixed_menu");

        $('#filtered').html("Filtered Messages:&emsp;&ensp;<strong><span id=\"filteredmessages\"></span></strong>");
        var id_filtered = document.getElementById("filteredmessages");
        var txt_filtered = document.createTextNode(filtered_messages);
        id_filtered.appendChild(txt_filtered);

        id = document.getElementById("filter_notext");
        id.innerHTML = "<span class=\"red\">Show All Messages</span>";
        //var txt = document.createTextNode("Show All messages");
        //id.appendChild(txt);
        Cookies.set('filter', 'true', { expires: 365 });
    }
}

window.toggle_label = function(key) {
    if(exclude.indexOf(key.toString()) == -1) {
        exclude.push(key.toString());
        document.getElementById(key.toString()).classList.add("red");
        var exclude_string = "";
        for(var i = 0; i < exclude.length; i++) {
            exclude_string += exclude[i] + " ";
        }

        Cookies.set('exclude', exclude_string.trim(), {expires: 365});
    } else {
        var exclude_string = "";
        document.getElementById(key.toString()).classList.remove("red");
        for(var i = 0; i < exclude.length; i++) {
            if(exclude[i] != key.toString())
                exclude_string += exclude[i] + " ";
        }
        exclude = exclude_string.trim().split(" ");
        Cookies.set('exclude', exclude_string.trim(), {expires: 365});
    }
}

$(document).ready(function(){
    //connect to the socket server.
    generate_menu();
    generate_footer();
    socket = io.connect('http://' + document.domain + ':' + location.port + '/main');

    var filter = Cookies.get("filter");
    if(filter == "true") {
        Cookies.set('filter', 'true', { expires: 365 });
        filter_notext();
    } else {
        text_filter = true; // temparily flip the value so we can run the filter_notext() function and set the proper CSS
        Cookies.set('filter', 'false', { expires: 365 });
        filter_notext();
    }

    var exclude_cookie = Cookies.get("exclude");
    console.log(exclude_cookie);
    if(exclude_cookie == null) {
        Cookies.set('exclude', "", { expires: 365 });
    } else {
        Cookies.set('exclude', exclude_cookie, {expires: 365});
        exclude = exclude_cookie.split(" ");
    }

    socket.on('labels', function(msg) {
        var label_html = "";
        for (var key in msg.labels) {
            var link_class = ""
            if(exclude.indexOf(key.toString()) != -1)
                link_class = "red";
            label_html += `<a href="javascript:toggle_label('${key.toString()}');" id="${key}" class="${link_class}">${key} ${msg.labels[key]['name']}</a><br>`;
        }
        $('#label_links').html(label_html);
    });

    //receive details from server
    socket.on('newmsg', function(msg) {
        //console.log("Received msg" + msg.msghtml);
        console.log("Received msg");

        if(msg.msghtml.hasOwnProperty('label') == false || exclude.indexOf(msg.msghtml.label) == -1) {
            if(!text_filter || (msg.msghtml.hasOwnProperty('text') || msg.msghtml.hasOwnProperty('data') ||
                msg.msghtml.hasOwnProperty('libacars') || msg.msghtml.hasOwnProperty('dsta') || msg.msghtml.hasOwnProperty('depa') ||
                msg.msghtml.hasOwnProperty('eta') || msg.msghtml.hasOwnProperty('gtout') || msg.msghtml.hasOwnProperty('gtin') ||
                msg.msghtml.hasOwnProperty('wloff') || msg.msghtml.hasOwnProperty('wlin') || msg.msghtml.hasOwnProperty('lat') ||
                msg.msghtml.hasOwnProperty('lon') || msg.msghtml.hasOwnProperty('alt'))) {

                if (msgs_received.length >= 50){
                    msgs_received.shift()
                }           

                if(msg.msghtml.hasOwnProperty('text')) {
                    var decoded_msg = md.decode(msg.msghtml);
                    if(decoded_msg.decoded == true) {
                        msg.msghtml.decodedText = decoded_msg;
                        console.log(msg.msghtml.decodedText);
                    }
                }

                msgs_received.push(msg.msghtml);
            } else {
                increment_filtered();
            }
        } else {
            console.log("EXCLUDED" + msg.msghtml.label);
            increment_filtered();
        }

        increment_received();

        if(!pause) {
            $('#log').html(display_messages(msgs_received));
        }
        else
            console.log("Message received, but updates paused")
    });

    //noop
    socket.on('noop', function(noop) {
        console.log("Received noop");
    });

});

