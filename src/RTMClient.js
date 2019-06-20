import { EventEmitter } from 'events';
import invariant from 'invariant';
import delay from './delay';
import withTimeout from './withTimeout';
import RTMClientEvents from './RTMClientEvents';
import RTMClientState from './RTMClientState';
import RTMConnectionEvents from './RTMConnectionEvents';
import RTMConnection, { RTMPingTimeoutError } from './RTMConnection';
import RTMMessageTypes from './RTMMessageTypes';

const ONE_MINUTE = 60 * 1000;

class RTMSendTimeoutError extends Error {
  constructor(errorMessage, rtmMessage) {
    super(errorMessage);
    this.rtmMessage = rtmMessage;
  }
}

class RTMNotConnectedError extends Error {
  constructor(errorMessage, rtmMessage) {
    super(errorMessage);
    this.rtmMessage = rtmMessage;
  }
}

class RTMReconnectTimeoutError extends Error {
  constructor(errorMessage) {
    super(errorMessage);
    this.constructor = RTMReconnectTimeoutError;
    this.__proto__ = RTMReconnectTimeoutError.prototype;
  }
};

/**
 * Keep an RTM client running with multiple.
 *
 * State diagram:
 *
 *                    INITIAL
 *                       +
 *          error        |
 *      +-------------+  |
 *      v             +  v        connect
 *  RECONNECT+------->CONNECTING<---------+CLOSED
 *      ^                +                    ^
 *      |                |                    |
 *      |    server      |                    |
 *      |    close/      v        close       +
 *      +------------+CONNECTED+---------->CLOSING
 *           error
 *
 * @constructor
 * @param {Object} options
 * @param {string|Function} options.url - A string or a function returning
 *                                        a string or a Promise resolves to
 *                                        a string.
 */
export default class RTMClient extends EventEmitter {

  static RTMClientEvents = RTMClientEvents;

  static RTMClientState = RTMClientState;

  static RTMMessageTypes = RTMMessageTypes;

  static RTMReconnectTimeoutError = RTMReconnectTimeoutError;

  static RTMPingTimeoutError = RTMPingTimeoutError;

  constructor(options) {
    super();

    options = options || {};
    const { url } = options;

    invariant(
      url,
      '"url" is required.'
    );

    invariant(
      typeof url === 'string' || typeof url === 'function',
      '"url" must be a string or a function returning a string.'
    );

    let WebSocket = options.WebSocket;
    if (!WebSocket && typeof window !== 'undefined') {
      WebSocket = window.WebSocket;
    }

    invariant(
      WebSocket,
      'A Websocket client is required.'
    );

    this._url = url;
    this.WebSocket = WebSocket;

    this._pingTimeout = options.pingTimeout || 15 * 1000;
    // following options are internal to speed up testing.
    this._pingInterval = options.pingInterval || 15 * 1000;
    this._backoffMultiplier = options.backoffMultiplier || 1000;

    this._reconnectTimeout = options.reconnectTimeout || ONE_MINUTE;

    this._connectionEvents = [
      [RTMConnectionEvents.OPEN, this._handleConnectionOpen],
      [RTMConnectionEvents.CLOSE, this._handleConnectionClose],
      [RTMConnectionEvents.ERROR, this._handleConnectionError],
      [RTMConnectionEvents.MESSAGE, this._handleConnectionMessage],
    ];

    this._state = RTMClientState.INITIAL;
    this._connection = null;
    this._forceClose = false;
    this._reconnectAttempts = 1;

    this.connect();
  }

  connect() {
    invariant(
      this._state === RTMClientState.INITIAL ||
      this._state === RTMClientState.CLOSED ||
      this._state === RTMClientState.RECONNECT,
      'Invalid state: connect() should always be called when current state ' +
      'is "%s", "%s" or "%s" but the current state is "%s".',
      RTMClientState.INITIAL,
      RTMClientState.CLOSED,
      RTMClientState.RECONNECT,
      this._state
    );

    this._doConnect();
  }

