import Anthropic from "@anthropic-ai/sdk";
import { runAgent, type AgentEvent } from "./lib/agent";

// Initialize Anthropic client - uses ANTHROPIC_API_KEY env var by default
const anthropic = new Anthropic();

// Store conversation history for each session (in-memory for now)
const conversations = new Map<string, Anthropic.MessageParam[]>();

// Store agent conversation history separately
const agentConversations = new Map<string, Anthropic.MessageParam[]>();

// Project root for the agent to work in
const PROJECT_ROOT = process.cwd();

// System prompt - extensible for custom prompting
const SYSTEM_PROMPT = `You are a helpful AI assistant. Be concise and clear in your responses.`;

interface ChatRequest {
  message: string;
  sessionId?: string;
}

async function handleChat(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as ChatRequest;
    const { message, sessionId = "default" } = body;

    if (!message || typeof message !== "string") {
      return new Response("Message is required", { status: 400 });
    }

    // Get or create conversation history
    if (!conversations.has(sessionId)) {
      conversations.set(sessionId, []);
    }
    const history = conversations.get(sessionId)!;

    // Add user message to history
    history.push({ role: "user", content: message });

    // Call Claude API
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: history,
    });

    // Extract assistant response
    const assistantMessage =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Add assistant response to history
    history.push({ role: "assistant", content: assistantMessage });

    // Return HTML fragment for HTMX
    const html = `
      <div class="message user-message">
        <div class="message-content">${escapeHtml(message)}</div>
      </div>
      <div class="message assistant-message">
        <div class="message-content">${formatMessage(assistantMessage)}</div>
      </div>
    `;

    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(
      `<div class="message error-message">Error: ${escapeHtml(errorMessage)}</div>`,
      {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }
    );
  }
}

function handleClearChat(req: Request): Response {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId") || "default";
  conversations.delete(sessionId);
  return new Response("", { status: 200 });
}

// Feature development agent handler with SSE streaming
async function handleFeature(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as ChatRequest;
    const { message, sessionId = "default" } = body;

    if (!message || typeof message !== "string") {
      return new Response("Message is required", { status: 400 });
    }

    // Get or create agent conversation history
    if (!agentConversations.has(sessionId)) {
      agentConversations.set(sessionId, []);
    }
    const history = agentConversations.get(sessionId)!;

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const sendEvent = (event: AgentEvent) => {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        try {
          // Run the agent
          const newHistory = await runAgent(
            message,
            history,
            PROJECT_ROOT,
            sendEvent
          );

          // Update the conversation history
          agentConversations.set(sessionId, newHistory);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          sendEvent({ type: "error", content: errorMessage });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Feature error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

async function handleFeatureClear(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { sessionId?: string };
    const sessionId = body.sessionId || "default";
    agentConversations.delete(sessionId);
    return new Response("", { status: 200 });
  } catch {
    return new Response("", { status: 200 });
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMessage(text: string): string {
  // Basic markdown-like formatting
  let formatted = escapeHtml(text);

  // Code blocks
  formatted = formatted.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    '<pre><code class="language-$1">$2</code></pre>'
  );

  // Inline code
  formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Italic
  formatted = formatted.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Line breaks
  formatted = formatted.replace(/\n/g, "<br>");

  return formatted;
}

// Serve static files from public directory
async function serveStatic(path: string): Promise<Response> {
  try {
    const file = Bun.file(`./public${path}`);
    if (await file.exists()) {
      return new Response(file);
    }
  } catch {
    // Fall through to 404
  }
  return new Response("Not Found", { status: 404 });
}

const server = Bun.serve({
  port: process.env.PORT || 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // API routes
    if (path === "/api/chat" && req.method === "POST") {
      return handleChat(req);
    }

    if (path === "/api/clear" && req.method === "POST") {
      return handleClearChat(req);
    }

    if (path === "/api/feature" && req.method === "POST") {
      return handleFeature(req);
    }

    if (path === "/api/feature/clear" && req.method === "POST") {
      return handleFeatureClear(req);
    }

    // Serve index.html for root
    if (path === "/") {
      return serveStatic("/index.html");
    }

    // Serve feature.html for /feature
    if (path === "/feature") {
      return serveStatic("/feature.html");
    }

    // Serve other static files
    return serveStatic(path);
  },
});

console.log(`Server running at http://localhost:${server.port}`);
