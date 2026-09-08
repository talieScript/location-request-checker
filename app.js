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
  let parts;
  if (trimmed.startsWith('[')) {
    parts = JSON.parse(trimmed);
  } else {
    parts = trimmed.replace(/[\[\]]/g, '').split(',').map((s) => parseFloat(s.trim()));
  }
  return parts.join(',');
}

app.use(express.static('public')); // Serve static files from the 'public' directory

// Exposes client-safe config to the frontend. The Google Maps key is meant to
// be used in the browser (Maps Embed API) and is locked down via HTTP
// referrer restrictions in Google Cloud, not by keeping it server-side.
app.get('/api/config', (req, res) => {
  res.json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || null });
});

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

// API endpoint to look up the username of the person who submitted a request
app.get('/api/user/:id', async (req, res) => {
  const auth = await getAuthenticatedClient(req, res);
  if (!auth) {
    return;
  }

  try {
    const { data, error } = await auth.client
      .from('profiles')
      .select('username')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) {
      throw error;
    }
    res.json({ username: data?.username || null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
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
      added_by: req.body.added_by || null,
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

// Great-circle distance between two lat/lon points, in metres.
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// API endpoint to find existing map locations near a given point — used while reviewing
// a request to flag likely duplicates as the coordinates are adjusted. The `location`
// table only stores latlon as a plain "lat,lon" string with no spatial index, so this
// fetches the (currently a few thousand rows) table and computes distance in JS rather
// than filtering in SQL. Registered before /api/location/:id so "nearby" isn't swallowed
// by that route's :id param.
app.get('/api/location/nearby', async (req, res) => {
  const auth = await getAuthenticatedClient(req, res);
  if (!auth) {
    return;
  }

  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    res.status(400).json({ error: 'lat and lon query params are required' });
    return;
  }
  const parsedRadius = parseFloat(req.query.radius);
  const radiusMeters = Number.isNaN(parsedRadius) ? 100 : parsedRadius;

  try {
    const { data, error } = await auth.client.from('location').select('id, name, latlon');
    if (error) {
      throw error;
    }

    const nearby = data
      .filter((row) => row.id !== req.query.excludeId)
      .map((row) => {
        const [rowLat, rowLon] = String(row.latlon || '').split(',').map((s) => parseFloat(s.trim()));
        if (Number.isNaN(rowLat) || Number.isNaN(rowLon)) {
          return null;
        }
        return { id: row.id, name: row.name, latlon: row.latlon, distance: distanceMeters(lat, lon, rowLat, rowLon) };
      })
      .filter((row) => row && row.distance <= radiusMeters)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);

    res.json(nearby);
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
