// 集成测试：注册/登录/查询/并发下单防超卖/取消恢复余票/管理员接口
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// 用独立的测试数据库
const TEST_DB = path.join(__dirname, 'test.db');
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'test-secret';

// 清理旧测试库
for (const ext of ['', '-shm', '-wal']) {
  try { fs.unlinkSync(TEST_DB + ext); } catch {}
}

const db = require('../src/db');
const bcrypt = require('bcryptjs');
const app = require('../src/server');

let server, base;

before(async () => {
  // 准备一个管理员、一个班次（只有 3 个座位，用于并发测试）
  db.exec('DELETE FROM orders; DELETE FROM trips; DELETE FROM users;');
  db.prepare('INSERT INTO users (username,password,phone,role) VALUES (?,?,?,?)')
    .run('admin', bcrypt.hashSync('admin123', 10), null, 'admin');
  db.prepare(`INSERT INTO trips (bus_number,from_city,to_city,depart_date,depart_time,price,total_seats,available_seats)
              VALUES ('T1','甲城','乙城','2030-01-01','08:00',50,3,3)`).run();

  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  for (const ext of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(TEST_DB + ext); } catch {}
  }
});

async function req(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

test('注册新用户成功并返回 token', async () => {
  const r = await req('/api/auth/register', {
    method: 'POST', body: { username: 'alice', password: 'pass123' },
  });
  assert.strictEqual(r.status, 201);
  assert.ok(r.data.token);
  assert.strictEqual(r.data.user.role, 'user');
});

test('重复用户名注册被拒绝', async () => {
  const r = await req('/api/auth/register', {
    method: 'POST', body: { username: 'alice', password: 'pass123' },
  });
  assert.strictEqual(r.status, 409);
});

test('登录成功 / 密码错误失败', async () => {
  const ok = await req('/api/auth/login', { method: 'POST', body: { username: 'alice', password: 'pass123' } });
  assert.strictEqual(ok.status, 200);
  const bad = await req('/api/auth/login', { method: 'POST', body: { username: 'alice', password: 'wrong' } });
  assert.strictEqual(bad.status, 401);
});

test('班次查询按线路过滤', async () => {
  const r = await req('/api/trips?from=甲城&to=乙城');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.trips.length, 1);
});

test('未登录不能下单', async () => {
  const trip = (await req('/api/trips')).data.trips[0];
  const r = await req('/api/orders', { method: 'POST', body: { trip_id: trip.id, seats: 1, passenger: 'x' } });
  assert.strictEqual(r.status, 401);
});

test('并发下单不会超卖（座位 3，10 个并发各买 1 座）', async () => {
  const trip = (await req('/api/trips')).data.trips[0];
  // 创建 10 个用户并发抢票
  const tokens = [];
  for (let i = 0; i < 10; i++) {
    const r = await req('/api/auth/register', {
      method: 'POST', body: { username: `buyer${i}`, password: 'pass123' },
    });
    tokens.push(r.data.token);
  }
  const results = await Promise.all(
    tokens.map((t) =>
      req('/api/orders', { method: 'POST', token: t, body: { trip_id: trip.id, seats: 1, passenger: 'p' } })
    )
  );
  const success = results.filter((r) => r.status === 201).length;
  const failed = results.filter((r) => r.status === 409).length;
  assert.strictEqual(success, 3, '只能成功 3 单');
  assert.strictEqual(failed, 7, '其余 7 单余票不足');

  // 余票必须归零，绝不为负
  const after = (await req(`/api/trips/${trip.id}`)).data.trip;
  assert.strictEqual(after.available_seats, 0);
});

test('取消订单恢复余票', async () => {
  const trip = (await req('/api/trips')).data.trips[0];
  // 此时余票 0，登录第一个成功买家取消
  const login = await req('/api/auth/login', { method: 'POST', body: { username: 'buyer0', password: 'pass123' } });
  const orders = (await req('/api/orders', { token: login.data.token })).data.orders;
  const paid = orders.find((o) => o.status === 'paid');
  assert.ok(paid, '应有已购票订单');
  const c = await req(`/api/orders/${paid.id}/cancel`, { method: 'POST', token: login.data.token });
  assert.strictEqual(c.status, 200);
  const after = (await req(`/api/trips/${trip.id}`)).data.trip;
  assert.strictEqual(after.available_seats, 1, '取消后余票恢复 1');
});

test('管理员可创建班次，普通用户被拒绝', async () => {
  const admin = await req('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
  const user = await req('/api/auth/login', { method: 'POST', body: { username: 'alice', password: 'pass123' } });

  const denied = await req('/api/admin/trips', {
    method: 'POST', token: user.data.token,
    body: { bus_number: 'X', from_city: 'a', to_city: 'b', depart_date: '2030-02-02', depart_time: '09:00', price: 10, total_seats: 5 },
  });
  assert.strictEqual(denied.status, 403);

  const ok = await req('/api/admin/trips', {
    method: 'POST', token: admin.data.token,
    body: { bus_number: 'X', from_city: 'a', to_city: 'b', depart_date: '2030-02-02', depart_time: '09:00', price: 10, total_seats: 5 },
  });
  assert.strictEqual(ok.status, 201);
});
