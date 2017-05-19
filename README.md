# BearyChat OpenAPI RTM Client

Compatible with Node.js, Webpack and Browserify.

[![@BearyChat](http://openapi.beary.chat/badge.svg)](http://openapi.beary.chat/join)
[![npm version](https://badge.fury.io/js/bearychat-rtm-client.svg)](https://npmjs.com/package/bearychat-rtm-client)

<!-- toc -->

- [Install](#install)
- [Usage](#usage)
  * [API](#api)
    + [RTMClient](#rtmclient)
  * [Browser usage:](#browser-usage)
  * [Node.js usage:](#nodejs-usage)
  * [Client events](#client-events)
  * [Client state](#client-state)
  * [RTM events](#rtm-events)
  * [Examples](#examples)
- [LICENSE](#license)

<!-- tocstop -->

## Install

```bash
npm install bearychat-rtm-client --save
```

or with `yarn`
```bash
yarn add bearychat-rtm-client
```

## Usage

### API

#### RTMClient
`constructor({ url, WebSocket })`

| Param | Description |
| ---- | ---- |
| url | a websocket url or a function returns a promise that resolves to a websocket url |
| WebSocket | a W3C compatible WebSocket client implement |

### Browser usage:

RTMClient uses native WebSocket in browser.

```javascript
import bearychat from 'bearychat';
import RTMClient from 'bearychat-rtm-client';
const RTMClientEvents = RTMClient.RTMClientEvents;

const client = new RTMClient({
  url() {
    return bearychat.rtm.start({token: '<your hubot token>'})
      .then(resp => resp.json())
      .then(data => data.ws_host);
  }
});

client.on(RTMClientEvents.ONLINE, function() {
  console.log('RTM online');
});

client.on(RTMClientEvents.OFFLINE, function() {
  console.log('RTM offline');
});

client.on(RTMClientEvents.EVENT, function(message) {
  console.log('event message received: ', message);
});

client.send({
  // your message body
});

```

### Node.js usage:

RTMClient need a W3C compatible WebSocket client implement. [ws](https://github.com/websockets/ws) version 3.0.0+ is recommended.

```javascript
const bearychat = require('bearychat');
const RTMClient = require('bearychat-rtm-client');
const RTMClientEvents = RTMClient.RTMClientEvents;
const WebSocket = require('ws');

const client = new RTMClient({
  url: function() {
    return bearychat.rtm.start({token: '<your hubot token>'})
      .then(function (resp) {return resp.json()})
      .then(function (data) {return data.ws_host});
  },
  WebSocket: WebSocket
});

client.on(RTMClientEvents.ONLINE, function() {
  console.log('RTM online');
});

client.on(RTMClientEvents.OFFLINE, function() {
  console.log('RTM offline');
});

client.on(RTMClientEvents.EVENT, function(message) {
  console.log('event message received: ', message);
});

client.send({
  // your message body
});

```

### Client events

| Event | Description |
| ----- | ----------- |
| RTMClientEvents.ONLINE| client connected |
| RTMClientEvents.OFFLINE | client disconnected |
| RTMClientEvents.CLOSE | client closed |
| RTMClientEvents.EVENT | receive event message from server |
| RTMClientEvents.ERROR | error occurred |

### Client state

```
                  INITIAL
                     +
        error        |
    +-------------+  |
    v             +  v        connect
RECONNECT+------->CONNECTING<---------+CLOSED
    ^                +                    ^
    |                |                    |
    |    server      |                    |
    |    close/      v        close       +
    +------------+CONNECTED+---------->CLOSING
         error
```

### RTM events

[RTM events](https://github.com/bearyinnovative/OpenAPI/blob/master/rtm/event.md)

### Examples

[BearyChat shell client](https://github.com/kenan2002/bcshell)

## LICENSE

MIT