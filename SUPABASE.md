# O que falta proteger no Supabase

O código deste repositório é só metade da Convorax. A outra metade — as tabelas,
as políticas de RLS e as 9 funções RPC (`criar_servidor`, `editar_servidor`,
`apagar_servidor`, `sair_do_servidor`, `entrar_por_codigo`, `criar_canal`,
`apagar_canal`, `definir_username`) — existe **só dentro do painel do Supabase**.
Não há nenhum arquivo `.sql` aqui.

Isso tem duas consequências práticas:

1. **O deploy não é reproduzível.** Se o projeto do Supabase for perdido ou
   alguém mexer numa policy sem querer, não há nada neste repositório para
   restaurar — nem para auditar o que mudou.
2. **As verificações abaixo não podem ser feitas por mim.** Eu não tenho acesso
   ao banco. O code review apontou cada uma delas lendo o código do cliente; a
   confirmação e a correção precisam ser feitas por você no SQL Editor.

> **Antes de rodar qualquer SQL daqui:** eu não consigo ver o seu esquema, então
> os nomes de tabela e coluna abaixo são os que o frontend usa. Onde eu precisei
> supor algo (a tabela que guarda quem é membro de qual servidor, por exemplo),
> está marcado. Leia e adapte antes de executar — não cole no escuro.

---

## 1. Qualquer usuário pode assinar mensagem com o nome de outro

**Onde:** `frontend/src/Sala.jsx`, no envio de mensagem.

A mensagem é gravada com `autor: meuNome` — uma **string livre vinda do
navegador** — e não existe nenhuma coluna ligando a mensagem ao usuário que a
escreveu. Quem abrir o console do navegador e rodar:

```js
supabase.from('mensagens').insert({ canal_id: '<id>', autor: 'dono_do_servidor', conteudo: 'oi' })
```

coloca no chat de todo mundo uma mensagem assinada pela vítima, com a cor do
nome dela, sem nenhuma marca de falsificação.

Tem um efeito colateral mais silencioso: como `definir_username` deixa trocar de
nome livremente, se o João usa `joao`, muda para `joao2` e outra pessoa registra
`joao`, **todo o histórico do João passa a parecer dessa outra pessoa** — e o
botão de apagar aparece pra ela.

```sql
-- 1. amarrar cada mensagem ao autor de verdade
alter table mensagens add column if not exists user_id uuid references auth.users(id);
alter table mensagens alter column user_id set default auth.uid();

-- 2. o cliente nao escolhe o user_id
drop policy if exists "inserir mensagem" on mensagens;
create policy "inserir mensagem" on mensagens for insert to authenticated
  with check (user_id = auth.uid());
```

O `autor` continua útil como cache de exibição, mas quem decide autoria passa a
ser o `user_id`. As mensagens antigas ficam com `user_id` nulo — vale rodar um
`update` casando `autor` com `perfis.username` antes de confiar na coluna.

## 2. "Só o dono apaga" é só enfeite da tela

**Onde:** `frontend/src/Sala.jsx` — `podeApagar = meu || souDono`.

Diferente de todas as outras ações privilegiadas (que passam por RPC), apagar
mensagem é um `delete` direto na tabela. A única barreira real é a policy de
DELETE de `mensagens` — e ela **precisa** ser permissiva hoje, porque a tela
promete ao dono apagar mensagem de qualquer um, e `souDono` é uma variável do
React que o banco não enxerga.

Resultado: um membro comum apaga a mensagem de quem quiser, direto pelo console.

A correção é tirar o DELETE direto do cliente e passar por uma função:

```sql
revoke delete on mensagens from authenticated;

create or replace function apagar_mensagem(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from mensagens m
   where m.id = p_id
     and ( m.user_id = auth.uid()                       -- e minha
        or auth.uid() = ( select s.dono_id              -- ou sou dono do servidor
                            from canais c
                            join servidores s on s.id = c.servidor_id
                           where c.id = m.canal_id ) );
  if not found then
    raise exception 'sem permissao para apagar esta mensagem';
  end if;
end $$;
```

Depois é só trocar o `.delete()` do `Sala.jsx` por `supabase.rpc('apagar_mensagem', { p_id: id })`.

## 3. Avatar de servidor: qualquer membro troca a foto de qualquer servidor

