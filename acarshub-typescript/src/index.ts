import { generate_menu, generate_footer } from "./menu.js";

import { set_live_page_urls, live_messages, live_message_active } from "./live_messages.js"
import { set_search_page_urls, search_page, search_active } from "./search.js"

declare const window: any;
let acars_url: string = "";
let acars_path: string = "";
let acars_page: string = "";

const pages: string[] = [
    "/", // index/live messages
    "/search" // search page
]

$(() => { // Document on ready new syntax....or something. Passing a function directly to jquery
    update_url(); // update the urls for everyone
    generate_menu(); // generate the top menu
    generate_footer(); // generate the footer

    // find the current page


    // init all page backgrounding functions
    live_messages();
    search_page();

    toggle_pages();
});

function update_url() {
    acars_path = document.location.pathname.replace(
        /about|search|stats|status|alerts/gi,
        ""
      );
    acars_path += acars_path.endsWith("/") ? "" : "/";
    acars_url = document.location.origin + acars_path;

    set_live_page_urls(acars_path, acars_url);
    set_search_page_urls(acars_path, acars_url);
}

function toggle_pages() {
    acars_page = "/" + document.location.pathname.replace(acars_path, "");
    for(let page in pages) {
        if(pages[page] === "/" && acars_page === pages[page]) {
            live_message_active(true);
        } else if(pages[page] === "/") {
            live_message_active();
        }
        else if(pages[page] === "/search" && acars_page === pages[page]) {
            search_active(true);
        } else if (pages[page] === "/search") {
            search_active();
        }
    }
}

window.new_page = function(page: string) {
    document.title = page;
    let sub_url = "";
    if(page === "Live Messages") sub_url = ""
    else if (page === "Search") sub_url = "search"
    window.history.pushState({path:acars_path + sub_url}, page, acars_path + sub_url);
    toggle_pages();
}
