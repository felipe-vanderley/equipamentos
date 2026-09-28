# Portal de Equipamentos — Guia de implantação

Sistema web para seus clientes acessarem a documentação técnica dos equipamentos e controlarem locações e finanças.

## O que o sistema faz

| Quem | O que vê / faz |
|---|---|
| **Qualquer pessoa** (link ou QR code) | Página do equipamento: dados técnicos, foto frontal e lateral, **lista** de documentos |
| **Cliente logado** | Baixa os PDFs dos **seus** equipamentos · registra locações · área financeira restrita (receitas, despesas, “informar recebimento”) |
| **Você (administrador)** | Cadastra clientes, usuários, equipamentos, fotos e PDFs · vê o financeiro de qualquer cliente |

**Locação:** tipo (hora, dia, mês, ano), início, término, valor por período. O sistema calcula a quantidade de períodos e gera as parcelas a receber.

**Financeiro:** recebido · valor futuro dos contratos · pendente vencido · despesas (administrativa, consumo, manutenção) · saldo realizado e projetado · exportação CSV.

Segurança: as permissões são aplicadas **no banco de dados** (Row Level Security). Um cliente não consegue ver dados nem baixar PDFs de outro, mesmo manipulando o navegador. Os PDFs ficam em armazenamento privado e o download usa link temporário (2 min).

---

## Implantação (≈ 30 minutos, sem programar)

### 1. Criar o banco (Supabase)
1. Crie uma conta em **supabase.com** → **New project** (região: *South America (São Paulo)*). Guarde a senha do banco.
2. Menu **SQL Editor → New query** → cole todo o conteúdo de `supabase.sql` → **Run**. Deve aparecer “Success”.

### 2. Bloquear cadastro público
**Authentication → Sign In / Providers → Email**: desative **“Allow new users to sign up”**.
(Só você cria logins; ninguém se cadastra sozinho.)

### 3. Criar seu usuário administrador
1. **Authentication → Users → Add user → Create new user** (e-mail + senha, marque *Auto Confirm User*).
2. No **SQL Editor**, rode (trocando o e-mail):
   ```sql
   update public.perfis set papel = 'admin', nome = 'Felipe' where email = 'seu-email@exemplo.com';
   ```

### 4. Configurar o site
**Project Settings → API**: copie a *Project URL* e a chave *anon public* para `config.js`.
Opcional: altere `NOME_EMPRESA` no mesmo arquivo.

### 5. Publicar
Opção mais simples — **Netlify Drop**: acesse app.netlify.com/drop e arraste a pasta `portal-equipamentos`. Pronto, o site ganha um endereço (pode depois ligar um domínio próprio, ex.: `documentos.suaempresa.com.br`).
Alternativas: Vercel, Cloudflare Pages ou qualquer hospedagem de site estático.

> Não abra o `index.html` com duplo clique — o navegador bloqueia módulos em arquivo local. Use o site publicado.

### 6. Endereço para “Esqueci minha senha”
**Authentication → URL Configuration**: em *Site URL* e *Redirect URLs*, coloque o endereço do site publicado.

---

## Rotina de uso

1. **Administração → + Novo cliente** (empresa).
2. No Supabase, **Add user** com o e-mail do cliente → volte em **Administração → Usuários**, vincule à empresa → **Salvar**. Envie e-mail e senha ao cliente.
3. **+ Novo equipamento**: dados técnicos + foto frontal e lateral (as fotos são reduzidas automaticamente).
4. Na página do equipamento: **+ Adicionar PDF** (laudo, ART, prontuário, APR…) com emissão e validade.
5. **QR code**: gere, imprima e cole a etiqueta no equipamento.
6. O cliente registra locações na página do equipamento e, no **Financeiro**, clica em **✓ Informar recebimento** quando receber; lança despesas em **+ Lançamento**.

Alertas automáticos por cor: inspeção/validade **vencida** (vermelho), **vence em até 30 dias** (amarelo).

---

## Custos e limites
O plano gratuito do Supabase atende para começar, mas tem limite de armazenamento de arquivos e pausa projetos sem uso por um período. Com muitos PDFs e clientes em produção, avalie o plano pago (confira valores atualizados em supabase.com/pricing). Netlify tem plano gratuito para sites estáticos.

## Arquivos
| Arquivo | Função |
|---|---|
| `supabase.sql` | Tabelas, permissões, armazenamento (rodar uma vez) |
| `config.js` | URL e chave do Supabase, nome da empresa |
| `index.html`, `styles.css` | Página e visual |
| `app.js` | Telas e regras do sistema |
| `calc.js` | Cálculo de períodos e parcelas da locação |
