import { display_messages } from "./html_generator";
import { acars_msg } from "./interfaces";

export class acarsscroller {
  first_element = 0 as number;
  last_element = 0 as number;
  messages = [] as acars_msg[][];
  selected_tabs = "" as string;
  target = (<any>null) as Element;
  options = {
    root: document.querySelector("log"),
    rootMargin: "0px",
    threshold: [0, 1],
    trackVisibility: true,
  };

  observer = (<unknown>null) as IntersectionObserver;

  constructor() {}

  set_messages(messages: acars_msg[][], selected_tabs: string) {
    this.messages = messages;
    this.selected_tabs = selected_tabs;
  }

  render_messages() {
    if (this.target) this.observer.unobserve(this.target);
    const html = display_messages(this.messages, this.selected_tabs, true);
    $("#log").html(html.html);
    this.create_io();
    this.target = document.querySelector("#" + html.message_uids[0]) as Element;
    //this.register_io(html.message_uids[0]);
    //this.register_io(html.message_uids[html.message_uids.length - 1]);
  }

  callback(entries: any, observer: any): void {
    console.log(
      entries[0].isIntersecting,
      entries[0].target,
      entries[0].intersectionRatio
    );
  }

  create_io() {
    this.observer = new IntersectionObserver(this.callback, this.options);
  }

  register_io() {
    if (this.target) this.observer.observe(this.target);
  }

  get_first_element() {
    return this.first_element;
  }

  get_last_element() {
    return this.last_element;
  }
}
