// require method because of module error with child spawning
const fs = require('fs');
const { spawn } = require('child_process');
// const jfs = require('./jsonFileStorage.js');
const fn = require('./functions.js');

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
// instantiate leg name constants, tf, and sinceDay for pulling data 
const frontLeg = "ETH-30SEP22"
const midLeg = "ETH-24JUN22"
const backLeg = "ETH-PERPETUAL"

const tf = "30";
// build constants to get
const sinceDay = fn.toTimestamp(2021, 6, 1);
const now = Date.now();

const testMsg = {
  "params": {
    "since_day_input": "default",
    "front_leg":"ETH-24JUN22",
    "mid_leg":"ETH-25MAR22",
    "back_leg":"BTC-PERPETUAL",
    "tf":60,
  }
}
console.log(`sinceDay: ${sinceDay}, now: ${now}`);

// instantiate empty array to append/push json results to
const tfObject = {"tf":tf};

const tripleDataframeArray = [];

// function to send messages for chart data




ws.onmessage = function (e) {
  console.log("receiving message...")
  const message = JSON.parse(e.data);
  const result = message["result"];
  const id = message["id"];
  if(result){
    if(id === 100){
      const frontLegObject = {
        leg: frontLeg, 
        ticks: result["ticks"],
        close: result["close"],
      }
      tripleDataframeArray.push(frontLegObject);
      console.log(`pushed ${frontLeg} onto tripleDataframeArray`)      
    } else if(id === 200){
      const midLegObject = {
        leg: midLeg, 
        ticks: result["ticks"],
        close: result["close"],
      }
      tripleDataframeArray.push(midLegObject);
      console.log(`pushed ${midLeg} onto tripleDataframeArray`)      
    } else if (id === 300){
      const backLegObject = {
        leg: backLeg,
        ticks: result["ticks"],
        close: result["close"],
      }
      tripleDataframeArray.push(backLegObject);
      console.log(`pushed ${backLeg} onto tripleDataframeArray`)      
    }

  } else if(message["error"]){
    let error_message = message['error']['message']
    let error_code = message['error']['code']
    console.log(`you've got a deribit websocket error: ${error_message}, code ${error_code}`)

  } else {
    console.error('websocket error')
  }

  console.log(Object.keys(tripleDataframeArray));
  if (Object.keys(tripleDataframeArray).length === 3){
    console.log(`print first item in Array`)
    console.log(tripleDataframeArray[0])
    // appending timeframe also
    tripleDataframeArray.push(tfObject)
    fs.writeFile('./test.json', JSON.stringify(tripleDataframeArray), (err) => {
    if (err) {
        throw err;
    }
    console.log(Object.keys(tripleDataframeArray));
    console.log("JSON data is saved.");
    ws.close()
});
  }
}

// open the websocket to Deribit
ws.onopen = function () {
  console.log("opening deribit websocket connection...")
  console.log("sending chart messages..")

  let frontLegMsg = fn.chartMsg(frontLeg, 100);
  let midLegMsg = fn.chartMsg(midLeg, 200);
  let backLegMsg = fn.chartMsg(backLeg, 300);

  ws.send(JSON.stringify(frontLegMsg));
  ws.send(JSON.stringify(midLegMsg));
  ws.send(JSON.stringify(backLegMsg));
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
        const childPython = spawn('python', ['backtester.py', JSON.stringify(tripleDataframeArray)]);
        childPython.stdout.on('data', (data) => {
          console.log('stdout output:\n');
          const dataObject = data.toString()
          console.log(JSON.parse(dataObject)); //works for output_string, not json df
          client.send(dataObject);
          // console.log(JSON.parse(data))
          // const pythonObject = JSON.parse(data);
          // console.log(pythonObject);
          // client.send(pythonObject);
          // console.log(`receiving an ${typeof (pythonObject)} from backtester.py...`);
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
