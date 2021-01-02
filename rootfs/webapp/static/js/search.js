var socket;

$(document).ready(function(){
    //connect to the socket server.
    socket = io.connect('http://' + document.domain + ':' + location.port + '/search');
    var msgs_received = [];

    //receive details from server
    // Maintain only the most recent search results
    // Server sends it as a huge blob

    socket.on('newmsg', function(msg) {
        //console.log("Received msg" + msg.msghtml);
        console.log("Received msg");
        //maintain a list of 1 msgs
        if (msgs_received.length >= 1){
            msgs_received.shift()
        }            
        msgs_received.push(msg.msghtml);
        msgs_string = '';
        for (var i = 0; i < msgs_received.length; i++){
            msgs_string = '<p>' + msgs_received[i].toString() + '</p>' + msgs_string;
        }
        $('#log').html(msgs_string);
    });

    document.addEventListener("keyup", function(event) {
        var search_term = document.getElementById("search_term").value;
        var field = document.getElementById("dbfield").value;
        socket.emit('query', {'search_term': search_term, 'field': field}, namespace='/search')
    });

    //noop
    socket.on('noop', function(noop) {
        console.log("Received noop");
    });
});

function runclick(page) {
    console.log("updating page");
    var search_term = document.getElementById("search_term").value;
    var field = document.getElementById("dbfield").value;
    socket.emit('query', {'search_term': search_term, 'field': field, 'results_after': page}, namespace='/search')
}