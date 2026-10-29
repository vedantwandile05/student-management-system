const express = require('express');

const app = express();
const PORT = process.env.PORT || 6000;
const NAME = process.env.SERVICE_NAME || 'Dummy Service';

app.disable('x-powered-by');

app.get('/', (req, res) =>
  res.json({
    service: NAME,
    status: 'successful',
    message: `${NAME} is running successfully`
  })
);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`${NAME} listening on port ${PORT}`));
