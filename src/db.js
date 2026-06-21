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
    passenger     TEXT NOT NULL,                -- 乘客姓名
    amount        REAL NOT NULL,
    status        TEXT NOT NULL DEFAULT 'paid', -- 'paid' | 'cancelled'
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (trip_id) REFERENCES trips(id)
  );

  CREATE INDEX IF NOT EXISTS idx_trips_route ON trips(from_city, to_city, depart_date);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
`);

module.exports = db;
