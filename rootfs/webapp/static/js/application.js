
var pause = false;
var text_filter = false;
var socket;
var msgs_received = [];

var filtered_messages = 0;
var received_messages = 0;

$(document).ready(function(){
    //connect to the socket server.
    socket = io.connect('http://' + document.domain + ':' + location.port + '/main');

    var filter = Cookies.get("filter");
    if(filter == "true")
        filter_notext();

    console.log(filter);
    //receive details from server
    socket.on('newmsg', function(msg) {
        //console.log("Received msg" + msg.msghtml);
        console.log("Received msg");
        //maintain a list of 50 msgs
        if(!text_filter || (msg.msghtml.hasOwnProperty('text') || msg.msghtml.hasOwnProperty('data') ||
            msg.msghtml.hasOwnProperty('libacars') || msg.msghtml.hasOwnProperty('dsta') || msg.msghtml.hasOwnProperty('depa') ||
            msg.msghtml.hasOwnProperty('eta') || msg.msghtml.hasOwnProperty('gtout') || msg.msghtml.hasOwnProperty('gtin') ||
            msg.msghtml.hasOwnProperty('wloff') || msg.msghtml.hasOwnProperty('wlin') || msg.msghtml.hasOwnProperty('lat') ||
            msg.msghtml.hasOwnProperty('lon') || msg.msghtml.hasOwnProperty('alt'))) {

            if (msgs_received.length >= 50){
                msgs_received.shift()
            }            
            msgs_received.push(msg.msghtml);
        } else {
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

function increment_filtered() {
    id = document.getElementById("filteredmessages");
    id.innerHTML = "";
    filtered_messages++;
    txt = document.createTextNode(filtered_messages);
    id.appendChild(txt);
}

function increment_received() {
    id = document.getElementById("receivedmessages");
    id.innerHTML = "";
    received_messages++;
    txt = document.createTextNode(received_messages);
    id.appendChild(txt);
}

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

function filter_notext() {
    if(text_filter) {
        text_filter = false;
        id = document.getElementById("filter_notext");
        id.innerHTML = "";
        txt = document.createTextNode("Filter out \"No Text\" messages");
        id.appendChild(txt);
        Cookies.set('filter', 'false', { expires: 365 });
    } else {
        text_filter = true;

        id = document.getElementById("filter_notext");
        id.innerHTML = "";
        txt = document.createTextNode("Show \"No Text\" messages");
        id.appendChild(txt);
        Cookies.set('filter', 'true', { expires: 365 });
    }
}

