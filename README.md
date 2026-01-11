# prein-ai

An AI chat interface built with Bun, TypeScript, and HTMX.

## Setup

1. Install dependencies:

```bash
bun install
```

2. Set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY=your-api-key-here
```

Or create a `.env` file based on `.env.example`.

3. Run the server:

```bash
bun run index.ts
```

4. Open http://localhost:3000 in your browser.

## Features

- Real-time chat interface with HTMX
- Conversation history maintained per session
- Basic markdown formatting support (code blocks, inline code, bold, italic)
- Extensible system prompt for custom behavior

## Architecture

- `index.ts` - Main server with API endpoints
- `public/index.html` - Frontend with HTMX for interactivity
- Uses the Anthropic SDK for Claude API integration

## API Endpoints

- `POST /api/chat` - Send a message and get a response
- `POST /api/clear` - Clear conversation history
