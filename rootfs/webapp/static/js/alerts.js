var socket_alerts;
var alerts = 0;
var alert_text = [];
var alert_callsigns = [];
var alert_tail = [];
var alert_icao = [];
var msgs_received = [];

msgs_received.unshift = function () {
    if (this.length >= 50) {
        this.pop();
    }
    return Array.prototype.unshift.apply(this,arguments);
}

$(document).ready(function(){
    generate_menu();
    generate_footer();

    socket_alerts = io.connect('http://' + document.domain + ':' + location.port + '/alerts');

    alerts = Cookies.get("alert_unread") ? Number(Cookies.get("alert_unread")) : 0;

    // Update the cookies so the expiration date pushes out in to the future
    onInit();

    if(document.location.pathname == "/alerts") {
        Cookies.set('alert_unread', 0, { expires: 365 });
        // Set the text areas to the values saved in the cookies
        document.getElementById("alert_text").value = Cookies.get("alert_text") ? Cookies.get("alert_text") : "";
        document.getElementById("alert_callsigns").value = Cookies.get("alert_callsigns") ? Cookies.get("alert_callsigns") : "";
        document.getElementById("alert_tail").value = Cookies.get("alert_tail") ? Cookies.get("alert_tail") : "";
        document.getElementById("alert_icao").value = Cookies.get("alert_icao") ? Cookies.get("alert_icao") : "";

        socket_alerts.on('newmsg', function(msg) {
            if(match_alert(msg)) {
                msgs_received.unshift([msg.msghtml]);
                $('#log').html(display_messages(msgs_received));
            }
        });
    } else if(document.location.pathname != "/") {
        alerts -= 1;
        updateAlertCounter();
        socket_alerts.on('newmsg', function(msg) {
            if(match_alert(msg)) {
                updateAlertCounter();
            }
        });
    } else {
        Cookies.set('alert_unread', 0, { expires: 365 });
    }
});

function updateAlertCounter() {
    alerts += 1;
    console.log(document.getElementById("alert_count"));
    $('#alert_count').html(` <span class="red">(${alerts})</span>`);
    //var txt = document.createTextNode();
    //id.appendChild(txt);
    console.log("end");
    Cookies.set('alert_unread', alerts, { expires: 365 });
}

function updateAlerts() {
    if(document.getElementById("alert_text").value.length > 0) {
        var split = document.getElementById("alert_text").value.split(",");
        alert_text = [];
        for(var i = 0; i < split.length; i++) {
            alert_text.push(split[i].trim());
        }
    } else {
        alert_text = [];
    }

    if(document.getElementById("alert_callsigns").value.length > 0) {
        var split = document.getElementById("alert_callsigns").value.split(",");
        alert_callsigns = [];
        for(var i = 0; i < split.length; i++) {
            alert_callsigns.push(split[i].trim());
        }
    } else {
        alert_callsigns = [];
    }

    if(document.getElementById("alert_tail").value.length > 0) {
        var split = document.getElementById("alert_tail").value.split(",");
        alert_tail = [];
        for(var i = 0; i < split.length; i++) {
            alert_tail.push(split[i].trim());
        }
    } else {
        alert_tail = [];
    }

    if(document.getElementById("alert_icao").value.length > 0) {
        var split = document.getElementById("alert_icao").value.split(",");
        alert_icao = [];
        for(var i = 0; i < split.length; i++) {
            alert_icao.push(split[i].trim());
        }
    } else {
        alert_icao = [];
    }

    Cookies.set('alert_text', combineArray(alert_text), { expires: 365 });
    Cookies.set('alert_callsigns', combineArray(alert_callsigns), { expires: 365 });
    Cookies.set('alert_tail', combineArray(alert_tail), { expires: 365 });
    Cookies.set('alert_icao', combineArray(alert_icao), { expires: 365 });
}

function onInit() {
    if(Cookies.get("alert_text") ? Cookies.get("alert_text") : "" > 0) {
        var split = Cookies.get("alert_text").split(",");
        for(var i = 0; i < split.length; i++) {
            alert_text.push(split[i]);
        }
    } else {
        alert_text = [];
    }

    if(Cookies.get("alert_callsigns") ? Cookies.get("alert_callsigns") : "" > 0) {
        var split = Cookies.get("alert_callsigns").split(",");
        for(var i = 0; i < split.length; i++) {
            alert_callsigns.push(split[i]);
        }
    } else {
        alert_callsigns = [];
    }

    if(Cookies.get("alert_tail") ? Cookies.get("alert_tail") : "" > 0) {
        var split = Cookies.get("alert_tail").split(",");
        for(var i = 0; i < split.length; i++) {
            alert_tail.push(split[i]);
        }
    } else {
        alert_tail = [];
    }

    if(Cookies.get("alert_icao") ? Cookies.get("alert_icao") : "" > 0) {
        var split = Cookies.get("alert_tail").split(",");
        for(var i = 0; i < split.length; i++) {
            alert_icao.push(split[i]);
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
        if(i != 0) {
            output += "," + input[i];
        } else {
            output = input[i];
        }
    }

    return output;
}

function match_alert(msg) {
    var found = false;
    if(msg.msghtml.hasOwnProperty('text')) {
        for(var i = 0; i < alert_text.length; i++) {
            console.log(alert_text[i]);
            if(msg.msghtml.text.toUpperCase().includes(alert_text[i].toUpperCase())) {
                found = true;
                i = alert_text.length;
            }
        }
    }

    if(!found && msg.msghtml.hasOwnProperty('flight')) {
        for(var i = 0; i < alert_callsigns.length; i++) {
            if(msg.msghtml.flight.toUpperCase().includes(alert_callsigns[i].toUpperCase())) {
                found = true;
                i = alert_callsigns.length;
            }
        }
    }

    if(!found && msg.msghtml.hasOwnProperty('tail')) {
        for(var i = 0; i < alert_tail.length; i++) {
            if(msg.msghtml.tail.toUpperCase().includes(alert_callsigns[i].toUpperCase())) {
                found = true;
                i = alert_tail.length;
            }
        }
    }

    return found;
}