import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDb, setSetting, getSetting } from './db/db.js';
import { seedWidgets } from './api/widgets-registry.js';
import { startCron } from './scheduler/cron.js';
import apiRouter from './routes/api.js';
import settingsRouter from './routes/settings.js';
import logsRouter from './routes/logs.js';
import insightsRouter from './routes/insights-api.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// Initialise DB and seed widgets
getDb();
seedWidgets();

// Seed API key from env only if not already configured in DB (DB wins after first run)
if (process.env.AHREFS_API_KEY && !getSetting('ahrefs_api_key')) {
  setSetting('ahrefs_api_key', process.env.AHREFS_API_KEY);
}
if (process.env.TIMEOUT_MS && !getSetting('timeout_ms')) {
  setSetting('timeout_ms', process.env.TIMEOUT_MS);
}
// Seed default_country if not yet configured
if (!getSetting('default_country')) {
  setSetting('default_country', 'us');
}

// Start scheduler
startCron();

const app = express();
app.use(express.json());

// Static assets — serve public/ directory
app.use(express.static(join(__dir, 'public')));

// ── Named HTML routes ────────────────────────────────────────────────────────
// Landing page
app.get('/', (req, res) => {
  res.sendFile(join(__dir, 'public', 'index.html'));
});

// Insights report
app.get('/insights', (req, res) => {
  res.sendFile(join(__dir, 'public', 'insights', 'index.html'));
});

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/api', apiRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/logs', logsRouter);
app.use('/api/insights', insightsRouter);

// Graceful shutdown — localhost only
app.post('/api/shutdown', (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || '';
  if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json({ ok: true });
  setTimeout(() => process.exit(0), 300);
});

app.listen(PORT, () => {
  console.log(`[server] Analytics dashboard running at http://localhost:${PORT}`);
});
