const bcrypt = require('bcryptjs');
const db = require('./db');

// 重置数据（仅 seed 用）
db.exec('DELETE FROM booked_seats; DELETE FROM orders; DELETE FROM trips; DELETE FROM users; DELETE FROM stations;');
db.exec("DELETE FROM sqlite_sequence WHERE name IN ('orders','trips','users','stations');");

// 管理员 + 演示用户
const adminHash = bcrypt.hashSync('admin123', 10);
const userHash = bcrypt.hashSync('user123', 10);
db.prepare('INSERT INTO users (username, password, phone, role) VALUES (?, ?, ?, ?)')
  .run('admin', adminHash, '13800000000', 'admin');
db.prepare('INSERT INTO users (username, password, phone, role) VALUES (?, ?, ?, ?)')
  .run('zhangsan', userHash, '13900000000', 'user');

// 线路站点
const stations = [
  ['北京', '北京八王坟客运站', '北京市朝阳区京通快速路'],
  ['北京', '北京六里桥客运站', '北京市丰台区六里桥南里'],
  ['天津', '天津通莎客运站', '天津市河东区中山门'],
  ['上海', '上海长途客运总站', '上海市闸北区中兴路'],
  ['上海', '上海南站长途客运站', '上海市徐汇区老沪闵路'],
  ['杭州', '杭州汽车客运中心', '杭州市江干区九堡'],
  ['南京', '南京中央门长途汽车站', '南京市玄武区龙蟠路'],
  ['广州', '广州省汽车客运站', '广州市越秀区环市西路'],
  ['深圳', '深圳福田汽车客运站', '深圳市福田区深南大道'],
  ['珠海', '珠海香洲长途汽车站', '珠海市香洲区迎宾北路'],
  ['成都', '成都新南门汽车站', '成都市武侯区临江中路'],
  ['重庆', '重庆龙头寺汽车站', '重庆市渝北区泰山大道'],
];
const insertStation = db.prepare('INSERT INTO stations (city, name, address) VALUES (?, ?, ?)');
for (const s of stations) insertStation.run(...s);

// 生成未来 5 天的班次
const routes = [
  { num: 'K101', from: '北京', to: '天津', fs: '北京八王坟客运站', ts: '天津通莎客运站', time: '08:00', price: 45, seats: 40 },
  { num: 'K102', from: '北京', to: '天津', fs: '北京六里桥客运站', ts: '天津通莎客运站', time: '14:30', price: 45, seats: 40 },
  { num: 'K201', from: '上海', to: '杭州', fs: '上海长途客运总站', ts: '杭州汽车客运中心', time: '09:15', price: 68, seats: 35 },
  { num: 'K202', from: '上海', to: '南京', fs: '上海南站长途客运站', ts: '南京中央门长途汽车站', time: '10:00', price: 88, seats: 45 },
  { num: 'K301', from: '广州', to: '深圳', fs: '广州省汽车客运站', ts: '深圳福田汽车客运站', time: '07:30', price: 55, seats: 50 },
  { num: 'K302', from: '广州', to: '珠海', fs: '广州省汽车客运站', ts: '珠海香洲长途汽车站', time: '13:00', price: 75, seats: 38 },
  { num: 'K401', from: '成都', to: '重庆', fs: '成都新南门汽车站', ts: '重庆龙头寺汽车站', time: '11:20', price: 110, seats: 30 },
];

const insertTrip = db.prepare(
  `INSERT INTO trips (bus_number, from_city, to_city, depart_station, arrive_station, depart_date, depart_time, price, total_seats, available_seats)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const today = new Date();
for (let d = 0; d < 5; d++) {
  const date = new Date(today);
  date.setDate(today.getDate() + d);
  const ds = date.toISOString().slice(0, 10);
  for (const r of routes) {
    insertTrip.run(r.num, r.from, r.to, r.fs, r.ts, ds, r.time, r.price, r.seats, r.seats);
  }
}

console.log('Seed 完成：');
console.log('  管理员  admin / admin123');
console.log('  普通用户 zhangsan / user123');
console.log(`  班次数量：${db.prepare('SELECT COUNT(*) c FROM trips').get().c}`);
console.log(`  站点数量：${db.prepare('SELECT COUNT(*) c FROM stations').get().c}`);
