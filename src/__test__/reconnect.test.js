import RTMClient, { RTMClientEvents, RTMReconnectTimeoutError } from '../';
import { WebSocket } from 'mock-socket';
import delay from '../delay';

let server, url;

const onlineHandler = jest.fn(async () => {
  // stop server then restart later
  server.close();
  const result = await createMockServer();
  server = result.server;
  url = result.url;
  await delay(100);
});
const offlineHandler = jest.fn();
const errorHandler = jest.fn();

beforeEach(async () => {
  const result = await createMockServer();
  server = result.server;
  url = result.url;

  onlineHandler.mockClear();
  offlineHandler.mockClear();
  errorHandler.mockClear();
});

afterEach(() => {
  return new Promise((resolve) => {
    server.stop(resolve);
  });
});

test('reconnect', async () => {
  const client = new RTMClient({
    url: () => url,
    WebSocket,
    pingInterval: CLIENT_PING_INTERVAL,
    backoffMultiplier: BACKOFF_MULTIPLIER
  });

  client.on(RTMClientEvents.ONLINE, onlineHandler);
  client.on(RTMClientEvents.OFFLINE, offlineHandler);

  expect(onlineHandler).not.toBeCalled();
  expect(offlineHandler).not.toBeCalled();

  await delay(3000);

  expect(onlineHandler.mock.calls.length).toBeGreaterThan(1);
  expect(offlineHandler.mock.calls.length).toBeGreaterThan(1);
});

test('reconnect timeout', async () => {
  const client = new RTMClient({
    url: async () => {
      await delay(500);
      return url
    },
    WebSocket,
    reconnectTimeout: 200,
  });

  client.on(RTMClientEvents.ONLINE, onlineHandler);
  client.on(RTMClientEvents.ERROR, errorHandler); 

  await delay(500);

  expect(errorHandler.mock.calls.length).toBe(1);
  expect(errorHandler.mock.calls[0][0]).toBeInstanceOf(RTMReconnectTimeoutError);
});
