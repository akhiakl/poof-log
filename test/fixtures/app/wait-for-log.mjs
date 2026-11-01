import { existsSync, readFileSync } from 'node:fs';

/** debug() writes the file in the background, so tests wait until the line has landed. */
export async function waitForLog(text, log = 'demo-my-app-.log') {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (existsSync(log) && readFileSync(log, 'utf8').includes(text)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
