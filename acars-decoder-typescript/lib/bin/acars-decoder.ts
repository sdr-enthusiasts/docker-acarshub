#!/usr/bin/env node

import { MessageDecoder } from '../MessageDecoder';

const decoder = new MessageDecoder();
const message = {
  label: process.argv[2],
  text: process.argv[3]
};

console.log("Original Message:");
console.log(message.text);
console.log();

const result = decoder.decode(message, { debug: true });

console.log("Decoded Message:");
console.log(result.formatted.description);
if (result.formatted.items && result.formatted.items.length > 0) {
  result.formatted.items.forEach((item: any) => {
    console.log(`${item.label} - ${item.value}`);
  });
}
