const bcrypt = require('bcryptjs');
const db = require('./db');

// 重置数据（仅 seed 用）
db.exec('DELETE FROM orders; DELETE FROM trips; DELETE FROM users;');
db.exec("DELETE FROM sqlite_sequence WHERE name IN ('orders','trips','users');");

// 管理员 + 演示用户
const adminHash = bcrypt.hashSync('admin123', 10);
const userHash = bcrypt.hashSync('user123', 10);
db.prepare('INSERT INTO users (username, password, phone, role) VALUES (?, ?, ?, ?)')
  .run('admin', adminHash, '13800000000', 'admin');
db.prepare('INSERT INTO users (username, password, phone, role) VALUES (?, ?, ?, ?)')
  .run('zhangsan', userHash, '13900000000', 'user');

// 生成未来 5 天的班次
const routes = [
  { num: 'K101', from: '北京', to: '天津', time: '08:00', price: 45, seats: 40 },
  { num: 'K102', from: '北京', to: '天津', time: '14:30', price: 45, seats: 40 },
  { num: 'K201', from: '上海', to: '杭州', time: '09:15', price: 68, seats: 35 },
  { num: 'K202', from: '上海', to: '南京', time: '10:00', price: 88, seats: 45 },
  { num: 'K301', from: '广州', to: '深圳', time: '07:30', price: 55, seats: 50 },
  { num: 'K302', from: '广州', to: '珠海', time: '13:00', price: 75, seats: 38 },
  { num: 'K401', from: '成都', to: '重庆', time: '11:20', price: 110, seats: 30 },
];

const insertTrip = db.prepare(
  `INSERT INTO trips (bus_number, from_city, to_city, depart_date, depart_time, price, total_seats, available_seats)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

const today = new Date();
for (let d = 0; d < 5; d++) {
  const date = new Date(today);
  date.setDate(today.getDate() + d);
  const ds = date.toISOString().slice(0, 10);
  for (const r of routes) {
    insertTrip.run(r.num, r.from, r.to, ds, r.time, r.price, r.seats, r.seats);
  }
}

console.log('Seed 完成：');
console.log('  管理员  admin / admin123');
console.log('  普通用户 zhangsan / user123');
console.log(`  班次数量：${db.prepare('SELECT COUNT(*) c FROM trips').get().c}`);
