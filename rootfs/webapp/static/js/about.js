var socket;
var acars_url = document.location.href.replace(/about|search|stats|status|alerts/gi, "") + (document.location.href.replace(/about|search|stats|status|alerts/gi, "").endsWith("/") ? "" : "/");

$(document).ready(function(){
    generate_menu();
    generate_footer();

    socket = io.connect(`${acars_url}about`, {
        'path': document.location.pathname.replace(/about|search|stats|status|alerts/gi, "") + 
               (document.location.pathname.replace(/about|search|stats|status|alerts/gi, "").endsWith("/") ? "" : "/") +
               'socket.io',
      });

    var converter = new showdown.Converter();
    fetch(`${acars_url}aboutmd`)
      .then(response => response.text())
      .then((data) => {
        $('#log').html(converter.makeHtml(data));
      })

    socket.on('system_status', function(msg) {
      if(msg.status.error_state == true) {
          $('#system_status').html(`<a href="${acars_url}status">System Status: <span class="red">Error</a></span>`);
      } else {
          $('#system_status').html(`<a href="${acars_url}status">System Status: <span class="green">Okay</a></span>`);
      }
    });

    socket.on('disconnect', function(msg) {
        connection_status();
    });

    socket.on('connect_error', function(msg) {
        connection_status();
    });

    socket.on('connect_timeout', function(msg) {
        connection_status();
    });

    socket.on('connect', function(msg) {
        connection_status(true);
    });

    socket.on('reconnect', function(msg) {
        connection_status(true);
    });
});