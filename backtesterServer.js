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

// function to send messages for chart data
function chartMsg(leg){
  return {
    "jsonrpc" : "2.0",
    "id" : 833,
    "method" : "public/get_tradingview_chart_data",
    "params" : {
      "instrument_name" : leg,
      "start_timestamp" : sinceDay,
      "end_timestamp" : now,
      "resolution" : "30"
    }
  };
} 

// instantiate leg name constants for 
const front_leg = "ETH-30SEP22"
const mid_leg = "ETH-24JUN22"
const back_leg = "ETH-PERPETUAL"

// open the websocket to Deribit
ws.onopen = function () {
  console.log("opening deribit websocket connection...")
  console.log("sending chart messages..")
  let front_leg_msg = chartMsg(front_leg);
  let mid_leg_msg = chartMsg(mid_leg);
  let back_leg_msg = chartMsg(back_leg);
  ws.send(JSON.stringify(front_leg_msg));
  ws.send(JSON.stringify(mid_leg_msg));
  ws.send(JSON.stringify(back_leg_msg));
};

ws.onmessage = function (e) {
  console.log("receiving message...")
  const message = JSON.parse(e.data);
  console.log(message);
}

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
