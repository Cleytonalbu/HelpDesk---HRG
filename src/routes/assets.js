const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db   = require('../db');
const auth = require('../middleware/auth');
const now  = () => new Date().toISOString();

router.get('/', auth, (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  if (req.query.type)   q.type   = req.query.type;
  db.assets.find(q).sort({ code:1 }).exec((err,docs) => res.json(docs||[]));
});
router.get('/:id', auth, (req, res) => {
  db.assets.findOne({ $or:[{_id:req.params.id},{code:req.params.id}] }, (err,doc) =>
    doc ? res.json(doc) : res.status(404).json({error:'Nao encontrado'}));
});
router.post('/', auth, (req, res) => {
  const { code, name, type, status, assigned_to, serial, notes } = req.body;
  if (!code||!name||!type) return res.status(400).json({error:'code, name, type obrigatorios'});
  const asset = { _id:uuid(), code, name, type, status:status||'online',
    assigned_to:assigned_to||null, serial:serial||null, notes:notes||null,
    created_at:now(), updated_at:now() };
  db.assets.insert(asset, (err,doc) => err ? res.status(400).json({error:'Codigo ja existe'}) : res.status(201).json(doc));
});
router.put('/:id', auth, (req, res) => {
  const update = { updated_at:now() };
  ['name','type','status','assigned_to','serial','notes'].forEach(k => { if(req.body[k]!==undefined) update[k]=req.body[k]; });
  db.assets.update({ _id:req.params.id }, { $set:update }, {}, (err,n) =>
    n ? res.json({message:'Atualizado'}) : res.status(404).json({error:'Nao encontrado'}));
});
router.delete('/:id', auth, (req, res) => {
  db.assets.remove({ _id:req.params.id }, {}, (err,n) =>
    n ? res.json({message:'Removido'}) : res.status(404).json({error:'Nao encontrado'}));
});
module.exports = router;
