require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const path      = require('path');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs:15*60*1000, max:1000 }));

// Static files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API
app.use('/api/auth',    rateLimit({windowMs:15*60*1000,max:30}), require('./routes/auth'));
app.use('/api/agents',  require('./routes/agents'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/assets',  require('./routes/assets'));
app.use('/api/kb',      require('./routes/kb'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/datashow', require('./routes/datashow'));

app.get('/api/health', (_, res) => res.json({ status:'ok', ts:new Date().toISOString() }));

// SPA fallback
app.get('*', (_, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

app.use((err, _, res, __) => {
  console.error(err);
  res.status(err.status||500).json({ error:err.message||'Erro interno' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\nHelpDesk Pro → http://localhost:${PORT}\n`));
