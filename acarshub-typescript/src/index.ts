import { generate_menu, generate_footer } from "./menu.js";

let acars_url: string = "";

$(() => { // Document on ready new syntax....or something. Passing a function directly to jquery
    update_url();
    generate_menu(); // generate the top menu
    generate_footer(); // generate the footer
});

function update_url() {
    let acars_path: string = document.location.pathname.replace(
        /about|search|stats|status|alerts/gi,
        ""
      );
    acars_path += acars_path.endsWith("/") ? "" : "/";
    acars_url = document.location.origin + acars_path;
}
