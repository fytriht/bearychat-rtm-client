import RTMClient, { RTMClientEvents, RTMMessageTypes } from "../";
import { Server, WebSocket } from "mock-socket";
import delay from "delay";

process.on('unhandledRejection', (reason) => {
  throw reason;
});

const SERVER_TIMEOUT = 200;
const CLIENT_PING_INTERVAL = 100;
const WAIT_SERVER_CLOSE_TIMEOUT = 1000;
const KEEP_ALIVE_TIMEOUT = 2000;
const BACKOFF_MULTIPLIER = 100;

const mockUrl = 'ws://rtm.local.bearychat.com/nimbus/ws:fake-token';
let mockServer = null;

function setupServer() {
  mockServer = new Server(mockUrl);

  mockServer.on('connection', server => {

    // send self connection
    server.send(JSON.stringify({
      data: {
        connection: 'connected',
        uid: '=bw52O'
      },
      '': Date.now(),
      type: 'update_user_connection'
    }));

    let timeoutId;
    const clearServerTimeout = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = void 0;
      }
    };
    const resetServerTimeout = () => {
      clearServerTimeout();
      timeoutId = setTimeout(() => {
        server.close();
      }, SERVER_TIMEOUT);
    };

    resetServerTimeout();

    server.on('message', async (message) => {
      resetServerTimeout();

      message = JSON.parse(message);

      await delay(20);

      server.send(JSON.stringify({
        code: 0,
        status: 'ok',
        ts: Date.now(),
        type: RTMMessageTypes.REPLY,
        call_id: message.call_id
      }));

      // send deprecated messages to ensure client filters them
      if (message.type === RTMMessageTypes.PING) {
        server.send(JSON.stringify({
          reply_to: message.call_id,
          ts: Date.now(),
          type: RTMMessageTypes.PONG
        }));
      } else {
        server.send(JSON.stringify({
          reply_to: message.call_id,
          text: 'hi',
          ts: Date.now(),
          type: RTMMessageTypes.OK
        }));
      }
    });
  });
}

function stopServer() {
  mockServer.stop();
  mockServer = null;
}

beforeEach(setupServer);

afterEach(stopServer);

test('server disconnects without heartbeat', async () => {
  const ws = new WebSocket(mockUrl);

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

test('keep alive', async () => {
  const client = new RTMClient({
    url: mockUrl,
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

test('reconnect', async () => {
  const client = new RTMClient({
    url: mockUrl,
    WebSocket,
    pingInterval: CLIENT_PING_INTERVAL,
    backoffMultiplier: BACKOFF_MULTIPLIER
  });

  const onlineHandler = jest.fn(async () => {
    // stop server then restart later
    mockServer.close();
    stopServer();
    setupServer();
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

test('send message', () => {
  return new Promise(async (resolve) => {
    const client = new RTMClient({
      url: mockUrl,
      WebSocket,
      pingInterval: CLIENT_PING_INTERVAL
    });

    try {
      await client.send({});
    } catch (e) {
      expect(e.message).toMatch('not connected');
    }

    const onlineHandler = jest.fn(async () => {
      const reply = await client.send({});
      expect(reply.type).toBe('reply');
      expect(reply.status).toBe('ok');

      const reply2 = await client.send({
        call_id: 65533
      });
      expect(reply2.type).toBe('reply');
      expect(reply2.status).toBe('ok');
      expect(reply2.call_id).toBe(65533);

      const reply3 = await client.send({}, 50);
      expect(reply3.type).toBe('reply');
      expect(reply3.status).toBe('ok');

      try {
        await client.send({}, 10);
      } catch (e) {
        expect(e.message).toMatch('timeout');
      }

      client.close();
    });

    const closeHandler = jest.fn(() => {
      expect(closeHandler.mock.calls.length).toBe(1);
      expect(onlineHandler.mock.calls.length).toBe(1);
      resolve();
    });

    client.on(RTMClientEvents.ONLINE, onlineHandler);
    client.on(RTMClientEvents.CLOSE, closeHandler);
  });
});

test('url param resolve', () => {
  return new Promise((resolve) => {
    const client = new RTMClient({
      url() {
        return Promise.resolve(mockUrl)
      },
      WebSocket,
      pingInterval: CLIENT_PING_INTERVAL
    });

    const onlineHandler = jest.fn(() => {
      client.close();
    });
    const errorHandler = jest.fn();

    client.on(RTMClientEvents.ONLINE, onlineHandler);
    client.on(RTMClientEvents.ERROR, errorHandler);
    client.on(RTMClientEvents.CLOSE, () => {
      expect(onlineHandler).toBeCalled();
      expect(errorHandler).not.toBeCalled();
      resolve();
    });
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

    client.on(RTMClientEvents.ONLINE, onlineHandler);
    client.on(RTMClientEvents.ERROR, errorHandler);
    client.on(RTMClientEvents.CLOSE, () => {
      expect(onlineHandler).not.toBeCalled();
      expect(errorHandler).toBeCalled();
      resolve();
    });
  });
});
