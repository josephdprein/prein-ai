import index from "../public/index.html";

const server = Bun.serve({
  port: 3000,
  routes: {
    "/": index,
    // TODO: Add API routes for todos
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at http://localhost:${server.port}`);
