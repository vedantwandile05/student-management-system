import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const API_BASE_URL = (process.env.API_BASE_URL || '').replace(/\/$/, '');
const PORT = process.env.PORT || 3000;

if (!API_BASE_URL) {
  console.error('API_BASE_URL is not set (e.g. https://student-api.onrender.com)');
  process.exit(1);
}

/* ---------- Call the backend REST API and shape the result for MCP ---------- */
async function callApi(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/students${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json().catch(() => ({}));
    return {
      isError: !res.ok,
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Backend request failed: ${err.message}` }]
    };
  }
}

/* ---------- Tool definitions ---------- */
function buildServer() {
  const server = new McpServer({ name: 'student-mcp-server', version: '1.0.0' });

  server.tool('list_students', 'List all students', async () => callApi(''));

  server.tool(
    'get_student',
    'Get a single student by their database ID',
    { id: z.string().describe('Student document ID') },
    async ({ id }) => callApi(`/${encodeURIComponent(id)}`)
  );

  server.tool(
    'create_student',
    'Create a new student. Pass the student fields exactly as the backend model expects them.',
    { data: z.record(z.any()).describe('Student fields as a JSON object') },
    async ({ data }) => callApi('', { method: 'POST', body: JSON.stringify(data) })
  );

  server.tool(
    'update_student',
    'Update an existing student by ID with the given fields',
    {
      id: z.string().describe('Student document ID'),
      data: z.record(z.any()).describe('Fields to update as a JSON object')
    },
    async ({ id, data }) =>
      callApi(`/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) })
  );

  server.tool(
    'delete_student',
    'Delete a student by ID',
    { id: z.string().describe('Student document ID') },
    async ({ id }) => callApi(`/${encodeURIComponent(id)}`, { method: 'DELETE' })
  );

  return server;
}

/* ---------- HTTP server (stateless Streamable HTTP transport) ---------- */
const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/mcp', async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null
      });
    }
  }
});

// Stateless server: GET/DELETE on /mcp are not supported
const notAllowed = (req, res) =>
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed' },
    id: null
  });
app.get('/mcp', notAllowed);
app.delete('/mcp', notAllowed);

app.listen(PORT, () => console.log(`MCP server listening on port ${PORT}, proxying ${API_BASE_URL}`));