**Onde:** `frontend/src/Sala.jsx` (editar servidor) e `frontend/src/App.jsx` (criar).

A imagem vai direto para o bucket `avatares` no caminho `servidores/<id>.<ext>`
com `upsert: true`, **fora de qualquer RPC**. Esse caminho não tem o id do dono —
só o id do servidor, que todo membro conhece (ele aparece na URL como `?sala=`).
E a policy do bucket precisa aceitar qualquer autenticado escrevendo em
`servidores/`, porque na criação o arquivo é gravado antes do servidor existir.

Ou seja: um membro comum, que nem vê o botão de editar, sobrescreve a foto do
servidor pelo console.

A correção é prefixar o caminho pelo dono e amarrar a policy ao primeiro
segmento:

```sql
create policy "avatar de servidor so do dono" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

Com isso o caminho vira `<uid>/servidores/<id>.<ext>` — exige mudar as três
funções de upload no frontend junto.

## 4. O ban só existe no navegador do banido

**Onde:** `frontend/src/App.jsx` — o poll de 30s em `checarPerfil`.

O ban depende de um SELECT que **o próprio banido executa**. Se a policy de
`perfis` não expuser a coluna `banido`, se a linha não existir ou se a rede
falhar, `data?.banido` vem `undefined` e o ban simplesmente não acontece — falha
em aberto.

E mesmo quando funciona, o `signOut()` só limpa o `localStorage`: o access token
do Supabase continua valendo até expirar, bastando ao banido tê-lo copiado.

O backend novo já fecha a porta da call (ele recusa emitir token para conta
banida — `backend/server.js`, no `/token`). Falta fechar o banco:

```sql
-- exemplo para mensagens; repita a ideia nas RPCs que alteram dados
create policy "banido nao escreve" on mensagens for insert to authenticated
  with check (
    not exists (select 1 from perfis p where p.id = auth.uid() and p.banido)
  );
```

E, no momento de banir, derrubar quem já está dentro: `RoomServiceClient.removeParticipant`
do lado do LiveKit, mais a revogação das sessões pela admin API do Supabase.

## 5. O diretório de usuários (parcialmente corrigido)

**Onde:** `frontend/src/Sala.jsx`.

Era um `select("email_nome, username, avatar_url")` **sem filtro nenhum**: ao
entrar em qualquer call, o cliente baixava username, avatar e `email_nome` —
derivado do email — de **todos** os cadastrados na Convorax. Além do vazamento,
batia no teto de 1000 linhas do PostgREST: passando disso, quem entrasse depois
ficaria sem foto.

Já corrigi no cliente: agora busca só os participantes daquela call. Mas a
policy continua permitindo o select completo para quem chamar direto pela API.
Para fechar de verdade, restrinja a leitura de `perfis` a quem compartilha
servidor com você:

```sql
create policy "ver perfil de quem compartilha servidor" on perfis for select to authenticated
  using (
    id = auth.uid()
    or exists (
      -- AQUI: troque 'membros' pelo nome real da sua tabela de associacao
      select 1 from membros m1
      join membros m2 on m1.servidor_id = m2.servidor_id
      where m1.user_id = auth.uid() and m2.user_id = perfis.id
    )
  );
```

## 6. O código de convite não tem como ser trocado

**Onde:** `frontend/src/App.jsx` — `select("*")` em `servidores`.

A lista vem com todas as colunas, inclusive `codigo`, que é renderizado para
**todo membro** (na tela inicial e dentro da call). Qualquer membro convida
qualquer pessoa, e não existe forma de rotacionar o código se ele vazar.

Se o convite deve ser privilégio do dono: tire `codigo` do select geral, sirva-o
por uma RPC que exija `dono_id = auth.uid()`, e crie uma função para gerar um
código novo.

---

## O mais importante: versionar isso

Nada acima é auditável enquanto o esquema viver só no painel. Vale rodar:

```bash
npx supabase login
npx supabase link --project-ref jdmoprahepzbpmuttywd
npx supabase db pull          # gera supabase/migrations/*.sql
git add supabase/ && git commit -m "chore: versiona schema e policies do Supabase"
```

A partir daí as policies e o corpo das RPCs entram no code review junto com o
resto do código — que é exatamente o que faltou para pegar os itens 1 a 4 antes
de hoje.
