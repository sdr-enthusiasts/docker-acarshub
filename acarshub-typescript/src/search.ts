import { display_messages } from "./html_generator.js";
import { MessageDecoder } from "@airframes/acars-decoder/dist/MessageDecoder";
import { updateAlertCounter } from "./alerts.js";
import {
  search_html_msg,
  database_size,
  system_status,
  current_search,
  acars_msg,
} from "./interfaces.js";
import { search_database } from "./index.js";

let page_active: boolean = false;
let db_size: database_size;

declare const window: any;
let current_search: current_search = {
  flight: "",
  depa: "",
  dsta: "",
  freq: "",
  label: "",
  msgno: "",
  tail: "",
  msg_text: "",
}; // variable to store the current search term
let current_page: number = 0; // store the current page of the current_search
let total_pages: number = 0; // number of pages of results
let show_all: boolean = false; // variable to indicate we are doing a 'show all' search and not of a specific term
let query_time: number = 0.0;

let acars_path: string = "";
let acars_url: string = "";
let msgs_received: acars_msg[][] = [];
let num_results: number[] = [];
const md: MessageDecoder = new MessageDecoder();

export function database_size_details(msg: database_size) {
  db_size = msg;
  update_size();
}

export function database_search_results(msg: search_html_msg) {
  //maintain a list of 1 msgs
  console.log("yo");
  if (msgs_received.length >= 1) {
    msgs_received.shift();
  }
  if (num_results.length >= 1) {
    num_results.shift();
  }

  if (msg.hasOwnProperty("query_time") && typeof msg.query_time !== "undefined")
    query_time = msg["query_time"];
  // Lets check and see if the results match the current search string

  // Show the results if the returned results match the current search string (in case user kept typing after search emitted)
  // or the user has executed a 'show all'

  if (true) {
    msgs_received.push(msg.msghtml);
    num_results.push(msg.num_results);
    show_search();
  }
}

export function search() {
  //connect to the socket server.
  updateAlertCounter();
  // receive details from server

  // Function to listen for key up events. If detected, check and see if the search string has been updated. If so, process the updated query
  document.addEventListener("keyup", function () {
    if (page_active) {
      let current_terms = get_search_terms();
      if (!is_everything_blank() && current_search != current_terms) {
        show_all = false;
        delay_query(current_terms);
      }
    }
  });
}

function show_search() {
  let display = "";
  let display_nav_results = "";
  let results = []; // temp variable to store the JSON formatted JS object

  for (let i = 0; i < msgs_received.length; i++) {
    // Loop through the received message blob.
    for (let j = 0; j < msgs_received[i].length; j++) {
      // Loop through the individual messages in the blob
      let msg_json = msgs_received[i][j];
      // Check and see if the text field is decodable in to human readable format
      let decoded_msg = md.decode(msg_json);
      if (decoded_msg.decoded == true) {
        msg_json.decodedText = decoded_msg;
      }
      results.push([msg_json]);
    }

    // Display the updated nav bar and messages
    display = display_messages(results);
    display_nav_results = display_search(current_page, num_results[i]);
    $("#log").html(display);
    $("#num_results").html(display_nav_results);
    window.scrollTo(0, 0); // Scroll the window back to the top. We want this because the user might have scrolled halfway down the page and then ran a new search/updated the page
  }
}

function get_search_terms() {
  return {
    flight: (<HTMLInputElement>document.getElementById("search_flight")).value,
    depa: (<HTMLInputElement>document.getElementById("search_depa")).value,
    dsta: (<HTMLInputElement>document.getElementById("search_dsta")).value,
    freq: (<HTMLInputElement>document.getElementById("search_freq")).value,
    label: (<HTMLInputElement>document.getElementById("search_msglbl")).value,
    msgno: (<HTMLInputElement>document.getElementById("search_msgno")).value,
    tail: (<HTMLInputElement>document.getElementById("search_tail")).value,
    msg_text: (<HTMLInputElement>document.getElementById("search_text")).value,
  };
}

function is_everything_blank() {
  for (let [key, value] of Object.entries(current_search)) {
    if (value === "" || value === null) return false;
  }
  return true;
}

function reset_search_terms() {
  (<HTMLInputElement>document.getElementById("search_flight")).value = "";
  (<HTMLInputElement>document.getElementById("search_depa")).value = "";
  (<HTMLInputElement>document.getElementById("search_dsta")).value = "";
  (<HTMLInputElement>document.getElementById("search_freq")).value = "";
  (<HTMLInputElement>document.getElementById("search_msglbl")).value = "";
  (<HTMLInputElement>document.getElementById("search_msgno")).value = "";
  (<HTMLInputElement>document.getElementById("search_tail")).value = "";
  (<HTMLInputElement>document.getElementById("search_text")).value = "";
}

