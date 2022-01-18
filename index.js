/* eslint-disable max-len */
// require method because of module error with child spawning
const fs = require('fs');
const { spawn } = require('child_process');
const express = require('express');
const pg = require('pg');
const methodOverride = require('method-override');
const cookieParser= require('cookie-parser');
const { time } = require('console');
const fn = require('./functions.js');

const format = require('pg-format');

// deribit websocket client
const WebSocket = require('ws');
const { parse } = require('path');
const { response } = require('express');

// Initialise DB connection
const { Pool } = pg;
const pgConnectionConfigs = {
  user: 'grahamlim',
  host: 'localhost',
  database: 'backtester',
  port: 5432, // Postgres server always runs on this port by default
};
const pool = new Pool(pgConnectionConfigs);

const app = express();

const PORT = 3008;

// we need sinceDay for the chart runner to work
const sinceDay = fn.toTimestamp(2021, 6, 1);

let timeframeEntry;
let tfObject;
let frontLeg;
let midLeg;
let backLeg;
let frontLegMsg;
let midLegMsg;
let backLegMsg;
// let backtestID;


app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));
app.use(methodOverride('_method'));
app.use(cookieParser());

console.log('imports finished')
/* Like app.get, app.use sets a callback that will run when a request arrives. Unlike app.get, the app.use callback runs on every request, regardless of the URL path. Add the following code to your app before your routes: */
// app.use((request, response, next) => {
//   console.log('Every request:', request.path);
//   next();
// });

// middleware to check session authentication
const checkAuth = (request, response, next) => {
  request.isLoggedIn = false;
  if (request.cookies.loggedIn && request.cookies.userId) {
    const { loggedIn, userId } = request.cookies;
    const hashedCookie = fn.getHash(userId);

    if (hashedCookie === loggedIn) {
      request.isLoggedIn = true;
    }
  }
  next();
};

app.get('/signup', (request, response) => {
  console.log('signup form GET request came in');

  const getSignupFormQuery = (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).send(result.rows);
      return;
    }
    console.log(result.rows[0]);
    response.render('signup');
  };

  // Query using pg.Pool instead of pg.Client
  pool.query('SELECT * FROM users', getSignupFormQuery);
});

// app.post('/signup', (request, response) => {
//   console.log('signup form post request came in');
//   const formData = request.body;
//   console.log(formData);

//   const { email } = formData;
//   const { password } = formData;
//   const cookieUserId = Number(request.cookies.userId);

//   const postSignupFormQuery = `
//   INSERT INTO users (email, password)
//   VALUES ('${email}', '${password}');
//   `;
//   console.log(postSignupFormQuery);

app.post('/signup', (request, response) => {
  pool
    .query('SELECT * FROM users WHERE email=$1', [request.body.email])
    .then((result) => {
      if (result.rows.length > 0) {
        response.send("this email user already exists!");
        return;
      }
      const hashedPw = fn.getHash(request.body.password);
      const values = [request.body.email, hashedPw];
      pool.query('INSERT INTO users (email, password) VALUES ($1, $2)', values, () => {
        response.redirect('/login');
      });
    })
    .catch((err) => {
      console.log('Error executing query', err.stack);
      response.status(503).send('error');
    });
});

// app.post('/signup', (request, response) => {
//     const hashedPw = fn.getHash(request.body.password);
//     console.log(hashedPw);
//     const values = [request.body.username, hashedPw];
//     console.log('printing sign
//     up values...')
//     console.log(values)
//     pool.query('INSERT INTO users (email, password) VALUES ($1, $2)', values, () => {
//       response.redirect('/login');
//     }).catch((err) => {
//       console.log('Error executing query', err.stack);
//       response.status(503).send('error');
//     });
// });

