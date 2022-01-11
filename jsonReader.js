const { json } = require('express/lib/response');
const fs = require('fs');

let jsonContentObj;

const handleFileRead = (readErr, jsonContentStr) => {
  if (readErr) {
    console.error('Read error', readErr);
    // Allow client to handle error in their own way
    console.log(readErr, null);
    return;
  }

  // Convert file content to JS Object
  jsonContentObj = JSON.parse(jsonContentStr);

  // Call client callback on file content
  console.log(Object.keys(jsonContentObj));
  console.log(typeof(jsonContentObj));
  console.log(jsonContentObj.length);
  console.log(jsonContentObj);
};

// Read content from DB
fs.readFile('./data/11_01_2022_19_55_16_30_running.json', 'utf-8', handleFileRead);

