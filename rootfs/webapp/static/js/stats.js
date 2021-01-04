var image_prefix = '';
$(document).ready(function(){
	socket = io.connect('http://' + document.domain + ':' + location.port + '/stats');
	socket.on('newmsg', function(msg) {
		console.log("message received");
		var text = "<a href=\"javascript:update_prefix('')\" id=\"pause_updates\">Combined Graphs</a>";
		if(msg.acars == true) {
			text += " | <a href=\"javascript:update_prefix('acars')\" id=\"pause_updates\">ACARS Graphs</a>";
		}

		if(msg.vdlm == true) {
			text += " | <a href=\"javascript:update_prefix('vdlm')\" id=\"pause_updates\">VDLM Graphs</a>";
		}

		text += " | <a href=\"javascript:update_prefix('error')\" id=\"pause_updates\">Message Error Graphs</a>";
		$('#image_links').html(text);
	});
});

setInterval(function() {
	grab_images();
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

