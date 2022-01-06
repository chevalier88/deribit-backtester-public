/* eslint-disable max-len */
import express from 'express';
import pg from 'pg';
import methodOverride from 'method-override';
import cookieParser from 'cookie-parser';

// Initialise DB connection
const { Pool } = pg;
const pgConnectionConfigs = {
  user: 'grahamlim',
  host: 'localhost',
  database: 'birdwatching',
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

/* Like app.get, app.use sets a callback that will run when a request arrives. Unlike app.get, the app.use callback runs on every request, regardless of the URL path. Add the following code to your app before your routes: */
app.use((request, response, next) => {
  console.log('Every request:', request.path);
  next();
});

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

    response.redirect('/');
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

app.get('/logout', (request, response) => {
  console.log('logging out');
  console.log(request);
  response.clearCookie('loggedIn');
  response.clearCookie('userId');
  response.redirect('/login');
});

app.get('/note', (request, response) => {
  console.log('note form get request came in');
  console.log(typeof (request.cookies.userId));
  const getBirdFormQuery = (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).send(result.rows);
    } else {
      const data = {
        species: result.rows,
      };
      console.log(result.rows);
      response.render('noteForm', data);
    }
  };

  // Query using pg.Pool instead of pg.Client
  pool.query('SELECT * FROM species', getBirdFormQuery);
});

app.post('/note', (request, response) => {
  console.log('note form post request came in');
  const formData = request.body;
  console.log('printing formData...');
  console.log(formData);

  const { date } = formData;
  // const { behaviour } = formData;
  const flockSize = formData.flock_size;
  const { appearance } = formData;
  const cookieUserId = Number(request.cookies.userId);
  const speciesId = formData.species_id;

  console.log(cookieUserId);

  const postBirdFormQuery = `
  INSERT INTO birds (date, flock_size, appearance, user_id, species_id)
  VALUES ('${date}', ${flockSize}, '${appearance}', ${cookieUserId}, ${speciesId})
  returning id;
  `;
  console.log(postBirdFormQuery);
  const postBirdFormQueryResult = (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).send(result);
    } else {
      console.log('printing result.rows...');
      console.log(result.rows);
      console.log('printing result.rows[0] ...');

      console.log(result.rows[0]);
      const noteId = result.rows[0].id;

      formData.behaviour.forEach((element) => {
        const behaviourIdQuery = `SELECT id FROM behaviour WHERE action = '${element}'`;

        pool.query(behaviourIdQuery, (behaviourIdQueryError, behaviourIdQueryResult) => {
          if (behaviourIdQueryError) {
            console.log('error', behaviourIdQueryError);
          } else {
            console.log('behaviour id:', behaviourIdQueryResult.rows);
            const behaviourId = behaviourIdQueryResult.rows[0].id;
            const behaviourData = [noteId, behaviourId];

            const notesBehaviourEntry = 'INSERT INTO notes_behaviour (notes_id, behaviour_id) VALUES ($1, $2)';

            pool.query(notesBehaviourEntry, behaviourData, (BehaviourError, BehaviourResult) => {
              if (BehaviourError) {
                console.log('error', BehaviourError);
              } else {
                console.log('printing Behaviour Entry Results...');
                console.log(BehaviourResult);
              }
            });
          }
        });
      });
      response.redirect('/');
    }
  };

  // Query using pg.Pool instead of pg.Client
  pool.query(postBirdFormQuery, postBirdFormQueryResult);
});

app.get('/note/:id', (request, response) => {
  console.log('indiv note request came in');

  console.log(request.params.id);

  // const getBirdNoteIndexQuery = `
  // SELECT * FROM birds WHERE id=${request.params.id};`;

  // inner join to get all the deets from the 3 tables
  const getBirdNoteIndexQuery = `
  SELECT birds.id, birds.flock_size, birds.date, birds.appearance, birds.behaviour, users.email, species.name 
  AS species 
  FROM birds 
  INNER JOIN users 
  ON birds.user_id = users.id 
  INNER JOIN species 
  ON species.id = birds.species_id 
  WHERE birds.id = ${request.params.id}`;
  console.log(getBirdNoteIndexQuery);

  const whenDoneWithQuery = (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).send(result.rows);
      return;
    }
    console.log(result.rows[0]);
    const content = {
      noteIndex: {
        id: result.rows[0].id,
        date: result.rows[0].date,
        flock_size: result.rows[0].flock_size,
        appearance: result.rows[0].appearance,
        species: result.rows[0].species,
        email: result.rows[0].email,
      },
    };
    console.log(content);
    // response.send(result.rows[0]);
    response.render('noteIndex', content);
  };

  // Query using pg.Pool instead of pg.Client
  pool.query(getBirdNoteIndexQuery, whenDoneWithQuery);
});

