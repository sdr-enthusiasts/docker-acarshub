
var pause = false;
var socket;
var msgs_received = [];


$(document).ready(function(){
    //connect to the socket server.
    socket = io.connect('http://' + document.domain + ':' + location.port + '/test');

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
    msgs_string = '';
    for (var i = 0; i < msgs_received.length; i++){
        msgs_string = '<p>' + msgs_received[i].toString() + '</p>' + msgs_string;
    }
    $('#log').html(msgs_string);
}