  _doConnect = async () => {
    this._state = RTMClientState.CONNECTING;

    let wsUrl;
    const timeoutMessage = new RTMReconnectTimeoutError('Reget websocket url error');
    try {
      wsUrl = await withTimeout(this._reconnectTimeout, timeoutMessage, this._getUrl());
    } catch (e) {
      this._reconnect(); // intentionally ignore "await"
      this.emit(RTMClientEvents.ERROR, e);
      return;
    }

    this._reconnectAttempts = 1;
    this._setConnection(new RTMConnection({
      url: wsUrl,
      WebSocket: this.WebSocket,
      pingInterval: this._pingInterval,
      pingTimeout: this._pingTimeout
    }));
  };

  async _reconnect() {
    this._state = RTMClientState.RECONNECT;
    await delay(generateInterval(this._reconnectAttempts, this._backoffMultiplier));
    this._reconnectAttempts++;
    this.connect();
  }

  async _getUrl() {
    const url = this._url;

    if (typeof url === 'string') {
      return url;
    }

    // assume url is a function
    return await url();
  }

  close() {
    if (this._connection && this._state !== RTMClientState.CLOSING) {
      this._state = RTMClientState.CLOSING;
      this._forceClose = true;
      this._connection.close();
    } else if (this._state !== RTMClientState.CLOSED) {
      this._state = RTMClientState.CLOSED;
      this.emit(RTMClientEvents.CLOSE);
    }
  }

  async _send(message) {
    if (this._connection) {
      return await this._connection.send(message);
    }
    throw new RTMNotConnectedError(
      'Client currently not connected, the current state is: ' + this.getState()
    );
  }


  async send(message, timeout) {
    if (!timeout || timeout < 0) {
      timeout = Infinity;
    }

    if (!Number.isFinite(timeout)) {
      return await this._send(message);
    }

    const sendPromise = this._send(message);
    const timeoutMessage = new RTMSendTimeoutError('RTM message send timeout.', message);
    return withTimeout(timeout, timeoutMessage, sendPromise);
  }

  _handleConnectionOpen = () => {
    this._state = RTMClientState.CONNECTED;
    this.emit(RTMClientEvents.ONLINE);
  };

  _handleConnectionClose = () => {
    this._removeConnection();
    if (this._forceClose) {
      // client close, close normally
      this._state = RTMClientState.CLOSED;
      this.emit(RTMClientEvents.OFFLINE);
      this.emit(RTMClientEvents.CLOSE);
      this._forceClose = false;
    } else {
      // server close or error, re-connect
      this._reconnect();
      this.emit(RTMClientEvents.OFFLINE);
    }
  };

  _handleConnectionError = (error) => {
    this.emit(RTMClientEvents.ERROR, error);
  };

  _handleConnectionMessage = (message) => {
    this.emit(RTMClientEvents.EVENT, message);
  };

  getState() {
    return this._state;
  }

  _setConnection(connection) {
    if (process.env.NODE_ENV !== 'production') {
      invariant(
        !this._connection,
        'Should not set connection when connection already exists.'
      );
    }

    this._connectionEvents.forEach(([name, handler]) => {
      connection.on(name, handler);
    });

    this._connection = connection;
  }

  _removeConnection() {
    const connection = this._connection;

    if (process.env.NODE_ENV !== 'production') {
      invariant(
        connection,
        'Connection not set or already removed.'
      );
    }

    this._connectionEvents.forEach(([name, handler]) => {
      connection.removeListener(name, handler);
    });

    this._connection = null;
  }
}

// exponential backoff, 30 seconds max
function generateInterval(attempts, multiplier = 1000) {
  const maxInterval = Math.min(30, (Math.pow(2, attempts) - 1)) * multiplier;
  return Math.random() * maxInterval;
}
