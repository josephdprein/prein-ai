import { Database } from "bun:sqlite";

const db = new Database("db/todos.db");

// Initialize database schema
db.run(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    scheduled_for TEXT,
    due_by TEXT,
    created_on TEXT,
    thoughts TEXT,
    completed INTEGER DEFAULT 0
  )
`);

export default db;
