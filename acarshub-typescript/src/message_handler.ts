import { acars_msg, messages, plane } from "./interfaces";

let message_handler = {
  acars_messages: {
    planes: [] as plane[],
    alerts: [] as acars_msg[],
  } as messages,

  new_acars_message: function (msg: acars_msg) {},

  new_alert_message: function (msg: acars_msg) {},
};
