#!/usr/bin/env node

import { MessageDecoder } from '../MessageDecoder';

function debugMessage(message: any, decoding: any) {
  console.log("ORIGINAL MESSAGE");
  console.log("Label:", message.label);
  console.log("Text:", message.text);
  console.log();
  console.log("Decoded Message:");
  console.log(decoding.formatted.description);
  if (decoding.formatted.items && decoding.formatted.items.length > 0) {
    decoding.formatted.items.forEach((item: any) => {
      console.log(`${item.label} - ${item.value}`);
    });
  }
  console.log();
}

function decode(label: string, text: string) {
  const message = {
    label: label,
    text: text
  };
  const decoder = new MessageDecoder();
  const decoding = decoder.decode(message);
  debugMessage(message, decoding);
}

// Label 5Z
decode('5Z', '/R3 SNAORD 2205-14 SNA');

// Label 80 + 3N01 POSRPT
decode(
  '80',
  "3N01 POSRPT 0570/13 MSLP/KJFK .N603AV/04F 00:59\n\
/NWYP ORF /HDG 074/MCH 779\n\
/POS N3630.7W07701.8/FL 350/TAS 453/SAT -054\n\
/SWND 079/DWND 216/FOB N006857/ETA 01:40.3"
);

// Label H1 + M1BPOS
decode(
  'H1',
  '#M1BPOSN32492W117178,N33492W118335,195835,350,N32463W117143,195907,N32359W117014,M51,25872,249/TS195835,1214195C27'
);
