var socket;

$(document).ready(function(){
    generate_menu();
    generate_footer();

    socket = io.connect('http://' + document.domain + ':' + location.port + '/about');

      socket.on('system_status', function(msg) {
        if(msg.status.error_state == true) {
            $('#system_status').html('<a href="/status">System Status: <span class="red">Error</a></span>');
        } else {
            $('#system_status').html('<a href="/status">System Status: <span class="green">Okay</a></span>');
        }

        $('#log').html(decode_status(msg.status.error_state, msg.status.decoders, msg.status.servers, msg.status.feeders, msg.status.global));
    });
});

function decode_status(status, decoders, servers, feeders, receivers) {
  var html_output = "<h2>ACARS Hub System Status</h2>";
  const keys_decoder = Object.keys(decoders);
  const keys_servers = Object.keys(servers);
  const keys_receivers = Object.keys(receivers);
  const keys_feeders = Object.keys(feeders);

  html_output += '<span class="monofont">';
  html_output += "System:".padEnd(55,'.');
  if(status) {
    html_output += '<strong><span class="red">ERRORS</span></strong>';
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

  keys_feeders.forEach((key, index) => {
    var sub_string = `Airframes.io Feeders ${key}:`;
    html_output += `${sub_string.padEnd(55,'.')}<strong><span class=${feeders[key].Status == "Ok" ? "green" : "red"}>${feeders[key].Status}</span></strong>`;
    html_output += '<br>';
  });

  keys_receivers.forEach((key, index) => {
    var sub_string = `${key} Receiving Messages:`;
    html_output += `${sub_string.padEnd(55,'.')}<strong><span class=${receivers[key].Status == "Ok" ? "green" : "red"}>${receivers[key].Status}</span></strong>`;
    html_output += '<br>';
  });

  html_output += '</span>';

  return html_output;
}