app.get('/login', checkAuth, (request, response) => {
  console.log('signup form GET request came in');
  if (request.isLoggedIn === true) {
    response.render('loggedInError');
  } else {
    const getSignupFormQuery = (error, result) => {
      if (error) {
        console.log('Error executing query', error.stack);
        response.status(503).send(result.rows);
        return;
      }
      console.log(result.rows[0]);
      response.render('login');
    };
  // Query using pg.Pool instead of pg.Client
  pool.query('SELECT * FROM users', getSignupFormQuery);
  }
});

app.post('/login', (request, response) => {
  console.log('login request came in');

  const values = [request.body.email];

  pool.query('SELECT * from users WHERE email=$1', values, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).send(result.rows);
      return;
    }

    if (result.rows.length === 0) {
      // we didnt find a user with that email.
      // the error for password and user are the same.
      // don't tell the user which error they got for security reasons, otherwise
      // people can guess if a person is a user of a given service.
      response.status(403).send('Sorry! No account was found with this user info.');
      return;
    }

    const user = result.rows[0];

    const hashedPassword = fn.getHash(request.body.password)
    const hashedCookieString = fn.getHash(user.id);

    if (user.password === hashedPassword) {
      response.cookie('loggedIn', hashedCookieString);
      response.cookie('userId', user.id);
      response.redirect('/');
    } else {
      // password didn't match
      // the error for password and user are the same...
      response.redirect('/login');
    }
  });
});

app.get('/', (request, response) => {
  console.log('homepage request');
  response.render('home');
});

app.get('/logout', checkAuth, (request, response) => {
  console.log('logging out');
  console.log(request);
  if (request.isLoggedIn === false) {
    console.log("you're not logged in")
    response.render('logoutFail');
  } else {
    console.log("you're logged in, so we're logging you out")
    response.clearCookie('loggedIn');
    response.clearCookie('userId');
    response.render('logout');
  }
});

app.get('/backtest', checkAuth, (request, response) => {
  console.log('backtest get form request came in!');
  console.log(`user ID now ${request.cookies.userId}`);
  if (request.isLoggedIn === true) {
    let data;
    let timeframesData;
    // Query using pg.Pool 
    pool
      .query('SELECT * FROM timeframes')
      .then((result) =>{
        console.log(result.rows);
        timeframesData = result.rows;
        return pool.query('SELECT * FROM instruments')
      }).then((result2)=>{
        console.log(result2.rows);
        data = {
          timeframes: timeframesData,
          instruments: result2.rows,
        };
        response.render('backtestForm', data);
      }).catch((error) => console.log(error.stack));
  } else {
    response.render('logoutFail');
  } 
});

