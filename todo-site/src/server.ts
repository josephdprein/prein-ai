import index from "../public/index.html";
import db from "./db";

interface Todo {
  id: number;
  title: string;
  description: string | null;
  scheduled_for: string | null;
  due_by: string | null;
  created_on: string | null;
  thoughts: string | null;
  completed: number;
}

// Helper to render a single todo item as HTML
function renderTodoItem(todo: Todo): string {
  const timeDisplay = todo.scheduled_for?.includes("T")
    ? todo.scheduled_for.split("T")[1]?.slice(0, 5)
    : null;

  return `
    <div class="todo-item ${todo.completed ? "completed" : ""}" id="todo-${todo.id}">
      <div class="todo-content">
        <span class="todo-title">${todo.title}</span>
        ${timeDisplay ? `<span class="todo-time">${timeDisplay}</span>` : ""}
      </div>
      <div class="todo-actions">
        <button
          hx-put="/api/todos/${todo.id}/complete"
          hx-target="#todo-${todo.id}"
          hx-swap="outerHTML"
          class="btn btn-complete"
          title="${todo.completed ? "Mark incomplete" : "Mark complete"}"
        >
          ${todo.completed ? "↩" : "✓"}
        </button>
        <button
          hx-put="/api/todos/${todo.id}/unschedule"
          hx-target="#todo-${todo.id}"
          hx-swap="delete"
          class="btn btn-unschedule"
          title="Move to backlog"
        >
          ✕
        </button>
      </div>
    </div>
  `;
}

// Helper to render backlog item for the modal
function renderBacklogItem(todo: Todo, date: string): string {
  return `
    <div class="backlog-item" id="backlog-${todo.id}">
      <span class="todo-title">${todo.title}</span>
      <button
        hx-put="/api/todos/${todo.id}/schedule?date=${date}"
        hx-target="#backlog-${todo.id}"
        hx-swap="delete"
        hx-on::after-request="htmx.trigger('#todo-list', 'refresh')"
        class="btn btn-schedule"
        title="Schedule for today"
      >
        +
      </button>
    </div>
  `;
}

const server = Bun.serve({
  port: 3000,
  routes: {
    "/": index,

    // Get todos for a specific day
    "/api/todos/day/:date": {
      GET: (req) => {
        const date = req.params.date;
        const stmt = db.prepare(`
          SELECT * FROM todos
          WHERE scheduled_for LIKE ? || '%'
          ORDER BY
            CASE WHEN scheduled_for LIKE '%T%' THEN 0 ELSE 1 END,
            scheduled_for,
            title
        `);
        const todos = stmt.all(date) as Todo[];
        const html = todos.map(renderTodoItem).join("");
        return new Response(html, {
          headers: { "Content-Type": "text/html" },
        });
      },
    },

    // Get backlog (todos with no scheduled_for)
    "/api/todos/backlog": {
      GET: (req) => {
        const url = new URL(req.url);
        const date = url.searchParams.get("date") || new Date().toISOString().split("T")[0];
        const stmt = db.prepare(`
          SELECT * FROM todos
          WHERE scheduled_for IS NULL
          ORDER BY title
        `);
        const todos = stmt.all() as Todo[];
        const html = todos.map((t) => renderBacklogItem(t, date)).join("");
        return new Response(html || '<p class="empty-message">No tasks in backlog</p>', {
          headers: { "Content-Type": "text/html" },
        });
      },
    },

    // Create a new todo
    "/api/todos": {
      POST: async (req) => {
        const formData = await req.formData();
        const title = formData.get("title") as string;
        const scheduled_for = formData.get("scheduled_for") as string | null;
        const time = formData.get("time") as string | null;

        if (!title) {
          return new Response("Title is required", { status: 400 });
        }

        let scheduledValue = scheduled_for || null;
        if (scheduledValue && time) {
          scheduledValue = `${scheduled_for}T${time}`;
        }

        const stmt = db.prepare(`
          INSERT INTO todos (title, scheduled_for, created_on, completed)
          VALUES (?, ?, ?, 0)
        `);
        const result = stmt.run(title, scheduledValue, new Date().toISOString());

        const newTodo = db
          .prepare("SELECT * FROM todos WHERE id = ?")
          .get(result.lastInsertRowid) as Todo;

        return new Response(renderTodoItem(newTodo), {
          headers: { "Content-Type": "text/html" },
        });
      },
    },

    // Toggle complete status
    "/api/todos/:id/complete": {
      PUT: (req) => {
        const id = req.params.id;
        const todo = db.prepare("SELECT * FROM todos WHERE id = ?").get(id) as Todo | null;
        if (!todo) {
          return new Response("Todo not found", { status: 404 });
        }

        const newStatus = todo.completed ? 0 : 1;
        db.prepare("UPDATE todos SET completed = ? WHERE id = ?").run(newStatus, id);

        const updatedTodo = db.prepare("SELECT * FROM todos WHERE id = ?").get(id) as Todo;
        return new Response(renderTodoItem(updatedTodo), {
          headers: { "Content-Type": "text/html" },
        });
      },
    },

    // Unschedule a todo (move to backlog)
    "/api/todos/:id/unschedule": {
      PUT: (req) => {
        const id = req.params.id;
        db.prepare("UPDATE todos SET scheduled_for = NULL WHERE id = ?").run(id);
        return new Response("", { status: 200 });
      },
    },

    // Schedule a backlog item for a specific date
    "/api/todos/:id/schedule": {
      PUT: (req) => {
        const id = req.params.id;
        const url = new URL(req.url);
        const date = url.searchParams.get("date");

        if (!date) {
          return new Response("Date is required", { status: 400 });
        }

        db.prepare("UPDATE todos SET scheduled_for = ? WHERE id = ?").run(date, id);
        return new Response("", { status: 200 });
      },
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at http://localhost:${server.port}`);
