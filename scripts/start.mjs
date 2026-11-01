import { createRequire } from 'node:module';
process.env.HOSTNAME='0.0.0.0';
process.env.PORT??='3000';
createRequire(import.meta.url)('../.next/standalone/server.js');
