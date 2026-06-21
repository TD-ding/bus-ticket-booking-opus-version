// 管理后台逻辑
const msgEl = document.getElementById('msg');

// 权限校验
if (!Auth.isLoggedIn || Auth.user?.role !== 'admin') {
  alert('需要管理员权限，请使用管理员账号登录');
  location.href = '/login.html';
}

document.getElementById('nav').innerHTML = `
  <a href="/">返回前台</a>
  <span>管理员：${escapeHtml(Auth.user?.username || '')}</span>
  <button id="logoutBtn">退出</button>`;
document.getElementById('logoutBtn').onclick = () => { Auth.clear(); location.href = '/login.html'; };

/* ---------- Tab 切换 ---------- */
document.querySelectorAll('.tabs button').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach((p) => (p.style.display = 'none'));
    document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';
    if (btn.dataset.tab === 'trips') loadTrips();
    if (btn.dataset.tab === 'orders') loadOrders();
    if (btn.dataset.tab === 'users') loadUsers();
  };
});

/* ---------- 班次管理 ---------- */
async function loadTrips() {
  clearFlash(msgEl);
  try {
    const { trips } = await api('/admin/trips');
    const el = document.getElementById('tripsTable');
    if (!trips.length) { el.innerHTML = '<div class="empty">暂无班次</div>'; return; }
    el.innerHTML = `<table><thead><tr>
      <th>ID</th><th>班次号</th><th>线路</th><th>发车</th><th>票价</th>
      <th>余票/座位</th><th>状态</th><th>操作</th>
    </tr></thead><tbody>${trips.map((t) => `<tr>
      <td>${t.id}</td>
      <td>${escapeHtml(t.bus_number)}</td>
      <td>${escapeHtml(t.from_city)} → ${escapeHtml(t.to_city)}</td>
      <td>${t.depart_date} ${t.depart_time}</td>
      <td>¥${t.price}</td>
      <td>${t.available_seats} / ${t.total_seats}</td>
      <td>${t.status === 'on' ? '<span class="badge badge-green">上架</span>' : '<span class="badge badge-gray">下架</span>'}</td>
      <td>
        <button class="btn btn-sm btn-ghost edit-trip" data-id="${t.id}">编辑</button>
        <button class="btn btn-sm btn-danger del-trip" data-id="${t.id}">删除</button>
      </td>
    </tr>`).join('')}</tbody></table>`;

    el.querySelectorAll('.edit-trip').forEach((b) => {
      b.onclick = () => openTripModal(trips.find((t) => t.id == b.dataset.id));
    });
    el.querySelectorAll('.del-trip').forEach((b) => {
      b.onclick = () => delTrip(b.dataset.id);
    });
  } catch (e) { flash(msgEl, e.message); }
}

const tripModal = document.getElementById('tripModal');
const tripMsg = document.getElementById('tripMsg');

function openTripModal(trip) {
  clearFlash(tripMsg);
  const isEdit = !!trip;
  document.getElementById('tripModalTitle').textContent = isEdit ? '编辑班次' : '新增班次';
  document.getElementById('tripId').value = isEdit ? trip.id : '';
  document.getElementById('f_bus_number').value = isEdit ? trip.bus_number : '';
  document.getElementById('f_from_city').value = isEdit ? trip.from_city : '';
  document.getElementById('f_to_city').value = isEdit ? trip.to_city : '';
  document.getElementById('f_depart_date').value = isEdit ? trip.depart_date : '';
  document.getElementById('f_depart_time').value = isEdit ? trip.depart_time : '';
  document.getElementById('f_price').value = isEdit ? trip.price : '';
  document.getElementById('f_total_seats').value = isEdit ? trip.total_seats : '';
  document.getElementById('f_available_seats').value = isEdit ? trip.available_seats : '';
  document.getElementById('f_status').value = isEdit ? trip.status : 'on';
  // 新增时隐藏余票/状态（由座位数自动初始化）
  document.getElementById('availWrap').style.display = isEdit ? 'block' : 'none';
  document.getElementById('statusWrap').style.display = isEdit ? 'block' : 'none';
  tripModal.classList.add('show');
}

document.getElementById('addTripBtn').onclick = () => openTripModal(null);
document.getElementById('tripCancel').onclick = () => tripModal.classList.remove('show');

