setInterval(function() {
	console.log("Grabbing new stat images");
	var onehour = document.getElementById('1hr');
	onehour.src = 'static/images/1hour.png?rand=' + Math.random();

	var sixhours = document.getElementById('6hr');
	sixhours.src = 'static/images/6hour.png?rand=' + Math.random();

	var twentyfourhours = document.getElementById('24hr');
	twentyfourhours.src = 'static/images/24hours.png?rand=' + Math.random();

	var oneweek = document.getElementById('1wk');
	oneweek.src = 'static/images/1week.png?rand=' + Math.random();

	var thirtydays = document.getElementById('30day');
	thirtydays.src = 'static/images/30days.png?rand=' + Math.random();

	var sixmonths = document.getElementById('6mon');
	sixmonths.src = 'static/images/6months.png?rand=' + Math.random();

	var oneyear = document.getElementById('1yr');
	oneyear.src = 'static/images/1year.png?rand=' + Math.random();
}, 300000);