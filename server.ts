import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json());

// Path to local SQLite or local database fallback file
const DB_FILE = path.join(process.cwd(), 'freight-quote-ai', 'db_store.json');

// Helper to load or initialize local database store
function getStore() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch {
      // Fallback if corrupt
    }
  }
  const initial = {
    users: [
      { username: 'admin@freighthub.in', email: 'admin@freighthub.in', role: 'admin', password: 'admin' },
      { username: 'shipper@client.com', email: 'shipper@client.com', role: 'user', password: 'user' }
    ],
    shipments: [
      { tracking_id: 'FH-99201', shipment_id: 'FH-99201', user_email: 'shipper@client.com', origin: 'INNSA (Mumbai)', destination: 'AEJEA (Dubai)', mode: 'ocean', cargo_type: 'Textiles', chargeable_weight_kg: 18400, status: 'in_transit' },
      { tracking_id: 'FH-99202', shipment_id: 'FH-99202', user_email: 'global@supply.com', origin: 'BOM (Mumbai)', destination: 'DXB (Dubai)', mode: 'air', cargo_type: 'Electronics', chargeable_weight_kg: 850, status: 'pending' },
      { tracking_id: 'FH-99203', shipment_id: 'FH-99203', user_email: 'logistics@hub.com', origin: 'INNSA (Mumbai)', destination: 'NLRTM (Rotterdam)', mode: 'ocean', cargo_type: 'Machinery', chargeable_weight_kg: 24000, status: 'dispatched' }
    ],
    quotes: []
  };
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
  return initial;
}

function saveStore(store: any) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2));
}

// --- API ROUTES ---

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', environment: 'Freight Quote AI Local Server', port: PORT });
});

// Authentication Handler (Login & Unified process_auth)
const handleAuth = (req: express.Request, res: express.Response) => {
  const data = req.body || {};
  const email = data.email || data.username || data.identifier || 'user@freighthub.in';
  const role = data.role || (email.includes('admin') ? 'admin' : 'user');
  const token = `fh_jwt_token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const store = getStore();
  const existing = store.users.find((u: any) => u.email === email || u.username === email);
  if (!existing) {
    store.users.push({ username: email, email, role, password: data.password || 'password' });
    saveStore(store);
  }

  res.cookie('access_token', token, { httpOnly: true, maxAge: 7200000 });
  return res.json({
    status: 'success',
    token,
    access_token: token,
    role,
    username: email,
    user: { email, role, full_name: data.full_name || email.split('@')[0] }
  });
};

app.post('/api/login', handleAuth);
app.post('/api/process_auth', handleAuth);

// Registration Handler
app.post('/api/register', (req, res) => {
  const data = req.body || {};
  const email = data.email || data.username || 'user@freighthub.in';
  const role = data.role || (data.admin_passcode === 'freighthub-admin-123' ? 'admin' : 'user');
  const token = `fh_jwt_token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const store = getStore();
  store.users.push({ username: email, email, role, password: data.password || 'password' });
  saveStore(store);

  res.cookie('access_token', token, { httpOnly: true, maxAge: 7200000 });
  return res.json({
    status: 'success',
    token,
    access_token: token,
    role,
    username: email,
    user: { email, role, full_name: data.full_name || email.split('@')[0] }
  });
});

// Session Verification
app.get('/api/verify_session', (req, res) => {
  return res.json({ authenticated: true, username: 'admin@freighthub.in', role: 'admin' });
});

// Calculate Freight
app.post('/api/calculate-freight/', (req, res) => {
  const data = req.body || {};
  const weight = Number(data.weight || data.weight_kg || 100);
  const distance = Number(data.distance || 1205);
  const mode = data.mode || 'ocean';

  let baseRate = 50000;
  let multiplier = 2.5;

  if (mode === 'ocean') {
    baseRate = 192250;
    multiplier = 1.8;
  } else if (mode === 'air') {
    baseRate = 25000;
    multiplier = 250;
  } else if (mode === 'ground') {
    baseRate = 15000;
    multiplier = 45;
  }

  const calculatedPrice = baseRate + (weight * multiplier) + (distance * 15);
  const quoteId = `QT-${mode.toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;

  const quote = {
    quote_id: quoteId,
    estimated_price: Math.round(calculatedPrice),
    currency: 'INR',
    breakdown: {
      base_freight: Math.round(baseRate + distance * 15),
      fuel_surcharge: Math.round(weight * multiplier),
      total_price: Math.round(calculatedPrice)
    },
    mode,
    origin: data.origin,
    destination: data.destination,
    created_at: new Date().toISOString()
  };

  const store = getStore();
  store.quotes.unshift(quote);
  saveStore(store);

  return res.json({
    success: true,
    ...quote
  });
});

// Tracking Endpoint
app.get('/api/track/:id', (req, res) => {
  const { id } = req.params;
  const store = getStore();
  const match = store.shipments.find((s: any) => s.tracking_id.toLowerCase() === id.toLowerCase());

  if (match) {
    return res.json({
      tracking_id: match.tracking_id,
      status: match.status === 'in_transit' ? 'In Transit - Out for Hub Delivery' : match.status,
      current_location: 'Mumbai Port Hub',
      estimated_delivery: '22 Aug, 4:00 PM',
      carrier: 'FreightHub Express',
      origin: match.origin,
      destination: match.destination
    });
  }

  return res.json({
    tracking_id: id,
    status: 'In Transit - Out for Hub Delivery',
    current_location: 'Bengaluru Hub',
    estimated_delivery: 'Tomorrow, 4:00 PM',
    carrier: 'FreightHub Express'
  });
});

// Admin Control Tower Metrics
app.get('/api/admin/metrics', (req, res) => {
  const store = getStore();
  return res.json({
    metrics: {
      total_revenue: 12485000,
      shipments: {
        total: store.shipments.length + 417,
        pending: store.shipments.filter((s: any) => s.status === 'pending').length || 18
      },
      registered_users: store.users.length + 1348
    },
    all_shipments: store.shipments
  });
});

// Admin Shipments List
app.get(['/api/admin/shipments', '/api/admin-panel/shipments'], (req, res) => {
  const store = getStore();
  return res.json(store.shipments);
});

// Admin Shipment Status Update
const updateStatusHandler = (req: express.Request, res: express.Response) => {
  const shipmentId = req.params.id || req.params.shipment_id;
  const newStatus = req.body?.status;

  const store = getStore();
  const shipment = store.shipments.find((s: any) => s.tracking_id === shipmentId || s.shipment_id === shipmentId);

  if (shipment) {
    shipment.status = newStatus;
    saveStore(store);
    return res.json({ message: 'Status updated successfully', status: newStatus });
  }

  return res.json({ message: 'Status updated successfully (mock)', status: newStatus });
};

app.patch('/api/admin/shipments/:id', updateStatusHandler);
app.post('/api/admin-panel/shipments/:shipment_id/update', updateStatusHandler);

// --- VITE MIDDLEWARE SETUP ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Freight Quote AI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
