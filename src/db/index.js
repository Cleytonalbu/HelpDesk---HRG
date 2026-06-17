const Datastore = require('@seald-io/nedb');
const path = require('path');
const DATA = path.join(__dirname, '../../data');
require('fs').mkdirSync(DATA, { recursive: true });
const load = f => new Datastore({ filename: path.join(DATA, f+'.db'), autoload: true });
module.exports = {
  agents:       load('agents'),
  tickets:      load('tickets'),
  comments:     load('comments'),
  attachments:  load('attachments'),
  assets:       load('assets'),
  kbCategories: load('kb_categories'),
  kbArticles:   load('kb_articles'),
  slaRules:     load('sla_rules'),
  clients:      load('clients'),
  datashow:     load('datashow'),
};
