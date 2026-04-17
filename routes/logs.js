import { Router } from 'express';
import { getLogs, clearLogs } from '../db/db.js';

const router = Router();

router.get('/', (req, res) => {
  const { widget_id, status, limit } = req.query;
  res.json(getLogs({
    widgetId: widget_id || undefined,
    status: status || undefined,
    limit: limit ? parseInt(limit, 10) : 200
  }));
});

router.delete('/', (req, res) => {
  clearLogs();
  res.json({ ok: true });
});

export default router;
