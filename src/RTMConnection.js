import { EventEmitter } from 'events';
import RTMConnectionState from './RTMConnectionState';
import RTMConnectionEvents from './RTMConnectionEvents';
import RTMMessageTypes from './RTMMessageTypes';
import delay from './delay';
import invariant from 'invariant';

export class RTMPingTimeoutError extends Error {
  constructor(errorMessage) {
    super(errorMessage);
    this.constructor = RTMPingTimeoutError;
    this.__proto__ = RTMPingTimeoutError.prototype;
  }
}

/**
 * Keep a WebSocket connection with server, handling heartbeat events,
 * omitting obsolete message types.
 *
 * State diagram:
 *
 *    INITIAL
 *       +
 *       |
 *       |
 *       v
 *   CONNECTED +-+
 *       +       |
 * client|       |
 * close |       | server
 *       v       | close/
 *    CLOSING    | error
 *       +       |
 *       |       |
 *       |       |
 *       v       |
 *    CLOSED <---+
 */
export default class RTMConnection extends EventEmitter {

  state = {};

  constructor({ url, WebSocket, pingInterval, pingTimeout }) {
    super();
    this._pingTimeout = pingTimeout;
    this._pingInterval = pingInterval;
    this._currentCallId = 0;
    this._state = RTMConnectionState.INITIAL;
    this._ws = new WebSocket(url);
    this._callbackMap = new Map();
    this._lastSentTs = 0;

    this._ws.addEventListener('open', this._handleOpen);
    this._ws.addEventListener('close', this._handleClose);
    this._ws.addEventListener('message', this._handleMessage);
    this._ws.addEventListener('error', this._handleError);
  }

  _handleOpen = () => {
    this._state = RTMConnectionState.CONNECTED;
    this.emit(RTMConnectionEvents.OPEN);
    this._startLoop();
  };

  _handleClose = () => {
    this._state = RTMConnectionState.CLOSED;
    this.emit(RTMConnectionEvents.CLOSE);
  };

  _handleMessage = (event) => {
    const message = JSON.parse(event.data);
    switch (message.type) {
      case RTMMessageTypes.PONG:
      case RTMMessageTypes.OK:
        // ignore deprecated events
        break;
      case RTMMessageTypes.REPLY:
        this._handleReplyMessage(message);
        break;
      default:
        this.emit(RTMConnectionEvents.MESSAGE, message);
    }
  };

  _handleReplyMessage(message) {
    const callbackMap = this._callbackMap;
    const callId = message.call_id;

    if (process.env.NODE_ENV !== 'production') {
      invariant(
        callbackMap.has(callId),
        'Call id replied without sending: %s',
        callId
      );
    }

    const callback = callbackMap.get(callId);
    callbackMap.delete(callId);
    callback && callback(message);
  }

  _handleError = (error) => {
    this.emit(RTMConnectionEvents.ERROR, error);
  };

  _getNextCallId() {
    return this._currentCallId++;
  }

  async send(message) {
    try {
      return await this._send(message);
    } catch (error) {
      if (error instanceof RTMPingTimeoutError) {
        if (this._state !== RTMConnectionState.CLOSED) {
          this.emit(RTMConnectionEvents.ERROR, error);
          this._terminate('Reply timeouted.');
        }
      }
      throw error;
    }
  }

  _send(message) {
    if (!message.call_id) {
      message = {
        ...message,
        call_id: this._getNextCallId()
      };
    }

    const callbackMap = this._callbackMap;
    const callId = message.call_id;

    invariant(
      !callbackMap.has(callId),
      'Duplicate call id %s',
      callId
    );

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new RTMPingTimeoutError());
      }, this._pingTimeout);

      callbackMap.set(callId, (...args) => {
        clearTimeout(timer);
        resolve(...args);
      });

      this._lastSentTs = Date.now();
      this._ws.send(JSON.stringify(message));
    });
  }

  _ping() {
    this.send({
      type: RTMMessageTypes.PING
    }).catch(() => { /* noop */ });
  }

  _startLoop = async () => {
    while (this._state === RTMConnectionState.CONNECTED) {
      const elapsed = Date.now() - this._lastSentTs;
      if (elapsed < this._pingInterval) {
        await delay(this._pingInterval - elapsed);
        continue;
      }

      this._ping();
      await delay(this._pingInterval);
    }
  };

  close(reason) {
    this._state = RTMConnectionState.CLOSING;
    this._ws.close(1000, reason);
  }

  _terminate(reason) {
    this._ws.removeEventListener('open', this._handleOpen);
    this._ws.removeEventListener('close', this._handleClose);
    this._ws.removeEventListener('message', this._handleMessage);
    this._ws.removeEventListener('error', this._handleError);
    this._state = RTMConnectionState.CLOSED;
    this.emit(RTMConnectionEvents.CLOSE);

    this._ws.close(1000, reason);
  }
}
