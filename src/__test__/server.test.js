import { RTMMessageTypes } from "../";
import { WebSocket } from "mock-socket";
import delay from "delay";

const WAIT_SERVER_CLOSE_TIMEOUT = 1000;

let server, url;

beforeEach(() => {
  const result = createMockServer();
  server = result.server;
  url = result.url;
});

afterEach(() => {
  server.stop();
});

test('server disconnects without heartbeat', async () => {
  const ws = new WebSocket(url);

  const errorHandler = jest.fn();
  const closeHandler = jest.fn();

  ws.onerror = errorHandler;
  ws.onclose = closeHandler;

  ws.send(JSON.stringify({
    call_id: 1,
    type: RTMMessageTypes.PING
  }));

  await delay(100);
  expect(closeHandler).not.toBeCalled();

  await delay(WAIT_SERVER_CLOSE_TIMEOUT);

  expect(errorHandler).not.toBeCalled();
  expect(closeHandler.mock.calls.length).toBe(1);
});