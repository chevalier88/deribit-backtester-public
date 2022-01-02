/* takes in parameters derived from the old graybot .csv output to continuously obtain hourly or other periodic UPPER BAND, LOWER BAND, MOVING AVERAGE, and STOP LOSS BANDS */

// import { readFileSync } from 'fs';
// import WebSocket from 'ws';
// import * as child from 'child_process';
// import { candlesticker, reauthenticator } from './functions.js';
// import { read } from './jsonFileStorage.js';

// require method because of module error with child spawning
const fs = require('fs');
// const WebSocket = require('ws');
const { spawn } = require('child_process');
const jfs = require('./jsonFileStorage.js');
const fn = require('./functions.js');
// spawn child process for python script
// took forever to figure out synchronous JSON file reading into javascript constants
// adapted from https://stackoverflow.com/questions/10011011/using-node-js-how-do-i-read-a-json-file-into-server-memory
// const WebSocket = require('ws');

const serverPort = 3000;
const http = require('http');
const express = require('express');

const app = express();
const server = http.createServer(app);
const WebSocket = require('ws');

const websocketServer = new WebSocket.Server({ server });

const config = JSON.parse(fs.readFileSync('config.json').toString());

console.log(config);

// instantiate LEGS and TF (timeframe)
const { FRONT_LEG } = config;
const { MID_LEG } = config;
const { BACK_LEG } = config;

const { TF } = config;

console.log('printing legs and tf...');
console.log(FRONT_LEG, MID_LEG, BACK_LEG, TF);

// instantiate JOHANSEN VECTORS
const { FRONT_VECTOR } = config;
const { MIDDLE_VECTOR } = config;
const { BACK_VECTOR } = config;

console.log('printing vectors...');
console.log(FRONT_VECTOR, MIDDLE_VECTOR, BACK_VECTOR);

// instantiate BOLLINGER PARAMS
const { LOOKBACK } = config;
const { STD_DEV } = config;
let spreadTicks = [];

// read in initial JSON
// const pureSpreads = [];
const { TEST_TIMESTAMP } = config;
const { API_KEY } = config;
const { SECRET } = config;
const initialJSONfilename = `./data/${TEST_TIMESTAMP}_${TF}.json`;

console.log(`initial JSON filename is ${initialJSONfilename}`);

function readCallback(objectToRead) {
  // console.log(objectToRead.spread);
  // taken from https://stackoverflow.com/questions/41221672/extract-only-values-from-json-object-in-javascript-without-using-a-loop
  // pureSpreads = Object.keys(objectToRead.spread).map((key) => objectToRead.spread[key]);

  const initialSpreads = objectToRead.spread;
  Object.keys(initialSpreads).map((key) => {
    const tempSpread = { tick: Number(key), spread: initialSpreads[key] };
    spreadTicks.push(tempSpread);
  });
  console.log('printing ALL spread ticks...');
  console.log(spreadTicks);

  spreadTicks = spreadTicks.slice(-25);
  console.log('printing last 25 spreads in spreadTicks...');
  console.log(spreadTicks);
}

jfs.read(initialJSONfilename, readCallback);

console.log(`lookback is ${LOOKBACK}, std deviation is ${STD_DEV}`);
// instantiate BOLLINGER BAND INDICATORS

let UPPER_BAND;
let LOWER_BAND;
let MOVING_AVERAGE;
let LONG_STOP_LOSS_BAND;
let SHORT_STOP_LOSS_BAND;

// run a constantly running CSV reader that gets the hourly
// Bollinger Data and updates the BOLLINGER CONSTANTS

// authenticate and open Websockets connection
const ws = new WebSocket('wss://test.deribit.com/ws/api/v2');

let refreshToken;
const authID = 9929;
const subscribeID = 2000;

let reauthenticateState = false;
let expiresIn;

// testnet only auth message.
const authMsg = {
  jsonrpc: '2.0',
  id: authID,
  method: 'public/auth',
  params: {
    grant_type: 'client_credentials',
    client_id: API_KEY,
    client_secret: SECRET,
  },
};

const frontChartString = `chart.trades.${FRONT_LEG}.${TF}`;
const midChartString = `chart.trades.${MID_LEG}.${TF}`;
const backChartString = `chart.trades.${BACK_LEG}.${TF}`;

const frontLegTicks = [];
const midLegTicks = [];
const backLegTicks = [];

