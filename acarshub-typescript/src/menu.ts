let acars_path: string = document.location.pathname.replace(
  /about|search|stats|status|alerts/gi,
  ""
);
acars_path += acars_path.endsWith("/") ? "" : "/";
const acars_url: string = document.location.origin + acars_path;

let menu_adsb = false;

export function generate_menu() {
  let html = '<div class="wrap"><span class="decor"></span>';
  html += '<nav><ul class="primary">';
  html += `<li class="img_box" id="logo_image"><img src="${acars_url}static/images/acarshubsquare.png" class="banner_img" alt="ACARS Hub Logo"></li>`;
  html += `<li><a href="javascript:new_page('Live Messages')" id="live_messages_link">Live Messages</a></li>`;
  if (menu_adsb)
    html += `<li><a href="javascript:new_page('Live Map')" id="live_map_link">Live Map</a></li>`;
  html += `<li><a href="javascript:new_page('Search')" id="search_link">Search Database</a></li>`;
  html += `<li><a href="javascript:new_page('Alerts')" id="alerts_link">Alerts<span id="alert_count"></span></li>`;
  html += `<li><a href="javascript:new_page('Stats')" id="stats_link">Statistics</a></li>`;
  html += `<li class="right_side"><span id="modal_text"></span></li>`;
  html += "</ul></nav></div>";
  $("#links").html(html);
}

export function generate_stat_submenu(acars: boolean, vdlm: boolean) {
  let text: string = "";
  if (acars == true && vdlm == true) {
    text =
      '<p><a href="javascript:update_prefix(\'\')" id="combined_graphs" class="spread_text">Combined Graphs</a></p>';
  }

  if (acars) {
    text +=
      '<p><a href="javascript:update_prefix(\'acars\')" id="acars_graphs" class="spread_text">ACARS Graphs</a></p>';
  }

  if (vdlm) {
    text +=
      '<p><a href="javascript:update_prefix(\'vdlm\')" id="vdlm_graphs" class="spread_text">VDLM Graphs</a></p>';
  }

  text +=
    '<p><a href="javascript:update_prefix(\'error\')" id="error_graphs" class="spread_text">Message Error Graphs</a></p>';
  //text += "<p><a href=\"javascript:grab_freqs()\" id=\"pause_updates\" class=\"spread_text\">Frequency Counts</a></p>";
  text += '<p><span id="freqs"></span></p>';
  text += '<p><span id="msgs"></span></p>';
  $("#stat_menu").html(text);
}

export function generate_footer() {
  let html: string = `<div><a href="javascript:new_page('About')">ACARS Hub Help/About</a></div> \
    <div id="github_link"><a href="https://github.com/fredclausen/docker-acarshub" target="_blank">Project Github</a></div> \
    <div id="discord_badge"><a href="https://discord.gg/sTf9uYF"><img src="https://img.shields.io/discord/734090820684349521" alt="discord"></a></div> \
    <div><span id="system_status"><a href="javascript:new_page('Status')">System Status: <span class="green">Okay</a></span></span> \
    <span id="disconnect"></span></div> \
    <div><span class="menu_non_link" id="received">Received Messages:&nbsp;</span><span class="green" id="receivedmessages">0</span></div> \
    <span id="filtered"></span> \
    <span class="align_right" id="release_version"><strong>Pre-Release</strong></span>`;
  $("#footer_div").html(html);
}

export function set_adsb(adsb_status = false) {
  menu_adsb = adsb_status;
  generate_menu();
}
