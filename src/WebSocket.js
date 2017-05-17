const isNode = require('detect-node');

if (isNode) {
  module.exports = require('ws');
} else {
  module.exports = window.WebSocket;
}
