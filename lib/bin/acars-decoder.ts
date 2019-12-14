#!/usr/bin/env node

import { MessageDecoder } from '../MessageDecoder';

const decoder = new MessageDecoder();
const message = {
  text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
};

decoder.decode(message);
