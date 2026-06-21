const express = require('express');
const db = require('../db');

const router = express.Router();

// 班次查询（公开）：按出发城市/到达城市/日期
router.get('/', (req, res) => {
  const { from, to, date } = req.query;
  const where = ["status = 'on'"];
  const params = [];
  if (from) { where.push('from_city = ?'); params.push(from); }
  if (to) { where.push('to_city = ?'); params.push(to); }
  if (date) { where.push('depart_date = ?'); params.push(date); }

  const sql = `SELECT * FROM trips WHERE ${where.join(' AND ')}
               ORDER BY depart_date, depart_time`;
  const trips = db.prepare(sql).all(...params);
  res.json({ trips });
});

// 城市列表（用于下拉框）
router.get('/cities', (req, res) => {
  const rows = db
    .prepare(
      `SELECT from_city AS city FROM trips WHERE status='on'
       UNION SELECT to_city AS city FROM trips WHERE status='on' ORDER BY city`
    )
    .all();
  res.json({ cities: rows.map((r) => r.city) });
});

// 班次详情
router.get('/:id', (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: '班次不存在' });
  res.json({ trip });
});

module.exports = router;
