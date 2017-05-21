import RTMClient, { RTMClientEvents } from "../";
import { WebSocket } from "mock-socket";

let server, url;

beforeEach(async () => {
  const result = await createMockServer();
  server = result.server;
  url = result.url;
});

afterEach(done => {
  server.stop(done);
});

test('send message', () => {
  return new Promise(async (resolve) => {
    const client = new RTMClient({
      url,
      WebSocket,
      pingInterval: CLIENT_PING_INTERVAL
    });

    try {
      await client.send({
        padding: 1
      });
    } catch (e) {
      expect(e.message).toMatch('not connected');
    }

    const onlineHandler = jest.fn(async () => {
      const reply = await client.send({ padding: 2 });
      expect(reply.type).toBe('reply');
      expect(reply.status).toBe('ok');

      const reply2 = await client.send({
        call_id: 65533,
        padding: 3
      });
      expect(reply2.type).toBe('reply');
      expect(reply2.status).toBe('ok');
      expect(reply2.call_id).toBe(65533);

      const reply3 = await client.send({
        padding: 4
      }, 50);
      expect(reply3.type).toBe('reply');
      expect(reply3.status).toBe('ok');

      try {
        await client.send({
          padding: 5
        }, 10);
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