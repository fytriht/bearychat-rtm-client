import RTMClient, { RTMClientEvents, RTMMessageTypes, RTMClientState } from "../";
import { WebSocket } from "mock-socket";
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

test('state', () => {
  return new Promise((resolve) => {
    const client = new RTMClient({
      url: () => url,
      WebSocket,
      pingInterval: CLIENT_PING_INTERVAL,
      backoffMultiplier: BACKOFF_MULTIPLIER
    });

    const onlineHandler = jest.fn()
      .mockImplementationOnce(async () => {
        expect(client.getState()).toBe(RTMClientState.CONNECTED);
        await delay(100);
        server.close();
        const result = createMockServer();
        server = result.server;
        url = result.url;
      })
      .mockImplementation(() => {
        client.close();
      });

    const offlineStateChecker = jest.fn();

    const offlineHandler = jest.fn(() => {
      offlineStateChecker(client.getState());
    });

    const eventHandler = jest.fn(() => {
      expect(client.getState()).toBe(RTMClientState.CONNECTED);
    });

    const closeHandler = jest.fn(() => {
      expect(client.getState()).toBe(RTMClientState.CLOSED);

      expect(onlineHandler.mock.calls.length).toBe(2);
      expect(closeHandler.mock.calls.length).toBe(1);
      expect(offlineHandler.mock.calls.length).toBe(2);
      expect(eventHandler).toBeCalled();

      for (let i = 0; i < offlineStateChecker.mock.calls.length; ++i) {
        const call = offlineStateChecker.mock.calls[i];
        if (i !== offlineStateChecker.mock.calls.length - 1) {
          expect(call[0]).toBe(RTMClientState.RECONNECT);
        } else {
          expect(call[0]).toBe(RTMClientState.CLOSED);
        }
      }

      resolve();
    });

    client.on(RTMClientEvents.ONLINE, onlineHandler);
    client.on(RTMClientEvents.OFFLINE, offlineHandler);
    client.on(RTMClientEvents.CLOSE, closeHandler);
    client.on(RTMClientEvents.EVENT, eventHandler);
  });
});
