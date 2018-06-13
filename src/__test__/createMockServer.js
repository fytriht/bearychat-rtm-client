import { RTMMessageTypes } from '..';
import { Server, WebSocket } from 'mock-socket';
import delay from '../delay';

const SERVER_TIMEOUT = 200;

export const CLIENT_PING_INTERVAL = 100;
export const CLIENT_PING_TIMEOUT = 50;
export const BACKOFF_MULTIPLIER = 100;

let urlCounter = 0;

function generateMockUrl() {
  return 'ws://rtm.local.bearychat.com/nimbus/ws:fake-token' + (urlCounter++);
}

export default async function createMockServer(ignorePing = false) {
  const mockUrl = generateMockUrl();
  const mockServer = new Server(mockUrl);

  mockServer.on('connection', (server) => {

    setTimeout(() => {
      // send self connection
      server.send(JSON.stringify({
        data: {
          connection: 'connected',
          uid: '=bw52O'
        },
        '': Date.now(),
        type: 'update_user_connection'
      }));
    }, 5);

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

      if (ignorePing && message.type === RTMMessageTypes.PING) {
        return;
      }

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

  return {
    url: mockUrl,
    server: mockServer
  };
}
