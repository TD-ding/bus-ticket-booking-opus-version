const path = require('path');
const express = require('express');

const authRoutes = require('./routes/auth');
const tripRoutes = require('./routes/trips');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// 静态前端
app.use(express.static(path.join(__dirname, '..', 'public')));

// JSON 解析错误兜底
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求体不是合法的 JSON' });
  }
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Bus ticket server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
