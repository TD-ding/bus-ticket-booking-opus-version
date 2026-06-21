const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'bus-ticket-dev-secret-change-me';
const JWT_EXPIRES = '7d';

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// 校验 JWT，把用户信息挂到 req.user
function authRequired(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录或缺少 token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'token 无效或已过期' });
  }
}

// 必须是管理员
function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

module.exports = { signToken, authRequired, adminRequired, JWT_SECRET };
