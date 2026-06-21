const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL UNIQUE,
    password    TEXT NOT NULL,
    phone       TEXT,
    role        TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS trips (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_number    TEXT NOT NULL,                -- 班次号
    from_city     TEXT NOT NULL,
    to_city       TEXT NOT NULL,
    depart_station TEXT,                         -- 出发站点（可选）
    arrive_station TEXT,                         -- 到达站点（可选）
    depart_date   TEXT NOT NULL,                -- YYYY-MM-DD
    depart_time   TEXT NOT NULL,                -- HH:MM
    price         REAL NOT NULL,
    total_seats   INTEGER NOT NULL,
    available_seats INTEGER NOT NULL,
    status        TEXT NOT NULL DEFAULT 'on',   -- 'on' | 'off'
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no      TEXT NOT NULL UNIQUE,
    user_id       INTEGER NOT NULL,
    trip_id       INTEGER NOT NULL,
    seats         INTEGER NOT NULL,             -- 购买座位数
    seat_numbers  TEXT,                          -- 具体座位号，逗号分隔，如 "3,4"
    passenger     TEXT NOT NULL,                -- 乘客姓名
    amount        REAL NOT NULL,
    status        TEXT NOT NULL DEFAULT 'paid', -- 'paid' | 'cancelled'
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (trip_id) REFERENCES trips(id)
  );

  -- 已售座位：UNIQUE(trip_id, seat_no) 保证同一班次同一座位不会被两单占用（防超卖/重复选座）
  CREATE TABLE IF NOT EXISTS booked_seats (
    trip_id   INTEGER NOT NULL,
    seat_no   INTEGER NOT NULL,
    order_id  INTEGER NOT NULL,
    PRIMARY KEY (trip_id, seat_no),
    FOREIGN KEY (trip_id) REFERENCES trips(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  -- 线路站点：城市下的客运站点
  CREATE TABLE IF NOT EXISTS stations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    city       TEXT NOT NULL,
    name       TEXT NOT NULL,                   -- 站点名，如 "北京八王坟客运站"
    address    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE (city, name)
  );

  CREATE INDEX IF NOT EXISTS idx_trips_route ON trips(from_city, to_city, depart_date);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_booked_trip ON booked_seats(trip_id);
`);

// --- 轻量迁移：为旧库补齐新增列（已存在则忽略） ---
function addColumnIfMissing(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
addColumnIfMissing('trips', 'depart_station', 'depart_station TEXT');
addColumnIfMissing('trips', 'arrive_station', 'arrive_station TEXT');
addColumnIfMissing('orders', 'seat_numbers', 'seat_numbers TEXT');

module.exports = db;
