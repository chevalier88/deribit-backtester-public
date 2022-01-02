// require method because of module error with child spawning
const fs = require('fs');
const { spawn } = require('child_process');
const jfs = require('./jsonFileStorage.js');
const fn = require('./functions.js');

const serverPort = 3000;
const http = require('http');
const express = require('express');

const app = express();
const server = http.createServer(app);
const WebSocket = require('ws');

const websocketServer = new WebSocket.Server({ server });
// const ws = new WebSocket('wss://www.deribit.com/ws/api/v2');

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
          console.log(pythonObject);
          // client.send(pythonObject);
          console.log(typeof (pythonObject));
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
