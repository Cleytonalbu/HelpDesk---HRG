const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db   = require('../db');
const auth = require('../middleware/auth');
const now  = () => new Date().toISOString();

router.get('/categories', auth, (req, res) => {
  db.kbCategories.find({}, (err, cats) => {
    db.kbArticles.find({}, (err, arts) => {
      const counts = {};
      (arts||[]).forEach(a => { counts[a.category_id]=(counts[a.category_id]||0)+1; });
      res.json((cats||[]).map(c => ({ ...c, article_count:counts[c._id]||0 })));
    });
  });
});
router.get('/articles', auth, (req, res) => {
  const q = {};
  if (req.query.category_id) q.category_id = req.query.category_id;
  if (req.query.search) { const rx=new RegExp(req.query.search,'i'); q.$or=[{title:rx},{body:rx}]; }
  db.kbArticles.find(q).sort({ views:-1 }).exec((err,docs) => res.json(docs||[]));
});
router.get('/articles/:id', auth, (req, res) => {
  db.kbArticles.findOne({ _id:req.params.id }, (err, doc) => {
    if (!doc) return res.status(404).json({error:'Artigo nao encontrado'});
    db.kbArticles.update({ _id:doc._id }, { $inc:{views:1} }, {});
    res.json(doc);
  });
});
router.post('/articles', auth, (req, res) => {
  const { category_id, title, body } = req.body;
  if (!title||!body) return res.status(400).json({error:'title e body obrigatorios'});
  const art = { _id:uuid(), category_id:category_id||null, title, body,
    helpful_pct:0, views:0, created_at:now(), updated_at:now() };
  db.kbArticles.insert(art, (err,doc) => res.status(201).json(doc));
});
router.put('/articles/:id', auth, (req, res) => {
  const update = { updated_at:now() };
  ['title','body','category_id','helpful_pct'].forEach(k => { if(req.body[k]!==undefined) update[k]=req.body[k]; });
  db.kbArticles.update({ _id:req.params.id }, { $set:update }, {}, (err,n) =>
    n ? res.json({message:'Atualizado'}) : res.status(404).json({error:'Nao encontrado'}));
});
router.delete('/articles/:id', auth, (req, res) => {
  db.kbArticles.remove({ _id:req.params.id }, {}, (err,n) =>
    n ? res.json({message:'Removido'}) : res.status(404).json({error:'Nao encontrado'}));
});
module.exports = router;
