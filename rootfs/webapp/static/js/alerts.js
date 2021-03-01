var socket_alerts;
var alerts = 0;
var alert_text = [];
var alert_callsigns = [];
var alert_tail = [];
var alert_icao = [];
var msgs_received = [];

var default_text_values = ['cop', 'police', 'authorities', 'chop', 'turbulence', 'turb', 'fault', 'divert', 'mask', 'csr', 'agent', 'medical', 'security', 'mayday', 'emergency', 'pan', 'red coat']

msgs_received.unshift = function () {
    if (this.length >= 50) {
        this.pop();
    }
    return Array.prototype.unshift.apply(this,arguments);
}

$(document).ready(function() {
    socket_alerts = io.connect('http://' + document.domain + ':' + location.port + '/alerts');

    alerts = Cookies.get("alert_unread") ? Number(Cookies.get("alert_unread")) : 0;

    // Update the cookies so the expiration date pushes out in to the future
    onInit();

    if(document.location.pathname == "/alerts") {
        generate_menu();
        generate_footer();
        Cookies.set('alert_unread', 0, { expires: 365 });
        // Set the text areas to the values saved in the cookies
        document.getElementById("alert_text").value = Cookies.get("alert_text") ? Cookies.get("alert_text") : "";
        document.getElementById("alert_callsigns").value = Cookies.get("alert_callsigns") ? Cookies.get("alert_callsigns") : "";
        document.getElementById("alert_tail").value = Cookies.get("alert_tail") ? Cookies.get("alert_tail") : "";
        document.getElementById("alert_icao").value = Cookies.get("alert_icao") ? Cookies.get("alert_icao") : "";

        socket_alerts.emit('query', {'icao': alert_icao.length > 0 ? alert_icao : null, 'text': alert_text.length > 0 ? alert_text : null,
                              'flight': alert_callsigns.length > 0 ? alert_callsigns : null, 'tail': alert_tail.length > 0 ? alert_tail : null}, '/alerts');

        socket_alerts.on('newmsg', function(msg) {
            var matched = match_alert(msg);
            if(matched.was_found) {
                msg.msghtml.matched_text = matched.text;
                msg.msghtml.matched_icao = matched.icao;
                msg.msghtml.matched_flight = matched.flight;
                msg.msghtml.matched_tail = matched.tail;
                msgs_received.unshift([msg.msghtml]);
                $('#log').html(display_messages(msgs_received));
            }
        });

        socket_alerts.on('system_status', function(msg) {
            if(msg.status.error_state == true) {
                $('#system_status').html('<a href="/status">System Status: <span class="red">Error</span>');
            } else {
                $('#system_status').html('<a href="/status">System Status: <span class="green">Okay</a></span>');
            }
        });
    } else if(document.location.pathname != "/") {
        socket_alerts.on('newmsg', function(msg) {
            var matched = match_alert(msg);
            if(matched.was_found) {
                alerts += 1;
                updateAlertCounter();
            }
        });
    } else {
        Cookies.set('alert_unread', 0, { expires: 365 });
    }
});

function updateAlertCounter() {
    if(alerts)
        $('#alert_count').html(` <span class="red">(${alerts})</span>`);
    Cookies.set('alert_unread', alerts, { expires: 365 });
}

function updateAlerts() {
    if(document.getElementById("alert_text").value.length > 0) {
        var split = document.getElementById("alert_text").value.split(",");
        alert_text = [];
        for(var i = 0; i < split.length; i++) {
            alert_text.push(split[i].trim().toUpperCase());
        }
    } else {
        alert_text = [];
    }

    if(document.getElementById("alert_callsigns").value.length > 0) {
        var split = document.getElementById("alert_callsigns").value.split(",");
        alert_callsigns = [];
        for(var i = 0; i < split.length; i++) {
            alert_callsigns.push(split[i].trim().toUpperCase());
        }
    } else {
        alert_callsigns = [];
    }

    if(document.getElementById("alert_tail").value.length > 0) {
        var split = document.getElementById("alert_tail").value.split(",");
        alert_tail = [];
        for(var i = 0; i < split.length; i++) {
            alert_tail.push(split[i].trim().toUpperCase());
        }
    } else {
        alert_tail = [];
    }

    if(document.getElementById("alert_icao").value.length > 0) {
        var split = document.getElementById("alert_icao").value.split(",");
        alert_icao = [];
        for(var i = 0; i < split.length; i++) {
            alert_icao.push(split[i].trim().toUpperCase());
        }
    } else {
        alert_icao = [];
    }

    document.getElementById("alert_text").value = document.getElementById("alert_text").value.toUpperCase();
    document.getElementById("alert_callsigns").value = document.getElementById("alert_callsigns").value.toUpperCase();
    document.getElementById("alert_tail").value = document.getElementById("alert_tail").value.toUpperCase();
    document.getElementById("alert_icao").value = document.getElementById("alert_icao").value.toUpperCase();

    Cookies.set('alert_text', combineArray(alert_text), { expires: 365 });
    Cookies.set('alert_callsigns', combineArray(alert_callsigns), { expires: 365 });
    Cookies.set('alert_tail', combineArray(alert_tail), { expires: 365 });
    Cookies.set('alert_icao', combineArray(alert_icao), { expires: 365 });
}

