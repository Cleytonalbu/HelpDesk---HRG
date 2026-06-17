const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db   = require('../db');
const auth = require('../middleware/auth');

const strip = c => { if(!c) return null; const {password,...r}=c; return r; };

// GET /api/clients — todos os agentes podem listar clientes
router.get('/', auth, (req, res) => {
  if (req.user.userType === 'client') return res.status(403).json({ error:'Acesso negado' });
  db.clients.find({ active: true }).sort({ created_at: -1 }).exec((err, docs) =>
    res.json((docs||[]).map(strip)));
});

// PUT /api/clients/me/password — DEVE vir ANTES de /:id
// Cliente troca a própria senha (confirma senha atual)
router.put('/me/password', auth, (req, res) => {
  if (req.user.userType !== 'client') return res.status(403).json({ error:'Use /api/agents/me/password' });
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error:'current_password e new_password obrigatorios' });
  if (new_password.length < 8)
    return res.status(400).json({ error:'Nova senha deve ter minimo 8 caracteres' });
  db.clients.findOne({ _id: req.user._id }, (err, client) => {
    if (!client) return res.status(404).json({ error:'Cliente nao encontrado' });
    if (!bcrypt.compareSync(current_password, client.password))
      return res.status(400).json({ error:'Senha atual incorreta' });
    db.clients.update(
      { _id: client._id },
      { $set: { password: bcrypt.hashSync(new_password, 10) } },
      {},
      () => res.json({ message:'Senha alterada com sucesso' })
    );
  });
});

// GET /api/clients/:id
router.get('/:id', auth, (req, res) => {
  if (req.user.userType === 'client' && req.user._id !== req.params.id)
    return res.status(403).json({ error:'Acesso negado' });
  db.clients.findOne({ _id: req.params.id }, (err, doc) =>
    doc ? res.json(strip(doc)) : res.status(404).json({ error:'Nao encontrado' }));
});

// PUT /api/clients/:id — agente/admin edita dados do cliente
router.put('/:id', auth, (req, res) => {
  if (req.user.userType === 'client' && req.user._id !== req.params.id)
    return res.status(403).json({ error:'Acesso negado' });
  const update = { updated_at: new Date().toISOString() };
  ['name','department'].forEach(k => { if(req.body[k]!==undefined) update[k]=req.body[k]; });
  // Agents can also update email
  if (req.body.email !== undefined && req.user.userType !== 'client') {
    const newEmail = req.body.email.toLowerCase().trim();
    // Check email not already taken
    if (!newEmail) return res.status(400).json({ error:'Email invalido' });
    update.email = newEmail;
  }
  db.clients.update({ _id:req.params.id }, { $set:update }, {}, (err,n) =>
    n ? res.json({ message:'Atualizado' }) : res.status(404).json({ error:'Nao encontrado' }));
});

// PUT /api/clients/:id/password — admin/agente redefine senha do cliente sem senha atual
router.put('/:id/password', auth, (req, res) => {
  if (req.user.userType === 'client') return res.status(403).json({ error:'Acesso negado' });
  const { new_password } = req.body;
  if (!new_password || new_password.length < 8)
    return res.status(400).json({ error:'Nova senha deve ter minimo 8 caracteres' });
  db.clients.update(
    { _id: req.params.id },
    { $set: { password: bcrypt.hashSync(new_password, 10) } },
    {},
    (err, n) => n
      ? res.json({ message:'Senha redefinida com sucesso' })
      : res.status(404).json({ error:'Cliente nao encontrado' })
  );
});

// DELETE /api/clients/:id — admin desativa cliente
router.delete('/:id', auth, (req, res) => {
  if (req.user.userType === 'client') return res.status(403).json({ error:'Acesso negado' });
  db.clients.update({ _id:req.params.id }, { $set:{ active:false } }, {}, (err,n) =>
    n ? res.json({ message:'Cliente desativado' }) : res.status(404).json({ error:'Nao encontrado' }));
});

module.exports = router;
