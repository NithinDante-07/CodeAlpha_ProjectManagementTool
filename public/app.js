async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function initials(name) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr + 'Z')) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

let socket = null;
function getSocket() {
  if (!socket) socket = io();
  return socket;
}

async function loadNav() {
  const nav = document.getElementById('nav');
  const me = await api('/api/me');
  nav.innerHTML = `
    <a href="/" class="brand">Basecamp<span style="color:var(--ink)">.</span></a>
    <div class="nav-links">
      ${me ? `
        <a href="/">Projects</a>
        <div class="bell-wrap">
          <button class="bell-btn" id="bellBtn">🔔<span class="bell-dot" id="bellDot" style="display:none;"></span></button>
          <div class="notif-panel" id="notifPanel"></div>
        </div>
        <span>Hi, ${me.name}</span>
        <a href="#" id="logoutLink">Logout</a>
      ` : `
        <a href="/login.html">Login</a><a href="/register.html" class="btn">Sign up</a>
      `}
    </div>
  `;
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) {
    logoutLink.addEventListener('click', async (e) => {
      e.preventDefault();
      await api('/api/logout', { method: 'POST' });
      window.location.href = '/';
    });
  }
  if (me) {
    getSocket().emit('join_user', me.id);
    setupNotifications(me);
  }
  return me;
}

async function setupNotifications(me) {
  const bellBtn = document.getElementById('bellBtn');
  const panel = document.getElementById('notifPanel');
  const dot = document.getElementById('bellDot');

  async function refresh() {
    const notes = await api('/api/notifications');
    const unread = notes.filter(n => !n.is_read).length;
    dot.style.display = unread > 0 ? 'block' : 'none';
    panel.innerHTML = notes.length ? notes.map(n => `
      <div class="notif-item ${n.is_read ? '' : 'unread'}">
        ${escapeHTML(n.message)}
        <div class="time">${timeAgo(n.created_at)}</div>
      </div>
    `).join('') : `<div class="notif-item">No notifications yet.</div>`;
  }
  refresh();

  bellBtn.addEventListener('click', async () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      await api('/api/notifications/read-all', { method: 'POST' });
      dot.style.display = 'none';
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.bell-wrap')) panel.classList.remove('open');
  });

  getSocket().on('notification', () => refresh());
}
