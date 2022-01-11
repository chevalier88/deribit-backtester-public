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

// deribit websocket client
const WebSocket = require('ws');

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

app.get('/signup', (request, response) => {
  console.log('signup form GET request came in');

  const getSignupFormQuery = (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).send(result.rows);
      return;
    }
    console.log(result.rows[0]);
    response.render('signupForm');
  };

  // Query using pg.Pool instead of pg.Client
  pool.query('SELECT * FROM users', getSignupFormQuery);
});

app.post('/signup', (request, response) => {
  console.log('signup form post request came in');
  const formData = request.body;
  console.log(formData);

  const { email } = formData;
  const { password } = formData;

  const postSignupFormQuery = `
  INSERT INTO users (email, password)
  VALUES ('${email}', '${password}');
  `;
  console.log(postSignupFormQuery);
  const postSignupFormQueryResult = (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).send(result);
      return;
    }
    console.log(result);

    response.redirect('/login');
  };

  // Query using pg.Pool instead of pg.Client
  pool.query(postSignupFormQuery, postSignupFormQueryResult);
});

app.get('/login', (request, response) => {
  console.log('signup form GET request came in');

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
});

app.post('/login', (request, response) => {
  console.log('request came in');

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
      response.status(403).send('sorry!');
      return;
    }

    const user = result.rows[0];

    if (user.password === request.body.password) {
      response.cookie('loggedIn', true);
      response.cookie('userId', user.id);
      response.redirect('/');
      // setTimeout(response.redirect('/'), 2000);
    } else {
      // password didn't match
      // the error for password and user are the same...
      response.status(403).send('sorry!');
    }
  });
});

app.get('/', (request, response) => {
  console.log('homepage request');
  if (request.cookies.loggedIn === 'true') {
    // const getAllBirdNotesQuery = `
    // SELECT * FROM birds;`;

  response.render('home');
  } else {
    response.status(403).send('sorry, please log in!');
  }
});

app.get('/logout', (request, response) => {
  console.log('logging out');
  console.log(request);
  response.clearCookie('loggedIn');
  response.clearCookie('userId');
  response.redirect('/login');
});

app.get('/backtest', (request, response) => {
  console.log('backtest request came in!');
  console.log(`user ID now ${request.cookies.userId}`);
  const getBacktestFormQuery = (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).send(result.rows);
    } else {
      const data = {
        timeframes: result.rows,
      };
      console.log(result.rows);
      response.render('backtest', data);
    }
  };

  // Query using pg.Pool instead of pg.Client
  pool.query('SELECT * FROM timeframes', getBacktestFormQuery);
});

