function generate_menu(){
	html = '<nav>';
    html += '<ul class="primary">';
    html +=  '<li>';
    html += '<a href="">ACARS Hub</a>';
    html += '<ul class="sub">';
    html += '<li><a href="/">Live Messages</a></li>';
    html += '<li><a href="/search">Search Database</a></li>';
    html += '<li><a href="/stats">Statistics</a></li>';
    html += '</ul>';
    html += '</li>';
    html += '<li>';

    // Sub page menu items
    if(window.location.pathname == "/") {
    	html += '<a href="">Page Settings</a>';
    	html += '<ul class="sub">';
    	html += '<li><a href="javascript:pause_updates()" id="pause_updates">Pause updates</a></li>';
    	html += '<li><a href="javascript:filter_notext()" id="filter_notext">Filter out "No Text" messages</a></li>';
    	html += '</ul>';
    } else if(window.location.pathname == "/stats") {
    	html += '<a href="">Graphs</a>';
    	html += '<ul class="sub">';
    	html += '<span id="stat_menu"></span>';
    	html += '</ul>';
    }
    html += '</nav>'
    $('#links').html(html);
 }

 function generate_stat_submenu(acars, vdlm) {
 	var text = "";
 	if(acars == true && vdlm == true) {
 		text = "<li><a href=\"javascript:update_prefix('')\" id=\"pause_updates\">Combined Graphs</a></li>";
 	}

 	if(acars) {
 		text += "<li><a href=\"javascript:update_prefix('acars')\" id=\"pause_updates\">ACARS Graphs</a></li>";
 	} 

 	if(vdlm) {
 		text += "<li><a href=\"javascript:update_prefix('vdlm')\" id=\"pause_updates\">VDLM Graphs</a></li>";
 	}

 	text += "<li><a href=\"javascript:update_prefix('error')\" id=\"pause_updates\">Message Error Graphs</a></li>";
 	$('#stat_menu').html(text);
 }