# 📋 Basecamp — Real-Time Project Management Tool

A Trello/Asana-style collaborative project tool with kanban boards, task assignment, and live updates powered by WebSockets — the most ambitious of the three projects, since it required real-time sync across multiple connected clients, not just request/response.

`Node.js` `Express` `SQLite` `Socket.IO` `bcrypt` `Sessions` `Vanilla JS`

![screenshot placeholder](./screenshot.png)

## Why I built this

Task 3 of a full-stack development challenge, with a bonus requirement: real-time updates. This pushed the project beyond a normal CRUD app — I had to learn how WebSocket "rooms" work (one room per project board) so that when one teammate drags a task or leaves a comment, everyone else looking at that board sees it happen instantly, with no page refresh.

## Features

- 📁 Create projects and invite teammates by email
- 🗂️ Kanban board with drag-and-drop across To do / In progress / Done
- 🙋 Assign tasks to specific team members
- 💬 Comment on tasks for in-context team communication
- ⚡ **Real-time sync** — task moves, new tasks, and comments appear live for every teammate viewing the board (Socket.IO)
- 🔔 **Live notifications** — a bell icon alerts you when you're assigned a task or someone comments on your work
- 🔐 Registration & login with hashed passwords and session-based auth
- 🌱 Seeded with a demo team and sample board so it's ready to explore immediately

## Tech stack

| Layer | Tech |
|---|---|
| Backend | Node.js, Express |
| Real-time | Socket.IO (WebSockets) |
| Database | SQLite (via `better-sqlite3`) |
| Auth | bcrypt password hashing, `express-session` |
| Frontend | Vanilla HTML, CSS, JavaScript, native HTML5 drag-and-drop |

## Getting started

```bash
npm install
npm start
```

Then open **http://localhost:3002**.

Demo accounts (password `demo1234` for all):
- `asha@demo.com`
- `ravi@demo.com`
- `priya@demo.com`

**To see the real-time features:** log in as two different demo users in two browser windows (or one normal + one incognito), open the same project board in both, and create or move a task in one window — watch it update instantly in the other.

## API overview

```
POST   /api/register                    Create an account
POST   /api/login                        Log in
GET    /api/projects                     My projects
POST   /api/projects                     Create a project
GET    /api/projects/:id                 Project detail (members + tasks)
POST   /api/projects/:id/members         Invite existing user by email
POST   /api/projects/:id/tasks           Create a task
PUT    /api/tasks/:id                    Update task (status, assignee, etc.)
DELETE /api/tasks/:id                    Delete task
GET    /api/tasks/:id/comments           Get comments
POST   /api/tasks/:id/comments           Add comment
GET    /api/notifications                My notifications
```

Socket.IO events: `task_created`, `task_updated`, `task_deleted`, `comment_added`, `member_added`, `notification`

## What I'd add next

- Due dates and priority labels on tasks
- @mentions in comments
- Activity log per project

---
Part of a 3-project full-stack series — see also the [E-commerce Store](../ecommerce-store) and [Social Media Platform](../social-platform).