app.get('/', (request, response) => {
  console.log('indiv note request came in');
  if (request.cookies.loggedIn === 'true') {
    // const getAllBirdNotesQuery = `
    // SELECT * FROM birds;`;

    const getAllBirdNotesQuery = `
    SELECT birds.id, birds.behaviour, birds.flock_size, birds.user_id, birds.species_id, birds.date, species.name 
    FROM birds 
    INNER JOIN species 
    ON birds.species_id = species.id;`;

    const whenDoneWithQuery = (error, result) => {
      if (error) {
        console.log('Error executing query', error.stack);
        response.status(503).send(result.rows);
        return;
      }
      console.log(result.rows);
      const content = {
        allSightings: result.rows,
      };
      // response.send(content);
      response.render('allNotes', content);
    };

    // Query using pg.Pool instead of pg.Client
    pool.query(getAllBirdNotesQuery, whenDoneWithQuery);
  } else {
    response.status(403).send('sorry, please log in!');
  }
});

// 3.POCE.9: Bird watching comments
app.post('/note/:id/comment', (req, res) => {
  const { userId } = req.cookies;

  const notesId = req.params.id;
  console.log(notesId);
  const text = req.body.comment;
  console.log(text);

  const addCommentQuery = 'INSERT INTO comments (text, notes_id, user_id) VALUES ($1, $2, $3)';
  const inputData = [`'${text}'`, notesId, userId];

  pool.query(addCommentQuery, inputData, (addCommentQueryError, addCommentQueryResult) => {
    if (addCommentQueryError) {
      console.log('error', addCommentQueryError);
    } else {
      console.log('done');
      res.redirect(`/note/${notesId}/comments`);
    }
  });
});

app.get('/note/:id/comments', (request, response) => {
  console.log('indiv note all comments request came in');

  console.log(request.params.id);

  // const getBirdNoteIndexQuery = `
  // SELECT * FROM birds WHERE id=${request.params.id};`;

  // inner join to get all the deets from the 3 tables
  const getBirdNoteIndexQuery = `
  SELECT * FROM comments
  WHERE notes_id = ${request.params.id};`;
  console.log(getBirdNoteIndexQuery);

  const whenDoneWithQuery = (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).send(result.rows);
      return;
    }
    const content = {
      index: request.params.id,
      allSightings: result.rows,
    };
    console.log(content);
    // response.send(result.rows[0]);
    response.render('indexAllComments', content);
  };

  // Query using pg.Pool instead of pg.Client
  pool.query(getBirdNoteIndexQuery, whenDoneWithQuery);
});

app.get('/note/:id/behaviours', (request, response) => {
  console.log('indiv note all behaviours request came in');

  console.log(request.params.id);

  // const getBirdNoteIndexQuery = `
  // SELECT * FROM birds WHERE id=${request.params.id};`;

  // inner join to get all the deets from the 2 tables
  const firstQuery = `
  SELECT notes_behaviour.id, notes_behaviour.behaviour_id, behaviour.id, behaviour.action
  FROM notes_behaviour
  INNER JOIN behaviour
  ON behaviour.id = notes_behaviour.behaviour_id
  WHERE notes_behaviour.notes_id = ${request.params.id};
  `;
  const whenDoneWithFirstQuery = (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).send(result.rows);
      return;
    }
    const content = {
      index: request.params.id,
      allActions: result.rows,
    };
    console.log(content);
    // response.send(result.rows);
    response.render('indexAllBehaviours', content);
  };
  pool.query(firstQuery, whenDoneWithFirstQuery);

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
});

app.listen(PORT);

console.log(`listening on port ${PORT}`);
