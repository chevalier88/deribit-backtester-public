const fs = require('fs');
const { resolve } = require('path');

console.log('test')

function toTimestamp(year, month, day) {
  const datum = new Date(Date.UTC(year, month - 1, day));
  return datum.getTime();
}

function chartMsg(leg, id, sinceDay, now, tf){
  return {
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
} 

module.exports = {
  toTimestamp, chartMsg,
};