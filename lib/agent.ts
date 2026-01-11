import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool } from "./tools";

const anthropic = new Anthropic();

export interface AgentEvent {
  type: "thinking" | "tool_use" | "tool_result" | "text" | "error" | "done";
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  success?: boolean;
}

export type EventCallback = (event: AgentEvent) => void;

const SYSTEM_PROMPT = `You are an expert full-stack developer working on a web application built with Bun, TypeScript, and HTMX. Your job is to implement features requested by the user.

## Project Structure
- index.ts: Main Bun server with API routes
- public/: Static HTML files served by the server
- lib/: TypeScript modules for business logic

## Your Process
1. First, explore the codebase to understand the existing structure
2. Ask clarifying questions if the request is ambiguous (max 1-2 questions)
3. Create a brief plan
4. Implement the feature by reading and writing files
5. Run 'bun build index.ts --outdir=./dist' to verify the code compiles
6. If there are errors, fix them
7. Commit the changes with git

## Guidelines
- Write clean, TypeScript code
- Follow existing patterns in the codebase
- Keep changes minimal and focused
- Always verify your changes compile before finishing
- Use HTMX patterns for frontend interactivity
- Match the existing UI style (dark theme, similar components)

## Important
- You have full access to read/write files and run commands
- Changes take effect immediately due to hot reload
- Always commit your changes with a descriptive message
- If you're unsure about something, check the existing code first`;

// Check if error is an API-level error that should stop the agent
function isApiError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const err = error as { status?: number; type?: string; error?: { type?: string } };
    const status = err.status;
    const errorType = err.error?.type || err.type;

    // These are API-level errors that should bubble up
    return (
      status === 401 || // Auth error
      status === 403 || // Permission error
      status === 429 || // Rate limit
      status === 529 || // Overloaded
      errorType === "authentication_error" ||
      errorType === "permission_error" ||
      errorType === "rate_limit_error" ||
      errorType === "overloaded_error" ||
      (errorType === "invalid_request_error" &&
        (String(err).includes("credit") || String(err).includes("quota")))
    );
  }
  return false;
}

export async function runAgent(
  userMessage: string,
  conversationHistory: Anthropic.MessageParam[],
  projectRoot: string,
  onEvent: EventCallback
): Promise<Anthropic.MessageParam[]> {
  // Add user message to history
  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  let continueLoop = true;
  const maxIterations = 20; // Safety limit
  let iterations = 0;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;

  while (continueLoop && iterations < maxIterations) {
    iterations++;

    try {
      onEvent({ type: "thinking", content: "Thinking..." });

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8096,
        system: SYSTEM_PROMPT,
        tools: toolDefinitions,
        messages,
      });

      // Reset consecutive errors on successful API call
      consecutiveErrors = 0;

      // Process response content
      const assistantContent: Anthropic.ContentBlock[] = [];
      let hasToolUse = false;

      for (const block of response.content) {
        assistantContent.push(block);

        if (block.type === "text") {
          onEvent({ type: "text", content: block.text });
        } else if (block.type === "tool_use") {
          hasToolUse = true;
          const toolInput = block.input as Record<string, unknown>;

          onEvent({
            type: "tool_use",
            content: `Using ${block.name}`,
            toolName: block.name,
            toolInput,
          });

          // Execute the tool
          const result = await executeTool(block.name, toolInput, projectRoot);

          onEvent({
            type: "tool_result",
            content: truncateOutput(result.output, 2000),
            toolName: block.name,
            success: result.success,
          });

          // Add assistant message with tool use
          messages.push({ role: "assistant", content: assistantContent });

          // Add tool result
          messages.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: block.id,
                content: result.output,
              },
            ],
          });

          // Clear for next iteration since we've added to messages
          assistantContent.length = 0;
        }
      }

      // If there was no tool use, add the assistant message and stop
      if (!hasToolUse) {
        if (assistantContent.length > 0) {
          messages.push({ role: "assistant", content: assistantContent });
        }
        continueLoop = false;
      }

      // Check stop reason
      if (response.stop_reason === "end_turn" && !hasToolUse) {
        continueLoop = false;
      }
    } catch (error) {
      consecutiveErrors++;

      // Re-throw API-level errors to be handled by the main handler
      if (isApiError(error)) {
        throw error;
      }

      // For other errors, report them but try to continue
      const errorMessage = error instanceof Error ? error.message : String(error);
      onEvent({
        type: "error",
        content: `Error during processing: ${errorMessage}`,
        success: false,
      });

      // Stop if we hit too many consecutive errors
      if (consecutiveErrors >= maxConsecutiveErrors) {
        onEvent({
          type: "error",
          content: "Too many consecutive errors. Stopping agent.",
          success: false,
        });
        continueLoop = false;
      }
    }
  }

  if (iterations >= maxIterations) {
    onEvent({
      type: "error",
      content: "Reached maximum iterations. Stopping for safety.",
      success: false,
    });
  }

  onEvent({ type: "done", content: "Agent finished" });

  return messages;
}

function truncateOutput(output: string, maxLength: number): string {
  if (output.length <= maxLength) {
    return output;
  }
  return output.substring(0, maxLength) + "\n... (truncated)";
}

// Helper to compile and verify the project
export async function verifyBuild(projectRoot: string): Promise<{ success: boolean; output: string }> {
  return executeTool("run_command", { command: "bun build index.ts --outdir=./dist" }, projectRoot);
}

// Helper to commit changes
export async function commitChanges(
  message: string,
  projectRoot: string
): Promise<{ success: boolean; output: string }> {
  const addResult = await executeTool("run_command", { command: "git add -A" }, projectRoot);
  if (!addResult.success) {
    return addResult;
  }

  return executeTool(
    "run_command",
    { command: `git commit -m "${message.replace(/"/g, '\\"')}"` },
    projectRoot
  );
}