// In order to help DB responsiveness, I want to make sure the user has quit typing before emitting a query
// We'll do this by recording the state of the DB search text field, waiting half a second (might could make this less)
// I chose 500ms for the delay because it seems like a reasonable compromise for fast/slow typers
// Once delay is met, compare the previous text field with the current text field. If they are the same, we'll send a query out

async function delay_query(initial_query: current_search) {
  // Pause for half a second
  await sleep(100);
  let old_search = current_search; // Save the old search term in a temp variable
  // Only execute the search query if the user is done typing. We track that by comparing the query we were asked to run
  // with what is currently in the text box
  if (JSON.stringify(initial_query) == JSON.stringify(get_search_terms())) {
    current_search = get_search_terms(); // update the global value for the current search
    if (
      !is_everything_blank() &&
      JSON.stringify(current_search) != JSON.stringify(old_search)
    ) {
      // Double check and ensure the search term is new and not blank. No sense hammering the DB to search for the same term
      // Reset status for letious elements of the page to what we're doing now
      current_page = 0;
      show_all = false;
      // Give feedback to the user while the search is going on
      $("#log").html("Searching...");
      $("#num_results").html("");
      search_database((current_search = current_search));
    } else if (is_everything_blank()) {
      // Field is now blank, clear the page and reset status
      show_all = false;
      $("#log").html("");
      $("#num_results").html("");
    }
  }
}

// Function to run show all messages. Sets the letious status trackers on the page to expected values

window.showall = function () {
  search_database(current_search, true);
  $("#log").html("Updating...");
  $("#num_results").html("");
  reset_search_terms();
  current_page = 0;
  show_all = true;
};

// Zzzzzzz

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Function called by a user clicking on a search page link.
// Set tracking to the new page and send the query off to the DB

window.runclick = function (page: number) {
  current_page = page;
  if (!is_everything_blank() || show_all) {
    $("#log").html("Updating results....");
    $("#num_results").html("");
    if (!show_all) {
      search_database(current_search, false, page);
    } else {
      search_database(current_search, true, page);
    }
  }
};

// Sanity checker to ensure the page typed in the jump box makes sense. If it does, call the runclick function to send it off to the DB
// window.jumppage = function () {
//   let page = document.getElementById("jump").value;
//   if (page > total_pages) {
//     $("#error_message").html(`Please enter a value less than ${total_pages}`);
//   } else if (page != 0) {
//     runclick(parseInt(page) - 1);
//   }
// };

// Function to format the side bar

function display_search(current: number, total: number) {
  let html = "";
  total_pages = 0;

  if (total == 0) return html + '<span class="menu_non_link">No results</span>';

  // Determine the number of pages to display.
  // We are getting a max of 50 results back from the database
  // We don't want a float for the total pages, and javascript (at least in my googling) doesn't have the ability to cast
  // a result from float to int. We what we are doing is applying the ~ operator, which (IIRC) reverses the bits of the element it is applied to
  // in doing so, it magically is cast to an int. For reasons I don't get but they work...then we reverse it again
  if (total % 50 != 0) total_pages = ~~(total / 50) + 1;
  else total_pages = ~~(total / 50);

  html +=
    '<table class="search"><thead><th class="search_label"></th><th class="search_term"></th></thead>';
  html += `<tr><td colspan="2"><span class="menu_non_link">Query Time: ${query_time.toFixed(
    4
  )} Seconds</span></td></tr>`;
  html += `<tr><td colspan="2"><span class="menu_non_link">Found <strong>${total}</strong> result(s) in <strong>${total_pages}</strong> page(s).</span></td></tr>`;

  // Determine -/+ range. We want to show -/+ 5 pages from current index

  let low_end = 0;
  let high_end = current + 6;

  if (current > 5) low_end = current - 5;

  if (high_end > total_pages) high_end = total_pages;

  if (total_pages != 1) {
    html += '<tr><td colspan="2">';

    if (low_end > 0) {
      if (low_end > 5)
        html += `<a href=\"#\" id=\"search_page\" onclick=\"runclick(${
          low_end - 5
        })\"><< </a>`;
      else
        html += `<a href=\"#\" id=\"search_page\" onclick=\"runclick(0)\"><< </a>`;
    }

    for (let i = low_end; i < high_end; i++) {
      if (i == current) {
        html += ` <span class="menu_non_link"><strong>${
          i + 1
        }</strong></span> `;
      } else {
        html += ` <a href=\"#\" id=\"search_page\" onclick=\"runclick(${i})\">${
          i + 1
        }</a> `;
      }
    }

    if (high_end != total_pages) {
      if (high_end + 5 < total_pages)
        html += `<a href=\"#\" id=\"search_page\" onclick=\"runclick(${
          high_end + 4
        })\" >>></a>`;
      else
        html += `<a href=\"#\" id=\"search_page\" onclick=\"runclick(${high_end}\")> >></a>`;
    }
  }

  if (total_pages > 5) {
    html +=
      '</td></tr><tr><td class="search_label"><label>Page:</label></td><td class="search_term"><input type="text" id="jump"><p></td></tr>';
    html +=
      '<tr><td class="search_label"></td><td class=search_term><a href="#" onclick="jumppage()">Jump to page</a></td></tr></table>';
    html += '<div id="error_message"></div></div>';
  } else {
    html += "</td></tr></table>";
    html += '<div id="error_message"></div></div>';
  }

  return html;
}

