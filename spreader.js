/* eslint-disable guard-for-in */
/* eslint-disable max-len */
const WebSocket = require('ws');
const fs = require('fs');
// const WebSocket = require('ws');
// const jfs = require('./jsonFileStorage.js');
const fn = require('./functions.js');

const config = JSON.parse(fs.readFileSync('config.json').toString());
console.log(config);

const lws = new WebSocket('ws://localhost:3000');
const ws = new WebSocket('wss://test.deribit.com/ws/api/v2');
// const pws = new WebSocket('wss://test.deribit.com/ws/api/v2');
// A variable declared outside a function, becomes GLOBAL.

// instantiate api key and secret
const { API_KEY } = config;
const { SECRET } = config;

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

// instantiate Bollinger Indicators
let UPPER_BAND;
let LOWER_BAND;
let MOVING_AVERAGE;
let LONG_STOP_LOSS_BAND;
let SHORT_STOP_LOSS_BAND;
let bollingerObject;

// instantiate Live Butterfly Objects
let frontAsk;
let frontBid;
let midBid;
let midAsk;
let backAsk;
let backBid;
let liveLongButterfly;
let liveShortButterfly;

// instantiate position objects
let frontPosition;
let midPosition;
let backPosition;

let spreadTaken;

// authentication message for Websockets connection; will send first to deribit Websocket
let refreshToken;
const authID = 9930;
const tickerID = 2001;
const initialPosCheckID = 4000;
const posCheckID = 5000;

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

// we want to check if we actually are in position when the script begins
// we'll send this after the authenctiation message
const CURRENCY = FRONT_LEG.substring(0, 3);
console.log(`Currency: ${CURRENCY}`);

// this JSON message helps us subscribe to the tickers for each instrument chosen
const frontTickerString = `ticker.${FRONT_LEG}.raw`;
const midTickerString = `ticker.${MID_LEG}.raw`;
const backTickerString = `ticker.${BACK_LEG}.raw`;

const tickersMsg = {
  jsonrpc: '2.0',
  id: tickerID,
  method: 'public/subscribe',
  params: {
    channels: [
      frontTickerString,
      midTickerString,
      backTickerString,
    ],
  },
};

// instantiate initial reauthenticate state
let reauthenticateState = false;
let expiresIn;
console.log(`current reAuth state: ${reauthenticateState}`);

const frontID = 1000;
const midID = 2000;
const backID = 3000;

const frontOrderSize = Math.abs(FRONT_VECTOR * 50000);
const midOrderSize = Math.abs(MIDDLE_VECTOR * 50000);
const backOrderSize = Math.abs(BACK_VECTOR * 50000);

// order functions and constants
let canTrade = true;
let positionDirection = 'none';

const printLater = (message, delay) => new Promise((resolve, reject) => {
  setTimeout(() => {
    console.log(`*** ${message} ***`);
    resolve();
  }, delay);
});
// carrying on working on orders
// input websocket, orderID, orderSide as only long or short, leg, and order size

lws.onmessage = function (e) {
  bollingerObject = JSON.parse(e.data);
  MOVING_AVERAGE = bollingerObject.moving_average;
  LOWER_BAND = bollingerObject.lower_band;
  UPPER_BAND = bollingerObject.upper_band;
  LONG_STOP_LOSS_BAND = bollingerObject.long_sl_band;
  SHORT_STOP_LOSS_BAND = bollingerObject.short_sl_band;
  setTimeout(() => {
    lws.send('asking again from local host');
  }, 1500);
  console.log('local websocket host is sending...');
  // console.log(bollingerObject);
};

lws.onerror = function (e) {
  console.log('\nlocal Websocket Host error! Ending Bollinger stream...\n');
  ws.close();
};

lws.onclose = function (e) {
  console.log('\nlocal Websocket Host stopped! Ending bollinger stream...');

  ws.close();
};

