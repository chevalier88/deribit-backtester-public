/* eslint-disable max-len */
// require method because of module error with child spawning
const fs = require('fs');
const express = require('express');
const pg = require('pg');
const methodOverride = require('method-override');
const cookieParser= require('cookie-parser');
const { time } = require('console');

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
  
  let timeframeEntry = 0;
  // console.log(formData.timeframes_id)
  // get the actual timeframe name based on timeframe id (one to many)

  pool
    .query(`SELECT * FROM timeframes WHERE id=${formData.timeframes_id};`)
    .then((result) => {
      console.log(result.rows[0].timeframe)
      timeframeEntry = result.rows[0].timeframe
      console.log(`timeframe entry: ${timeframeEntry}`)
    });
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
