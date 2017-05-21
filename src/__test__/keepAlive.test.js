import RTMClient, { RTMClientEvents } from "../";
import { WebSocket } from "mock-socket";
import delay from "delay";

const KEEP_ALIVE_TIMEOUT = 2000;

let server, url;

beforeEach(async () => {
  const result = await createMockServer();
  server = result.server;
  url = result.url;
});

afterEach(done => {
  server.stop(done);
});

test('keep alive', async () => {
  const client = new RTMClient({
    url,
    WebSocket,
    pingInterval: CLIENT_PING_INTERVAL
  });

  const errorHandler = jest.fn();
  const closeHandler = jest.fn();
  const onlineHandler = jest.fn();
  const offlineHandler = jest.fn();
  const eventHandler = jest.fn();

  client.on(RTMClientEvents.ERROR, errorHandler);
  client.on(RTMClientEvents.CLOSE, closeHandler);
  client.on(RTMClientEvents.ONLINE, onlineHandler);
  client.on(RTMClientEvents.OFFLINE, offlineHandler);
  client.on(RTMClientEvents.EVENT, eventHandler);

  expect(offlineHandler).not.toBeCalled();
  expect(closeHandler).not.toBeCalled();
  expect(eventHandler).not.toBeCalled();

  await delay(KEEP_ALIVE_TIMEOUT);

  client.close();

  expect(errorHandler).not.toBeCalled();
  expect(onlineHandler.mock.calls.length).toBe(1);
  expect(offlineHandler.mock.calls.length).toBe(1);
  expect(closeHandler.mock.calls.length).toBe(1);
  expect(eventHandler.mock.calls.length).toBe(1);
});