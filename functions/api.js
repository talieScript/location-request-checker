const express = require('express');
const serverless = require('serverless-http');

const apiRouter = require('../lib/api');

// Netlify Function entry point. Static files (including login.html) are served
// directly by Netlify from the `public` publish directory, not through this function —
// see netlify.toml, which rewrites /api/* here and /login to /login.html.
const app = express();
app.use('/api', apiRouter);

module.exports.handler = serverless(app);