const subscribeMsg = {
  jsonrpc: '2.0',
  id: subscribeID,
  method: 'public/subscribe',
  params: {
    channels: [
      frontChartString,
      midChartString,
      backChartString,
    ],
  },
};

// instantiate initial reauthenticate state
// let reauthenticateState = false;

ws.onmessage = function (e) {
  // do something with the response...
  // console.log('received from server : ', e.data);
  // console.log(e.data);

  const message = JSON.parse(e.data);
  // console.log(message);

  if (message.id === authID) {
    if (reauthenticateState === false) {
      console.log('initial authentication successful!');
      console.log(`session expires in ${message.result.expires_in / 1000 / 60} minutes...`);

      // store refresh token
      refreshToken = message.result.refresh_token;

      // for mainnet, but 10 mins or 600k millseconds refresh is safe

      // expiresIn = message.result.expires_in;

      expiresIn = 60000;
      console.log(`...but we will reauthenticate in ${expiresIn / 1000} seconds`);

      console.log('new refresh token stored');
      console.log(`current refresh token is ${refreshToken}`);

      reauthenticateState = true;
      setTimeout(() => {
        fn.reauthenticator(authID, refreshToken, ws);
      }, expiresIn);
      console.log('reauthenticateState is now true');
    } else {
      // get datetime now
      const today = new Date();
      const date = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
      const time = `${today.getHours()}:${today.getMinutes()}:${today.getSeconds()}`;
      const dateTime = `${date} ${time}`;

      console.log(`Successfully Refreshed your Auth at ${dateTime}!`);

      // store refresh token
      refreshToken = message.result.refresh_token;

      // reset expiry time
      expiresIn = 60000;

      setTimeout(() => {
        fn.reauthenticator(authID, refreshToken, ws);
      }, expiresIn);
      console.log(`new refresh token: ${refreshToken}`);
      console.log(`refreshing in ${expiresIn / 1000} seconds`);
    }
  }
  // adapted from this: https://stackoverflow.com/questions/51685383/settimeout-callback-argument-must-be-a-function/51685407

  // eslint-disable-next-line max-len
  fn.candlesticker(message, FRONT_LEG, MID_LEG, BACK_LEG, frontLegTicks, midLegTicks, backLegTicks, spreadTicks);

  const childPython = spawn('python', ['bollinger.py', JSON.stringify(spreadTicks)]);

  childPython.stdout.on('data', (data) => {
    console.log('stdout output:\n');
    // console.log(`data type is ${typeof (data)}`);
    const pythonObject = JSON.parse(data);
    MOVING_AVERAGE = pythonObject[0].moving_average;
    LOWER_BAND = pythonObject[0].lower_band;
    UPPER_BAND = pythonObject[0].upper_band;
    LONG_STOP_LOSS_BAND = pythonObject[0].long_sl_band;
    SHORT_STOP_LOSS_BAND = pythonObject[0].short_sl_band;

    console.log('printing current spreadTicks array...');
    console.log(spreadTicks);
    console.log(`spreadTicks length length: ${spreadTicks.length}`);
    console.log(pythonObject);
    console.log(`Unix Datetime now: ${Date.now()}`);
    console.log(`reauthenticate state: ${reauthenticateState}`);
  });
  childPython.stderr.on('data', (data) => {
    console.error(`stderr error: ${data.toString()}`);
  });
};

ws.onopen = function () {
  ws.send(JSON.stringify(authMsg));
  // subscribe to instrument tickers
  ws.send(JSON.stringify(subscribeMsg));
};

// taken from https://blog.kevinchisholm.com/javascript/node-js/websocket-server-five-minutes/

// when a websocket connection is established
websocketServer.on('connection', (webSocketClient) => {
  // send feedback to the incoming connection
  webSocketClient.send('{ "connection" : "ok"}');

  // when a message is received
  webSocketClient.on('message', (message) => {
    // for each websocket client
    websocketServer
      .clients
      .forEach((client) => {
        // send the client the current message
        client.send(`{ "message" : "${message}",
        "date_now":${Date.now()},
        "moving_average": ${MOVING_AVERAGE},
        "lower_band":${LOWER_BAND},
        "upper_band":${UPPER_BAND},
        "long_sl_band":${LONG_STOP_LOSS_BAND},
        "short_sl_band":${SHORT_STOP_LOSS_BAND}}`);
      });
  });
});

// start the web server
server.listen(serverPort, () => {
  console.log(`Websocket server started on port ${serverPort}`);
});
// build bollinger values that keep refreshing

// transmit as websocket server

console.log('script read in');
