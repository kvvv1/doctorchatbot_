# 🗄️ Guia de Execução das Migrations

## ✅ Método Recomendado: SQL Editor do Supabase

### Passo a Passo:

1. **Acesse o Supabase Dashboard**
   - URL: https://supabase.com/dashboard
   - Faça login com sua conta

2. **Selecione o Projeto**
   - Clique no projeto: `efepbabyhicufogfchwf`

3. **Abra o SQL Editor**
   - No menu lateral esquerdo, clique em **"SQL Editor"**

4. **Crie uma Nova Query**
   - Clique no botão **"New Query"** (ou pressione Ctrl+I)

5. **Copie e Cole o SQL**
   - Abra o arquivo: `database/all-migrations.sql`
   - Selecione TODO o conteúdo (Ctrl+A)
   - Copie (Ctrl+C)
   - Cole no SQL Editor do Supabase (Ctrl+V)

6. **Execute a Query**
   - Clique no botão **"Run"** (ou pressione Ctrl+Enter)
   - Aguarde a execução (pode levar 10-30 segundos)

7. **Verifique o Resultado**
   - Se tudo correu bem, você verá: "Success. No rows returned"
   - Se houver algum erro, leia a mensagem e corrija antes de prosseguir

### ✅ Verificação Pós-Execução

Após executar as migrations, verifique se as tabelas foram criadas:

```sql
-- Execute esta query para listar todas as tabelas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```

**Você deve ver estas tabelas:**
- appointments
- bot_settings
- calendar_integrations
- clinics
- conversations
- messages
- profiles
- quick_replies
- subscriptions

---

## 🔧 Método Alternativo: Supabase CLI (Para usuários avançados)

Se você tiver o Supabase CLI instalado:

```bash
# Instalar Supabase CLI (se não tiver)
npm install -g supabase

# Fazer login
supabase login

# Executar migrations
supabase db push

# Ou executar o arquivo SQL diretamente
supabase db execute -f database/all-migrations.sql
```

---

## ⚠️ Problemas Comuns

### Erro: "relation clinics does not exist"

**Problema:** As tabelas `clinics` e `profiles` não existem ainda.

**Solução:** Você precisa criar estas tabelas primeiro. Execute este SQL antes das migrations:

```sql
-- Criar tabela clinics (simplificada)
CREATE TABLE IF NOT EXISTS clinics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Criar tabela profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Criar políticas básicas
CREATE POLICY "Users can view their clinic"
  ON clinics FOR SELECT
  USING (id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view their profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());
```

Depois execute o arquivo `all-migrations.sql`.

### Erro: "column already exists"

**Problema:** Você já executou algumas migrations antes.

**Solução:** Não há problema! O SQL usa `IF NOT EXISTS` e `ADD COLUMN IF NOT EXISTS`, então ele vai pular o que já existe e criar apenas o que falta.

### Erro: "permission denied"

**Problema:** Você não tem permissão de administrador.

**Solução:** Certifique-se de estar logado com a conta correta no Supabase Dashboard. A conta deve ter acesso de administrador ao projeto.

---

## 📊 Status das Migrations

Marque aqui conforme você for executando:

- [ ] Migration 001: Conversations e Messages
- [ ] Migration 002: Bot Enabled e Quick Replies
- [ ] Migration 003: Notes em Conversations
- [ ] Migration 004: Last Patient Message At
- [ ] Migration 005: Bot State e Bot Context
- [ ] Migration 006: Z-API Message ID
- [ ] Migration 007: Bot Settings
- [ ] Migration 008: Appointments e Calendar Integrations
- [ ] Migration 009: Subscriptions

---

## 🎉 Próximos Passos

Após executar as migrations com sucesso:

1. ✅ Banco de dados está configurado
2. ⏭️ Configure as variáveis de ambiente (.env.local)
3. ⏭️ Execute `npm run dev`
4. ⏭️ Teste o sistema

---

## 💡 Dicas

- **Backup**: O Supabase faz backup automático, mas você pode fazer snapshots manuais em "Database" > "Backups"
- **Rollback**: Se algo der errado, você pode restaurar um backup
- **Logs**: Em caso de erro, copie a mensagem completa para análise
- **Documentação**: https://supabase.com/docs/guides/database

---

## 📞 Suporte

Se encontrar problemas:
1. Leia a mensagem de erro completa
2. Verifique se as tabelas `clinics` e `profiles` existem
3. Confira se você tem permissões de admin no projeto
4. Tente executar as migrations uma por vez (arquivos individuais em `database/migrations/`)
