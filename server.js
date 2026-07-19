const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3002;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'pm-tool-demo-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  next();
}

function isMember(projectId, userId) {
  return !!db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
}

function requireMember(req, res, next) {
  const projectId = req.params.id || req.params.projectId;
  if (!isMember(projectId, req.session.userId)) return res.status(403).json({ error: 'Not a member of this project' });
  next();
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, avatar_color: u.avatar_color };
}

function notify(userId, message, projectId, taskId) {
  const info = db.prepare('INSERT INTO notifications (user_id, message, project_id, task_id) VALUES (?, ?, ?, ?)')
    .run(userId, message, projectId || null, taskId || null);
  io.to('user:' + userId).emit('notification', {
    id: info.lastInsertRowid, message, project_id: projectId, task_id: taskId
  });
}

// ---------- Auth ----------
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'Email already registered' });
  const colors = ['#4C8577', '#E0A458', '#C1553B', '#5B6EE1', '#8A5CB8'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (name, email, password, avatar_color) VALUES (?, ?, ?, ?)')
    .run(name, email, hash, color);
  req.session.userId = info.lastInsertRowid;
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)));
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ error: 'Invalid email or password' });
  }
  req.session.userId = user.id;
  res.json(publicUser(user));
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json(null);
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId)));
});

// ---------- Projects ----------
app.get('/api/projects', requireAuth, (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
      (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as member_count
    FROM projects p
    JOIN project_members pm ON pm.project_id = p.id
    WHERE pm.user_id = ?
    ORDER BY p.created_at DESC
  `).all(req.session.userId);
  res.json(projects);
});

app.post('/api/projects', requireAuth, (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Project name required' });
  const info = db.prepare('INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)')
    .run(name.trim(), description || '', req.session.userId);
  db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)')
    .run(info.lastInsertRowid, req.session.userId, 'owner');
  res.json({ id: info.lastInsertRowid });
});

app.get('/api/projects/:id', requireAuth, requireMember, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  const members = db.prepare(`
    SELECT u.id, u.name, u.avatar_color, pm.role FROM project_members pm
    JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ?
  `).all(req.params.id);
  const tasks = db.prepare(`
    SELECT t.*, u.name as assignee_name, u.avatar_color as assignee_color,
      (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) as comment_count
    FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
    WHERE t.project_id = ? ORDER BY t.position ASC, t.created_at ASC
  `).all(req.params.id);
  res.json({ ...project, members, tasks });
});

app.post('/api/projects/:id/members', requireAuth, requireMember, (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'No user with that email' });
  const existing = db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(req.params.id, user.id);
  if (existing) return res.status(400).json({ error: 'Already a member' });
  db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(req.params.id, user.id, 'member');
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  notify(user.id, `You were added to project "${project.name}"`, req.params.id, null);
  io.to('project:' + req.params.id).emit('member_added', { id: user.id, name: user.name, avatar_color: user.avatar_color, role: 'member' });
  res.json({ ok: true });
});

// ---------- Tasks ----------
app.post('/api/projects/:id/tasks', requireAuth, requireMember, (req, res) => {
  const { title, description, status, assignee_id } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Task title required' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM tasks WHERE project_id = ? AND status = ?')
    .get(req.params.id, status || 'todo').m;
  const info = db.prepare('INSERT INTO tasks (project_id, title, description, status, assignee_id, created_by, position) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.params.id, title.trim(), description || '', status || 'todo', assignee_id || null, req.session.userId, maxPos + 1);
  const task = db.prepare(`
    SELECT t.*, u.name as assignee_name, u.avatar_color as assignee_color, 0 as comment_count
    FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.id = ?
  `).get(info.lastInsertRowid);
  io.to('project:' + req.params.id).emit('task_created', task);
  if (assignee_id && parseInt(assignee_id) !== req.session.userId) {
    notify(assignee_id, `You were assigned to "${task.title}"`, req.params.id, task.id);
  }
  res.json(task);
});

function getProjectIdForTask(taskId) {
  const t = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId);
  return t ? t.project_id : null;
}

app.put('/api/tasks/:id', requireAuth, (req, res) => {
  const projectId = getProjectIdForTask(req.params.id);
  if (!projectId || !isMember(projectId, req.session.userId)) return res.status(403).json({ error: 'Not allowed' });
  const { title, description, status, assignee_id, position } = req.body;
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE tasks SET title = ?, description = ?, status = ?, assignee_id = ?, position = ? WHERE id = ?')
    .run(
      title !== undefined ? title : existing.title,
      description !== undefined ? description : existing.description,
      status !== undefined ? status : existing.status,
      assignee_id !== undefined ? assignee_id : existing.assignee_id,
      position !== undefined ? position : existing.position,
      req.params.id
    );
  const task = db.prepare(`
    SELECT t.*, u.name as assignee_name, u.avatar_color as assignee_color,
      (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) as comment_count
    FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.id = ?
  `).get(req.params.id);
  io.to('project:' + projectId).emit('task_updated', task);
  if (assignee_id !== undefined && assignee_id && parseInt(assignee_id) !== existing.assignee_id && parseInt(assignee_id) !== req.session.userId) {
    notify(assignee_id, `You were assigned to "${task.title}"`, projectId, task.id);
  }
  res.json(task);
});

app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  const projectId = getProjectIdForTask(req.params.id);
  if (!projectId || !isMember(projectId, req.session.userId)) return res.status(403).json({ error: 'Not allowed' });
  db.prepare('DELETE FROM comments WHERE task_id = ?').run(req.params.id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  io.to('project:' + projectId).emit('task_deleted', { id: parseInt(req.params.id) });
  res.json({ ok: true });
});

// ---------- Comments ----------
app.get('/api/tasks/:id/comments', requireAuth, (req, res) => {
  const projectId = getProjectIdForTask(req.params.id);
  if (!projectId || !isMember(projectId, req.session.userId)) return res.status(403).json({ error: 'Not allowed' });
  const comments = db.prepare(`
    SELECT c.*, u.name as author_name, u.avatar_color as author_color
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.task_id = ? ORDER BY c.created_at ASC
  `).all(req.params.id);
  res.json(comments);
});

app.post('/api/tasks/:id/comments', requireAuth, (req, res) => {
  const projectId = getProjectIdForTask(req.params.id);
  if (!projectId || !isMember(projectId, req.session.userId)) return res.status(403).json({ error: 'Not allowed' });
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });
  const info = db.prepare('INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)')
    .run(req.params.id, req.session.userId, content.trim());
  const comment = db.prepare(`
    SELECT c.*, u.name as author_name, u.avatar_color as author_color
    FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(info.lastInsertRowid);
  io.to('project:' + projectId).emit('comment_added', { task_id: parseInt(req.params.id), comment });

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (task.assignee_id && task.assignee_id !== req.session.userId) {
    notify(task.assignee_id, `New comment on "${task.title}"`, projectId, task.id);
  }
  res.json(comment);
});

// ---------- Notifications ----------
app.get('/api/notifications', requireAuth, (req, res) => {
  const notes = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30').all(req.session.userId);
  res.json(notes);
});

app.post('/api/notifications/:id/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

app.post('/api/notifications/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.session.userId);
  res.json({ ok: true });
});

// ---------- Sockets ----------
io.on('connection', (socket) => {
  socket.on('join_project', (projectId) => {
    socket.join('project:' + projectId);
  });
  socket.on('leave_project', (projectId) => {
    socket.leave('project:' + projectId);
  });
  socket.on('join_user', (userId) => {
    socket.join('user:' + userId);
  });
});

server.listen(PORT, () => {
  console.log(`Project management tool running at http://localhost:${PORT}`);
});
