process.on('unhandledRejection', (reason) => {
  throw reason;
});

import createMockServer, { CLIENT_PING_INTERVAL, BACKOFF_MULTIPLIER } from './createMockServer';

global.createMockServer = createMockServer;
global.CLIENT_PING_INTERVAL = CLIENT_PING_INTERVAL;
global.BACKOFF_MULTIPLIER = BACKOFF_MULTIPLIER;
