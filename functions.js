/* eslint-disable max-len */
// main functions used by index.js or bollingerGenerator.js
// import { readFileSync } from 'fs';
const fs = require('fs');
const { resolve } = require('path');

const config = JSON.parse(fs.readFileSync('config.json').toString());

// instantiate LEGS and TF (timeframe)
const { FRONT_LEG } = config;
const { MID_LEG } = config;
const { BACK_LEG } = config;

// instantiate JOHANSEN VECTORS
const { FRONT_VECTOR } = config;
const { MIDDLE_VECTOR } = config;
const { BACK_VECTOR } = config;

function reauthenticator(authId, token, websocket) {
  console.log('token expiry detected...');
  console.log('reauthenticating...');
  const reauthMsg = {
    jsonrpc: '2.0',
    id: authId,
    method: 'public/auth',
    params: {
      grant_type: 'refresh_token',
      refresh_token: token,
    },
  };
  websocket.send(JSON.stringify(reauthMsg));
}

// returns Spread of last item in each leg's tick array
function spreadCalc(frontTicks, midTicks, backTicks) {
  // merge list of 3 arrays on common ticks
  // eslint-disable-next-line max-len
  const lastSpreadObject = {};

  const prelimArray = frontTicks.map((ft) => ({ ...ft, ...midTicks.find((mt) => mt.tick === ft.tick) }));

  // eslint-disable-next-line max-len
  const spreadArray = backTicks.map((bt) => ({ ...bt, ...prelimArray.find((sal1) => sal1.tick === bt.tick) }));

  let spread;
  const lastItem = spreadArray.length - 1;

  console.log('printing last item of spreadArray...');
  console.log(JSON.stringify(spreadArray[lastItem]));

  if (spreadArray.length >= 1) {
    const frontMultiple = spreadArray[lastItem][FRONT_LEG] * FRONT_VECTOR;
    const midMultiple = spreadArray[lastItem][MID_LEG] * MIDDLE_VECTOR;
    const backMultiple = spreadArray[lastItem][BACK_LEG] * BACK_VECTOR;

    // calculate the spread
    spread = frontMultiple + midMultiple + backMultiple;

    // create single object for eventual appending to array-list

    lastSpreadObject.tick = spreadArray[lastItem].tick;
    lastSpreadObject.spread = spread;

    if (spread !== null) {
      console.log(`current spread is ${spread}`);
      console.log(JSON.stringify(lastSpreadObject));
      return lastSpreadObject;
    } console.log('spread not yet fully formed, doing nothing.');
  }
}
// catches ticks that are fresh and not repeated in variable leg object so far
function freshTicker(message, legProcessedList) {
  // define a tick first
  // learnt how to define variable key into JS object
  // adapted from https://stackoverflow.com/questions/11508463/javascript-set-object-key-by-variable
  const tickDateTime = message.params.data.tick;
  let tickChannelName = message.params.channel.toString();

  if (tickChannelName.includes(FRONT_LEG)) {
    tickChannelName = FRONT_LEG;
  } else if (tickChannelName.includes(MID_LEG)) {
    tickChannelName = MID_LEG;
  } else {
    tickChannelName = BACK_LEG;
  }

  const tickClosePrice = message.params.data.close;
  const potentialTick = {};
  // assign tick-time, channel-name and close price to keys
  potentialTick.tick = tickDateTime;
  potentialTick[tickChannelName] = tickClosePrice;

  console.log('reviewing leg tick...');
  // console.log(tickDateTime);
  // console.log(tickClosePrice);
  console.log(JSON.stringify(potentialTick));

  // checking if some key exists in list of objects: https://stackoverflow.com/questions/8217419/how-to-determine-if-javascript-array-contains-an-object-with-an-attribute-that-e
  if (legProcessedList.some((item) => item.tick === tickDateTime) === false) {
    legProcessedList.push(potentialTick);
    console.log(`appending new candlestick to ${tickChannelName} list of arrays...`);
    console.log(`length of ${tickChannelName} candlesticks is now  ${legProcessedList.length}`);
  }
  else if (legProcessedList.some((item) => item.tick === tickDateTime) === true) {
    console.log(`repeat leg tick for ${JSON.stringify(potentialTick)}, doing nothing.`);
    console.log(`length of ${tickChannelName} candlesticks is still ${legProcessedList.length}`);
  }
}

