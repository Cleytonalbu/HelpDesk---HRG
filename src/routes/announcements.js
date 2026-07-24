const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db   = require('../db');
const auth = require('../middleware/auth');
const now  = () => new Date().toISOString();

const agentOnly = (req, res, next) =>
  req.user.userType === 'client' ? res.status(403).json({ error: 'Acesso negado' }) : next();

const targetMatches = (target, userType) =>
  target === 'all' || (target === 'clients' && userType === 'client') || (target === 'agents' && userType === 'agent');

// GET /api/announcements — list all (management view)
router.get('/', auth, agentOnly, (req, res) => {
  db.announcements.find({}).sort({ created_at: -1 }).exec((err, docs) => res.json(docs || []));
});

// GET /api/announcements/active — avisos vigentes para o usuário logado
router.get('/active', auth, (req, res) => {
  const nowIso = now();
  db.announcements.find({
    active: true,
    starts_at: { $lte: nowIso },
    ends_at:   { $gte: nowIso },
  }).sort({ created_at: 1 }).exec((err, docs) => {
    res.json((docs || []).filter(a => targetMatches(a.target, req.user.userType)));
  });
});

// POST /api/announcements — create
router.post('/', auth, agentOnly, (req, res) => {
  const { message, title, target, starts_at, ends_at } = req.body;
  if (!message || !ends_at)
    return res.status(400).json({ error: 'Campos obrigatorios: message, ends_at' });

  const announcement = {
    _id: uuid(),
    title: title || 'Aviso',
    message,
    target: ['all', 'agents', 'clients'].includes(target) ? target : 'all',
    starts_at: starts_at || now(),
    ends_at,
    active: true,
    created_by: req.user._id,
    created_by_name: req.user.name,
    created_at: now(), updated_at: now(),
  };
  db.announcements.insert(announcement, (err, doc) => {
    if (err) return res.status(500).json({ error: 'Erro ao criar aviso' });
    res.status(201).json(doc);
  });
});

// PATCH /api/announcements/:id
router.patch('/:id', auth, agentOnly, (req, res) => {
  const allowed = ['title', 'message', 'target', 'starts_at', 'ends_at', 'active'];
  const update = { updated_at: now() };
  allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
  db.announcements.update({ _id: req.params.id }, { $set: update }, {}, (err, n) =>
    n ? res.json({ message: 'Atualizado' }) : res.status(404).json({ error: 'Nao encontrado' }));
});

// DELETE /api/announcements/:id
router.delete('/:id', auth, agentOnly, (req, res) => {
  db.announcements.remove({ _id: req.params.id }, {}, (err, n) =>
    n ? res.json({ message: 'Aviso excluído' }) : res.status(404).json({ error: 'Nao encontrado' }));
});

module.exports = router;