document.getElementById('tripSave').onclick = async () => {
  clearFlash(tripMsg);
  const id = document.getElementById('tripId').value;
  const body = {
    bus_number: document.getElementById('f_bus_number').value.trim(),
    from_city: document.getElementById('f_from_city').value.trim(),
    to_city: document.getElementById('f_to_city').value.trim(),
    depart_date: document.getElementById('f_depart_date').value,
    depart_time: document.getElementById('f_depart_time').value,
    price: document.getElementById('f_price').value,
    total_seats: document.getElementById('f_total_seats').value,
  };
  if (id) {
    body.available_seats = document.getElementById('f_available_seats').value;
    body.status = document.getElementById('f_status').value;
  }
  try {
    if (id) {
      await api(`/admin/trips/${id}`, { method: 'PUT', body });
    } else {
      await api('/admin/trips', { method: 'POST', body });
    }
    tripModal.classList.remove('show');
    flash(msgEl, '保存成功', 'success');
    loadTrips();
  } catch (e) { flash(tripMsg, e.message); }
};

async function delTrip(id) {
  if (!confirm('确认删除该班次？')) return;
  try {
    await api(`/admin/trips/${id}`, { method: 'DELETE' });
    flash(msgEl, '已删除', 'success');
    loadTrips();
  } catch (e) { flash(msgEl, e.message); }
}

/* ---------- 订单管理 ---------- */
async function loadOrders() {
  clearFlash(msgEl);
  try {
    const { orders } = await api('/admin/orders');
    const el = document.getElementById('ordersTable');
    if (!orders.length) { el.innerHTML = '<div class="empty">暂无订单</div>'; return; }
    el.innerHTML = `<table><thead><tr>
      <th>订单号</th><th>用户</th><th>行程</th><th>发车</th><th>乘客</th>
      <th>座位</th><th>金额</th><th>状态</th><th>下单时间</th><th>操作</th>
    </tr></thead><tbody>${orders.map((o) => `<tr>
      <td>${escapeHtml(o.order_no)}</td>
      <td>${escapeHtml(o.username)}</td>
      <td>${escapeHtml(o.from_city)} → ${escapeHtml(o.to_city)} <span class="muted">(${escapeHtml(o.bus_number)})</span></td>
      <td>${o.depart_date} ${o.depart_time}</td>
      <td>${escapeHtml(o.passenger)}</td>
      <td>${o.seats}</td>
      <td>¥${o.amount}</td>
      <td>${o.status === 'paid' ? '<span class="badge badge-green">已购票</span>' : '<span class="badge badge-gray">已取消</span>'}</td>
      <td class="muted" style="font-size:12px">${o.created_at}</td>
      <td>${o.status === 'paid'
        ? `<button class="btn btn-sm btn-danger cancel-order" data-id="${o.id}">取消</button>`
        : '-'}</td>
    </tr>`).join('')}</tbody></table>`;
    el.querySelectorAll('.cancel-order').forEach((b) => {
      b.onclick = () => cancelOrder(b.dataset.id);
    });
  } catch (e) { flash(msgEl, e.message); }
}

async function cancelOrder(id) {
  if (!confirm('确认取消该订单？取消后将恢复余票。')) return;
  try {
    await api(`/admin/orders/${id}/cancel`, { method: 'POST' });
    flash(msgEl, '订单已取消', 'success');
    loadOrders();
  } catch (e) { flash(msgEl, e.message); }
}

/* ---------- 用户管理 ---------- */
async function loadUsers() {
  clearFlash(msgEl);
  try {
    const { users } = await api('/admin/users');
    const el = document.getElementById('usersTable');
    el.innerHTML = `<table><thead><tr>
      <th>ID</th><th>用户名</th><th>手机号</th><th>角色</th><th>注册时间</th><th>操作</th>
    </tr></thead><tbody>${users.map((u) => `<tr>
      <td>${u.id}</td>
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.phone || '-')}</td>
      <td>${u.role === 'admin' ? '<span class="badge badge-red">管理员</span>' : '<span class="badge badge-gray">普通用户</span>'}</td>
      <td class="muted" style="font-size:12px">${u.created_at}</td>
      <td>${u.role === 'admin'
        ? '-'
        : `<button class="btn btn-sm btn-danger del-user" data-id="${u.id}">删除</button>`}</td>
    </tr>`).join('')}</tbody></table>`;
    el.querySelectorAll('.del-user').forEach((b) => {
      b.onclick = () => delUser(b.dataset.id);
    });
  } catch (e) { flash(msgEl, e.message); }
}

async function delUser(id) {
  if (!confirm('确认删除该用户？')) return;
  try {
    await api(`/admin/users/${id}`, { method: 'DELETE' });
    flash(msgEl, '已删除', 'success');
    loadUsers();
  } catch (e) { flash(msgEl, e.message); }
}

// 初始加载
loadTrips();
