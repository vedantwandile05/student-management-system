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

/* ---------- Shared schema: the fields the backend accepts ---------- */
const studentId = z.string().describe('Student ID, e.g. ST101');
const fields = {
  name: z.string().describe('Full name'),
  email: z.string().describe('Email address'),
  department: z.string().describe('Department'),
  semester: z.union([z.string(), z.number()]).describe('Semester'),
  contact: z.string().describe('Contact number')
};

/* ---------- Tool definitions ---------- */
function buildServer() {
  const server = new McpServer({ name: 'student-mcp-server', version: '1.0.0' });

  server.tool(
    'list_students',
    'List all students, optionally filtered by a search term (matches ID, name, email or department)',
    { search: z.string().optional().describe('Optional search text') },
    async ({ search }) => callApi(search ? `?search=${encodeURIComponent(search)}` : '')
  );

  server.tool(
    'get_student',
    'Get a single student by Student ID (e.g. ST101)',
    { studentId },
    async ({ studentId }) => callApi(`/${encodeURIComponent(studentId)}`)
  );

  server.tool(
    'create_student',
    'Create a new student',
    { studentId, ...fields },
    async (args) => callApi('', { method: 'POST', body: JSON.stringify(args) })
  );

  server.tool(
    'update_student',
    'Update an existing student. The Student ID itself cannot be changed; provide only the fields to change.',
    {
      studentId,
      name: fields.name.optional(),
      email: fields.email.optional(),
      department: fields.department.optional(),
      semester: fields.semester.optional(),
      contact: fields.contact.optional()
    },
    async ({ studentId, ...changes }) =>
      callApi(`/${encodeURIComponent(studentId)}`, { method: 'PUT', body: JSON.stringify(changes) })
  );

  server.tool(
    'delete_student',
    'Delete a student by Student ID',
    { studentId },
    async ({ studentId }) => callApi(`/${encodeURIComponent(studentId)}`, { method: 'DELETE' })
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
