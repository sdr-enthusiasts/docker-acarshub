
var pause = false;
var text_filter = false;
var socket;
var msgs_received = [];
var exclude = [];
var selected_tabs = "";

var filtered_messages = 0;
var received_messages = 0;

import { MessageDecoder } from '../airframes-acars-decoder/MessageDecoder.js'
const md = new MessageDecoder();

// Automatically keep the array size at 100 messages or less
// without the need to check before we push on to the stack

msgs_received.unshift = function () {
    if (this.length >= 50) {
        this.pop();
    }
    return Array.prototype.unshift.apply(this,arguments);
}

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

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}

window.handle_radio = function(element_id, uid) {
    var all_tabs = document.querySelectorAll(`div.sub_msg${uid}`);
    for(var i = 0; i < all_tabs.length; i++) {
        all_tabs[i].classList.remove("checked");
    }
    var element = document.getElementById(`message_${uid}_${element_id}`);
    element.classList.add("checked");
    var added = false;
    if(selected_tabs != "") {
        var split = selected_tabs.split(",")
        for(var i = 0; i < split.length; i++) {
            var sub_split = split[i].split(";");

            if(sub_split[0] == uid && i == 0) {
                selected_tabs = uid + ";" + element_id;
                added = true;
            }
            else if(sub_split[0] == uid) {
                selected_tabs += "," + uid + ";" + element_id;
                added = true;
            }
            else if (i == 0)
                selected_tabs = sub_split[0] + ';' + sub_split[1];
            else
                selected_tabs += "," + sub_split[0] + ';' + sub_split[1];
        }
    }

    if(selected_tabs.length == 0) {
        selected_tabs = uid + ";" + element_id;
    } else if(!added) {
        selected_tabs += "," + uid + ";" + element_id;
    }
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

        $('#log').html(display_messages(msgs_received, selected_tabs, true));
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
        document.getElementById(key.toString()).classList.remove("sidebar_link");
        document.getElementById(key.toString()).classList.add("red");
        var exclude_string = "";
        for(var i = 0; i < exclude.length; i++) {
            exclude_string += exclude[i] + " ";
        }

        Cookies.set('exclude', exclude_string.trim(), {expires: 365});
    } else {
        var exclude_string = "";
        document.getElementById(key.toString()).classList.remove("red");
        document.getElementById(key.toString()).classList.add("sidebar_link");
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
    if(exclude_cookie == null) {
        Cookies.set('exclude', "", { expires: 365 });
    } else {
        Cookies.set('exclude', exclude_cookie, {expires: 365});
        exclude = exclude_cookie.split(" ");
    }

    socket.on('labels', function(msg) {
        var label_html = "";
        for (var key in msg.labels) {
            var link_class = "sidebar_link"
            if(exclude.indexOf(key.toString()) != -1)
                link_class = "red";
            label_html += `<a href="javascript:toggle_label('${key.toString()}');" id="${key}" class="${link_class}">${key} ${msg.labels[key]['name']}</a><br>`;
        }
        $('#label_links').html(label_html);
    });

    //receive details from server
    socket.on('newmsg', function(msg) {
        if(msg.msghtml.hasOwnProperty('label') == false || exclude.indexOf(msg.msghtml.label) == -1) {
            if(!text_filter || (msg.msghtml.hasOwnProperty('text') || msg.msghtml.hasOwnProperty('data') ||
                msg.msghtml.hasOwnProperty('libacars') || msg.msghtml.hasOwnProperty('dsta') || msg.msghtml.hasOwnProperty('depa') ||
                msg.msghtml.hasOwnProperty('eta') || msg.msghtml.hasOwnProperty('gtout') || msg.msghtml.hasOwnProperty('gtin') ||
                msg.msghtml.hasOwnProperty('wloff') || msg.msghtml.hasOwnProperty('wlin') || msg.msghtml.hasOwnProperty('lat') ||
                msg.msghtml.hasOwnProperty('lon') || msg.msghtml.hasOwnProperty('alt'))) {   

                if(msg.msghtml.hasOwnProperty('text')) {
                    var decoded_msg = md.decode(msg.msghtml);
                    if(decoded_msg.decoded == true) {
                        msg.msghtml.decodedText = decoded_msg;
                        //console.log(msg.msghtml.decodedText);
                    }
                }

                var new_tail = msg.msghtml.tail;
                var new_icao = msg.msghtml.icao;
                var new_flight = msg.msghtml.flight;
                var found = false; // variable to track if the new message was found in previous messages
                var rejected = false; // variable to track if the new message was rejected for being a duplicate
                var index_new = 0; // the index of the found previous message

                msg.msghtml.uid = getRandomInt(1000000).toString(); // Each message gets a unique ID. Used to track tab selection

                // Loop through the received messages. If a message is found we'll break out of the for loop
                for(var u = 0; u < msgs_received.length; u++) {
                    if(msgs_received[u][0].hasOwnProperty('tail') && new_tail == msgs_received[u][0].tail) {
                        //msgs_received[u].push(msg.msghtml);
                        found = true;
                        index_new = u;
                        u = msgs_received.length;
                        //console.log("match " + new_tail);
                    } else if(msgs_received[u][0].hasOwnProperty('icao') && new_icao == msgs_received[u][0].icao) {
                        //msgs_received[u].push(msg.msghtml);
                        found = true;
                        index_new = u;
                        u = msgs_received.length;
                        //console.log("match " + new_icao);
                    } else if(msgs_received[u][0].hasOwnProperty('flight') && new_flight == msgs_received[u][0].flight) {
                        //msgs_received[u].push(msg.msghtml);
                        found = true;
                        index_new = u;
                        u = msgs_received.length;
                        //console.log("match " + new_flight);
                    }

                    // if we found a message group that matches the new message
                    // run through the messages in that group to see if it is a dup.
                    // if it is, we'll reject the new message and append a counter to the old/saved message
                    if(found) {
                        for(var j = 0; j < msgs_received[index_new].length; j++) {
                            // First we'll see if the text field is the same
                            // If not, then we'll see if this is a multipart message
                            if (msgs_received[index_new][j].hasOwnProperty('text') && msg.msghtml.hasOwnProperty('text') &&
                                msgs_received[index_new][j]['text'] == msg.msghtml['text']) { // it's the same message
                                //console.log("REJECTED " + JSON.stringify(msg.msghtml));
                                msgs_received[index_new][j]['timestamp'] = msg.msghtml.timestamp;
                                if(msgs_received[index_new][j].hasOwnProperty("duplicates")) {
                                    msgs_received[index_new][j]['duplicates']++;                 
                                }
                                else {
                                    msgs_received[index_new][j]['duplicates'] = 1;
                                }
                                rejected = true;
                            } else if(msg.msghtml.station_id == msgs_received[index_new][j].station_id &&
                                msg.msghtml.hasOwnProperty('msgno') && msgs_received[index_new][j].hasOwnProperty('msgno') &&
                                ((msg.msghtml['msgno'].charAt(0) == msgs_received[index_new][j]['msgno'].charAt(0) &&
                                msg.msghtml['msgno'].charAt(3) == msgs_received[index_new][j]['msgno'].charAt(3)) ||
                                (msg.msghtml['msgno'].substring(0,3) == msgs_received[index_new][j]['msgno'].substring(0, 3)))) {
                                console.log("REJECTED multi-part " + JSON.stringify(msg.msghtml));

                                // We have a multi part message. Now we need to see if it is a dup
                                rejected = true;
                                var add_multi = true;

                                if(msgs_received[index_new][j].hasOwnProperty('msgno_parts')) {
                                    var split = msgs_received[index_new][j].msgno_parts.toString().split(" ");
                                    console.log(msgs_received[index_new][j].msgno_parts);
                                    console.log(split.length);

                                    for(var a = 0; a < split.length; a++) {
                                        console.log(split[a].substring(0, 4) + " " + msg.msghtml['msgno']);
                                        if(split[a].substring(0, 4) == msg.msghtml['msgno']) {
                                            add_multi = false;
                                            console.log("FOUND MATCH");

                                            if(a == 0 && split[a].length == 4) {
                                                msgs_received[index_new][j].msgno_parts = split[a] + "x2";
                                            } else if (split[a].length == 4) {
                                                msgs_received[index_new][j].msgno_parts += " " + split[a] + "x2";
                                            } else if(a == 0) {
                                                console.log(split[a].substring(5));
                                                var count = parseInt(split[a].substring(5)) + 1;
                                                msgs_received[index_new][j].msgno_parts = split[a].substring(0,4) + "x" + count;
                                            } else {
                                                var count = parseInt(split[a].substring(5)) + 1;
                                                console.log(split[a].substring(5));
                                                msgs_received[index_new][j].msgno_parts += " " + split[a].substring(0,4) + "x" + count;
                                            }
                                        } else {
                                            if(a == 0) {
                                                msgs_received[index_new][j].msgno_parts = split[a];
                                            } else {
                                                msgs_received[index_new][j].msgno_parts += " " + split[a];
                                            }
                                        }
                                    }
                                }                  

                                msgs_received[index_new][j]['timestamp'] = msg.msghtml.timestamp;
                                
                                if(add_multi) {
                                    if(msgs_received[index_new][j]['text'] && msg.msghtml.hasOwnProperty('text'))
                                        msgs_received[index_new][j]['text'] += msg.msghtml.text;
                                    else if(msg.msghtml.hasOwnProperty('text'))
                                        msgs_received[index_new][j]['text'] = msg.msghtml.text;

                                    if(msgs_received[index_new][j].hasOwnProperty('msgno_parts')) {
                                        msgs_received[index_new][j]['msgno_parts'] += " " + msg.msghtml.msgno;
                                    } else {
                                        msgs_received[index_new][j]['msgno_parts'] = msgs_received[index_new][j]['msgno'] + " " + msg.msghtml.msgno;
                                    }

                                    var decoded_msg = md.decode(msgs_received[index_new][j]);
                                    if(decoded_msg.decoded == true) {
                                        msgs_received[index_new][j]['decoded_msg'] = decoded_msg;
                                        //console.log(msg.msghtml.decodedText);
                                    }
                                }
                            }

                            if(rejected) {
                                // Promote the message back to the front
                                msgs_received[index_new].forEach(function(item,i) {
                                    if(i == j) {
                                        msgs_received[index_new].splice(i, 1);
                                        msgs_received[index_new].unshift(item);
                                    }
                                });
                                j = msgs_received[index_new].length;
                            }
                        }
                    }

                    // If the message was found we'll move the message group back to the top
                    if(found) {
                        // If the message was found, and not rejected, we'll append it to the message group
                        if(!rejected)
                            msgs_received[index_new].unshift(msg.msghtml);

                        msgs_received.forEach(function(item,i){
                            if(i == index_new){
                                msgs_received.splice(i, 1);
                                msgs_received.unshift(item);
                            }
                        });
                    }
                }
                if(!found && !rejected) {
                    msgs_received.unshift([msg.msghtml]);
                }
            } else {
                increment_filtered();
            }
        } else {
            if(text_filter)
                increment_filtered();
        }

        increment_received();
        if(!pause) {
            $('#log').html(display_messages(msgs_received, selected_tabs, true));
        }
    });

    //noop
    socket.on('noop', function(noop) {
        console.log("Received noop");
    });

});

