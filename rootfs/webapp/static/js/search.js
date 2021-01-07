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
        //maintain a list of 1 msgs
        if (msgs_received.length >= 1){
            msgs_received.shift();
        }
        if (num_results.length >= 1) {
            num_results.shift();
        }
        // Lets check and see if the results match the current search string
        var display = '';
        var display_nav_results = '';
        if(msg.search_term == current_search) {            
            msgs_received.push(msg.msghtml);
            num_results.push(msg.num_results);
            for (var i = 0; i < msgs_received.length; i++){
                display = display_messages(msgs_received[i], true);
                display_nav_results = display_search(current_page, num_results[i]);
                //msgs_string = '<p>' + msgs_received[i].toString() + '</p>' + msgs_string;
            }
        }
        $('#log').html(display);
        console.log(display_nav_results);
        $('#num_results').html(display_nav_results);
        window.scrollTo(0, 0);
    });

    document.addEventListener("keyup", function(event) {
        var old_search = current_search;
        current_search = document.getElementById("search_term").value;
        var field = document.getElementById("dbfield").value;
        if(current_search != '' && current_search != old_search) {
            current_page = 0;
            socket.emit('query', {'search_term': current_search, 'field': field}, namespace='/search');
        } else if(current_search == '') {
            $('#log').html('');
        }
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


function display_search(current, total) {
    html = '';
    total_pages = 0;

    if(total == 0)
        return html + "No results";

    if(total % 20 != 0)
        total_pages = ~~(total / 20) + 1;
    else
        total_pages = ~~(total / 20);

    html += '<table class="search"><thead><th class="search_label"></th><th class="search_term"></th></thead>';
    html += `<tr><td colspan="2">Found ${total} results in ${total_pages} pages.</td></tr>`;

    // Determine -/+ range. We want to show -/+ 5 pages from current index

    var low_end = 0;
    var high_end = current + 6;

    if(current > 5)
        low_end = current - 5;

    if(high_end > total_pages)
        high_end = total_pages;

    if(total_pages != 1) {
        html += "<tr><td colspan=\"2\">";

        if(low_end > 0) {
            if(low_end > 5)
                html += `<a href=\"#\" id=\"search_page\" onclick=\"runclick(${low_end - 5})\"><< </a>`;
            else
                html += `<a href=\"#\" id=\"search_page\" onclick=\"runclick(0)\"><< </a>`;
        }

        for(var i = low_end; i < high_end; i++) {
            if(i == current) {
                html += ` ${i+1} `;
            }
            else {
                html += ` <a href=\"#\" id=\"search_page\" onclick=\"runclick(${i})\">${i+1}</a> `;
            }
        }

        if(high_end != total_pages) {
            if(high_end + 5 < total_pages)
                html += `<a href=\"#\" id=\"search_page\" onclick=\"runclick(${high_end + 4})\" >>></a>`;
            else
                html += `<a href=\"#\" id=\"search_page\" onclick=\"runclick(${high_end}\")> >></a>`;
        }
    }

    if(total_pages > 5) {
        html += "</td></tr><tr><td class=\"search_label\"><label>Jump to page:</label></td><td class=\"search_term\"><input type=\"text\" id=\"jump\"><p></td></tr>";
        html += "<tr><td class=\"search_label\"></td><td class=search_term><a href=\"#\" onclick=\"jumppage()\">Run Search</a></td></tr></table>"
        html += "<div id=\"error_message\"></div>";
    } else {
        html += "</td></tr></table>";
        html += "<div id=\"error_message\"></div>";
    }

    return html;
}