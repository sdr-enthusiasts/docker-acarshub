import { images } from "./assets";
import { acarshub_version } from "./interfaces";
import jBox from "jbox";
export let menu = {
  acars_path: "" as string,
  acars_url: "" as string,

  menu_adsb: false as boolean,
  arch: "" as string,

  footer_message_modal: new jBox("Modal", {
    id: "set_modal",
    width: 300,
    height: 200,
    blockScroll: false,
    isolateScroll: true,
    animation: "zoomIn",
    closeButton: "box",
    overlay: true,
    reposition: false,
    repositionOnOpen: true,
    content: `<span class="red"><center><h2>NOTICE!</h2></center></span><span class="white">You are running an ARM 32 bit host system. After March 1st, 2022 your system may fail to properly run ACARS Hub. Please visit <a href="https://github.com/fredclausen/docker-acarshub/blob/main/arm32.md">this page</a> for more information.</span>`,
  }),

  show_menu_modal(): void {
    this.footer_message_modal.open();
  },

  generate_menu: function (): void {
    let html = '<div class="wrap"><span class="decor"></span>';
    html += '<nav><ul class="primary">';
    html += `<li class="img_box" id="logo_image">${images.acars_hub_logo}"</li>`;
    html += `<li><a href="javascript:new_page('Live Messages')" id="live_messages_link">Live Messages</a></li>`;
    if (this.menu_adsb)
      html += `<li><a href="javascript:new_page('Live Map')" id="live_map_link">Live Map</a></li>`;
    html += `<li><a href="javascript:new_page('Search')" id="search_link">Search Database</a></li>`;
    html += `<li><a href="javascript:new_page('Alerts')" id="alerts_link">Alerts<span id="alert_count"></span></li>`;
    html += `<li><a href="javascript:new_page('Stats')" id="stats_link">Statistics</a></li>`;
    html += `<li class="right_side"><span id="modal_text"></span></li>`;
    html += "</ul></nav></div>";
    $("#links").html(html);
  },

  generate_stat_submenu: function (
    acars: boolean = false,
    vdlm: boolean = false
  ): void {
    let text: string = "";
    const acars_prefix = acars && vdlm ? "'acars'" : "''";
    const vdlm_prefix = vdlm && acars ? "'vdlm'" : "''";
    if (acars && vdlm) {
      text =
        '<a href="javascript:update_prefix(\'\')" id="combined_graphs" class="spread_text">Combined Graphs</a>';
    }

    if (acars) {
      text += `${
        acars && vdlm ? " | " : ""
      }<a href="javascript:update_prefix(${acars_prefix})" id="acars_graphs" class="spread_text">ACARS Graphs</a>`;
    }

    if (vdlm) {
      text += `${
        acars && vdlm ? " | " : ""
      }<a href="javascript:update_prefix(${vdlm_prefix})" id="vdlm_graphs" class="spread_text">VDLM Graphs</a>`;
    }

    text +=
      ' | <a href="javascript:update_prefix(\'error\')" id="error_graphs" class="spread_text">Message Error Graphs</a>';
    $("#stat_menu").html(text);
  },

  generate_footer: function (): void {
    let update_message =
      this.arch.trim() === "armhf"
        ? '<div id="update_notice"><a href="javascript:show_menu_modal()" class="red">Notice: System may need update!</a></div>'
        : "";
    let html: string = `<div><a href="javascript:new_page('About')">ACARS Hub Help/About</a></div> \
      <div id="github_link"><a href="https://github.com/fredclausen/docker-acarshub" target="_blank">Project Github</a></div> \
      <div id="discord_badge"><a href="https://discord.gg/sTf9uYF"><img src="https://img.shields.io/discord/734090820684349521" alt="discord"></a></div> \
      <div><span id="system_status"><a href="javascript:new_page('Status')">System Status: <span class="green">Okay</a></span></span> \
      <span id="disconnect"></span></div> \
      <div><span class="menu_non_link" id="received">Received Messages:&nbsp;</span><span class="green" id="receivedmessages">0</span></div> \
      <span id="filtered"></span> \
      ${update_message} \
      <span class="align_right" id="release_version" data-jbox-content="Your version of ACARS Hub is up to date"><strong>Pre-Release</strong></span>`;
    $("#footer_div").html(html);
  },

  set_adsb: function (adsb_status = false): void {
    this.menu_adsb = adsb_status;
    this.generate_menu();
  },

  set_arch: function (arch: string): void {
    this.arch = arch;
  },

  set_version: function (version: acarshub_version): void {
    if (version.is_outdated) {
      $("#release_version").attr(
        "data-jbox-content",
        `Latest non-development version of ACARS Hub is ${version.github_version}`
      );
      $("#release_version").addClass("red_important");
    } else {
      $("#release_version").attr(
        "data-jbox-content",
        `ACARS Hub is up to date. Current version is ${version.github_version}`
      );
      $("#release_version").removeClass("red_important");
    }
  },

  set_about_page_urls: function (
    documentPath: string,
    documentUrl: string
  ): void {
    this.acars_path = documentPath;
    this.acars_url = documentUrl;
  },
};
