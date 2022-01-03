// require method because of module error with child spawning
const fs = require('fs');
const { spawn } = require('child_process');
// const jfs = require('./jsonFileStorage.js');
// const fn = require('./functions.js');

const serverPort = 3000;
const http = require('http');
const express = require('express');

const app = express();
const server = http.createServer(app);
const WebSocket = require('ws');

// make local websocket server and deribit websocket client simultaneously
const websocketServer = new WebSocket.Server({ server });
const ws = new WebSocket('wss://www.deribit.com/ws/api/v2');

// get since day
// default is 2021-06-01
// taken from https://www.hashbangcode.com/article/convert-date-timestamp-javascript
function toTimestamp(year, month, day) {
  const datum = new Date(Date.UTC(year, month - 1, day));
  return datum.getTime();
}

// build constants to get
const sinceDay = toTimestamp(2021, 6, 1);
const now = Date.now();

console.log(`sinceDay: ${sinceDay}, now: ${now}`);

// instantiate empty array to append/push json results to
const tripleDataframeArray = [];

// open the websocket to Deribit
ws.onopen = function () {
  ws.send(JSON.stringify(authMsg));
  // subscribe to instrument tickers
  ws.send(JSON.stringify(subscribeMsg));
};

// when a websocket connection is established
websocketServer.on('connection', (webSocketClient) => {
  // send feedback to the incoming connection
  webSocketClient.send('{ "connection" : "ok"}');

  // when a message is received
  webSocketClient.on('message', (message) => {
    // for each websocket client
    console.log(message);

    websocketServer
      .clients
      .forEach((client) => {
        // send the client the current message
        const childPython = spawn('python', ['backtester.py', message]);
        childPython.stdout.on('data', (data) => {
          console.log('stdout output:\n');
          // console.log(data.toString());
          const pythonObject = JSON.parse(data);
          // client.send(pythonObject);
          console.log(`receiving an ${typeof (pythonObject)} from backtester.py...`);
          console.log(pythonObject);
          client.send(data.toString());
        });
        childPython.stderr.on('data', (data) => {
          console.error(`stderr error: ${data.toString()}`);
        });
      });
  });
});

server.listen(serverPort, () => {
  console.log(`backtester websocket server started on port ${serverPort}`);
});