ws.onmessage = function (e) {
  // do something with the response...
  console.log('\nreceived from deribit server:\n ');
  // console.log(e.data);
  const message = JSON.parse(e.data);
  // console.log(message);

  if (message.id === initialPosCheckID) {
    console.log('INITIAL POSITIONS data received:\n');
    // eslint-disable-next-line no-restricted-syntax
    for (const position in message.result) {
      console.log('printing average price of 1 leg in position...');
      if (message.result[position].instrument_name === MID_LEG) {
        midPosition = MIDDLE_VECTOR * message.result[position].average_price;
        console.log(`${MID_LEG} average price: ${message.result[position].average_price}`);
        console.log(`mid Position: ${midPosition}`);
      // the direction of the front leg indicates whether you're in a short or long
      } else if (message.result[position].instrument_name === FRONT_LEG) {
        frontPosition = FRONT_VECTOR * message.result[position].average_price;
        console.log(`${FRONT_LEG} average price: ${message.result[position].average_price}`);
        console.log(`front Position: ${frontPosition}`);
        if (message.result[position].direction === 'buy') {
          canTrade = false;
          positionDirection = 'long';
          console.log('confirming you are in already in a LONG Butterfly.');
        } else if (message.result[position].direction === 'sell') {
          canTrade = false;
          positionDirection = 'short';
          console.log('confirming you are in already in a SHORT Butterfly.');
        } else {
          console.log('you are not in position.');
        }
      } else {
        backPosition = BACK_VECTOR * message.result[position].average_price;
        console.log(`${BACK_LEG} average price: ${message.result[position].average_price}`);
        console.log(`back Position: ${backPosition}`);
      }
    }
    spreadTaken = frontPosition + midPosition + backPosition;
    console.log(`spread Taken: ${spreadTaken}`);
  }
  if (message.id === posCheckID) {
    console.log('** POSITIONS data received: **\n');
    // eslint-disable-next-line no-restricted-syntax
    for (const position in message.result) {
      console.log('printing average price of 1 leg in position...');
      if (message.result[position].instrument_name === MID_LEG) {
        midPosition = MIDDLE_VECTOR * message.result[position].average_price;
        console.log(`${MID_LEG} average price: ${message.result[position].average_price}`);
        console.log(`mid Position: ${midPosition}`);
        // the direction of the front leg indicates whether you're in a short or long
      } else if (message.result[position].instrument_name === FRONT_LEG) {
        frontPosition = FRONT_VECTOR * message.result[position].average_price;
        console.log(`${FRONT_LEG} average price: ${message.result[position].average_price}`);
        console.log(`front Position: ${frontPosition}`);
        if (message.result[position].direction === 'buy') {
          positionDirection = 'long';
          console.log('confirming you are in already in a LONG Butterfly.');
        } else if (message.result[position].direction === 'sell') {
          positionDirection = 'short';
          console.log('confirming you are in already in a SHORT Butterfly.');
        } else {
          console.log('you are not in position.');
        }
      } else {
        backPosition = BACK_VECTOR * message.result[position].average_price;
        console.log(`${BACK_LEG} average price: ${message.result[position].average_price}`);
        console.log(`back Position: ${backPosition}`);
      }
    }
    spreadTaken = frontPosition + midPosition + backPosition;
    console.log(`spread Taken: ${spreadTaken}\n`);
  }

  // subscription and live spread streaming logic
  if (message.method === 'subscription') {
    // console.log('ticker message received');
    if (message.params.channel.includes(FRONT_LEG)) {
      frontAsk = message.params.data.best_ask_price;
      frontBid = message.params.data.best_bid_price;
      // console.log(`${FRONT_LEG} subscription message received`);
    } if (message.params.channel.includes(MID_LEG)) {
      midBid = message.params.data.best_bid_price;
      midAsk = message.params.data.best_ask_price;
      // console.log(`${MID_LEG} subscription message received`);
    } if (message.params.channel.includes(BACK_LEG)) {
      backAsk = message.params.data.best_ask_price;
      backBid = message.params.data.best_bid_price;
    }
    liveLongButterfly = (FRONT_VECTOR * frontAsk) + (MIDDLE_VECTOR * midBid) + (BACK_VECTOR * backAsk);
    liveShortButterfly = (FRONT_VECTOR * frontBid) + (MIDDLE_VECTOR * midAsk) + (BACK_VECTOR * backBid);

    // butterfly opening logic
    // if long butterfly less than lower band and not touching stop loss band
    // and not in position
    if (canTrade === true) {
      if ((liveLongButterfly <= LOWER_BAND) && (liveLongButterfly > LONG_STOP_LOSS_BAND)) {
        console.log('\nLONGING 1 Butterfly!');
        canTrade = false;
        Promise.all([
          fn.sendOrder(ws, midID, 'short', MID_LEG, midOrderSize),
          fn.sendOrder(ws, frontID, 'long', FRONT_LEG, frontOrderSize),
          fn.sendOrder(ws, backID, 'long', BACK_LEG, backOrderSize),
        ]).then((arrayOfResults) => {
          positionDirection = 'long';
          console.log(arrayOfResults);
          // delay position check by 3 seconds to let orders actually execute
          return printLater('delaying by 3 seconds', 3000).then((successDelay) => {
            console.log(successDelay);
            return fn.getAllPositions(ws, posCheckID, CURRENCY).then((successPosMsg) => {
              console.log(successPosMsg);
              console.log('you just opened a LONG Butterfly, checking spreadTaken...');
            });
          });
        });
      // if short butterfly spread higher than upper band and in SL band
      // and again, not in position
      } else if ((liveShortButterfly >= UPPER_BAND) && (liveShortButterfly < SHORT_STOP_LOSS_BAND)) {
        console.log('\nShorting 1 Butterfly!');
        canTrade = false;
        Promise.all([
          fn.sendOrder(ws, midID, 'long', MID_LEG, midOrderSize),
          fn.sendOrder(ws, frontID, 'short', FRONT_LEG, frontOrderSize),
          fn.sendOrder(ws, backID, 'short', BACK_LEG, backOrderSize),
        ]).then((arrayOfResults) => {
          positionDirection = 'short';
          console.log(arrayOfResults);
          // delay position check by 3 seconds to let orders actually execute
          return printLater('delaying by 3 seconds', 3000).then((successDelay) => {
            console.log(successDelay);
            return fn.getAllPositions(ws, posCheckID, CURRENCY).then((successPosMsg) => {
              console.log(successPosMsg);
              console.log('you just opened a SHORT Butterfly, checking spreadTaken...');
            });
          });
        });
      // if spread is touching stop loss bands either lower than lower sl
      // or higher than upper sl, then do nothing
      } else if (liveLongButterfly <= LONG_STOP_LOSS_BAND) {
        console.log('Long signal, but Stop Loss band reached, no entries.');
        console.log('awaiting a better signal...');
      } else if (liveShortButterfly >= SHORT_STOP_LOSS_BAND) {
        console.log('Short signal, but Stop Loss band reached, no entries.');
        console.log('awaiting a better signal...');
      }
    }

    // closing logic
    // if in position, you cannot long/short again, assess if in long or short
    // to see if you can close the position
    else if (canTrade === false) {
      if (positionDirection === 'long') {
        if (liveLongButterfly >= MOVING_AVERAGE) {
          console.log('you are in a Long Butterfly, and there is a CLOSE signal!');
          console.log('CLOSING 1 Long Butterfly...');
          Promise.all([
            fn.closeOrderMarket(ws, midID, MID_LEG),
            fn.closeOrderMarket(ws, frontID, FRONT_LEG),
            fn.closeOrderMarket(ws, backID, BACK_LEG),
          ]).then((arrayOfResults) => {
            canTrade = true;
            positionDirection = 'none';
            spreadTaken = 0;
            console.log(arrayOfResults);
            // delay position check by 3 seconds to let orders actually execute
            return printLater('delaying by 3 seconds', 3000).then((successDelay) => {
              console.log(successDelay);
              return fn.getAllPositions(ws, posCheckID, CURRENCY).then((successPosMsg) => {
                console.log(successPosMsg);
                console.log(`you just closed a LONG Butterfly at TP, spreadTaken: ${spreadTaken}...`);
                console.log('spreadTaken should be 0 unless rapid signal changes now.');
              });
            });
          });
        } else if (liveLongButterfly <= LONG_STOP_LOSS_BAND) {
          console.log('you are in a Long Butterfly, and you hit the STOP LOSS!');
          console.log('CLOSING 1 Long Butterfly at STOP LOSS...');
          Promise.all([
            fn.closeOrderMarket(ws, midID, MID_LEG),
            fn.closeOrderMarket(ws, frontID, FRONT_LEG),
            fn.closeOrderMarket(ws, backID, BACK_LEG),
          ]).then((arrayOfResults) => {
            canTrade = true;
            positionDirection = 'none';
            spreadTaken = 0;
            console.log(arrayOfResults);
            // delay position check by 3 seconds to let orders actually execute
            return printLater('delaying by 3 seconds', 3000).then((successDelay) => {
              console.log(successDelay);
              return fn.getAllPositions(ws, posCheckID, CURRENCY).then((successPosMsg) => {
                console.log();
                console.log(successPosMsg);
                console.log(`you just closed a LONG Butterfly at SL, spreadTaken: ${spreadTaken}...`);
                console.log('spreadTaken should be 0 unless rapid signal changes now.');
              });
            });
          });
        } else if (positionDirection === 'short') {
          if (liveShortButterfly <= MOVING_AVERAGE) {
            console.log('you are in a Short Butterfly, and there is a CLOSE signal!');
            console.log('CLOSING 1 Short Butterfly...');
            Promise.all([
              fn.closeOrderMarket(ws, midID, MID_LEG),
              fn.closeOrderMarket(ws, frontID, FRONT_LEG),
              fn.closeOrderMarket(ws, backID, BACK_LEG),
            ]).then((arrayOfResults) => {
              canTrade = true;
              positionDirection = 'none';
              spreadTaken = 0;
              console.log(arrayOfResults);
              // delay position check by 3 seconds to let orders actually execute
              return printLater('delaying by 3 seconds', 3000).then((successDelay) => {
                console.log(successDelay);
                return fn.getAllPositions(ws, posCheckID, CURRENCY).then((successPosMsg) => {
                  console.log(successPosMsg);
                  console.log(`you just closed a SHORT Butterfly at TP, spreadTaken: ${spreadTaken}...`);
                  console.log('spreadTaken should be 0 unless rapid signal changes now.');
                });
              });
            });
          } else if (liveShortButterfly >= SHORT_STOP_LOSS_BAND) {
            console.log('you are in a Short Butterfly, and you hit the STOP LOSS!');
            console.log('CLOSING 1 Short Butterfly at STOP LOSS...');
            Promise.all([
              fn.closeOrderMarket(ws, midID, MID_LEG),
              fn.closeOrderMarket(ws, frontID, FRONT_LEG),
              fn.closeOrderMarket(ws, backID, BACK_LEG),
            ]).then((arrayOfResults) => {
              canTrade = true;
              positionDirection = 'none';
              spreadTaken = 0;
              console.log(arrayOfResults);
              // delay position check by 3 seconds to let orders actually execute
              return printLater('delaying by 3 seconds', 3000).then((successDelay) => {
                console.log(successDelay);
                return fn.getAllPositions(ws, posCheckID, CURRENCY).then((successPosMsg) => {
                  console.log(successPosMsg);
                  console.log(`you just closed a SHORT Butterfly at SL, spreadTaken: ${spreadTaken}...`);
                  console.log('spreadTaken should be 0 unless rapid signal changes now.');
                });
              });
            });
          }
        } else {
          console.log('in position, but no trading signal yet.');
        }
      }
      // console.log(bollingerObject);
    }
    // metadata per tick:
    console.log(`Unix Datetime now:${Date.now()}`);
    console.log(`Long Spread now: ${liveLongButterfly}`, `Lower Band now: ${LOWER_BAND}`);
    console.log(`Short Spread now: ${liveShortButterfly}`, `Upper Band now: ${UPPER_BAND}`);
    console.log(`Moving Average now: ${MOVING_AVERAGE}`);
    console.log(`Long SL Band now: ${LONG_STOP_LOSS_BAND}, Short SL Band now: ${SHORT_STOP_LOSS_BAND}`);
    console.log(`canTrade: ${canTrade}`);
    console.log(`positionDirection: ${positionDirection}`);
    console.log(`spreadTaken: ${spreadTaken}`);
    console.log(`reauthenticateState: ${reauthenticateState}`);
  }
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

      console.log(`\n** Successfully Refreshed your Auth at ${dateTime}! **\n`);

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
};

