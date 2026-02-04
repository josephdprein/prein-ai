# Todo Site

A minimal daily task planner with week and day views.

## Features

- **Week view**: See all tasks for the week at a glance (Mon-Sun)
- **Day view**: Manage tasks for a specific day with full details
- **Task management**: Create, complete, and unschedule tasks
- **Backlog**: Unscheduled tasks that can be assigned to any day
- **Navigation**: Move between weeks and days with arrow buttons

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Frontend**: HTML + [HTMX](https://htmx.org) for reactive updates
- **Database**: SQLite via `bun:sqlite`
- **Styling**: Plain CSS (no framework)

## Running

```bash
# Install dependencies
bun install

# Development (with hot reload)
bun run dev

# Production
bun run start
```

The server runs on `http://localhost:3000`.
