var socket;
var socket_alerts;
var image_prefix = "";
var acars_path = document.location.pathname.replace(
  /about|search|stats|status|alerts/gi,
  ""
);
acars_path += acars_path.endsWith("/") ? "" : "/";
var acars_url = document.location.origin + acars_path;

var chart_alerts;
var chart_signals;

$(document).ready(function () {
  generate_menu();
  generate_footer();
  updateAlertCounter();

  socket = io.connect(`${document.location.origin}/stats`, {
    path: acars_path + "socket.io",
  });

  socket.on("newmsg", function (msg) {
    generate_stat_submenu(msg.acars, msg.vdlm);
  });

  socket.on("signal", function (msg) {
    var input_labels = [];
    var input_data = [];

    // This float check is a hack and will discard good data. However, for reasons I don't understand
    // The database stores whole numbers not as the input float but as an int
    // This might be an artifact of any database that was running the old acarsdec (which used whole numbers only)
    // And the matching done for signal levels in the db write function...in any case, the graph should even out the
    // missing data points
    // The ultimate result here is that anyone who had run the old acarsdec would see massive spikes on whole numbers
    // that skews the graph significantly. Removing those values smooths the graph and is more representative of what
    // really has been received with the newer, better signal levels

    for (let i in msg.levels) {
      if (msg.levels[i].level != null && isFloat(msg.levels[i].level)) {
        input_labels.push(`${msg.levels[i].level}`);
        input_data.push(msg.levels[i].count);
      }
    }
    if (chart_signals) {
      chart_signals.destroy();
    }
    var ctx = document.getElementById("signallevels").getContext("2d");
    chart_signals = new Chart(ctx, {
      // The type of chart we want to create
      type: "line",

      // The data for our dataset
      data: {
        labels: input_labels,
        datasets: [
          {
            label: "Received Signal Levels",
            backgroundColor: "rgb(30, 255, 30)",
            borderColor: "rgb(0, 0, 0)",
            data: input_data,
            //pointRadius: 0,
            borderWidth: 1,
          },
        ],
      },

      // Configuration options go here
      options: {},
    });
  });

  socket.on("alert_terms", function (msg) {
    var labels = [];
    var alert_data = [];
    for (let i in msg.data) {
      // for now checking if count > 0 is a hack to get it to work
      // ideally, it should list out 0 term items
      if (msg.data[i].count > 0) {
        labels.push(msg.data[i].term);
        alert_data.push(msg.data[i].count);
      }
    }
    if (chart_alerts) {
      chart_alerts.destroy();
    }
    var ctx = document.getElementById("alertterms").getContext("2d");
    p = palette("tol", 12).map(function (hex) {
      return "#" + hex;
    });

    chart_alerts = new Chart(ctx, {
      // The type of chart we want to create
      type: "doughnut",

      // The data for our dataset
      data: {
        labels: labels,
        datasets: [
          {
            label: "Received Alert Terms",
            backgroundColor: p,
            //borderColor: 'rgb(0, 0, 0)',
            data: alert_data,
            //borderWidth: 1
          },
        ],
      },

      // Configuration options go here
      options: {},
    });
  });

  socket.on("freqs", function (msg) {
    var html = '<table class="search">';
    html +=
      '<thead><th><span class="menu_non_link">Frequency</span></th><th><span class="menu_non_link">Count</span></th><th><span class="menu_non_link">Type</span></th></thead>';
    for (let i = 0; i < msg.freqs.length; i++) {
      if (msg.freqs[i].freq_type == "ACARS")
        html += `<tr><td><span class=\"menu_non_link\">${msg.freqs[i].freq}</span></td><td><span class=\"menu_non_link\">${msg.freqs[i].count}</span></td><td><span class=\"menu_non_link\">${msg.freqs[i].freq_type}</span></td></tr>`;
    }

    for (let i = 0; i < msg.freqs.length; i++) {
      if (msg.freqs[i].freq_type == "VDL-M2")
        html += `<tr><td><span class=\"menu_non_link\">${msg.freqs[i].freq}</span></td><td><span class=\"menu_non_link\">${msg.freqs[i].count}</span></td><td><span class=\"menu_non_link\">${msg.freqs[i].freq_type}</span></td></tr>`;
    }

    html += "</table>";

    $("#freqs").html(html);
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

  socket.on("count", function (msg) {
    var error = msg.count[1];
    var total = msg.count[0] + msg.count[2] + msg.count[3];
    var good_msg = msg.count[0] - error;

    var empty_error = msg.count[3];
    var empty_good = msg.count[2];

    html = '<p><table class="search">';
    html += `<tr><td><span class="menu_non_link">Total Messages (All): </span></td><td><span class="menu_non_link">${total}</span></td><td></td></tr>`;
    html += `<tr><td><span class="menu_non_link">Messages (No Errors): </span></td><td><span class="menu_non_link">${good_msg}</span></td><td><span class="menu_non_link">${
      total ? parseFloat((good_msg / total) * 100).toFixed(2) + "%" : ""
    }</span></td></tr>`;
    html += `<tr><td><span class="menu_non_link">Messages (W/Errors): </span></td><td><span class="menu_non_link">${error}</span></td><td><span class="menu_non_link">${
      total ? parseFloat((error / total) * 100).toFixed(2) + "%" : ""
    }</span></td></tr>`;
    html += "</table></p>";
    html += '<table class="search">';
    html += `<tr><td><span class="menu_non_link">Empty Messages (Total): </span></td><td><span class="menu_non_link">${
      empty_good + empty_error
    }</span></td><td><span class="menu_non_link">${
      total
        ? parseFloat(((empty_good + empty_error) / total) * 100).toFixed(2) +
          "%"
        : ""
    }</span></td></tr>`;
    html += `<tr><td><span class="menu_non_link">Empty Messages (No Errors): </span></td><td><span class="menu_non_link">${empty_good}</span></td><td><span class="menu_non_link">${
      total ? parseFloat((empty_good / total) * 100).toFixed(2) + "%" : ""
    }</span></td></tr>`;
    html += `<tr><td><span class="menu_non_link">Empty Messages (W/Errors): </span></td><td><span class="menu_non_link">${empty_error}</span></td><td><span class="menu_non_link">${
      total ? parseFloat((empty_error / total) * 100).toFixed(2) + "%" : ""
    }</span></td></tr>`;
    html += "</table>";

    $("#msgs").html(html);
  });

  socket_alerts.on("disconnect", function () {
    connection_status();
  });

  socket_alerts.on("connect_error", function () {
    connection_status();
  });

  socket_alerts.on("connect_timeout", function () {
    connection_status();
  });

  socket_alerts.on("connect", function () {
    connection_status(true);
  });

  socket_alerts.on("reconnect", function () {
    connection_status(true);
  });

  grab_freqs();
  grab_message_count();
});

function isFloat(n) {
  return Number(n) === n && n % 1 !== 0;
}

setInterval(function () {
  grab_images();
  grab_freqs();
  grab_message_count();
  grab_updated_graphs();
}, 60000);

function update_prefix(prefix) {
  image_prefix = prefix;
  grab_images();
}

function grab_images() {
  var onehour = document.getElementById("1hr");
  onehour.src = `static/images/${image_prefix}1hour.png?rand=` + Math.random();

  var sixhours = document.getElementById("6hr");
  sixhours.src = `static/images/${image_prefix}6hour.png?rand=` + Math.random();

  var twelvehours = document.getElementById("12hr");
  twelvehours.src =
    `static/images/${image_prefix}12hour.png?rand=` + Math.random();

  var twentyfourhours = document.getElementById("24hr");
  twentyfourhours.src =
    `static/images/${image_prefix}24hours.png?rand=` + Math.random();

  var oneweek = document.getElementById("1wk");
  oneweek.src = `static/images/${image_prefix}1week.png?rand=` + Math.random();

  var thirtydays = document.getElementById("30day");
  thirtydays.src =
    `static/images/${image_prefix}30days.png?rand=` + Math.random();

  var sixmonths = document.getElementById("6mon");
  sixmonths.src =
    `static/images/${image_prefix}6months.png?rand=` + Math.random();

  var oneyear = document.getElementById("1yr");
  oneyear.src = `static/images/${image_prefix}1year.png?rand=` + Math.random();
}

function grab_freqs() {
  socket.emit("freqs", { freqs: true }, (namespace = "/stats"));
}

function grab_message_count() {
  socket.emit("count", { count: true }, (namespace = "/stats"));
}

function grab_updated_graphs() {
  socket.emit("graphs", { graphs: true }, (namespace = "/stats"));
}
