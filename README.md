# 畅途客运 - 长途汽车票在线订购网站

一个仿 12306 的长途汽车票（客运）在线订购系统，包含用户端、管理员后台和完整后端 API。

## 技术栈

- **后端**：Node.js + Express
- **数据库**：SQLite（[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)，同步 API + 事务）
- **认证**：JWT（`jsonwebtoken`）+ bcrypt 密码哈希
- **前端**：原生 HTML / CSS / JavaScript（用户端 + 管理员后台两套页面，无框架）

## 核心功能

### 用户端
- 用户注册 / 登录（JWT 认证，token 存 localStorage）
- 班次查询：按出发城市 / 到达城市 / 日期筛选，展示出发/到达站点
- **可视化选座购票**：点击座位图选择具体座位（最多 5 座），**防超卖**，并发下单不会卖超
- 我的订单：查看（含座位号）、取消（取消后自动恢复余票并释放座位）

### 管理员后台
- 班次管理：增删改查，含出发/到达站点、余票 / 座位数 / 上下架管理
- 线路站点管理：城市下客运站点的增删改查
- 订单管理：查看全部订单（含座位号）、代取消（恢复余票）
- 用户管理：查看用户列表、删除用户

## 防超卖与选座实现

下单在一个 SQLite **事务**内完成，采用「条件原子扣减 + 座位唯一约束」双重保障：

```sql
-- 1）原子扣减余票：只有余票足够时才成功
UPDATE trips SET available_seats = available_seats - ?
WHERE id = ? AND available_seats >= ?;

-- 2）占座：booked_seats 表 PRIMARY KEY(trip_id, seat_no)
--    同一班次同一座位被两单争抢时，第二次 INSERT 触发唯一冲突 → 回滚
INSERT INTO booked_seats (trip_id, seat_no, order_id) VALUES (?, ?, ?);
```

只有当扣减 `changes === 1` 且所有座位插入成功时才提交订单，否则回滚并返回「余票不足」或「座位已被占用」。
配合 better-sqlite3 的串行化事务，10 个并发请求抢 3 个座位时，**精确成功 3 单、失败 7 单，余票归零且绝不为负**（见单元测试）。未指定座位号时系统自动分配最小可用座位。

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 初始化并填充演示数据（班次 + 演示账号）
npm run seed

# 3. 启动服务
npm start
# 默认 http://localhost:3000  （可用 PORT 环境变量修改）
```

打开浏览器：

- 用户端首页：<http://localhost:3000/>
- 管理后台：<http://localhost:3000/admin/>

### 演示账号

| 角色     | 用户名     | 密码       |
| -------- | ---------- | ---------- |
| 管理员   | `admin`    | `admin123` |
| 普通用户 | `zhangsan` | `user123`  |

## 运行测试

```bash
npm test
```

覆盖：注册/登录、重复用户名、班次查询过滤、未登录拦截、**并发下单防超卖**、指定座位下单与座位图、已售座位防重复、座位号越界校验、取消恢复余票与释放座位、线路站点 CRUD、管理员权限校验。测试使用独立的 `test/test.db`，不影响开发数据。

## 项目结构

```
bus-ticket-booking-opus-version/
├── src/
│   ├── server.js          # Express 入口，挂载路由与静态资源
│   ├── db.js              # SQLite 连接、建表与轻量迁移
│   ├── seed.js            # 初始化演示数据（含线路站点）
│   ├── middleware/
│   │   └── auth.js        # JWT 签发、登录校验、管理员校验
│   └── routes/
│       ├── auth.js        # 注册 / 登录 / 当前用户
│       ├── trips.js       # 班次查询、座位图（公开）
│       ├── orders.js      # 下单 / 我的订单 / 取消（选座 + 防超卖）
│       └── admin.js       # 班次/站点/订单/用户管理（管理员）
├── public/
│   ├── index.html         # 用户端：查询 + 购票
│   ├── login.html         # 登录
│   ├── register.html      # 注册
│   ├── orders.html        # 我的订单
│   ├── css/style.css
│   ├── js/
│   │   ├── common.js      # API 封装 + Auth 工具
│   │   └── index.js       # 首页逻辑
│   └── admin/
│       ├── index.html     # 管理后台页面
│       └── admin.js       # 管理后台逻辑
├── test/
│   └── api.test.js        # 集成测试
└── package.json
```

## API 概览

| 方法 | 路径 | 说明 | 鉴权 |
| ---- | ---- | ---- | ---- |
| POST | `/api/auth/register` | 注册 | - |
| POST | `/api/auth/login` | 登录 | - |
| GET  | `/api/auth/me` | 当前用户 | 用户 |
| GET  | `/api/trips` | 班次查询（`from`/`to`/`date`） | - |
| GET  | `/api/trips/cities` | 城市列表 | - |
| GET  | `/api/trips/:id` | 班次详情 | - |
| GET  | `/api/trips/:id/seats` | 座位图（总座位、已售座位号） | - |
| POST | `/api/orders` | 下单购票（`seat_numbers` 选座 / `seats` 自动分配） | 用户 |
| GET  | `/api/orders` | 我的订单 | 用户 |
| POST | `/api/orders/:id/cancel` | 取消订单 | 用户 |
| GET  | `/api/admin/trips` | 班次列表 | 管理员 |
| POST | `/api/admin/trips` | 新增班次 | 管理员 |
| PUT  | `/api/admin/trips/:id` | 修改班次 | 管理员 |
| DELETE | `/api/admin/trips/:id` | 删除班次 | 管理员 |
| GET  | `/api/admin/stations` | 站点列表 | 管理员 |
| POST | `/api/admin/stations` | 新增站点 | 管理员 |
| PUT  | `/api/admin/stations/:id` | 修改站点 | 管理员 |
| DELETE | `/api/admin/stations/:id` | 删除站点 | 管理员 |
| GET  | `/api/admin/orders` | 全部订单 | 管理员 |
| POST | `/api/admin/orders/:id/cancel` | 代取消订单 | 管理员 |
| GET  | `/api/admin/users` | 用户列表 | 管理员 |
| DELETE | `/api/admin/users/:id` | 删除用户 | 管理员 |

## 环境变量

| 变量 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `PORT` | `3000` | 服务端口 |
| `JWT_SECRET` | 内置开发密钥 | 生产环境务必修改 |
| `DB_PATH` | `data/app.db` | SQLite 文件路径 |
