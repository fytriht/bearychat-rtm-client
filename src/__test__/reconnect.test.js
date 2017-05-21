import RTMClient, { RTMClientEvents } from "../";
import { WebSocket } from "mock-socket";
import createMockServer, { CLIENT_PING_INTERVAL, BACKOFF_MULTIPLIER } from './createMockServer';
import delay from "delay";

let server, url;

beforeEach(() => {
  const result = createMockServer();
  server = result.server;
  url = result.url;
});

afterEach(() => {
  server.stop();
});

test('reconnect', async () => {
  const client = new RTMClient({
    url: () => url,
    WebSocket,
    pingInterval: CLIENT_PING_INTERVAL,
    backoffMultiplier: BACKOFF_MULTIPLIER
  });

  const onlineHandler = jest.fn(async () => {
    // stop server then restart later
    server.close();
    const result = createMockServer();
    server = result.server;
    url = result.url;
    await delay(100);
  });
  const offlineHandler = jest.fn();

  client.on(RTMClientEvents.ONLINE, onlineHandler);
  client.on(RTMClientEvents.OFFLINE, offlineHandler);

  expect(onlineHandler).not.toBeCalled();
  expect(offlineHandler).not.toBeCalled();

  await delay(3000);

  expect(onlineHandler.mock.calls.length).toBeGreaterThan(1);
  expect(offlineHandler.mock.calls.length).toBeGreaterThan(1);
});