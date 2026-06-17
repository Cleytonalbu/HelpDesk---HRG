const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db     = require('../db');
const authMW = require('../middleware/auth');

const sign = (id, type) => jwt.sign({ id, type }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
const strip = u => { if(!u) return null; const {password,...r}=u; return r; };

// Agent login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatorios' });
  db.agents.findOne({ email: email.toLowerCase(), active: true }, (err, agent) => {
    if (!agent || !bcrypt.compareSync(password, agent.password))
      return res.status(401).json({ error: 'Credenciais invalidas' });
    db.agents.update({ _id: agent._id }, { $set: { last_login: new Date().toISOString() } }, {});
    res.json({ token: sign(agent._id, 'agent'), agent: strip(agent) });
  });
});

// Client login
router.post('/client-login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatorios' });
  db.clients.findOne({ email: email.toLowerCase(), active: true }, (err, client) => {
    if (!client || !bcrypt.compareSync(password, client.password))
      return res.status(401).json({ error: 'Credenciais invalidas' });
    res.json({ token: sign(client._id, 'client'), client: strip(client) });
  });
});

// Client register
router.post('/client-register', (req, res) => {
  const { name, email, password, department } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha obrigatorios' });
  if (password.length < 8) return res.status(400).json({ error: 'Senha deve ter minimo 8 caracteres' });
  db.clients.findOne({ email: email.toLowerCase() }, (err, existing) => {
    if (existing) return res.status(400).json({ error: 'Email ja cadastrado' });
    const client = { _id: uuid(), name, email: email.toLowerCase(), password: bcrypt.hashSync(password, 10),
      department: department || '', active: true, created_at: new Date().toISOString() };
    db.clients.insert(client, (err, doc) => {
      if (err) return res.status(500).json({ error: 'Erro ao criar conta' });
      res.status(201).json({ token: sign(doc._id, 'client'), client: strip(doc) });
    });
  });
});

// Me
router.get('/me', authMW, (req, res) => res.json(req.user));

// Change password
router.put('/password', authMW, (req, res) => {
  const { current, next_password } = req.body;
  const col = req.user.userType === 'client' ? db.clients : db.agents;
  col.findOne({ _id: req.user._id }, (err, user) => {
    if (!bcrypt.compareSync(current, user.password))
      return res.status(400).json({ error: 'Senha atual incorreta' });
    col.update({ _id: user._id }, { $set: { password: bcrypt.hashSync(next_password, 10) } }, {}, () =>
      res.json({ message: 'Senha atualizada' }));
  });
});

module.exports = router;
