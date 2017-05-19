import { EventEmitter } from 'events';
import warning from 'warning';
import invariant from 'invariant';
import delay from 'delay';
import RTMClientEvents from './RTMClientEvents';
import RTMClientState from './RTMClientState';
import RTMConnectionEvents from './RTMConnectionEvents';
import RTMConnection from './RTMConnection';
import RTMMessageTypes from './RTMMessageTypes';

class RTMTimeoutError extends Error {
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

  constructor(options) {
    super();

    options = options || {};
    const { url } = options;

    warning(
      url,
      '"url" is required.'
    );

    warning(
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
    try {
      wsUrl = await this._getUrl();
    } catch (e) {
      this._reconnect(); // intentionally ignore "await"
      this.emit(RTMClientEvents.ERROR, e);
      return;
    }

    this._reconnectAttempts = 1;
    this._setConnection(new RTMConnection({
      url: wsUrl,
      WebSocket: this.WebSocket
    }));
  };

  async _reconnect() {
    this._state = RTMClientState.RECONNECT;
    await delay(generateInterval(this._reconnectAttempts));
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
    const timeoutPromise = timeoutDelay(timeout, message);
    return Promise.race([sendPromise, timeoutPromise]);
  }

  _handleConnectionOpen = () => {
    this._state = RTMClientState.CONNECTED;
    this.emit(RTMClientEvents.ONLINE);
  };

  _handleConnectionClose = () => {
    this._removeConnection();
    this.emit(RTMClientEvents.OFFLINE);
    if (this._forceClose) {
      // client close, close normally
      this._state = RTMClientState.CLOSED;
      this.emit(RTMClientEvents.CLOSE);
      this._forceClose = false;
    } else {
      // server close or error, re-connect
      this._reconnect();
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
function generateInterval(attempts) {
  const maxInterval = Math.min(30, (Math.pow(2, attempts) - 1)) * 1000;
  return Math.random() * maxInterval;
}

async function timeoutDelay(timeout, message) {
  await delay(timeout);
  throw new RTMTimeoutError('RTM message send timeout.', message);
}