// if ticks are fresh, get the timeframe specific candlesticks for the 3 legs
// and get the timeframe-specific spread
function candlesticker(message, frontLeg, midLeg, backLeg, frontTicks, midTicks, backTicks, spreadTicks) {
  let potentialSpread = {};
  let spreadTickDateTime;
  // let pureSpread;

  if (message.method === 'subscription') {
    console.log('processing candlesticks...');
    if (message.params.channel.includes(frontLeg)) {
      console.log(`${frontLeg} subscription message received`);
      freshTicker(message, frontTicks);
    }
    if (message.params.channel.includes(midLeg)) {
      console.log(`${midLeg} subscription message received`);
      freshTicker(message, midTicks);
    }
    if (message.params.channel.includes(backLeg)) {
      console.log(`${backLeg} subscription message received`);
      freshTicker(message, backTicks);
    }

    if (frontTicks.length === midTicks.length && midTicks.length === backTicks.length) {
      console.log(`length of ticklists: ${frontLeg}:${frontTicks.length}, ${midLeg}:${midTicks.length}, ${backLeg}:${backTicks.length}`);
      potentialSpread = spreadCalc(frontTicks, midTicks, backTicks);
      console.log('potentialSpread spread:');
      // pureSpread = potentialSpread.spread;
      // console.log(pureSpread);
      spreadTickDateTime = potentialSpread.tick;

      console.log('reviewing spread tick...');

      if (spreadTicks.some((entry) => entry.tick === spreadTickDateTime) === false) {
        spreadTicks.push(potentialSpread);
        console.log('appending new spread to list of spread arrays...');
        console.log(`length of spreadTicks is now  ${spreadTicks.length}`);
        // pureSpreads.push(pureSpread);
      } else if (spreadTicks.some((tick) => tick.tick === spreadTickDateTime) === true) {
        console.log(`repeat spread tick for ${JSON.stringify(potentialSpread)}, doing nothing.`);
        console.log(`length of spreadTicks is still ${spreadTicks.length}`);
      }
    }
  }
}

function timeConverter(unixTimestamp) {
  const a = new Date(unixTimestamp);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const year = a.getFullYear();
  const month = months[a.getMonth()];
  const date = a.getDate();
  const hour = a.getHours();
  const min = a.getMinutes();
  const sec = a.getSeconds();
  const time = `${date} ${month} ${year} ${hour}:${min}:${sec}`;
  return time;
}

function setDelay(delayInMs) {
  console.log(`delaying ${delayInMs}`);
  return new Promise((success, reject) =>
  {
    setTimeout(() => {
      success();
    }, delayInMs);
  });
}

function getAllPositions(websocket, posCheckID, coin) {
  return new Promise((success, reject) =>
  {
    const posCheckMsg = {
      jsonrpc: '2.0',
      id: posCheckID,
      method: 'private/get_positions',
      params: {
        currency: coin,
        kind: 'future',
      },
    };
    websocket.send(JSON.stringify(posCheckMsg));
    success(`retrieving ${coin} positions!`);
    reject(Error('position checking message failed...'));
  });
}

function sendOrder(websocket, orderID, orderSide, leg, orderSize) {
  return new Promise((success, reject) =>
  {
    let direction;
    if (orderSide === 'long') {
      direction = 'private/buy';
    } else if (orderSide === 'short') {
      direction = 'private/sell';
    }
    const orderMsg = {
      jsonrpc: '2.0',
      id: orderID,
      method: direction,
      params: {
        instrument_name: leg,
        amount: orderSize,
        type: 'market',
      },
    };
    websocket.send(JSON.stringify(orderMsg));
    success(`${leg} ${orderSide} order sent, size ${orderSize}`);
    reject(Error('order leg failed...'));
  });
}

function closeOrderMarket(websocket, orderID, leg) {
  return new Promise((success, reject) =>
  {
    const orderMsg = {
      jsonrpc: '2.0',
      id: orderID,
      method: 'private/close_position',
      params: {
        instrument_name: leg,
        type: 'market',
      },
    };
    websocket.send(JSON.stringify(orderMsg));
    success(`closing ${leg} position!`);
    reject(Error('market close order failed...'));
  });
}

module.exports = {
  candlesticker, reauthenticator, timeConverter, setDelay, getAllPositions, sendOrder, closeOrderMarket,
};
