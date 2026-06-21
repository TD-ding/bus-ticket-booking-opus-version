const msgEl = document.getElementById('msg');
const resultsEl = document.getElementById('results');
let currentTrip = null;

function renderNav() {
  const nav = document.getElementById('nav');
  if (Auth.isLoggedIn) {
    const u = Auth.user || {};
    const adminLink = u.role === 'admin' ? '<a href="/admin/">管理后台</a>' : '';
    nav.innerHTML = `
      <a href="/orders.html">我的订单</a>
      ${adminLink}
      <span>你好，${escapeHtml(u.username)}</span>
      <button id="logoutBtn">退出</button>`;
    document.getElementById('logoutBtn').onclick = () => {
      Auth.clear();
      location.reload();
    };
  } else {
    nav.innerHTML = `<a href="/login.html">登录</a> <a href="/register.html">注册</a>`;
  }
}

async function loadCities() {
  try {
    const { cities } = await api('/trips/cities', { auth: false });
    const from = document.getElementById('fromCity');
    const to = document.getElementById('toCity');
    for (const c of cities) {
      from.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`);
      to.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`);
    }
  } catch (e) { /* ignore */ }
}

async function search() {
  clearFlash(msgEl);
  const from = document.getElementById('fromCity').value;
  const to = document.getElementById('toCity').value;
  const date = document.getElementById('departDate').value;
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (date) qs.set('date', date);

  try {
    const { trips } = await api(`/trips?${qs.toString()}`, { auth: false });
    renderTrips(trips);
  } catch (e) {
    flash(msgEl, e.message);
  }
}

function renderTrips(trips) {
  if (!trips.length) {
    resultsEl.innerHTML = '<div class="card empty">没有符合条件的班次</div>';
    return;
  }
  resultsEl.innerHTML = '<div class="card">' + trips.map((t) => {
    const soldOut = t.available_seats <= 0;
    return `
      <div class="trip-item">
        <div>
          <div class="trip-route">${escapeHtml(t.from_city)} → ${escapeHtml(t.to_city)}</div>
          <div class="trip-meta">
            班次 ${escapeHtml(t.bus_number)} · ${t.depart_date} ${t.depart_time}
          </div>
          <div class="trip-seats">余票 ${t.available_seats} / ${t.total_seats}</div>
        </div>
        <div class="right">
          <div class="trip-price">¥${t.price}</div>
          <button class="btn btn-sm mt book-btn" data-id="${t.id}" ${soldOut ? 'disabled' : ''}>
            ${soldOut ? '已售罄' : '购票'}
          </button>
        </div>
      </div>`;
  }).join('') + '</div>';

  document.querySelectorAll('.book-btn').forEach((b) => {
    b.onclick = () => openBook(trips.find((t) => t.id == b.dataset.id));
  });
}

/* ---------- 购票弹窗 ---------- */
const modal = document.getElementById('bookModal');
const bookMsg = document.getElementById('bookMsg');

function openBook(trip) {
  if (!Auth.isLoggedIn) {
    location.href = '/login.html';
    return;
  }
  currentTrip = trip;
  clearFlash(bookMsg);
  document.getElementById('passenger').value = Auth.user?.username || '';
  document.getElementById('seatCount').value = 1;
  document.getElementById('bookInfo').innerHTML = `
    <div class="trip-route">${escapeHtml(trip.from_city)} → ${escapeHtml(trip.to_city)}</div>
    <div class="trip-meta">班次 ${escapeHtml(trip.bus_number)} · ${trip.depart_date} ${trip.depart_time}</div>
    <div class="trip-meta">单价 ¥${trip.price} · 余票 ${trip.available_seats}</div>`;
  modal.classList.add('show');
}

document.getElementById('bookCancel').onclick = () => modal.classList.remove('show');

document.getElementById('bookConfirm').onclick = async () => {
  clearFlash(bookMsg);
  const passenger = document.getElementById('passenger').value.trim();
  const seats = parseInt(document.getElementById('seatCount').value, 10);
  if (!passenger) return flash(bookMsg, '请填写乘客姓名');
  try {
    const { order } = await api('/orders', {
      method: 'POST',
      body: { trip_id: currentTrip.id, seats, passenger },
    });
    flash(bookMsg, `下单成功！订单号 ${order.order_no}，金额 ¥${order.amount}`, 'success');
    setTimeout(() => {
      modal.classList.remove('show');
      search();
    }, 1200);
  } catch (e) {
    flash(bookMsg, e.message);
  }
};

document.getElementById('searchBtn').onclick = search;

renderNav();
loadCities().then(search);
