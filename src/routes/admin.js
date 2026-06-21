const express = require('express');
const db = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');

const router = express.Router();

// 所有管理员接口都需要登录 + 管理员
router.use(authRequired, adminRequired);

/* ----------------------- 班次管理 ----------------------- */

// 班次列表（管理员可见全部，含下架）
router.get('/trips', (req, res) => {
  const trips = db.prepare('SELECT * FROM trips ORDER BY depart_date, depart_time').all();
  res.json({ trips });
});

// 新增班次
router.post('/trips', (req, res) => {
  const { bus_number, from_city, to_city, depart_date, depart_time, price, total_seats } =
    req.body || {};
  if (!bus_number || !from_city || !to_city || !depart_date || !depart_time) {
    return res.status(400).json({ error: '班次号、城市、日期、时间必填' });
  }
  const seats = parseInt(total_seats, 10);
  const p = parseFloat(price);
  if (!Number.isInteger(seats) || seats < 1 || !(p >= 0)) {
    return res.status(400).json({ error: '座位数和票价不合法' });
  }
  const info = db
    .prepare(
      `INSERT INTO trips (bus_number, from_city, to_city, depart_date, depart_time, price, total_seats, available_seats)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(bus_number, from_city, to_city, depart_date, depart_time, p, seats, seats);
  res.status(201).json({ id: info.lastInsertRowid });
});

// 修改班次
router.put('/trips/:id', (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: '班次不存在' });

  const {
    bus_number, from_city, to_city, depart_date, depart_time,
    price, total_seats, available_seats, status,
  } = req.body || {};

  const newTotal = total_seats != null ? parseInt(total_seats, 10) : trip.total_seats;
  let newAvail = available_seats != null ? parseInt(available_seats, 10) : trip.available_seats;
  if (!Number.isInteger(newTotal) || newTotal < 1) {
    return res.status(400).json({ error: '座位数不合法' });
  }
  if (!Number.isInteger(newAvail) || newAvail < 0 || newAvail > newTotal) {
    return res.status(400).json({ error: '余票数必须在 0 到座位数之间' });
  }

  db.prepare(
    `UPDATE trips SET bus_number=?, from_city=?, to_city=?, depart_date=?, depart_time=?,
       price=?, total_seats=?, available_seats=?, status=? WHERE id=?`
  ).run(
    bus_number ?? trip.bus_number,
    from_city ?? trip.from_city,
    to_city ?? trip.to_city,
    depart_date ?? trip.depart_date,
    depart_time ?? trip.depart_time,
    price != null ? parseFloat(price) : trip.price,
    newTotal,
    newAvail,
    status ?? trip.status,
    trip.id
  );
  res.json({ ok: true });
});

// 删除班次（有有效订单则禁止删除）
router.delete('/trips/:id', (req, res) => {
  const active = db
    .prepare("SELECT COUNT(*) AS c FROM orders WHERE trip_id = ? AND status='paid'")
    .get(req.params.id);
  if (active.c > 0) {
    return res.status(409).json({ error: '该班次存在有效订单，不能删除，可改为下架' });
  }
  db.prepare('DELETE FROM trips WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ----------------------- 订单管理 ----------------------- */

router.get('/orders', (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*, u.username, t.bus_number, t.from_city, t.to_city, t.depart_date, t.depart_time
       FROM orders o
       JOIN users u ON o.user_id = u.id
       JOIN trips t ON o.trip_id = t.id
       ORDER BY o.created_at DESC`
    )
    .all();
  res.json({ orders });
});

// 管理员取消订单（恢复余票）
router.post('/orders/:id/cancel', (req, res) => {
  try {
    db.transaction(() => {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
      if (!order) {
        const e = new Error('订单不存在');
        e.code = 404;
        throw e;
      }
      if (order.status === 'cancelled') {
        const e = new Error('订单已取消');
        e.code = 409;
        throw e;
      }
      db.prepare("UPDATE orders SET status='cancelled' WHERE id = ?").run(order.id);
      db.prepare('UPDATE trips SET available_seats = available_seats + ? WHERE id = ?')
        .run(order.seats, order.trip_id);
    })();
    res.json({ ok: true });
  } catch (e) {
    res.status(e.code || 500).json({ error: e.message || '取消失败' });
  }
});

/* ----------------------- 用户管理 ----------------------- */

router.get('/users', (req, res) => {
  const users = db
    .prepare('SELECT id, username, phone, role, created_at FROM users ORDER BY id')
    .all();
  res.json({ users });
});

// 删除用户（不能删管理员、不能删有有效订单的用户）
router.delete('/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (user.role === 'admin') {
    return res.status(403).json({ error: '不能删除管理员账号' });
  }
  const active = db
    .prepare("SELECT COUNT(*) AS c FROM orders WHERE user_id = ? AND status='paid'")
    .get(user.id);
  if (active.c > 0) {
    return res.status(409).json({ error: '该用户存在有效订单，不能删除' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.json({ ok: true });
});

module.exports = router;