app.post('/backtest', (request, response) => {
  console.log('note form post request came in');

  // get the formData
  const formData = request.body;
  console.log('printing formData...');
  console.log(formData);

  // get user id cookie
  const cookieUserId = Number(request.cookies.userId);

  
  // instantiate the websocket
  const ws = new WebSocket('wss://www.deribit.com/ws/api/v2');
  console.log(ws)
  let tripleDataframeArray = [];
  let dataObject;
  let endingBalance;
  const now = Date.now();
  // let createdTimestamp;

  // provide processing rules for what to do upon websocket message received
  ws.onmessage = function (e) {
    console.log("receiving message...");
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
      // appending timeframe also after first 3 legs are in
      tripleDataframeArray.push(tfObject)

      ws.close();
    }
  };
  console.log('printing timeframe id for pool query....')
  console.log(formData.timeframes_id)
  // get the actual timeframe name based on timeframe id (one to many)
  pool
    .query(`SELECT * FROM timeframes WHERE id=${formData.timeframes_id};`)
    .then((result) => {
      console.log(result.rows[0].timeframe);
      timeframeEntry = result.rows[0].timeframe;
      console.log(`timeframe entry ID: ${formData.timeframes_id}`);
      console.log(`timeframe entry: ${timeframeEntry}`);

      // prepare timeframe object for eventual appending
      tfObject = {"tf":timeframeEntry};
      console.log(tfObject);
      return pool.query(
        `SELECT * FROM instruments WHERE id in 
        (${formData.front_leg_id}, 
          ${formData.mid_leg_id}, 
          ${formData.back_leg_id})`
        );
    }).then((result)=> {
        frontLeg = result.rows[0].name;
        console.log(typeof(frontLeg));
        console.log(`frontLeg: ${frontLeg}`);
        midLeg = result.rows[1].name;
        backLeg = result.rows[2].name;
        console.log(`other legs: ${midLeg}, ${backLeg}`);
        return fn.printLater('delaying by 2 seconds', 2000)
      }).then((successDelay)=>{
          console.log(successDelay);
          frontLegMsg = fn.chartMsg(frontLeg, 100, sinceDay, now, timeframeEntry);
          midLegMsg = fn.chartMsg(midLeg, 200, sinceDay, now, timeframeEntry);
          backLegMsg = fn.chartMsg(backLeg, 300, sinceDay, now, timeframeEntry);

          console.log(frontLegMsg);
          console.log(midLegMsg);
          console.log(backLegMsg);
          return fn.printLater('delaying by 5 seconds', 5000).then((successDelay)=>{
            console.log(successDelay);

            // after delay, actually send the messages 
            ws.send(JSON.stringify(frontLegMsg));
            ws.send(JSON.stringify(midLegMsg));
            ws.send(JSON.stringify(backLegMsg));       
            return fn.printLater('delaying by 10 seconds', 10000).then((successDelay)=>{
              // after processing the messages received, send to the python script
              // parse the JSON data coming back from the python script 
              console.log(successDelay);
              console.log(`length of triple df: ${tripleDataframeArray.length}`);
              const childPython = spawn('python', ['backtester.py', JSON.stringify(tripleDataframeArray)]);
              childPython.stdout.on('data', (data) => {
                console.log('stdout output:\n');
                dataString = data.toString()
                console.log(JSON.parse(dataString)); //works for output_string, not json df
                dataObject = JSON.parse(dataString);
                console.log('will write json parser here for chart.js');
                console.log('printing dataObject...')
                console.log(dataObject);
                console.log(dataObject.backtest_created_timestamp)
                let fileString = `./${dataObject.backtest_created_timestamp}.json`

                // save the JSON backtest results for later testing
                fs.writeFile(fileString, JSON.stringify(dataObject), (err) => {
                  if (err) {
                      throw err;
                    }
                  console.log(Object.keys(dataObject));
                  console.log("JSON data is saved.");
                });

                // the python backtester script will also build cumulative returns in a json file. this can be appended also into PG
                // so we read the file and parse it accordingly. 
                let cumretFilestring = `./data/${dataObject.backtest_created_timestamp}_${dataObject.tf}_cumret.json`
                let rawCumretData = fs.readFileSync(cumretFilestring);
                let parsedCumret = JSON.parse(rawCumretData);

                console.log('printing cumulative returns across timeseries...')
                console.log(parsedCumret);

                // render the backtestIndex ejs file
                return fn.printLater('delaying by 2 second', 2000).then((successDelay)=>{
                  console.log(successDelay);

                  //calculate ending balance
                  endingBalance = formData.starting_balance*dataObject.ROI;
                  console.log(`endingBalance: ${endingBalance}`);
                  let insertBacktestString = `INSERT INTO backtests ("user_id", "timeframe_id", "roi", "length", "lookback", "std_dev", "front_vector", "middle_vector", "back_vector", "created_timestamp", "starting_balance", "ending_balance") VALUES (${cookieUserId}, ${formData.timeframes_id}, ${dataObject.ROI}, ${dataObject.length}, ${dataObject.lookback}, ${dataObject.std_dev}, ${dataObject.front_vector}, ${dataObject.middle_vector}, ${dataObject.back_vector}, '${dataObject.backtest_alt_timestamp}', ${formData.starting_balance}, ${endingBalance}) returning id;
                  `;
                  console.log(insertBacktestString);
                  return pool.query(insertBacktestString);
                }).then((result) =>{

                  // insert the data into the backtests_instruments bridging table.

                  const backtestID = result.rows[0].id;
                  console.log(backtestID);
                  console.log('checking formdata first front_leg_id again...')
                  console.log(formData.front_leg_id)
                  // have to use promise.all because multiple pool.query commands don't work well in for loops
                  const results = Promise.all([
                    pool.query(`INSERT INTO backtests_instruments (backtest_id, instrument_id, leg) VALUES (${backtestID}, ${formData.front_leg_id}, 'front');`),
                    pool.query(`INSERT INTO backtests_instruments (backtest_id, instrument_id, leg) VALUES (${backtestID}, ${formData.mid_leg_id}, 'mid');`),
                    pool.query(`INSERT INTO backtests_instruments (backtest_id, instrument_id, leg) VALUES (${backtestID}, ${formData.back_leg_id}, 'back');`),
                  ]).then((allResults)=>{
                    console.log(allResults);
                  })

                  return results.then((arrayOfResults) =>{
                    console.log('insertions into backtest_instruments done');
                    console.log(arrayOfResults);
                    // response.render('backtestIndex');
                    console.log(parsedCumret);

                    let cumretKeys = Object.keys(parsedCumret);
                    console.log('printing cumretKeys...');
                    console.log(cumretKeys);
                    let cumretValues = Object.values(parsedCumret);
                    console.log('printing cumretValues...');
                    console.log(cumretValues);
                    let cumretArray;

                    // mapping the timeseries data into an array of [[x,y], [x1, y1]...] arrays
                    cumretArray = cumretKeys.map((x, i) => [backtestID, x, cumretValues[i]]);

                    console.log('printing cumretArray...')
                    console.log(cumretArray);

                    // derived from https://stackoverflow.com/questions/34990186/how-do-i-properly-insert-multiple-rows-into-pg-with-node-postgres
                    // requires another node module: https://www.npmjs.com/package/pg-format
                    pool.query(format('INSERT INTO backtest_cumret_timeseries ("backtest_id", "timestamp", "cumret") VALUES %L', cumretArray),[], (err, result)=>{
                      console.log(err);
                      console.log(result);
                    })
                    return fn.printLater('delaying by 1 second', 1000).then((successDelay)=>{
                      console.log(successDelay);
                      response.redirect(`backtest/${backtestID}`);
                    });
                  });
                });
              });
              childPython.stderr.on('data', (data) => {
                console.error(`stderr error: ${data.toString()}`);
              });
            });
          });
        }).catch((error) => console.log(error.stack));
});
      // get legs


      // prep to send websocket messages to deribit server