function onInit() {
    if(Cookies.get("alert_text") ? Cookies.get("alert_text") : "" > 0) {
        var split = Cookies.get("alert_text").split(",");
        for(var i = 0; i < split.length; i++) {
            alert_text.push(split[i].toUpperCase());
        }
    } else {
        alert_text = [];
    }

    if(Cookies.get("alert_callsigns") ? Cookies.get("alert_callsigns") : "" > 0) {
        var split = Cookies.get("alert_callsigns").split(",");
        for(var i = 0; i < split.length; i++) {
            alert_callsigns.push(split[i].toUpperCase());
        }
    } else {
        alert_callsigns = [];
    }

    if(Cookies.get("alert_tail") ? Cookies.get("alert_tail") : "" > 0) {
        var split = Cookies.get("alert_tail").split(",");
        for(var i = 0; i < split.length; i++) {
            alert_tail.push(split[i].toUpperCase());
        }
    } else {
        alert_tail = [];
    }

    if(Cookies.get("alert_icao") ? Cookies.get("alert_icao") : "" > 0) {
        var split = Cookies.get("alert_icao").split(",");
        for(var i = 0; i < split.length; i++) {
            alert_icao.push(split[i].toUpperCase());
        }
    } else {
        alert_icao = [];
    }

    Cookies.set('alert_text', combineArray(alert_text), { expires: 365 });
    Cookies.set('alert_callsigns', combineArray(alert_callsigns), { expires: 365 });
    Cookies.set('alert_tail', combineArray(alert_tail), { expires: 365 });
    Cookies.set('alert_icao', combineArray(alert_icao), { expires: 365 });
}

function combineArray(input) {
    var output = "";

    for(var i = 0; i < input.length; i++) {
        output += `${i != 0 ? "," + input[i] : input[i]}`;
    }

    return output;
}

function match_alert(msg) {
    var found = false;
    var matched_tail = [];
    var matched_flight = [];
    var matched_icao = [];
    var matched_text = [];

    if(msg.msghtml.hasOwnProperty('text')) {
        for(var i = 0; i < alert_text.length; i++) {
            if(msg.msghtml.text.toUpperCase().includes(alert_text[i].toUpperCase())) {
                found = true;
                matched_text.push(alert_text[i]);
            }
        }
    }

    if(msg.msghtml.hasOwnProperty('flight')) {
        for(var i = 0; i < alert_callsigns.length; i++) {
            if(msg.msghtml.flight.toUpperCase().includes(alert_callsigns[i].toUpperCase())) {
                found = true;
                matched_flight.push(alert_callsigns[i]);
            }
        }
    }

    if(msg.msghtml.hasOwnProperty('tail')) {
        for(var i = 0; i < alert_tail.length; i++) {
            if(msg.msghtml.tail.toUpperCase().includes(alert_tail[i].toUpperCase())) {
                found = true;
                matched_tail.push(alert_tail[i]);
            }
        }
    }

    if(msg.msghtml.hasOwnProperty('icao')) {
        for(var i = 0; i < alert_icao.length; i++) {
            if(msg.msghtml.icao.toString().toUpperCase().includes(alert_icao[i].toUpperCase()) || (
                msg.msghtml.hasOwnProperty('icao_hex') &&
                msg.msghtml.icao_hex.toUpperCase().includes(alert_icao[i].toUpperCase()))) {
                found = true;
                matched_icao.push(alert_icao[i]);
            }
        }
    }

    return {
        was_found: found,
        text: matched_text.length > 0 ? matched_text : null,
        icao: matched_icao.length > 0 ? matched_icao : null,
        flight: matched_flight.length > 0 ? matched_flight : null,
        tail: matched_tail.length > 0 ? matched_tail : null,
    };
}

function default_alert_values() {
    var current = document.getElementById("alert_text").value;

    default_text_values.forEach(element => {
        if(!alert_text.includes(element.toUpperCase)) {
            current += `${current.length > 0 ? "," + element : element}`;
        }
    });
    document.getElementById("alert_text").value = current;
    updateAlerts();
}