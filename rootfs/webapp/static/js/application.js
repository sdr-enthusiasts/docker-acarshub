
$(document).ready(function(){
    //connect to the socket server.
    var socket = io.connect('ws://' + document.domain + ':' + location.port + '/test');
    var msgs_received = [];

    //receive details from server
    socket.on('newmsg', function(msg) {
        //console.log("Received msg" + msg.msghtml);
        console.log("Received msg");
        //maintain a list of 50 msgs
        if (msgs_received.length >= 50){
            msgs_received.shift()
        }            
        msgs_received.push(msg.msghtml);
        msgs_string = '';
        for (var i = 0; i < msgs_received.length; i++){
            msgs_string = '<p>' + msgs_received[i].toString() + '</p>' + msgs_string;
        }
        $('#log').html(msgs_string);
    });

    //noop
    socket.on('noop', function(noop) {
        console.log("Received noop");
    });

});