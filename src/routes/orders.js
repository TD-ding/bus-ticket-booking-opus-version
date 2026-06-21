const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function genOrderNo() {
  const ts = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}` +
    `${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `BT${stamp}${rand}`;
}

// 下单购票（防超卖）
router.post('/', authRequired, (req, res) => {
  const { trip_id, seats, passenger } = req.body || {};
  const seatCount = parseInt(seats, 10);
  if (!trip_id || !Number.isInteger(seatCount) || seatCount < 1) {
    return res.status(400).json({ error: '班次和座位数（>=1）必填' });
  }
  if (!passenger || !String(passenger).trim()) {
    return res.status(400).json({ error: '乘客姓名必填' });
  }
  if (seatCount > 5) {
    return res.status(400).json({ error: '单笔订单最多购买 5 个座位' });
  }

  try {
    // 用事务 + 条件更新保证并发安全：只有余票足够时才扣减
    const result = db.transaction(() => {
      const trip = db.prepare("SELECT * FROM trips WHERE id = ? AND status='on'").get(trip_id);
      if (!trip) {
        const e = new Error('班次不存在或已下架');
        e.code = 404;
        throw e;
      }
      // 原子扣减：WHERE 条件确保不会卖超
      const upd = db
        .prepare(
          'UPDATE trips SET available_seats = available_seats - ? ' +
            'WHERE id = ? AND available_seats >= ?'
        )
        .run(seatCount, trip_id, seatCount);
      if (upd.changes === 0) {
        const e = new Error('余票不足，下单失败');
        e.code = 409;
        throw e;
      }
      const orderNo = genOrderNo();
      const amount = trip.price * seatCount;
      const info = db
        .prepare(
          'INSERT INTO orders (order_no, user_id, trip_id, seats, passenger, amount, status) ' +
            "VALUES (?, ?, ?, ?, ?, ?, 'paid')"
        )
        .run(orderNo, req.user.id, trip_id, seatCount, String(passenger).trim(), amount);
      return { id: info.lastInsertRowid, order_no: orderNo, amount };
    })();

    res.status(201).json({ order: result });
  } catch (e) {
    res.status(e.code || 500).json({ error: e.message || '下单失败' });
  }
});

// 我的订单
router.get('/', authRequired, (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*, t.bus_number, t.from_city, t.to_city, t.depart_date, t.depart_time, t.price
       FROM orders o JOIN trips t ON o.trip_id = t.id
       WHERE o.user_id = ? ORDER BY o.created_at DESC`
    )
    .all(req.user.id);
  res.json({ orders });
});

// 取消订单（恢复余票）
router.post('/:id/cancel', authRequired, (req, res) => {
  try {
    db.transaction(() => {
      const order = db
        .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
        .get(req.params.id, req.user.id);
      if (!order) {
        const e = new Error('订单不存在');
        e.code = 404;
        throw e;
      }
      if (order.status === 'cancelled') {
        const e = new Error('订单已取消，请勿重复操作');
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

module.exports = router;
