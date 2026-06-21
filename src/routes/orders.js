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

// 下单购票（防超卖 + 选座）
//   body: { trip_id, passenger, seat_numbers?: number[], seats?: number }
//   - 传 seat_numbers：按指定座位号下单（选座）
//   - 只传 seats：系统自动分配最小可用座位号（兼容旧逻辑）
router.post('/', authRequired, (req, res) => {
  const { trip_id, seats, passenger, seat_numbers } = req.body || {};

  if (!trip_id) {
    return res.status(400).json({ error: '班次必填' });
  }
  if (!passenger || !String(passenger).trim()) {
    return res.status(400).json({ error: '乘客姓名必填' });
  }

  // 规整选座入参
  let chosenSeats = null;
  if (Array.isArray(seat_numbers) && seat_numbers.length) {
    chosenSeats = seat_numbers.map((n) => parseInt(n, 10));
    if (chosenSeats.some((n) => !Number.isInteger(n) || n < 1)) {
      return res.status(400).json({ error: '座位号不合法' });
    }
    if (new Set(chosenSeats).size !== chosenSeats.length) {
      return res.status(400).json({ error: '存在重复座位号' });
    }
  }

  const seatCount = chosenSeats ? chosenSeats.length : parseInt(seats, 10);
  if (!Number.isInteger(seatCount) || seatCount < 1) {
    return res.status(400).json({ error: '座位数（>=1）必填' });
  }
  if (seatCount > 5) {
    return res.status(400).json({ error: '单笔订单最多购买 5 个座位' });
  }

  try {
    // 用事务保证并发安全：座位扣减 + booked_seats 唯一约束双重防超卖
    const result = db.transaction(() => {
      const trip = db.prepare("SELECT * FROM trips WHERE id = ? AND status='on'").get(trip_id);
      if (!trip) {
        const e = new Error('班次不存在或已下架');
        e.code = 404;
        throw e;
      }

      // 校验选座范围
      if (chosenSeats && chosenSeats.some((n) => n > trip.total_seats)) {
        const e = new Error(`座位号必须在 1 到 ${trip.total_seats} 之间`);
        e.code = 400;
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

      // 确定座位号：指定座位 or 自动分配最小可用
      let finalSeats = chosenSeats;
      if (!finalSeats) {
        const taken = new Set(
          db.prepare('SELECT seat_no FROM booked_seats WHERE trip_id = ?').all(trip_id)
            .map((r) => r.seat_no)
        );
        finalSeats = [];
        for (let s = 1; s <= trip.total_seats && finalSeats.length < seatCount; s++) {
          if (!taken.has(s)) finalSeats.push(s);
        }
        if (finalSeats.length < seatCount) {
          const e = new Error('余票不足，下单失败');
          e.code = 409;
          throw e;
        }
      }

      const orderNo = genOrderNo();
      const amount = trip.price * seatCount;
      const info = db
        .prepare(
          'INSERT INTO orders (order_no, user_id, trip_id, seats, seat_numbers, passenger, amount, status) ' +
            "VALUES (?, ?, ?, ?, ?, ?, ?, 'paid')"
        )
        .run(
          orderNo, req.user.id, trip_id, seatCount,
          finalSeats.join(','), String(passenger).trim(), amount
        );

      // 占座：UNIQUE(trip_id, seat_no) 命中冲突则抛错回滚（座位已被抢）
      const insSeat = db.prepare(
        'INSERT INTO booked_seats (trip_id, seat_no, order_id) VALUES (?, ?, ?)'
      );
      try {
        for (const s of finalSeats) insSeat.run(trip_id, s, info.lastInsertRowid);
      } catch (err) {
        const e = new Error('所选座位已被占用，请重新选座');
        e.code = 409;
        throw e;
      }

      return { id: info.lastInsertRowid, order_no: orderNo, amount, seat_numbers: finalSeats };
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
      // 释放占座
      db.prepare('DELETE FROM booked_seats WHERE order_id = ?').run(order.id);
    })();
    res.json({ ok: true });
  } catch (e) {
    res.status(e.code || 500).json({ error: e.message || '取消失败' });
  }
});

module.exports = router;