app.get('/backtest/:id', checkAuth, (request, response) => {
  console.log('indiv backtest request came in');

  console.log(request.params.id);

  if (request.isLoggedIn === true) {
    // const getAllBirdNotesQuery = `
    // SELECT * FROM birds;`;
    // inner join to get all the deets from the 3 tables:
    // backtests, instruments, timeframes

    // get the timeframe with backtest metadata
    const testTFQuery = `
    SELECT backtests.id, backtests.roi, backtests.length, backtests.lookback, backtests.std_dev, backtests.front_vector, backtests.middle_vector, backtests.back_vector, backtests.starting_balance, backtests.ending_balance, backtests.created_timestamp, timeframes.timeframe
    FROM backtests
    INNER JOIN timeframes 
    ON backtests.timeframe_id = timeframes.id 
    WHERE backtests.id = ${request.params.id}`;
    console.log(testTFQuery);

    // get the 3 instrument legs
    const testInstrumentQuery = `
    SELECT backtests_instruments.id, backtests_instruments.instrument_id, backtests_instruments.leg, instruments.id, instruments.name
    FROM backtests_instruments
    INNER JOIN instruments
    ON instruments.id = backtests_instruments.instrument_id
    WHERE backtests_instruments.backtest_id = ${request.params.id};
    `;
    console.log(testInstrumentQuery);

    // get the large timeseries data
    const testTimeseriesQuery = `
    SELECT * FROM backtest_cumret_timeseries WHERE backtest_cumret_timeseries.backtest_id = ${request.params.id};
    `;
    console.log(testTimeseriesQuery);

    pool
      .query(testTFQuery)
      .then((result) =>{
        console.log(result.rows);

        return fn.printLater('delaying by 1 seconds', 1000).then((successDelay)=>{
          console.log(successDelay)

          const tripleQueries = Promise.all([
            pool.query(testTFQuery),
            pool.query(testInstrumentQuery),
            pool.query(testTimeseriesQuery),
          ]).then((allResults)=>{
            // console.log(allResults[0]);
            const [result1, result2, result3] = allResults;
            console.log('printing result1 rows...')
            console.log(result1.rows);
            console.log('printing result2 rows...')
            console.log(result2.rows);
            console.log('printing result3 rows...')
            console.log(result3.rows);

            // parse the legs correctly
            let frontLegName;
            let midLegName;
            let backLegName;

            // for loop to correctly parse leg names
            result2.rows.forEach((element)=> {
              if (element.leg === 'front'){
                frontLegName = element.name;
              } else if (element.leg === 'mid'){
                midLegName = element.name;
              } else if (element.leg === 'back'){
                backLegName = element.name;
              };
            })
            console.log ('printing retrieved leg names...');
            console.log (`front: ${frontLegName}, mid: ${midLegName}, back: ${backLegName}`);

            // parse the timeseries data in order to later use as arrays for chart.js
            let timestampsArray = []
            let cumretArray = []

            // converting to datettime string
            // derived from https://coderrocketfuel.com/article/convert-a-unix-timestamp-to-a-date-in-vanilla-javascript
            result3.rows.forEach((element) =>{
              let humanDateFormat = fn.toDatetimeShort(element.timestamp);
              timestampsArray.push(humanDateFormat);
              cumretArray.push(Number(element.cumret));
            })
            console.log("printing lengths of timestamps and cumret arrays...");
            console.log(timestampsArray.length);
            console.log(cumretArray.length);

            // calculate ROI in human readable format
            const rawROI = Number(result1.rows[0].roi);
            const readableROI = `${Math.round(rawROI*100-100)}%`

            // get created_timestamp in human readable format
            const readableCreateTimestamp = fn.toDatetimeShort(result1.rows[0].created_timestamp);

            let content = {
              mainResult:{
                frontLegKey: frontLegName,
                midLegKey: midLegName,
                backLegKey: backLegName,
                id: result1.rows[0].id,
                roi: readableROI,
                decimal_roi: result1.rows[0].roi,
                length: result1.rows[0].length,
                lookback: result1.rows[0].lookback,
                std_dev: result1.rows[0].std_dev,
                front_vector: result1.rows[0].front_vector,
                mid_vector: result1.rows[0].middle_vector,
                back_vector: result1.rows[0].back_vector,
                starting_balance: result1.rows[0].starting_balance,
                ending_balance: result1.rows[0].ending_balance,
                created_timestamp: result1.rows[0].created_timestamp,
                timeframe: result1.rows[0].timeframe,
                timestamps: timestampsArray,
                cumret: cumretArray,
              },
            };
            console.log('printing content object...')
            console.log(content);
            response.render('backtestIndex', content);
          });

          // return tripleQueries.then((arrayOfResults) =>{
          //   console.log('printing the tripleQueries...');
          //   console.log(arrayOfResults);
          
      });
    });
  } else {
    response.render('logoutFail');
  }
});

