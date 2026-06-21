const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

// 注册
router.post('/register', (req, res) => {
  const { username, password, phone } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码必填' });
  }
  if (String(username).length < 3 || String(password).length < 6) {
    return res.status(400).json({ error: '用户名至少3位，密码至少6位' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: '用户名已存在' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (username, password, phone, role) VALUES (?, ?, ?, ?)')
    .run(username, hash, phone || null, 'user');

  const user = { id: info.lastInsertRowid, username, role: 'user' };
  const token = signToken(user);
  res.status(201).json({ token, user });
});

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码必填' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = signToken(user);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

// 当前用户信息
router.get('/me', authRequired, (req, res) => {
  const user = db
    .prepare('SELECT id, username, phone, role, created_at FROM users WHERE id = ?')
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ user });
});

module.exports = router;
