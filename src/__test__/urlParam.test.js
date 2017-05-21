import RTMClient, { RTMClientEvents } from "../";
import { WebSocket } from "mock-socket";

let server, url;

beforeEach(async () => {
  const result = await createMockServer();
  server = result.server;
  url = result.url;
});

afterEach(() => {
  return new Promise((resolve) => {
    server.stop(resolve);
  });
});

describe('url param', () => {
  test('url param resolve', () => {
    return new Promise((resolve) => {
      const client = new RTMClient({
        url() {
          return Promise.resolve(url)
        },
        WebSocket,
        pingInterval: CLIENT_PING_INTERVAL
      });

      const onlineHandler = jest.fn(() => {
        client.close();
      });
      const errorHandler = jest.fn();
      const closeHandler = jest.fn(() => {
        expect(onlineHandler).toBeCalled();
        expect(errorHandler).not.toBeCalled();
        expect(closeHandler).toBeCalled();
        resolve();
      });

      client.on(RTMClientEvents.ONLINE, onlineHandler);
      client.on(RTMClientEvents.ERROR, errorHandler);
      client.on(RTMClientEvents.CLOSE, closeHandler);
    });
  });

  test('url param reject', () => {
    return new Promise((resolve) => {
      const client = new RTMClient({
        url() {
          return Promise.reject()
        },
        pingInterval: CLIENT_PING_INTERVAL
      });

      const onlineHandler = jest.fn();
      const errorHandler = jest.fn(() => {
        client.close();
      });
      const closeHandler = jest.fn(() => {
        expect(onlineHandler).not.toBeCalled();
        expect(errorHandler).toBeCalled();
        expect(closeHandler).toBeCalled();
        resolve();
      });

      client.on(RTMClientEvents.ONLINE, onlineHandler);
      client.on(RTMClientEvents.ERROR, errorHandler);
      client.on(RTMClientEvents.CLOSE, closeHandler);
    });
  });
});
