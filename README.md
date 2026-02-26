# Doctor Chat Bot

Sistema de chatbot inteligente para clínicas médicas com WhatsApp (via Z-API), agendamentos automatizados e integração com Google Calendar.

## 🚀 Features

- ✅ **WhatsApp Business Integration** (Z-API)
- ✅ **Bot Inteligente** para agendamentos automáticos
- ✅ **Dashboard de Conversas** completo
- ✅ **Google Calendar Integration**
- ✅ **Sistema de Assinatura Recorrente** (Stripe)
- ✅ **Autenticação** com Supabase Auth
- ✅ **Banco de Dados** PostgreSQL via Supabase
- ✅ **Interface Moderna** com Next.js 15 + Tailwind CSS

---

## 📋 Documentação

- **[Implementação do Bot](docs/BOT_IMPLEMENTATION_COMPLETE.md)** - Sistema de bot e fluxos
- **[Integração Google Calendar](docs/GOOGLE_CALENDAR_INTEGRATION.md)** - Como configurar agendamentos
- **[Webhook Z-API](docs/WEBHOOK_ZAPI.md)** - Recebimento de mensagens
- **[Sistema de Billing](docs/BILLING_STRIPE.md)** - Assinatura recorrente com Stripe
- **[Dashboard Evolution](DASHBOARD_EVOLUTION.md)** - Evolução da interface

---

## 🛠️ Stack Tecnológica

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS 4
- **Backend**: Next.js API Routes
- **Banco de Dados**: PostgreSQL (Supabase)
- **Autenticação**: Supabase Auth
- **WhatsApp**: Z-API
- **Pagamentos**: Stripe
- **Calendar**: Google Calendar API

---

## 🔧 Setup

### 1. Clone o repositório

```bash
git clone <repo-url>
cd doctor-chat-bot
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```bash
cp .env.example .env.local
```

Variáveis necessárias:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_ESSENCIAL`
- `STRIPE_PRICE_ID_PROFISSIONAL`
- `STRIPE_PRICE_ID_CLINIC_PRO`
- `STRIPE_PRICE_ID_FUNDADOR`
- `APP_URL`

### 4. Execute as migrações do banco

Execute os arquivos em `database/migrations/` no Supabase SQL Editor (em ordem).

### 5. Inicie o servidor de desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000)

---

## 📦 Estrutura do Projeto

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── bot/                  # Bot endpoints
│   │   ├── stripe/               # Stripe checkout/portal
│   │   ├── webhooks/             # Webhooks (Z-API, Stripe)
│   │   └── zapi/                 # Z-API endpoints
│   ├── dashboard/                # Dashboard pages
│   │   ├── billing/              # Assinatura
│   │   ├── conversas/            # Conversas
│   │   ├── agenda/               # Agenda
│   │   └── configuracoes/        # Configurações
│   ├── login/                    # Login page
│   ├── pricing/                  # Planos e preços
│   └── signup/                   # Cadastro
├── components/                   # Componentes reutilizáveis
├── lib/
│   ├── auth/                     # Autenticação e guards
│   ├── bot/                      # Engine do bot
│   ├── calendar/                 # Google Calendar
│   ├── services/                 # Services (subscription, inbox)
│   ├── stripe/                   # Stripe client
│   ├── supabase/                 # Supabase clients
│   ├── types/                    # TypeScript types
│   ├── utils/                    # Utilities
│   └── zapi/                     # Z-API client
database/
└── migrations/                   # SQL migrations
docs/                             # Documentação técnica
```

---

## 🔐 Sistema de Assinatura

O sistema usa **Stripe** para cobrança recorrente mensal.

### Status de Assinatura
- **`active`** ✅ - Assinatura ativa (funcionalidades liberadas)
- **`trialing`** ⏱ - Período de teste (funcionalidades liberadas)
- **`past_due`** ⚠️ - Pagamento pendente (funcionalidades bloqueadas)
- **`canceled`** ❌ - Assinatura cancelada (funcionalidades bloqueadas)
- **`inactive`** ○ - Sem assinatura (funcionalidades bloqueadas)

### Funcionalidades Bloqueadas
Quando a assinatura não está ativa:
- ❌ Envio de mensagens WhatsApp
- ❌ Conexão/reconexão do WhatsApp
- ❌ Acesso ao dashboard (redireciona para /billing)

**Documentação completa**: [docs/BILLING_STRIPE.md](docs/BILLING_STRIPE.md)

---

## 🧪 Testes

### Cartões de Teste (Stripe)
- **Sucesso**: `4242 4242 4242 4242`
- **Falha**: `4000 0000 0000 0002`
- CVV: qualquer 3 dígitos
- Validade: qualquer data futura

### Webhook Local (Stripe)
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## 📚 Scripts Disponíveis

```bash
npm run dev          # Inicia servidor de desenvolvimento
npm run build        # Build para produção
npm run start        # Inicia servidor de produção
npm run lint         # Roda o linter
```

---

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

---

## 📄 Licença

Este projeto é privado e proprietário.

---

## 📞 Suporte

Para dúvidas ou problemas:
- Consulte a [documentação](docs/)
- Abra uma issue no GitHub

---

**Desenvolvido com ❤️ para otimizar o atendimento médico**