app.post('/backtest', (request, response) => {
  console.log('note form post request came in');
  const formData = request.body;
  console.log('printing formData...');
  console.log(formData);
  
  // instantiate the websocket
  const ws = new WebSocket('wss://www.deribit.com/ws/api/v2');
  console.log(ws)
  let tripleDataframeArray = [];
  let dataObject;
  const now = Date.now();

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
  // console.log(formData.timeframes_id)
  // get the actual timeframe name based on timeframe id (one to many)
  pool
    .query(`SELECT * FROM timeframes WHERE id=${formData.timeframes_id};`)
    .then((result) => {
      console.log(result.rows[0].timeframe)
      timeframeEntry = result.rows[0].timeframe
      console.log(`timeframe entry: ${timeframeEntry}`)
      tfObject = {"tf":timeframeEntry};
      console.log(tfObject);
      frontLeg = formData.front_leg;
      console.log(typeof(frontLeg));
      console.log(`frontLeg: ${frontLeg}`);
      midLeg = formData.middle_leg;
      backLeg = formData.back_leg;
      console.log(`other legs: ${midLeg}, ${backLeg}`);
      return fn.printLater('delaying by 2 seconds', 2000).then((successDelay)=>{
        console.log(successDelay);
        frontLegMsg = fn.chartMsg(frontLeg, 100, sinceDay, now, timeframeEntry);
        midLegMsg = fn.chartMsg(midLeg, 200, sinceDay, now, timeframeEntry);
        backLegMsg = fn.chartMsg(backLeg, 300, sinceDay, now, timeframeEntry);

        console.log(frontLegMsg);
        console.log(midLegMsg);
        console.log(backLegMsg);
        return fn.printLater('delaying by 2 seconds', 2000).then((successDelay)=>{
          console.log(successDelay);
          ws.send(JSON.stringify(frontLegMsg));
          ws.send(JSON.stringify(midLegMsg));
          ws.send(JSON.stringify(backLegMsg));       
          return fn.printLater('delaying by 4 seconds', 4000).then((successDelay)=>{
            console.log(successDelay);
            console.log(`length of triple df: ${tripleDataframeArray}`);
            const childPython = spawn('python', ['backtester.py', JSON.stringify(tripleDataframeArray)]);
            childPython.stdout.on('data', (data) => {
              console.log('stdout output:\n');
              dataString = data.toString()
              console.log(JSON.parse(dataString)); //works for output_string, not json df
              dataObject = JSON.parse(dataString);
              // response.send(dataObject);
              console.log('will write json parser here for chart.js');
              console.log('printing dataObject...')
              console.log(dataObject);
              console.log(dataObject.backtest_created_timestamp)
              let fileString = `./${dataObject.backtest_created_timestamp}.json`

              fs.writeFile(fileString, JSON.stringify(tripleDataframeArray), (err) => {
                if (err) {
                    throw err;
                  }
                console.log(Object.keys(tripleDataframeArray));
                console.log("JSON data is saved.");
              });
              return fn.printLater('delaying by 2 second', 2000).then((successDelay)=>{
                console.log(successDelay);
                response.render('backtestIndex');
                });
              });
            childPython.stderr.on('data', (data) => {
              console.error(`stderr error: ${data.toString()}`);
            });
          })
        })
      })
    }).catch((error) => console.log(error.stack)
    );
});
// app.get('/note/:id', (request, response) => {
//   console.log('indiv note request came in');

//   console.log(request.params.id);

//   // const getBirdNoteIndexQuery = `
//   // SELECT * FROM birds WHERE id=${request.params.id};`;

//   // inner join to get all the deets from the 3 tables
//   const getBirdNoteIndexQuery = `
//   SELECT birds.id, birds.flock_size, birds.date, birds.appearance, birds.behaviour, users.email, species.name 
//   AS species 
//   FROM birds 
//   INNER JOIN users 
//   ON birds.user_id = users.id 
//   INNER JOIN species 
//   ON species.id = birds.species_id 
//   WHERE birds.id = ${request.params.id}`;
//   console.log(getBirdNoteIndexQuery);

//   const whenDoneWithQuery = (error, result) => {
//     if (error) {
//       console.log('Error executing query', error.stack);
//       response.status(503).send(result.rows);
//       return;
//     }
//     console.log(result.rows[0]);
//     const content = {
//       noteIndex: {
//         id: result.rows[0].id,
//         date: result.rows[0].date,
//         flock_size: result.rows[0].flock_size,
//         appearance: result.rows[0].appearance,
//         species: result.rows[0].species,
//         email: result.rows[0].email,
//       },
//     };
//     console.log(content);
//     // response.send(result.rows[0]);
//     response.render('noteIndex', content);
//   };

//   // Query using pg.Pool instead of pg.Client
//   pool.query(getBirdNoteIndexQuery, whenDoneWithQuery);
// });

// app.get('/', (request, response) => {
//   console.log('indiv note request came in');
//   if (request.cookies.loggedIn === 'true') {
//     // const getAllBirdNotesQuery = `
//     // SELECT * FROM birds;`;

//     const getAllBirdNotesQuery = `
//     SELECT birds.id, birds.behaviour, birds.flock_size, birds.user_id, birds.species_id, birds.date, species.name 
//     FROM birds 
//     INNER JOIN species 
//     ON birds.species_id = species.id;`;

//     const whenDoneWithQuery = (error, result) => {
//       if (error) {
//         console.log('Error executing query', error.stack);
//         response.status(503).send(result.rows);
//         return;
//       }
//       console.log(result.rows);
//       const content = {
//         allSightings: result.rows,
//       };
//       // response.send(content);
//       response.render('allNotes', content);
//     };