app.get('/backtests', checkAuth, (request, response) => {
  console.log('all backtests retrieve/get request came in!');
  console.log(`user ID now ${request.cookies.userId}`);
  if (request.isLoggedIn === true) {
    let data;
    let backtestsData;
    // Query using pg.Pool 
    pool
      .query('SELECT * FROM backtests')
      .then((result) =>{
        console.log(result.rows)
        backtestsData = result.rows;
        // parse the timeseries data in order to later use as arrays for chart.js
        let labelsArray = []
        let cumretArray = []

        // converting to datettime string
        // derived from https://coderrocketfuel.com/article/convert-a-unix-timestamp-to-a-date-in-vanilla-javascript
        result.rows.forEach((element) =>{
          labelsArray.push(element.id);
          cumretArray.push(Number(element.roi));
        })
        console.log("printing lengths of labels and data arrays...");
        console.log(labelsArray.length);
        console.log(cumretArray.length);
        data = {
          allTests: backtestsData,
          labels: labelsArray,
          allROIs: cumretArray,
        };
        response.render('backtests', data);
      }).catch((error) => console.log(error.stack));
  } else {
    response.render('logoutFail');
  };
});

app.get('/disclaimer', (request, response) => {
  console.log('disclaimer request');
  response.render('disclaimer');
});

