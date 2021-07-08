import { display_messages } from "./html_generator.js";
import { MessageDecoder } from "@airframes/acars-decoder/dist/MessageDecoder";
import {
  search_html_msg,
  database_size,
  system_status,
  current_search,
  acars_msg,
} from "./interfaces.js";
import { search_database, window } from "./index.js";
import jBox from "jbox";
import "jbox/dist/jBox.all.css";
import { tooltip } from "./tooltips.js";

export let search_page = {
  search_page_active: false as boolean,
  db_size: (<unknown>null) as database_size,
  current_search: {
    flight: "",
    depa: "",
    dsta: "",
    freq: "",
    label: "",
    msgno: "",
    tail: "",
    msg_text: "",
  } as current_search, // variable to store the current search term
  current_page: 0 as number, // store the current page of the current_search
  total_pages: 0 as number, // number of pages of results
  show_all: false as boolean, // variable to indicate we are doing a 'show all' search and not of a specific term
  query_time: 0.0 as number,

  search_acars_path: "" as string,
  search_acars_url: "" as string,
  search_msgs_received: [] as acars_msg[][],
  num_results: [] as number[],
  search_md: new MessageDecoder(),
  search_message_modal: new jBox("Modal", {
    id: "set_modal",
    width: 350,
    height: 400,
    blockScroll: false,
    isolateScroll: true,
    animation: "zoomIn",
    closeButton: "box",
    overlay: true,
    reposition: false,
    repositionOnOpen: true,
    onClose: () => window.close_modal(),
    content: `  <p><a href="javascript:showall()" class="spread_text">Most Recent Messages</a></p>
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

    </table>`,
  }),

  show_search_message_modal: function () {
    this.search_message_modal.open();
    $("input").on("keyup", () => this.key_event());
    this.update_size();
  },

  database_size_details: function (msg: database_size) {
    this.db_size = msg;
    this.update_size();
  },

  database_search_results: function (msg: search_html_msg) {
    //maintain a list of 1 msgs
    if (this.search_msgs_received.length >= 1) {
      this.search_msgs_received.shift();
    }
    if (this.num_results.length >= 1) {
      this.num_results.shift();
    }

    if (
      msg.hasOwnProperty("query_time") &&
      typeof msg.query_time !== "undefined"
    )
      this.query_time = msg["query_time"];
    // Lets check and see if the results match the current search string

    // Show the results if the returned results match the current search string (in case user kept typing after search emitted)
    // or the user has executed a 'show all'

    if (true) {
      this.search_msgs_received.push(msg.msghtml);
      this.num_results.push(msg.num_results);
      this.show_search();
    }
  },

  search: function () {},

  key_event: function () {
    if (this.search_page_active) {
      let current_terms = this.get_search_terms();
      if (this.current_search != current_terms) {
        this.show_all = false;
        this.delay_query(current_terms);
      }
    }
  },

  show_search: function () {
    let display = "";
    let display_nav_results = "";
    let results = []; // temp variable to store the JSON formatted JS object

    for (let i = 0; i < this.search_msgs_received.length; i++) {
      // Loop through the received message blob.
      for (let j = 0; j < this.search_msgs_received[i].length; j++) {
        // Loop through the individual messages in the blob
        let msg_json = this.search_msgs_received[i][j];
        // Check and see if the text field is decodable in to human readable format
        let decoded_msg = this.search_md.decode(msg_json);
        if (decoded_msg.decoded == true) {
          msg_json.decodedText = decoded_msg;
        }
        results.push([msg_json]);
      }

      // Display the updated nav bar and messages
      display = display_messages(results);
      display_nav_results = this.display_search(
        this.current_page,
        this.num_results[i]
      );
      $("#log").html('<div class="row" id="num_results"></div>' + display);
      $("#num_results").html(display_nav_results);
      tooltip.close_all_tooltips();
      tooltip.attach_all_tooltips();
      window.scrollTo(0, 0); // Scroll the window back to the top. We want this because the user might have scrolled halfway down the page and then ran a new search/updated the page
    }
  },

  get_search_terms: function () {
    console.log($("#search_text").val(), $("search_text"));
    return {
      flight: $("#search_flight").val(),
      depa: $("#search_depa").val(),
      dsta: $("#search_dsta").val(),
      freq: $("#search_freq").val(),
      label: $("#search_msglbl").val(),
      msgno: $("#search_msgno").val(),
      tail: $("#search_tail").val(),
      msg_text: $("search_text").val(),
    } as current_search;
  },

  is_everything_blank: function () {
    console.log(this.get_search_terms());
    for (let [key, value] of Object.entries(this.get_search_terms())) {
      if (value != "") return false;
    }
    return true;
  },

  reset_search_terms: function () {
    $("#search_flight").val("");
    $("#search_depa").val("");
    $("#search_dsta").val("");
    $("#search_freq").val("");
    $("#search_msglbl").val("");
    $("#search_msgno").val("");
    $("#search_tail").val("");
    $("#search_text").val("");
  },

  // In order to help DB responsiveness, I want to make sure the user has quit typing before emitting a query
  // We'll do this by recording the state of the DB search text field, waiting half a second (might could make this less)
  // I chose 500ms for the delay because it seems like a reasonable compromise for fast/slow typers
  // Once delay is met, compare the previous text field with the current text field. If they are the same, we'll send a query out

  delay_query: async function (initial_query: current_search) {
    // Pause for a tenth of a second
    await this.sleep(100);
    let old_search = this.current_search; // Save the old search term in a temp variable
    // Only execute the search query if the user is done typing. We track that by comparing the query we were asked to run
    // with what is currently in the text box
    if (
      JSON.stringify(initial_query) == JSON.stringify(this.get_search_terms())
    ) {
      this.current_search = this.get_search_terms(); // update the global value for the current search
      if (
        !this.is_everything_blank() &&
        JSON.stringify(this.current_search) != JSON.stringify(old_search)
      ) {
        // Double check and ensure the search term is new and not blank. No sense hammering the DB to search for the same term
        // Reset status for letious elements of the page to what we're doing now
        this.current_page = 0;
        this.show_all = false;
        // Give feedback to the user while the search is going on
        $("#log").html("Searching...");
        $("#num_results").html("");
        search_database((this.current_search = this.current_search));
      } else if (this.is_everything_blank()) {
        // Field is now blank, clear the page and reset status
        this.show_all = false;
        $("#log").html("");
        $("#num_results").html("");
      }
    }
  },

  // Function to run show all messages. Sets the letious status trackers on the page to expected values

  showall: function () {
    search_database(this.current_search, true);
    $("#log").html("Updating...");
    $("#num_results").html("");
    this.reset_search_terms();
    this.current_page = 0;
    this.show_all = true;
  },

  // Zzzzzzz

  sleep: function (ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  // Function called by a user clicking on a search page link.
  // Set tracking to the new page and send the query off to the DB

  runclick: function (page: number) {
    this.current_page = page;
    if (!this.is_everything_blank() || this.show_all) {
      $("#log").html("Updating results....");
      $("#num_results").html("");
      if (!this.show_all) {
        search_database(this.current_search, false, page);
      } else {
        search_database(this.current_search, true, page);
      }
    }
  },

  // Sanity checker to ensure the page typed in the jump box makes sense. If it does, call the runclick function to send it off to the DB
  jumppage: function () {
    let page: number = Number($("#jump").val());
    if (typeof page === "undefined" || page === null) return;
    if (page > this.total_pages || page < 1) {
      $("#error_message").html(
        `Please enter a value less than ${this.total_pages} and greater than 1`
      );
      return;
    }
    this.runclick(page - (page > 1 ? 1 : 0));
  },

  // Function to format the side bar

  display_search: function (current: number, total: number) {
    let html = "";
    this.total_pages = 0;

    if (total == 0)
      return html + '<span class="menu_non_link">No results</span>';

    // Determine the number of pages to display.
    // We are getting a max of 50 results back from the database
    // We don't want a float for the total pages, and javascript (at least in my googling) doesn't have the ability to cast
    // a result from float to int. We what we are doing is applying the ~ operator, which (IIRC) reverses the bits of the element it is applied to
    // in doing so, it magically is cast to an int. For reasons I don't get but they work...then we reverse it again
    if (total % 50 != 0) this.total_pages = ~~(total / 50) + 1;
    else this.total_pages = ~~(total / 50);

    html +=
      '<table class="search"><thead><th class="search_label"></th><th class="search_term"></th></thead>';
    html += `<tr><td colspan="2"><span class="menu_non_link">Query Time: ${this.query_time.toFixed(
      4
    )} Seconds</span></td></tr>`;
    html += `<tr><td colspan="2"><span class="menu_non_link">Found <strong>${total}</strong> result(s) in <strong>${this.total_pages}</strong> page(s).</span></td></tr>`;

    // Determine -/+ range. We want to show -/+ 5 pages from current index

    let low_end = 0;
    let high_end = current + 6;

    if (current > 5) low_end = current - 5;

    if (high_end > this.total_pages) high_end = this.total_pages;

    if (this.total_pages != 1) {
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

      if (high_end != this.total_pages) {
        if (high_end + 5 < this.total_pages)
          html += `<a href=\"#\" id=\"search_page\" onclick=\"runclick(${
            high_end + 4
          })\" >>></a>`;
        else
          html += `<a href=\"#\" id=\"search_page\" onclick=\"runclick(${high_end}\")> >></a>`;
      }
    }

    if (this.total_pages > 5) {
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
  },

  formatSizeUnits: function (bytes: number) {
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
  },

  update_size: function () {
    if (this.search_page_active && this.db_size !== null) {
      $("#database").html(String(this.db_size.count).trim() + " rows");
      if (parseInt(this.db_size.size) > 0) {
        $("#size").html(this.formatSizeUnits(parseInt(this.db_size.size)));
      } else {
        $("#size").html("Error getting DB size");
      }
    }
  },
  set_search_page_urls: function (documentPath: string, documentUrl: string) {
    this.search_acars_path = documentPath;
    this.search_acars_url = documentUrl;
  },

  search_active: function (state = false) {
    this.search_page_active = state;

    if (this.search_page_active) {
      // page is active
      this.set_html();
      this.update_size();
      $("#log").html(""); // show the messages we've received
      this.show_search();
    }
  },

  set_html: function () {
    $("#modal_text").html(
      '<a href="javascript:show_page_modal()">Search For Messages</a>'
    );
    $("#page_name").html("Search received messages");
  },
};
