// A small HTTP server for trying poof-log. With DEBUG_FILE=true (pnpm dev:file) it also writes
// poof-log-example.log, named after "name" in package.json, and deletes it when you stop it.
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3000);
const users: Record<string, string> = { '1': 'Ada', '2': 'Grace' };

createServer((req, res) => {
  poof.log(req.method, req.url);

  if (req.url === '/boom') {
    poof.error('about to throw', new Error('boom'));
    throw new Error('boom');
  }

  const id = req.url?.match(/^\/users\/(\w+)$/)?.[1];
  if (id === undefined) {
    res.end('try /users/1, /users/2 or /boom\n');
    return;
  }

  const name = users[id];
  if (name === undefined) {
    poof.warn('unknown user', { id });
    res.statusCode = 404;
    res.end('not found\n');
    return;
  }

  poof.info('user loaded', { id, name });
  res.end(`${name}\n`);
}).listen(port, () => {
  poof.debug(`listening on http://localhost:${String(port)}`);
});
