import { startServer } from './server/index';

startServer().catch((e) => {
  console.error(e);
  process.exit(1);
});