//     // Query using pg.Pool instead of pg.Client
//     pool.query(getAllBirdNotesQuery, whenDoneWithQuery);
//   } else {
//     response.status(403).send('sorry, please log in!');
//   }
// });

// // 3.POCE.9: Bird watching comments
// app.post('/note/:id/comment', (req, res) => {
//   const { userId } = req.cookies;

//   const notesId = req.params.id;
//   console.log(notesId);
//   const text = req.body.comment;
//   console.log(text);

//   const addCommentQuery = 'INSERT INTO comments (text, notes_id, user_id) VALUES ($1, $2, $3)';
//   const inputData = [`'${text}'`, notesId, userId];

//   pool.query(addCommentQuery, inputData, (addCommentQueryError, addCommentQueryResult) => {
//     if (addCommentQueryError) {
//       console.log('error', addCommentQueryError);
//     } else {
//       console.log('done');
//       res.redirect(`/note/${notesId}/comments`);
//     }
//   });
// });

// app.get('/note/:id/comments', (request, response) => {
//   console.log('indiv note all comments request came in');

//   console.log(request.params.id);

//   // const getBirdNoteIndexQuery = `
//   // SELECT * FROM birds WHERE id=${request.params.id};`;

//   // inner join to get all the deets from the 3 tables
//   const getBirdNoteIndexQuery = `
//   SELECT * FROM comments
//   WHERE notes_id = ${request.params.id};`;
//   console.log(getBirdNoteIndexQuery);

//   const whenDoneWithQuery = (error, result) => {
//     if (error) {
//       console.log('Error executing query', error.stack);
//       response.status(503).send(result.rows);
//       return;
//     }
//     const content = {
//       index: request.params.id,
//       allSightings: result.rows,
//     };
//     console.log(content);
//     // response.send(result.rows[0]);
//     response.render('indexAllComments', content);
//   };

//   // Query using pg.Pool instead of pg.Client
//   pool.query(getBirdNoteIndexQuery, whenDoneWithQuery);
// });

// app.get('/note/:id/behaviours', (request, response) => {
//   console.log('indiv note all behaviours request came in');

//   console.log(request.params.id);

//   // const getBirdNoteIndexQuery = `
//   // SELECT * FROM birds WHERE id=${request.params.id};`;

//   // inner join to get all the deets from the 2 tables
//   const firstQuery = `
//   SELECT notes_behaviour.id, notes_behaviour.behaviour_id, behaviour.id, behaviour.action
//   FROM notes_behaviour
//   INNER JOIN behaviour
//   ON behaviour.id = notes_behaviour.behaviour_id
//   WHERE notes_behaviour.notes_id = ${request.params.id};
//   `;
//   const whenDoneWithFirstQuery = (error, result) => {
//     if (error) {
//       console.log('Error executing query', error.stack);
//       response.status(503).send(result.rows);
//       return;
//     }
//     const content = {
//       index: request.params.id,
//       allActions: result.rows,
//     };
//     console.log(content);
//     // response.send(result.rows);
//     response.render('indexAllBehaviours', content);
//   };
//   pool.query(firstQuery, whenDoneWithFirstQuery);

  // const getBirdNoteIndexQuery = `
  // SELECT * FROM comments
  // WHERE notes_id = ${request.params.id};`;
  // console.log(getBirdNoteIndexQuery);

  // const whenDoneWithQuery = (error, result) => {
  //   if (error) {
  //     console.log('Error executing query', error.stack);
  //     response.status(503).send(result.rows);
  //     return;
  //   }
  //   const content = {
  //     index: request.params.id,
  //     allSightings: result.rows,
  //   };
  //   console.log(content);
  //   // response.send(result.rows[0]);
  //   response.render('indexAllBehaviours', content);
  // };

  // // Query using pg.Pool instead of pg.Client
  // pool.query(getBirdNoteIndexQuery, whenDoneWithQuery);
// });

app.listen(PORT);

console.log(`listening on port ${PORT}`);
