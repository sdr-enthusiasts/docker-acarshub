var socket;
var acars_url = document.location.href.replace(/about|search|stats|status|alerts/gi, "") + (document.location.href.replace(/about|search|stats|status|alerts/gi, "").endsWith("/") ? "" : "/");

$(document).ready(function(){
    generate_menu();
    generate_footer();

    socket = io.connect(`${acars_url}status`, {
      'path': document.location.pathname.replace(/about|search|stats|status|alerts/gi, "") + 
             (document.location.pathname.replace(/about|search|stats|status|alerts/gi, "").endsWith("/") ? "" : "/") +
             'socket.io',
    });

    socket.on('system_status', function(msg) {
      if(msg.status.error_state == true) {
          $('#system_status').html(`<a href="${acars_url}status">System Status: <span class="red">Error</a></span>`);
      } else {
          $('#system_status').html(`<a href="${acars_url}status">System Status: <span class="green">Okay</a></span>`);
      }

      $('#log').html(decode_status(msg.status.error_state, msg.status.decoders, msg.status.servers, msg.status.feeders, msg.status.global, msg.status.stats));
  });

  socket_alerts.on('disconnect', function() {
    connection_status();
  });
  
  socket_alerts.on('connect_error', function() {
      connection_status();
  });

  socket_alerts.on('connect_timeout', function() {
      connection_status();
  });

  socket_alerts.on('connect', function() {
      connection_status(true);
  });

  socket_alerts.on('reconnect', function() {
      connection_status(true);
  });
});

function decode_status(status, decoders, servers, feeders, receivers, stats) {
  var html_output = "<h2>ACARS Hub System Status</h2>";
  const keys_decoder = Object.keys(decoders);
  const keys_servers = Object.keys(servers);
  const keys_receivers = Object.keys(receivers);
  const keys_feeders = Object.keys(feeders);
  const keys_stats = Object.keys(stats);

  html_output += '<span class="monofont">';
  html_output += "System:".padEnd(55,'.');
  if(status) {
    html_output += '<strong><span class="red">DEGRADED</span></strong>';
  } else {
    html_output += '<strong><span class="green">Ok</span></strong>';
  }
  html_output += '<br>';

  keys_decoder.forEach((key, index) => {
    var sub_string = `SDR ${key}:`;
    html_output += `${sub_string.padEnd(55,'.')}<strong><span class=${decoders[key].Status == "Ok" ? "green" : "red"}>${decoders[key].Status}</span></strong>`;
    html_output += '<br>';
  });

  keys_servers.forEach((key, index) => {
    var sub_string = `Internal Server ${key}:`;
    html_output += `${sub_string.padEnd(55,'.')}<strong><span class=${servers[key].Status == "Ok" ? "green" : "red"}>${servers[key].Status}</span></strong>`;
    html_output += '<br>';
    sub_string = `Internal Server ${key} to Python Connecton:`;
    html_output += `${sub_string.padEnd(55,'.')}<strong><span class=${servers[key].Web == "Ok" ? "green" : "red"}>${servers[key].Web}</span></strong>`;
    html_output += '<br>';
  });

  keys_stats.forEach((key, index) => {
    var sub_string = `Internal Stat Server ${key}:`;
    html_output += `${sub_string.padEnd(55,'.')}<strong><span class=${stats[key].Status == "Ok" ? "green" : "red"}>${stats[key].Status}</span></strong>`;
    html_output += '<br>';
  });

  keys_feeders.forEach((key, index) => {
    var sub_string = `Airframes.io Feeders ${key}:`;
    html_output += `${sub_string.padEnd(55,'.')}<strong><span class=${feeders[key].Status == "Ok" ? "green" : "red"}>${feeders[key].Status}</span></strong>`;
    html_output += '<br>';
  });

  keys_receivers.forEach((key, index) => {
    var sub_string = `${key} Receiving Messages:`;
    var class_string = "";
    if(receivers[key].Status == "Ok")
      class_string = '"green"';
    else
      class_string = receivers[key].Status == "Bad" ? "red" : "orange";

    html_output += `${sub_string.padEnd(55,'.')}<strong><span class=${class_string}>${receivers[key].Status}</span></strong>`;
    html_output += '<br>';
  });

  html_output += '</span>';

  return html_output;
}