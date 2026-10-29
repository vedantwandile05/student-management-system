const express = require('express');

const app = express();
const PORT = process.env.PORT || 6000;

app.disable('x-powered-by');

app.get('/', (req, res) =>
  res.json({
    service: 'Dummy Service',
    status: 'successful',
    message: 'Dummy service is running successfully'
  })
);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Dummy service listening on port ${PORT}`));
