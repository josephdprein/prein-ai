import Anthropic from "@anthropic-ai/sdk";

// Tool definitions for the AI agent
export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "read_file",
    description:
      "Read the contents of a file. Use this to understand existing code before making changes.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description:
            "The path to the file, relative to the project root (e.g., 'index.ts', 'public/index.html')",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write content to a file. This will create the file if it doesn't exist, or overwrite it if it does.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "The path to the file, relative to the project root",
        },
        content: {
          type: "string",
          description: "The full content to write to the file",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_files",
    description:
      "List files and directories in a path. Use this to explore the project structure.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description:
            "The directory path to list, relative to project root. Use '.' for root.",
        },
        recursive: {
          type: "boolean",
          description: "Whether to list files recursively (default: false)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "run_command",
    description:
      "Run a shell command. Use this for building, testing, git operations, etc. Commands run from the project root.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The shell command to run (e.g., 'bun build', 'git status')",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "search_files",
    description:
      "Search for a pattern in files. Returns matching lines with file paths and line numbers.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description: "The search pattern (supports regex)",
        },
        path: {
          type: "string",
          description: "Directory to search in, relative to project root. Default: '.'",
        },
        file_pattern: {
          type: "string",
          description: "Glob pattern to filter files (e.g., '*.ts', '*.html')",
        },
      },
      required: ["pattern"],
    },
  },
];

// Tool execution functions
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  projectRoot: string
): Promise<{ success: boolean; output: string }> {
  try {
    switch (name) {
      case "read_file":
        return await readFile(input.path as string, projectRoot);
      case "write_file":
        return await writeFile(
          input.path as string,
          input.content as string,
          projectRoot
        );
      case "list_files":
        return await listFiles(
          input.path as string,
          input.recursive as boolean,
          projectRoot
        );
      case "run_command":
        return await runCommand(input.command as string, projectRoot);
      case "search_files":
        return await searchFiles(
          input.pattern as string,
          (input.path as string) || ".",
          input.file_pattern as string,
          projectRoot
        );
      default:
        return { success: false, output: `Unknown tool: ${name}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, output: `Error: ${message}` };
  }
}

async function readFile(
  path: string,
  projectRoot: string
): Promise<{ success: boolean; output: string }> {
  const fullPath = `${projectRoot}/${path}`;
  const file = Bun.file(fullPath);

  if (!(await file.exists())) {
    return { success: false, output: `File not found: ${path}` };
  }

  const content = await file.text();
  return { success: true, output: content };
}

async function writeFile(
  path: string,
  content: string,
  projectRoot: string
): Promise<{ success: boolean; output: string }> {
  const fullPath = `${projectRoot}/${path}`;

  // Ensure directory exists
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  if (dir) {
    await Bun.$`mkdir -p ${dir}`.quiet();
  }

  await Bun.write(fullPath, content);
  return { success: true, output: `Successfully wrote ${content.length} bytes to ${path}` };
}

async function listFiles(
  path: string,
  recursive: boolean,
  projectRoot: string
): Promise<{ success: boolean; output: string }> {
  const fullPath = `${projectRoot}/${path}`;

  try {
    let result;
    if (recursive) {
      result = await Bun.$`find ${fullPath} -type f | head -100`.text();
    } else {
      result = await Bun.$`ls -la ${fullPath}`.text();
    }
    return { success: true, output: result };
  } catch (error) {
    return {
      success: false,
      output: `Failed to list files: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function runCommand(
  command: string,
  projectRoot: string
): Promise<{ success: boolean; output: string }> {
  // Security: block obviously dangerous commands
  const blocked = ["rm -rf /", "rm -rf ~", "> /dev/sda", "mkfs", "dd if="];
  for (const pattern of blocked) {
    if (command.includes(pattern)) {
      return { success: false, output: `Blocked dangerous command pattern: ${pattern}` };
    }
  }

  try {
    const proc = Bun.spawn(["sh", "-c", command], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : "");

    return {
      success: exitCode === 0,
      output: output || `Command completed with exit code ${exitCode}`,
    };
  } catch (error) {
    return {
      success: false,
      output: `Command failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function searchFiles(
  pattern: string,
  path: string,
  filePattern: string | undefined,
  projectRoot: string
): Promise<{ success: boolean; output: string }> {
  const fullPath = `${projectRoot}/${path}`;

  try {
    let cmd = `grep -rn "${pattern}" ${fullPath}`;
    if (filePattern) {
      cmd = `grep -rn --include="${filePattern}" "${pattern}" ${fullPath}`;
    }
    cmd += " | head -50";

    const result = await Bun.$`sh -c ${cmd}`.text();
    return {
      success: true,
      output: result || "No matches found",
    };
  } catch {
    return { success: true, output: "No matches found" };
  }
}
