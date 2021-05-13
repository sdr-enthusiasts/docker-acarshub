var socket;
var acars_path = document.location.pathname.replace(
  /about|search|stats|status|alerts/gi,
  ""
);
acars_path += acars_path.endsWith("/") ? "" : "/";
var acars_url = document.location.origin + acars_path;

$(document).ready(function () {
  generate_menu();
  generate_footer();

  socket = io.connect(`${document.location.origin}/about`, {
    path: acars_path + "socket.io",
  });

  var converter = new showdown.Converter();
  fetch(`${acars_url}aboutmd`)
    .then((response) => response.text())
    .then((data) => {
      $("#log").html(converter.makeHtml(data));
    });

  socket.on("system_status", function (msg) {
    if (msg.status.error_state == true) {
      $("#system_status").html(
        `<a href="${acars_url}status">System Status: <span class="red_body">Error</a></span>`
      );
    } else {
      $("#system_status").html(
        `<a href="${acars_url}status">System Status: <span class="green">Okay</a></span>`
      );
    }
  });

  socket.on("disconnect", function () {
    connection_status();
  });

  socket.on("connect_error", function () {
    connection_status();
  });

  socket.on("connect_timeout", function () {
    connection_status();
  });

  socket.on("connect", function () {
    connection_status(true);
  });

  socket.on("reconnect", function () {
    connection_status(true);
  });
});
