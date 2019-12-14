#!/usr/bin/env node

import { MessageDecoder } from '../MessageDecoder';

const decoder = new MessageDecoder();
const message = {
  label: '80',
  text: "3N01 POSRPT 0570/13 MSLP/KJFK .N603AV/04F 00:59\n\
/NWYP ORF /HDG 074/MCH 779\n\
/POS N3630.7W07701.8/FL 350/TAS 453/SAT -054\n\
/SWND 079/DWND 216/FOB N006857/ETA 01:40.3"
};

const result = decoder.decode(message);

console.log("Original Message:");
console.log(message.text);
console.log();
console.log("Decoded Message:");
console.log(result.formatted.description);
if (result.formatted.items && result.formatted.items.length > 0) {
  result.formatted.items.forEach((item: any) => {
    console.log(`${item.label} - ${item.value}`);
  });
}