ws.onclose = function () {
  console.log('Ending Live Spread stream...');
  console.log('local Bollinger websocket server still streaming...');
};

ws.onerror = function () {
  console.log('Deribit Websocket Error! Ending Live Spread stream...');
  console.log('local Bollinger websocket server still streaming...');
};

ws.onopen = function () {
  console.log('deribit websocket opened!');
  // attempting delayed websocket messages
  // authenticate, check for positions, then subscribe to tickers + check signals.

  const initialAuthPromise = new Promise((success, reject) => {
    ws.send(JSON.stringify(authMsg));
    success('sending Auth message...');
    reject(Error('Auth message failed!'));
  });

  initialAuthPromise.then((successAuthMsg) => {
    console.log(successAuthMsg);
    return fn.getAllPositions(ws, initialPosCheckID, CURRENCY).then((successPosMsg) => {
      console.log(successPosMsg);
      return printLater('delaying tickers subscribing by 5 seconds', 5000).then((successDelay) => {
        console.log(successDelay);
        console.log('delay is over, sending ticker messages');
        console.log(`canTrade: ${canTrade}`);
        ws.send(JSON.stringify(tickersMsg));
      });
    });
  });
};

lws.onopen = function () {
  lws.send('asking for first bollingers from local host');
  // subscribe to instrument tickers
};
