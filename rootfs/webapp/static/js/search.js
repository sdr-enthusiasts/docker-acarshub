var socket;
var current_search = '';
var current_page = 0;
var total_pages = 0;

$(document).ready(function(){
    //connect to the socket server.
    generate_menu();
    socket = io.connect('http://' + document.domain + ':' + location.port + '/search');
    var msgs_received = [];
    var num_results = [];

    //receive details from server

    socket.on('newmsg', function(msg) {
        //console.log("Received msg" + msg.msghtml);
        console.log("Received msg");
        console.log(msg);
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
        window.scrollTo(0, 0);
    });

    document.addEventListener("keyup", function(event) {
        var old_search = current_search;
        current_search = document.getElementById("search_term").value;
        var field = document.getElementById("dbfield").value;
        current_page = 0;
        if(current_search != '' && current_search != old_search)
            socket.emit('query', {'search_term': current_search, 'field': field}, namespace='/search');
        else if(current_search == '')
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

function jumppage() {
    page = document.getElementById("jump").value;
    if(page > total_pages){
        $('#error_message').html(`Please enter a value less than ${total_pages}`);
    } else
        runclick(parseInt(page)-1);
}


function display_search(html, current, total) {
    total_pages = 0;

    if(total == 0)
        return html + "<p>No results</p>";

    if(total % 20 != 0)
        total_pages = ~~(total / 20) + 1;
    else
        total_pages = ~~(total / 20);

    html += `<p>Found ${total} results in ${total_pages} pages.</p><p>`

    // Determine -/+ range. We want to show -/+ 5 pages from current index

    var low_end = 0;
    var high_end = current + 6;

    if(current > 5)
        low_end = current - 5;

    if(high_end > total_pages)
        high_end = total_pages

    if(low_end > 0) {
        if(low_end > 5)
            html += `<a href=\"#\" id=\"search_page\" onclick=\"runclick(${low_end - 5})\"><<</a>`
        else
            html += `<a href=\"#\" id=\"search_page\" onclick=\"runclick(0)\"><<</a>`
    }

    for(var i = low_end; i < high_end; i++) {
        if(i == current) {
            html += `${i+1} `;
        }
        else {
            html += `<a href=\"#\" id=\"search_page\" onclick=\"runclick(${i})\">${i+1}</a> `;
        }
    }

    if(high_end != total_pages) {
        if(high_end + 5 < total_pages)
            html += `<a href=\"#\" id=\"search_page\" onclick=\"runclick(${high_end + 4})\">>></a>`;
        else
            html += `<a href=\"#\" id=\"search_page\" onclick=\"runclick(${high_end}\")>>></a>`;
    }

    if(total_pages > 5) {
        html += "<p><form><label>Jump to page: </label> <input type=\"text\" id=\"jump\"><p></form>";
        html += "<a href=\"javascript:void(0);\" id=\"jump_page\" onclick=\"jumppage()\">Submit</a>";
        html += "<div id=\"error_message\"></div>";
    }

    return html;
}