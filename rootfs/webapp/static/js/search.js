var socket;
var current_search = '';
var current_page = 0;

$(document).ready(function(){
    //connect to the socket server.
    socket = io.connect('http://' + document.domain + ':' + location.port + '/search');
    var msgs_received = [];
    var num_results = [];

    //receive details from server

    socket.on('newmsg', function(msg) {
        //console.log("Received msg" + msg.msghtml);
        console.log("Received msg");
        //maintain a list of 1 msgs
        if (msgs_received.length >= 1){
            msgs_received.shift();
        }
        if (num_results.length >= 1) {
            num_results.shift();
        }
        // Lets check and see if the results match the current search string
        var display = '';
        if(msg.search_term == current_search) {            
            msgs_received.push(msg.msghtml);
            num_results.push(msg.num_results);
            for (var i = 0; i < msgs_received.length; i++){
                display = display_messages(msgs_received[i], true);
                display = display_search(display, current_page, num_results[i]);
                //msgs_string = '<p>' + msgs_received[i].toString() + '</p>' + msgs_string;
            }
        }
        $('#log').html(display);
    });

    document.addEventListener("keyup", function(event) {
        current_search = document.getElementById("search_term").value;
        var field = document.getElementById("dbfield").value;
        current_page = 0;
        if(current_search != '')
            socket.emit('query', {'search_term': current_search, 'field': field}, namespace='/search');
        else
            $('#log').html('');
    });

    //noop
    socket.on('noop', function(noop) {
        console.log("Received noop");
    });
});


function runclick(page) {
    console.log("updating page");
    current_page = page;
    current_search = document.getElementById("search_term").value;
    var field = document.getElementById("dbfield").value;
    socket.emit('query', {'search_term': current_search, 'field': field, 'results_after': page}, namespace='/search')
}


function display_search(html, current, total) {
    var total_pages = 0;

    if(total == 0)
        return html + "<p>No results</p>";
    else
        html += `<p>Found ${total} results.</p><p>`

    if(total % 20 != 0)
        total_pages = ~~(total / 20) + 1;
    else
        total_pages = ~~(total / 20);

    for(var i = 0; i < total_pages; i++) {
        if(i == current) {
            html += `${i+1} `;
        }
        else {
            html += `<a href=\"#\" id=\"search_page\" onclick=\"runclick(${i})\">${i+1}</a> `;
        }
    }

    return html;
}