app.get('/edit/:id', checkAuth, (request, response) => {

  if (request.isLoggedIn === true) {
    console.log(request.params.id);
    console.log('indiv backtest edit request came in');

    pool
      .query(`SELECT * FROM backtests WHERE id = ${request.params.id}`)
      .then((result) => {
        console.log(result.rows);
        let content = {
          mainResult:{
            id: result.rows[0].id,
            decimal_roi: String((Number(result.rows[0].roi).toFixed(2))),
            starting_balance: result.rows[0].starting_balance,
            ending_balance: String((Number(result.rows[0].ending_balance).toFixed(2)))
          },
        };
        console.log('printing edit content...')
        console.log(content)
        response.render('backtestEdit', content);
      })
  } else {
    response.render('logoutFail');
  }
});

app.post('/edit/:id', checkAuth, (request, response) => {

  if (request.isLoggedIn === true) {
    console.log(request.params.id);
    console.log('indiv backtest edit request came in');
    const id = Number(request.params.id);
    const formData = request.body;
    console.log(id);
    console.log(formData);

    const roiMultiplier = Number(formData.decimal_roi);
    const newStartBalance = Number(formData.new_balance);

    const newEndBalance = Number(roiMultiplier*newStartBalance);
    console.log('printing the new End Balance...')
    console.log(newEndBalance);

    let updateQueryString = `
    UPDATE backtests 
    SET starting_balance = ${newStartBalance}, ending_balance = ${newEndBalance}
    WHERE id = ${id};
    `
    console.log('printing update query...')
    console.log(updateQueryString)
    pool
      .query(updateQueryString)
      .then((result)=>{
        console.log('printing update query result...');
        console.log(result);
        response.redirect(`/backtest/${id}`);
      })
  } else {
    response.render('logoutFail');
  }
});

app.delete('/edit/:id', checkAuth, (request, response) => {
  console.log("delete request came in test again")

  if (request.isLoggedIn === true) {
    console.log("you're logged in, so we can delete stuff")
    const id = Number(request.params.id);
    console.log(`id: ${id}`);

    // have to delete the rows from 3 separate tables, in a Promise.all style thing
    const deleteMainQuery = `DELETE FROM backtests WHERE id=${id};`
    const deleteBridgingQuery = `DELETE FROM backtests_instruments WHERE backtest_id=${id};`
    const deleteTimeSeriesQuery = `DELETE FROM backtest_cumret_timeseries WHERE backtest_id=${id};`

    const results = Promise.all([
      pool.query(deleteMainQuery),
      pool.query(deleteBridgingQuery),
      pool.query(deleteTimeSeriesQuery),
      ]).then((allResults)=>
      {
        console.log(allResults);
      });

    return results.then((arrayOfResults) =>{
      console.log('triple delete complete');
      console.log(arrayOfResults);
      response.redirect('/backtests');
    });
  } else {
    response.render('logoutFail');
  }
});

app.listen(PORT);

console.log(`listening on port ${PORT}`);