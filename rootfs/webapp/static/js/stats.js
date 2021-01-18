
var image_prefix = '';
$(document).ready(function(){
	generate_menu();

	socket = io.connect('http://' + document.domain + ':' + location.port + '/stats');
	socket.on('newmsg', function(msg) {
		console.log("message received");
		generate_stat_submenu(msg.acars, msg.vdlm);
	});

	socket.on('freqs', function(msg) {
		var html = "<table class=\"search\">";
		html += "<thead><th><span class=\"menu_non_link\">Frequency</span></th><th><span class=\"menu_non_link\">Count</span></th><th><span class=\"menu_non_link\">Type</span></th></thead>"

		for(let i = 0; i < msg.freqs.length; i++) {
			var split = msg.freqs[i].split("|");

			html += `<tr><td><span class=\"menu_non_link\">${split[1]}</span></td><td><span class=\"menu_non_link\">${split[2]}</span></td><td><span class=\"menu_non_link\">${split[0]}</span></td></tr>`;
		}

		html += "</table>"

		$('#freqs').html(html);
	});

	socket.on('count', function(msg) {
		var error = msg.count[1];
		var total = msg.count[0];
		var good_msg = total - error;

		var empty_error = msg.count[3];
		var empty_good = msg.count[2];

		html = "<table class=\"search\">";
		html += `<tr><td><span class="menu_non_link">Total Messages (All): </span></td><td><span class="menu_non_link">${total}</span></td><td></td></tr>`;
		html += `<tr><td><span class="menu_non_link">Messages (No Errors): </span></td><td><span class="menu_non_link">${good_msg}</span></td><td><span class="menu_non_link">${parseFloat((good_msg/total)*100).toFixed(2)}%</span></td></tr>`;
		html += `<tr><td><span class="menu_non_link">Messages (W/Errors): </span></td><td><span class="menu_non_link">${error}</span></td><td><span class="menu_non_link">${parseFloat((error/total)*100).toFixed(2)}%</span></td></tr>`;

		html += `<tr><td><span class="menu_non_link">Empty Messages (Total): </span></td><td><span class="menu_non_link">${empty_good + empty_error}</span></td><td><span class="menu_non_link">${parseFloat(((empty_good + empty_error)/total)*100).toFixed(2)}%</span></td></tr>`;
		html += `<tr><td><span class="menu_non_link">Empty Messages (No Errors): </span></td><td><span class="menu_non_link">${empty_good}</span></td><td><span class="menu_non_link">${parseFloat((empty_good/total)*100).toFixed(2)}%</span></td></tr>`;
		html += `<tr><td><span class="menu_non_link">Empty Messages (W/Errors: </span></td><td><span class="menu_non_link">${empty_error}</span></td><td><span class="menu_non_link">${parseFloat((empty_error/total)*100).toFixed(2)}%</span></td></tr>`;
		html += "</table>";

		$('#msgs').html(html);
	});

	grab_freqs();
	grab_message_count();
});

setInterval(function() {
	grab_images();
	grab_freqs();
	grab_message_count();
}, 60000);

function update_prefix(prefix) {
	image_prefix = prefix;
	grab_images();
}

function grab_images() {
	console.log("Grabbing new stat images");
	var onehour = document.getElementById('1hr');
	onehour.src = `static/images/${image_prefix}1hour.png?rand=` + Math.random();

	var sixhours = document.getElementById('6hr');
	sixhours.src = `static/images/${image_prefix}6hour.png?rand=` + Math.random();

	var twelvehours = document.getElementById('12hr');
	twelvehours.src = `static/images/${image_prefix}12hour.png?rand=` + Math.random();

	var twentyfourhours = document.getElementById('24hr');
	twentyfourhours.src = `static/images/${image_prefix}24hours.png?rand=` + Math.random();

	var oneweek = document.getElementById('1wk');
	oneweek.src = `static/images/${image_prefix}1week.png?rand=` + Math.random();

	var thirtydays = document.getElementById('30day');
	thirtydays.src = `static/images/${image_prefix}30days.png?rand=` + Math.random();

	var sixmonths = document.getElementById('6mon');
	sixmonths.src = `static/images/${image_prefix}6months.png?rand=` + Math.random();

	var oneyear = document.getElementById('1yr');
	oneyear.src = `static/images/${image_prefix}1year.png?rand=` + Math.random();
}

function grab_freqs() {
	socket.emit('freqs', {'freqs': true}, namespace='/stats');
}

function grab_message_count() {
	socket.emit('count', {'count': true}, namespace='/stats');
}

