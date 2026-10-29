const express = require('express');

const app = express();
const PORT = process.env.PORT || 6001;

app.disable('x-powered-by');

app.get('/', (req, res) =>
  res.json({
    service: 'Dummy Service 2',
    status: 'successful',
    message: 'Dummy service 2 is running successfully'
  })
);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Dummy service 2 listening on port ${PORT}`));
