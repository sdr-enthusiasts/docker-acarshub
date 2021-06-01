export function tab_ids() {}

export function start_message_tabs() {
  return '<div class="tabinator">';
}

export function create_message_nav(
  tab_to_nav: string,
  unique_id: string,
  direction_back: boolean = true
) {
  return (
    `<a href="javascript:handle_radio('` +
    tab_to_nav +
    `', '` +
    unique_id +
    `')" id = "tab${unique_id}_${
      direction_back ? "previous" : "next"
    }" name = "tabs_${unique_id}" class="boxed">${
      direction_back ? "&lt;&lt;" : "&gt;&gt;"
    }</a>`
  );
}
