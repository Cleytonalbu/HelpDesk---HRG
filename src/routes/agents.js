const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db   = require('../db');
const auth = require('../middleware/auth');

const strip = a => { if(!a) return null; const {password,...r}=a; return r; };
const adminOnly = (req,res,next) => req.user.role==='admin' ? next() : res.status(403).json({error:'Acesso negado'});

// GET /api/agents — todos os agentes autenticados podem listar
router.get('/', auth, (_, res) => {
  db.agents.find({ active: true }, (err, docs) => res.json((docs||[]).map(strip)));
});

// PUT /api/agents/me/password — DEVE vir ANTES de /:id para não ser interceptado
// Agente troca a própria senha (precisa confirmar senha atual)
router.put('/me/password', auth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error:'current_password e new_password obrigatorios' });
  if (new_password.length < 8)
    return res.status(400).json({ error:'Nova senha deve ter minimo 8 caracteres' });
  db.agents.findOne({ _id: req.user._id }, (err, agent) => {
    if (!agent) return res.status(404).json({ error:'Agente nao encontrado' });
    if (!bcrypt.compareSync(current_password, agent.password))
      return res.status(400).json({ error:'Senha atual incorreta' });
    db.agents.update(
      { _id: agent._id },
      { $set: { password: bcrypt.hashSync(new_password, 10) } },
      {},
      () => res.json({ message:'Senha alterada com sucesso' })
    );
  });
});

// GET /api/agents/:id
router.get('/:id', auth, (req, res) => {
  db.agents.findOne({ _id: req.params.id }, (err, doc) =>
    doc ? res.json(strip(doc)) : res.status(404).json({ error:'Nao encontrado' }));
});

// POST /api/agents — admin cria novos agentes
router.post('/', auth, adminOnly, (req, res) => {
  const { name, email, password, role, color } = req.body;
  if (!name||!email||!password) return res.status(400).json({ error:'name, email, password obrigatorios' });
  if (password.length < 8) return res.status(400).json({ error:'Senha deve ter minimo 8 caracteres' });
  db.agents.findOne({ email: email.toLowerCase() }, (err, ex) => {
    if (ex) return res.status(400).json({ error:'Email ja cadastrado' });
    const agent = {
      _id:uuid(), name, email:email.toLowerCase(),
      password:bcrypt.hashSync(password,10),
      role:role||'N1', color:color||'#3b82f6',
      active:true, created_at:new Date().toISOString()
    };
    db.agents.insert(agent, (err, doc) => err
      ? res.status(500).json({ error:'Erro ao criar agente' })
      : res.status(201).json(strip(doc)));
  });
});

// PUT /api/agents/:id — admin edita qualquer agente
router.put('/:id', auth, adminOnly, (req, res) => {
  const update = {};
  ['name','email','role','color','active'].forEach(k => { if(req.body[k]!==undefined) update[k]=req.body[k]; });
  if (update.email) update.email = update.email.toLowerCase();
  db.agents.update({ _id:req.params.id }, { $set:update }, {}, (err,n) =>
    n ? res.json({message:'Atualizado'}) : res.status(404).json({error:'Nao encontrado'}));
});

// PUT /api/agents/:id/password — admin redefine senha de qualquer agente (sem senha atual)
router.put('/:id/password', auth, adminOnly, (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 8)
    return res.status(400).json({ error:'Nova senha deve ter minimo 8 caracteres' });
  db.agents.update(
    { _id: req.params.id },
    { $set: { password: bcrypt.hashSync(new_password, 10) } },
    {},
    (err, n) => n
      ? res.json({ message:'Senha redefinida com sucesso' })
      : res.status(404).json({ error:'Agente nao encontrado' })
  );
});

// DELETE /api/agents/:id — admin desativa (soft delete)
router.delete('/:id', auth, adminOnly, (req,res) => {
  if (req.params.id === req.user._id)
    return res.status(400).json({ error:'Voce nao pode desativar sua propria conta' });
  db.agents.update({ _id:req.params.id }, { $set:{active:false} }, {}, (err,n) =>
    n ? res.json({message:'Agente desativado'}) : res.status(404).json({error:'Nao encontrado'}));
});

module.exports = router;
