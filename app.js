const express = require('express');

const apiRouter = require('./lib/api');

const app = express();
const port = 3000;

app.use(express.static('public')); // Serve static files from the 'public' directory

app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

app.use('/api', apiRouter);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
