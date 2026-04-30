#!/usr/bin/env tsx

import { render } from 'ink';
import { stdout } from 'node:process';
import { App } from './app.js';

stdout.write('\x1b[?1049h\x1b[?25l');

const { waitUntilExit } = render(<App />, { exitOnCtrlC: false });

waitUntilExit().then(() => {
  stdout.write('\x1b[?25h\x1b[?1049l');
  process.exit(0);
});
