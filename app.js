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

function getAccessToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

function createAuthenticatedClient(accessToken) {
  return createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function getAuthenticatedClient(req, res) {
  const accessToken = getAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: 'Not logged in' });
    return null;
  }

  const client = createAuthenticatedClient(accessToken);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    res.status(401).json({ error: 'Not logged in' });
    return null;
  }

  return { client, user };
}

function formatLatlonForLocation(latlon) {
  const trimmed = String(latlon).trim();
  if (trimmed.startsWith('[')) {
    return JSON.parse(trimmed).join(',');
  }
  return trimmed.replace(/[\[\]]/g, '');
}

app.use(express.static('public')); // Serve static files from the 'public' directory

app.get('/login', async function (req, res) {
  res.sendFile(__dirname + '/public/login.html');
});

app.post('/login', jsonParser, async (req, res) => {
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
  const auth = await getAuthenticatedClient(req, res);
  if (!auth) {
    return;
  }

  try {
    const { data, error } = await auth.client
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
  const auth = await getAuthenticatedClient(req, res);
  if (!auth) {
    return;
  }

  try {
    const { data, error } = await auth.client.from('location').insert({
      ...req.body,
      latlon: formatLatlonForLocation(req.body.latlon),
      security: req.body.security || null,
      user_added: true,
      reviewer: auth.user.id,
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
  const auth = await getAuthenticatedClient(req, res);
  if (!auth) {
    return;
  }

  delete req.body.id;
  delete req.body.latlon;
  try {
    const { data, error } = await auth.client
      .from('location')
      .update({
        ...req.body,
        security: req.body.security || null,
        user_added: true,
        reviewer: auth.user.id,
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
  const auth = await getAuthenticatedClient(req, res);
  if (!auth) {
    return;
  }

  try {
    const { data, error } = await auth.client
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
  const auth = await getAuthenticatedClient(req, res);
  if (!auth) {
    return;
  }

  try {
    const { data, error } = await auth.client
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
