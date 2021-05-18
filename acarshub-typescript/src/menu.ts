let acars_path: string = document.location.pathname.replace(
  /about|search|stats|status|alerts/gi,
  ""
);
acars_path += acars_path.endsWith("/") ? "" : "/";
const acars_url: string = document.location.origin + acars_path;

export function generate_menu() {
  let html = "<nav>";
  html += '<ul class="primary">';
  html += `<li class="img_box"><img src="${acars_url}static/images/acarshubsquare.png" class="banner_img"></li>`;
  html += `<li><a href="${acars_url}">Live Messages</a></li>`;
  html += `<li><a href="${acars_url}search">Search Database</a></li>`;
  html += `<li><a href="${acars_url}alerts">Alerts&nbsp;<span id="alert_count"></span></li>`;
  html += `<li><a href="${acars_url}stats">Statistics</a></li></ul>`;
  html += "</nav>";
  $("#links").html(html);
}

export function generate_stat_submenu(acars: boolean, vdlm: boolean) {
  let text: string = "";
  if (acars == true && vdlm == true) {
    text =
      '<p><a href="javascript:update_prefix(\'\')" id="pause_updates" class="spread_text">Combined Graphs</a></p>';
  }

  if (acars) {
    text +=
      '<p><a href="javascript:update_prefix(\'acars\')" id="pause_updates" class="spread_text">ACARS Graphs</a></p>';
  }

  if (vdlm) {
    text +=
      '<p><a href="javascript:update_prefix(\'vdlm\')" id="pause_updates" class="spread_text">VDLM Graphs</a></p>';
  }

  text +=
    '<p><a href="javascript:update_prefix(\'error\')" id="pause_updates" class="spread_text">Message Error Graphs</a></p>';
  //text += "<p><a href=\"javascript:grab_freqs()\" id=\"pause_updates\" class=\"spread_text\">Frequency Counts</a></p>";
  text += "<hr>";
  text += '<p><span id="freqs"></span></p>';
  text += '<p><span id="msgs"></span></p>';
  $("#stat_menu").html(text);
}

export function generate_footer() {
  let html: string = `<strong><a href="${acars_url}about">ACARS Hub Help/About</a> | <a href="https://github.com/fredclausen/docker-acarshub" target="_blank">Project Github</a> | \
     <a href="https://discord.gg/sTf9uYF"><img src="https://img.shields.io/discord/734090820684349521" alt="discord"></a> | \
     <span id="system_status"><a href="${acars_url}status">System Status: <span class="green">Okay</a></span></span></strong>\
     <span id="disconnect"></span> \
     <span class="align_right">Pre-Release</span>`;
  $("#footer_div").html(html);
}
