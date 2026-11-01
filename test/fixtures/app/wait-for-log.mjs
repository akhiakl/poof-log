import { existsSync, readFileSync } from 'node:fs';

/** debug() writes the file in the background, so tests wait until the line has landed. */
export async function waitForLog(text, log = 'demo-my-app-.log') {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if (existsSync(log) && readFileSync(log, 'utf8').includes(text)) return;
    } catch {
      // The file can vanish between existsSync and readFileSync; retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for "${text}" to appear in ${log}`);
}
