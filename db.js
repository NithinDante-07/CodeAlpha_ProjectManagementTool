const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, 'pm.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  avatar_color TEXT DEFAULT '#4C8577',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  owner_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS project_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT DEFAULT 'member',
  UNIQUE(project_id, user_id),
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'todo',
  assignee_id INTEGER,
  created_by INTEGER NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(assignee_id) REFERENCES users(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(task_id) REFERENCES tasks(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  project_id INTEGER,
  task_id INTEGER,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (count === 0) {
  const hash = bcrypt.hashSync('demo1234', 10);
  const insertUser = db.prepare('INSERT INTO users (name, email, password, avatar_color) VALUES (?, ?, ?, ?)');
  const demoUsers = [
    ['Asha Kumar', 'asha@demo.com', hash, '#E0A458'],
    ['Ravi Menon', 'ravi@demo.com', hash, '#4C8577'],
    ['Priya Nair', 'priya@demo.com', hash, '#C1553B'],
  ];
  const userIds = demoUsers.map(u => insertUser.run(...u).lastInsertRowid);

  const insertProject = db.prepare('INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)');
  const projectId = insertProject.run('Website Relaunch', 'Redesign and rebuild the marketing site.', userIds[0]).lastInsertRowid;

  const insertMember = db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)');
  insertMember.run(projectId, userIds[0], 'owner');
  insertMember.run(projectId, userIds[1], 'member');
  insertMember.run(projectId, userIds[2], 'member');

  const insertTask = db.prepare('INSERT INTO tasks (project_id, title, description, status, assignee_id, created_by, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const t1 = insertTask.run(projectId, 'Wireframe homepage', 'Low-fidelity wireframes for the new homepage layout.', 'todo', userIds[1], userIds[0], 0).lastInsertRowid;
  const t2 = insertTask.run(projectId, 'Set up CI pipeline', 'GitHub Actions for lint + test on every PR.', 'in_progress', userIds[2], userIds[0], 0).lastInsertRowid;
  const t3 = insertTask.run(projectId, 'Draft content for About page', '', 'done', userIds[0], userIds[0], 0).lastInsertRowid;
  insertTask.run(projectId, 'Pick color palette', 'Needs 4-6 named colors + accessibility check.', 'todo', null, userIds[0], 1);

  const insertComment = db.prepare('INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)');
  insertComment.run(t1, userIds[0], 'Keep it simple, we can iterate later.');
  insertComment.run(t2, userIds[2], 'Almost done, just need to add the deploy step.');
}

module.exports = db;
