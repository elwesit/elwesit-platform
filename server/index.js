import { openDatabases } from './db.js';
import { createApp } from './app.js';
import { config } from './config.js';

openDatabases();
const app = createApp();
const server = app.listen(config.port, config.host, () => {
  console.log(`الوسيط العقاري يعمل على http://${config.host}:${config.port}`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
