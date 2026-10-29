const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const API_BASE_URL = (process.env.API_BASE_URL || '').replace(/\/$/, '');
const PORT = process.env.PORT || 4000;

if (!API_BASE_URL) {
  console.error('API_BASE_URL is not set (e.g. https://student-api.onrender.com)');
  process.exit(1);
}

const COLUMNS = ['studentId', 'name', 'email', 'department', 'semester', 'contact'];

/* ---------- CORS: same pattern as the main API ---------- */
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const app = express();
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed by CORS'));
    },
    methods: ['GET', 'OPTIONS']
  })
);

/* ---------- Helpers ---------- */
async function fetchStudents(search) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await fetch(`${API_BASE_URL}/api/students${qs}`);
  if (!res.ok) throw new Error(`Backend responded with ${res.status}`);
  const body = await res.json();
  return Array.isArray(body.data) ? body.data : [];
}

// Quote every cell, double embedded quotes, and neutralise spreadsheet formulas.
function csvCell(value) {
  let text = value === undefined || value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(students) {
  const lines = [COLUMNS.map(csvCell).join(',')];
  for (const s of students) lines.push(COLUMNS.map((c) => csvCell(s[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}

function countBy(students, field) {
  const counts = {};
  for (const s of students) {
    const key = s[field] === undefined || s[field] === null || s[field] === '' ? 'Unknown' : String(s[field]);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

/* ---------- Routes ---------- */
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/', (req, res) =>
  res.json({
    service: 'Student Reports Service',
    endpoints: ['/reports/summary', '/reports/students.csv', '/reports/students.csv?department=...&semester=...']
  })
);

// GET /reports/summary -> total, per-department and per-semester counts
app.get('/reports/summary', async (req, res, next) => {
  try {
    const students = await fetchStudents();
    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      total: students.length,
      byDepartment: countBy(students, 'department'),
      bySemester: countBy(students, 'semester')
    });
  } catch (err) {
    next(err);
  }
});

// GET /reports/students.csv[?department=X][&semester=N] -> downloadable CSV
app.get('/reports/students.csv', async (req, res, next) => {
  try {
    let students = await fetchStudents();
    const { department, semester } = req.query;
    if (typeof department === 'string' && department) {
      students = students.filter((s) => String(s.department).toLowerCase() === department.toLowerCase());
    }
    if (typeof semester === 'string' && semester) {
      students = students.filter((s) => String(s.semester) === semester);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
    res.send(toCsv(students));
  } catch (err) {
    next(err);
  }
});

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.message === 'Origin not allowed by CORS') {
    return res.status(403).json({ success: false, message: 'Origin not allowed' });
  }
  console.error(err);
  res.status(502).json({ success: false, message: 'Could not reach the student API' });
});

app.listen(PORT, () => console.log(`Reports service on port ${PORT}, source API ${API_BASE_URL}`));
