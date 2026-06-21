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
    const stationLine = (t.depart_station || t.arrive_station)
      ? `<div class="trip-meta">${escapeHtml(t.depart_station || '—')} 发车 · 抵达 ${escapeHtml(t.arrive_station || '—')}</div>`
      : '';
    return `
      <div class="trip-item">
        <div>
          <div class="trip-route">${escapeHtml(t.from_city)} → ${escapeHtml(t.to_city)}</div>
          <div class="trip-meta">
            班次 ${escapeHtml(t.bus_number)} · ${t.depart_date} ${t.depart_time}
          </div>
          ${stationLine}
          <div class="trip-seats">余票 ${t.available_seats} / ${t.total_seats}</div>
        </div>
        <div class="right">
          <div class="trip-price">¥${t.price}</div>
          <button class="btn btn-sm mt book-btn" data-id="${t.id}" ${soldOut ? 'disabled' : ''}>
            ${soldOut ? '已售罄' : '选座购票'}
          </button>
        </div>
      </div>`;
  }).join('') + '</div>';

  document.querySelectorAll('.book-btn').forEach((b) => {
    b.onclick = () => openBook(trips.find((t) => t.id == b.dataset.id));
  });
}

/* ---------- 购票弹窗（选座） ---------- */
const modal = document.getElementById('bookModal');
const bookMsg = document.getElementById('bookMsg');
const MAX_SEATS = 5;
let pickedSeats = [];

async function openBook(trip) {
  if (!Auth.isLoggedIn) {
    location.href = '/login.html';
    return;
  }
  currentTrip = trip;
  pickedSeats = [];
  clearFlash(bookMsg);
  document.getElementById('passenger').value = Auth.user?.username || '';
  const stationLine = (trip.depart_station || trip.arrive_station)
    ? `<div class="trip-meta">${escapeHtml(trip.depart_station || '—')} 发车 · 抵达 ${escapeHtml(trip.arrive_station || '—')}</div>`
    : '';
  document.getElementById('bookInfo').innerHTML = `
    <div class="trip-route">${escapeHtml(trip.from_city)} → ${escapeHtml(trip.to_city)}</div>
    <div class="trip-meta">班次 ${escapeHtml(trip.bus_number)} · ${trip.depart_date} ${trip.depart_time}</div>
    ${stationLine}
    <div class="trip-meta">单价 ¥${trip.price} · 余票 ${trip.available_seats}</div>`;

  document.getElementById('seatMap').innerHTML = '<div class="muted">加载座位图...</div>';
  document.getElementById('seatSummary').textContent = '';
  modal.classList.add('show');

  try {
    const info = await api(`/trips/${trip.id}/seats`, { auth: false });
    renderSeatMap(info.total_seats, info.taken_seats || []);
  } catch (e) {
    document.getElementById('seatMap').innerHTML =
      `<div class="msg msg-error">座位图加载失败：${escapeHtml(e.message)}</div>`;
  }
}

function renderSeatMap(total, taken) {
  const takenSet = new Set(taken);
  let html = '';
  for (let n = 1; n <= total; n++) {
    const isTaken = takenSet.has(n);
    html += `<button type="button" class="seat ${isTaken ? 'seat-taken' : 'seat-free'}"
      data-seat="${n}" ${isTaken ? 'disabled' : ''}>${n}</button>`;
  }
  const map = document.getElementById('seatMap');
  map.innerHTML = html;
  map.querySelectorAll('.seat-free').forEach((btn) => {
    btn.onclick = () => toggleSeat(parseInt(btn.dataset.seat, 10), btn);
  });
  updateSeatSummary();
}

function toggleSeat(n, btn) {
  const idx = pickedSeats.indexOf(n);
  if (idx >= 0) {
    pickedSeats.splice(idx, 1);
    btn.classList.remove('seat-picked');
  } else {
    if (pickedSeats.length >= MAX_SEATS) {
      flash(bookMsg, `单笔订单最多购买 ${MAX_SEATS} 个座位`);
      return;
    }
    clearFlash(bookMsg);
    pickedSeats.push(n);
    btn.classList.add('seat-picked');
  }
  updateSeatSummary();
}

function updateSeatSummary() {
  const el = document.getElementById('seatSummary');
  if (!pickedSeats.length) {
    el.textContent = '请选择座位';
    return;
  }
  const sorted = [...pickedSeats].sort((a, b) => a - b);
  const total = (currentTrip.price * pickedSeats.length).toFixed(2);
  el.innerHTML = `已选 <b>${pickedSeats.length}</b> 座：${sorted.join('、')} · 合计 <b>¥${total}</b>`;
}

document.getElementById('bookCancel').onclick = () => modal.classList.remove('show');

document.getElementById('bookConfirm').onclick = async () => {
  clearFlash(bookMsg);
  const passenger = document.getElementById('passenger').value.trim();
  if (!passenger) return flash(bookMsg, '请填写乘客姓名');
  if (!pickedSeats.length) return flash(bookMsg, '请至少选择一个座位');
  try {
    const { order } = await api('/orders', {
      method: 'POST',
      body: { trip_id: currentTrip.id, seat_numbers: pickedSeats, passenger },
    });
    flash(
      bookMsg,
      `下单成功！订单号 ${order.order_no}，座位 ${order.seat_numbers.join('、')}，金额 ¥${order.amount}`,
      'success'
    );
    setTimeout(() => {
      modal.classList.remove('show');
      search();
    }, 1400);
  } catch (e) {
    flash(bookMsg, e.message);
    // 座位被抢/失败时刷新座位图
    try {
      const info = await api(`/trips/${currentTrip.id}/seats`, { auth: false });
      pickedSeats = [];
      renderSeatMap(info.total_seats, info.taken_seats || []);
    } catch { /* ignore */ }
  }
};

document.getElementById('searchBtn').onclick = search;

renderNav();
loadCities().then(search);
