const fs = require('fs');
const { resolve } = require('path');

console.log('test')

function toTimestamp(year, month, day) {
  const datum = new Date(Date.UTC(year, month - 1, day));
  return datum.getTime();
}

function toDatetimeShort(timestamp){
  const milliseconds = Number(timestamp)
  const dateObject = new Date(milliseconds);
  return humanDateFormat = dateObject.toLocaleString("en-US", {timeZoneName: "short"});
}

function chartMsg(leg, id, sinceDay, now, tf){
  const msgResult = {
    "jsonrpc" : "2.0",
    "id" : id,
    "method" : "public/get_tradingview_chart_data",
    "params" : {
      "instrument_name" : leg,
      "start_timestamp" : sinceDay,
      "end_timestamp" : now,
      "resolution" : tf
    }
  };

  return msgResult;
}

const printLater = (message, delay) => new Promise((resolve, reject) => {
  setTimeout(() => {
    console.log(`*** ${message} ***`);
    resolve('delay done.');
  }, delay);
});

module.exports = {
  toTimestamp, chartMsg, printLater, toDatetimeShort
};