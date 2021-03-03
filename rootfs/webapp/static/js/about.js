var socket;

$(document).ready(function(){
    generate_menu();
    generate_footer();

    socket = io.connect('http://' + document.domain + ':' + location.port + '/about');

    var converter = new showdown.Converter();
    fetch('http://' + document.domain + ':' + location.port + '/aboutmd')
      .then(response => response.text())
      .then((data) => {
        $('#log').html(converter.makeHtml(data));
      })

    socket.on('system_status', function(msg) {
      if(msg.status.error_state == true) {
          $('#system_status').html('<a href="/status">System Status: <span class="red">Error</a></span>');
      } else {
          $('#system_status').html('<a href="/status">System Status: <span class="green">Okay</a></span>');
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