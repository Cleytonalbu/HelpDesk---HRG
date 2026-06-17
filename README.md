# HelpDesk Pro v2.0 — Sistema Completo

Sistema de chamados de TI com backend + frontend totalmente integrados e funcionais.

## Stack
- **Backend:** Node.js + Express.js
- **Banco:** NeDB (embarcado, zero config)
- **Auth:** JWT com refresh automático  
- **Upload:** Multer (10 MB por arquivo)
- **Frontend:** HTML/CSS/JS puro (sem frameworks, zero dependências externas)

---

## Estrutura do Projeto

```
helpdesk-pro/
├── src/
│   ├── server.js              ← Entrada principal
│   ├── db/
│   │   ├── index.js           ← Conexão NeDB
│   │   └── setup.js           ← Seed: dados, agentes, tickets, KB
│   ├── middleware/
│   │   └── auth.js            ← JWT (agentes + clientes)
│   └── routes/
│       ├── auth.js            ← Login, cadastro, senha
│       ├── tickets.js         ← CRUD + comentários + uploads
│       ├── agents.js          ← Gestão de técnicos
│       ├── assets.js          ← CMDB
│       ├── kb.js              ← Base de conhecimento
│       └── reports.js         ← Dashboard, SLA, agentes
├── public/
│   ├── index.html             ← Login (agente + cliente + cadastro)
│   ├── dashboard.html         ← Painel do agente
│   └── portal.html            ← Portal do cliente
├── data/                      ← Banco NeDB (criado automaticamente)
├── uploads/                   ← Anexos dos chamados
├── .env                       ← Configurações
└── package.json
```

---

## Instalação (3 passos)

### 1. Instalar dependências
```bash
npm install
```

### 2. Criar banco de dados e dados iniciais
```bash
npm run setup
```

### 3. Iniciar o servidor
```bash
npm start
```

Acesse: **http://localhost:3000**

---

## Credenciais

### Agentes (acesso ao painel completo)
| E-mail | Senha | Nível |
|---|---|---|
| admin@helpdesk.com | admin123 | Admin |
| carlos@helpdesk.com | carlos123 | N1 |
| ana@helpdesk.com | ana123 | N2 |
| mariana@helpdesk.com | mariana123 | N3 |
| lucas@helpdesk.com | lucas123 | N1 |

### Cliente (acesso ao portal self-service)
| E-mail | Senha |
|---|---|
| joao@empresa.com | joao123 |

> **Novo cliente:** clique em "Sou Cliente" → "Criar conta" na tela de login.

---

## Páginas

### `/` — Login (index.html)
- Dois modos: **Agente** e **Cliente**
- Botões de login rápido para demo
- Cadastro de novos clientes com validação completa
- Redirect automático se já autenticado

### `/dashboard.html` — Painel do Agente
- **Dashboard:** KPIs em tempo real, gráfico 7 dias, donut por canal
- **Chamados:** Tabela com filtros, modal de detalhe, timeline, comentários
- **Novo Chamado:** Formulário com sugestão de KB e seleção de ativos
- **IA Assistente:** Chat com respostas contextuais
- **SLAs:** Ranking de urgência com tempo restante
- **Ativos CMDB:** Inventário completo
- **Agentes:** Cards + formulário de criação com seletor de cor
- **Relatórios:** CSAT, desempenho, métricas exportáveis

### `/portal.html` — Portal do Cliente
- Tema claro, interface simplificada
- KPIs pessoais (só seus chamados)
- Abertura de chamados
- Acompanhamento com histórico
- Base de conhecimento com busca
- Avaliação por estrelas nos chamados resolvidos
- Edição de perfil

---

## API Reference

Base URL: `/api` (relativa ao servidor)

### Autenticação
Todas as rotas protegidas exigem:
```
Authorization: Bearer <token>
```

| Método | Rota | Descrição |
|---|---|---|
| POST | /api/auth/login | Login de agente |
| POST | /api/auth/client-login | Login de cliente |
| POST | /api/auth/client-register | Cadastro de cliente |
| GET | /api/auth/me | Dados do usuário logado |
| PUT | /api/auth/password | Alterar senha |

| Método | Rota | Descrição |
|---|---|---|
| GET | /api/tickets | Listar (clientes veem só os próprios) |
| GET | /api/tickets/stats | KPIs |
| GET | /api/tickets/:id | Detalhe + comentários |
| POST | /api/tickets | Criar chamado |
| PATCH | /api/tickets/:id | Atualizar status/agente/tier |
| POST | /api/tickets/:id/comments | Adicionar comentário |
| POST | /api/tickets/:id/attachments | Anexar arquivo |

| Método | Rota | Descrição |
|---|---|---|
| GET/POST/PUT/DELETE | /api/agents | CRUD agentes (admin) |
| GET/POST/PUT/DELETE | /api/assets | CRUD ativos CMDB |
| GET | /api/kb/categories | Categorias KB |
| GET/POST/PUT/DELETE | /api/kb/articles | Artigos KB |
| GET | /api/reports/dashboard | KPIs + volume diário |
| GET | /api/reports/sla | Chamados com SLA |
| GET | /api/reports/agents | Stats por agente |

---

## Deploy em Produção

### VPS Ubuntu (recomendado)

```bash
# 1. Instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Instalar PM2
sudo npm install -g pm2

# 3. Enviar projeto ao servidor
scp -r helpdesk-pro/ usuario@SEU-IP:/var/www/

# 4. Configurar e iniciar
cd /var/www/helpdesk-pro
npm install
# Edite .env: troque JWT_SECRET por valor seguro
npm run setup
pm2 start src/server.js --name helpdesk
pm2 save && pm2 startup

# 5. Nginx (proxy reverso)
# /etc/nginx/sites-available/helpdesk:
# server {
#   listen 80;
#   server_name helpdesk.suaempresa.com;
#   location / { proxy_pass http://localhost:3000; }
#   client_max_body_size 10M;
# }
sudo nginx -t && sudo systemctl reload nginx

# 6. HTTPS gratuito
sudo certbot --nginx -d helpdesk.suaempresa.com
```

### Segurança antes do deploy
1. Troque `JWT_SECRET` no `.env` por string aleatória (min. 32 chars)
2. Troque todas as senhas padrão pelo painel de Agentes
3. Ajuste CORS no `server.js` para permitir só seu domínio
4. Configure backup da pasta `data/` (crontab diário)

---

## Requisitos de Servidor

| Usuários simultâneos | CPU | RAM | Disco |
|---|---|---|---|
| Até 50 | 1 vCPU | 512 MB | 10 GB |
| Até 200 | 2 vCPU | 1 GB | 20 GB |
| Até 1000 | 4 vCPU | 2 GB | 40 GB |

Menor custo: **Hostinger KVM 1** (~R$15/mês) para equipes pequenas.