function formatSizeUnits(bytes: number) {
  let output: string = "";
  if (bytes >= 1073741824) {
    output = (bytes / 1073741824).toFixed(2) + " GB";
  } else if (bytes >= 1048576) {
    output = (bytes / 1048576).toFixed(2) + " MB";
  } else if (bytes >= 1024) {
    output = (bytes / 1024).toFixed(2) + " KB";
  } else if (bytes > 1) {
    output = bytes + " bytes";
  } else if (bytes == 1) {
    output = bytes + " byte";
  } else {
    output = "0 bytes";
  }
  return output;
}

function update_size() {
  if (page_active && typeof db_size !== "undefined") {
    $("#database").html(String(db_size.count).trim() + " rows");
    if (parseInt(db_size.size) > 0) {
      $("#size").html(formatSizeUnits(parseInt(db_size.size)));
    } else {
      $("#size").html("Error getting DB size");
    }
  }
}
export function set_search_page_urls(
  documentPath: string,
  documentUrl: string
) {
  acars_path = documentPath;
  acars_url = documentUrl;
}

export function search_active(state = false) {
  page_active = state;

  if (page_active) {
    // page is active
    set_html();
    update_size();
    $("#log").html(""); // show the messages we've received
    show_search();
  }
}

function set_html() {
  $("#right").html(
    `          <div class="fixed_results">
  <p><a href="javascript:showall()" class="spread_text">Most Recent Messages</a></p>
  <table class="search">
    <tr>
      <td class="search_label">
        <label>Database Rows:</label>
      </td>
      <td class="search_term">
        <span id="database"></span>
      </td>
    </tr>
    <tr>
      <td class="search_label">
        <label>Database Size:</label>
      </td>
      <td class="search_term">
        <span id="size"></span>
      </td>
    </tr>

    <tr>
      <td class="search_label">
        <label>Callsign:</label>
      </td>
      <td class="search_term">
        <input type="text" id="search_flight">
      </td>
    </tr>

    <tr class="search_label">
      <td>
        <label>DEPA:</label>
      </td>
      <td class="search_term">
        <input type="text" id="search_depa">
      </td>
    </tr>

    <tr class="search_label">
      <td>
        <label>DSTA:</label>
      </td>
      <td class="search_term">
        <input type="text" id="search_dsta">
      </td>
    </tr>

    <tr class="search_label">
      <td>
        <label>Frequency:</label>
      </td>
      <td class="search_term">
        <input type="text" id="search_freq">
      </td>
    </tr>

    <tr class="search_label">
      <td>
        <label>Label:</label>
      </td>
      <td class="search_term">
        <input type="text" id="search_msglbl">
      </td>
    </tr>

    <tr class="search_label">
      <td>
        <label>Message Number:</label>
      </td>
      <td class="search_term">
        <input type="text" id="search_msgno">
      </td>
    </tr>

    <tr class="search_label">
      <td>
        <label>Tail Number:</label>
      </td>
      <td class="search_term">
        <input type="text" id="search_tail">
      </td>
    </tr>

    <tr class="search_label">
      <td>
        <label>Text:</label>
      </td>
      <td class="search_term">
        <input type="text" id="search_text">
      </td>
    </tr>

  </table>
  <div class="row" id="num_results"></div>
</div> <!-- /fixed results -->`
  );

  $("#page_name").html("Search received messages");
}
