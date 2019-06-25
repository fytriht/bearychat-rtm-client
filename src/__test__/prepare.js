process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection: ', reason);
});

import createMockServer, { CLIENT_PING_INTERVAL, CLIENT_PING_TIMEOUT, BACKOFF_MULTIPLIER } from './createMockServer';

global.createMockServer = createMockServer;
global.CLIENT_PING_INTERVAL = CLIENT_PING_INTERVAL;
global.CLIENT_PING_TIMEOUT = CLIENT_PING_TIMEOUT;
global.BACKOFF_MULTIPLIER = BACKOFF_MULTIPLIER;
