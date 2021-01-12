function generate_menu(){
	html = '<nav>';
    html += '<ul class="primary">';
    html +=  '<li>';
    html += '<span class="nav_text">ACARS Hub</span>';
    html += '<li><a href="/">Live Messages</a></li>';
    html += '<li><a href="/search">Search Database</a></li>';
    html += '<li><a href="/stats">Statistics</a></li>';
    html += '</ul>';
    html += '</li>';

    // Alerts!
    /*html += '<li class="right_side"><a href="">Alerts</a>';
    html += '<ul class="sub">';
    html += '<li>Test</li>';
    html += '</ul></li>';*/
    html += '</nav>'
    $('#links').html(html);
 }

 function generate_stat_submenu(acars, vdlm) {
 	var text = "";
 	if(acars == true && vdlm == true) {
 		text = "<p><a href=\"javascript:update_prefix('')\" id=\"pause_updates\" class=\"spread_text\">Combined Graphs</a></p>";
 	}

 	if(acars) {
 		text += "<p><a href=\"javascript:update_prefix('acars')\" id=\"pause_updates\" class=\"spread_text\">ACARS Graphs</a></p>";
 	} 

 	if(vdlm) {
 		text += "<p><a href=\"javascript:update_prefix('vdlm')\" id=\"pause_updates\" class=\"spread_text\">VDLM Graphs</a></p>";
 	}

 	text += "<p><a href=\"javascript:update_prefix('error')\" id=\"pause_updates\" class=\"spread_text\">Message Error Graphs</a></p>";
 	$('#stat_menu').html(text);
 }