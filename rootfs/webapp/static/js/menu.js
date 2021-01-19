function generate_menu(){
	html = '<nav>';
    html += '<ul class="primary">';
    html += '<li>';
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
    //text += "<p><a href=\"javascript:grab_freqs()\" id=\"pause_updates\" class=\"spread_text\">Frequency Counts</a></p>";
    text += "<hr>";
    text += "<p><span id=\"freqs\"></span></p>";
    text += "<p><span id=\"msgs\"></span></p>";
 	$('#stat_menu').html(text);
 }

 function generate_footer() {
    var html = '<strong><a href="/about">ACARS Hub Help/About</a> | <a href="https://github.com/fredclausen/docker-acarshub" target="_blank">Project Github</a> | <a href="https://discord.gg/sTf9uYF"><img src="https://img.shields.io/discord/734090820684349521" alt="discord"></a> |</strong><span class="align_right">Pre-Release</span>';
    $('#footer_div').html(html);
 }