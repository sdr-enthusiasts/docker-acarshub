var socket;
var current_search = '';
var current_page = 0;
var total_pages = 0;
var show_all = false;

import { MessageDecoder } from '../airframes-acars-decoder/MessageDecoder.js'
const md = new MessageDecoder();

$(document).ready(function(){
    //connect to the socket server.
    generate_menu();
    generate_footer();
    socket = io.connect('http://' + document.domain + ':' + location.port + '/search');
    var msgs_received = [];
    var num_results = [];

    //receive details from server

    socket.on('database', function(msg) {
        $('#database').html(String(msg.count).trim() + " rows");
        if(parseInt(msg.size) > 0){
            $('#size').html(formatSizeUnits(parseInt(msg.size)));
        } else {
            $('#size').html("Error getting DB size");
        }
    });

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

        var results = [];

        if(msg.search_term == current_search || show_all) {            
            msgs_received.push(msg.msghtml);
            num_results.push(msg.num_results);
            for (var i = 0; i < msgs_received.length; i++){
                for(var j = 0; j < msgs_received[i].length; j++) {
                    var msg_json = JSON.parse(msgs_received[i][j]);
                    var decoded_msg = md.decode(msg_json);
                    if(decoded_msg.decoded == true) {
                        msg_json.decodedText = decoded_msg;
                    }
                    results.push([msg_json]);
                }
                display = display_messages(results);
                display_nav_results = display_search(current_page, num_results[i]);
                $('#log').html(display);
                $('#num_results').html(display_nav_results);
                window.scrollTo(0, 0);
                //msgs_string = '<p>' + msgs_received[i].toString() + '</p>' + msgs_string;
            }
        }
    });

    document.addEventListener("keyup", function(event) {
        if(current_search != document.getElementById("search_term").value)
            delay_query(document.getElementById("search_term").value);
    });

    //noop
    socket.on('noop', function(noop) {
        console.log("Received noop");
    });
});

// In order to help DB responsiveness, I want to make sure the user has quit typing before emitting a query
// We'll do this by recording the state of the DB search text field, waiting half a second (might could make this less)
// I chose 500ms for the delay because it seems like a reasonable compromise for fast/slow typers
// Once delay is met, compare the previous text field with the current text field. If they are the same, we'll send a query out

async function delay_query(initial_query) {
    await sleep(500);
    var old_search = current_search;
    if(initial_query == document.getElementById("search_term").value) {
        current_search = document.getElementById("search_term").value;
        var field = document.getElementById("dbfield").value;
        if(current_search != '' && current_search != old_search) {
            current_page = 0;
            show_all = false;
            console.log("sending query");
            $('#log').html('Searching...');
            $('#num_results').html('');
            socket.emit('query', {'search_term': current_search, 'field': field}, '/search');
        } else if(current_search == '') {
            show_all = false;
            $('#log').html('');
            $('#num_results').html('');
        }
    }
}

window.showall = function() {
    socket.emit('query', {'show_all': true}, "/search");
    $('#log').html('Updating...');
    $('#num_results').html('');
    const search_box = document.getElementById('search_term');
    search_box.value = "";
    current_page = 0;
    show_all = true;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

window.runclick = function(page) {
    console.log("updating page");
    current_page = page;
    current_search = document.getElementById("search_term").value;
    var field = document.getElementById("dbfield").value;
    if(current_search != '' || show_all) {
        $('#log').html('Updating results....');
        $('#num_results').html('');
        if(!show_all) {
            socket.emit('query', {'search_term': current_search, 'field': field, 'results_after': page}, '/search');
        } else {
            socket.emit('query', {'show_all': true, 'results_after': page}, '/search');
        }
    }
}

window.jumppage = function() {
    var page = document.getElementById("jump").value;
    if(page > total_pages){
        $('#error_message').html(`Please enter a value less than ${total_pages}`);
    } else if(page != 0) {
        runclick(parseInt(page)-1);
    }
}


function display_search(current, total) {
    html = '';
    total_pages = 0;

    if(total == 0)
        return html + '<span class="menu_non_link">No results</span>';

    if(total % 50 != 0)
        total_pages = ~~(total / 50) + 1;
    else
        total_pages = ~~(total / 50);

    html += '<table class="search"><thead><th class="search_label"></th><th class="search_term"></th></thead>';
    html += `<tr><td colspan="2"><span class="menu_non_link">Found <strong>${total}</strong> result(s) in <strong>${total_pages}</strong> page(s).</span></td></tr>`;

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
                html += ` <span class="menu_non_link"><strong>${i+1}</strong></span> `;
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
        html += "</td></tr><tr><td class=\"search_label\"><label>Page:</label></td><td class=\"search_term\"><input type=\"text\" id=\"jump\"><p></td></tr>";
        html += "<tr><td class=\"search_label\"></td><td class=search_term><a href=\"#\" onclick=\"jumppage()\">Jump to page</a></td></tr></table>"
        html += "<div id=\"error_message\"></div></div>";
    } else {
        html += "</td></tr></table>";
        html += "<div id=\"error_message\"></div></div>";
    }

    return html;
}

function formatSizeUnits(bytes){
  if      (bytes >= 1073741824) { bytes = (bytes / 1073741824).toFixed(2) + " GB"; }
  else if (bytes >= 1048576)    { bytes = (bytes / 1048576).toFixed(2) + " MB"; }
  else if (bytes >= 1024)       { bytes = (bytes / 1024).toFixed(2) + " KB"; }
  else if (bytes > 1)           { bytes = bytes + " bytes"; }
  else if (bytes == 1)          { bytes = bytes + " byte"; }
  else                          { bytes = "0 bytes"; }
  return bytes;
}