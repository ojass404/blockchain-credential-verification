import { createApp } from './app.js';
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT must be an integer between 1 and 65535.');
const server = createApp().listen(port, '127.0.0.1');
server.on('listening', () => console.log(`Backend running at http://127.0.0.1:${port}`));
server.on('error', error => { console.error(`Unable to start backend: ${error.message}`); process.exitCode = 1; });
