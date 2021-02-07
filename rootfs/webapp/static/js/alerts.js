var socket_alerts;

$(document).ready(function(){
    generate_menu();
    generate_footer();

    socket_alerts = io.connect('http://' + document.domain + ':' + location.port + '/alerts');

    // Set the text areas to the values saved in the cookies
    document.getElementById("alert_text").value = (Cookies.get("alert_text") === "undefined") ? "" : Cookies.get("alert_text");
    document.getElementById("alert_callsigns").value = (Cookies.get("alert_callsigns") === "undefined") ? "" : Cookies.get("alert_callsigns");
    document.getElementById("alert_tail").value = (Cookies.get("alert_tail") === "undefined") ? "" : Cookies.get("alert_tail");

    // Update the cookies so the expiration date pushes out in to the future
    Cookies.set('alert_text', document.getElementById("alert_text").value, { expires: 365 });
	Cookies.set('alert_callsigns', document.getElementById("alert_callsigns").value, { expires: 365 });
	Cookies.set('alert_tail', document.getElementById("alert_tail").value, { expires: 365 });
});

function updateAlerts() {
	Cookies.set('alert_text', document.getElementById("alert_text").value, { expires: 365 });
	Cookies.set('alert_callsigns', document.getElementById("alert_callsigns").value, { expires: 365 });
	Cookies.set('alert_tail', document.getElementById("alert_tail").value, { expires: 365 });
}