const express = require('express');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();

const app = express();
const port = 3000;

// create application/json parser
var jsonParser = bodyParser.json();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.static('public')); // Serve static files from the 'public' directory

app.get('/login', function (req, res) {
  res.sendFile(__dirname + '/public/login.html');
});

app.post('/login', jsonParser, async (req, res) => {
  console.log(req.body);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: req.body.email,
    password: req.body.password,
  });

  if (error) {
    console.error(error);
    res.status(401).json({ error: error.message });
  } else {
    res.json(data);
  }
});

// API endpoint to fetch data from the Supabase table
app.get('/api/data', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('location_requests')
      .select('*');
    if (error) {
      throw error;
    }
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to insert data into the Supabase table
app.post('/api/data', jsonParser, async (req, res) => {
  try {
    const { data, error } = await supabase.from('location').insert({
      ...req.body,
      security: req.body.security || null,
      user_added: true,
    });
    if (error) {
      throw error;
    }
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/data/:id', jsonParser, async (req, res) => {
  delete req.body.id;
  delete req.body.latlon;
  console.log('id', req.params.id);
  try {
    const { data, error } = await supabase
      .from('location')
      .update({
        ...req.body,
        security: req.body.security || null,
        user_added: true,
      })
      .eq('id', req.params.id);
    if (error) {
      throw error;
    }
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// API get location from id
app.get('/api/location/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('location')
      .select('*')
      .eq('id', req.params.id);
    if (error) {
      console.log(error);
      throw error;
    }
    res.json(data[0]);
  } catch (error) {
    res.statusMessage = error.message;
    res.status(500);
  }
});

app.delete('/api/location/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('location_requests')
      .delete()
      .eq('id', req.params.id);
    if (error) {
      throw error;
    }
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
