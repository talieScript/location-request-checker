const express = require('express');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();

const app = express();
const port = 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.static('public')); // Serve static files from the 'public' directory

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
app.post('/api/data', async (req, res) => {
  try {
    const { data, error } = await supabase.from('locations').insert(req.body);
    if (error) {
      throw error;
    }
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API get location from id
app.get('/api/location/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
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
