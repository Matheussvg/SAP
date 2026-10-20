# Mery's Toys · Conferência de pedidos

Simulação da ME22N com conferência de NF. Os administradores criam e enviam os pedidos; os conferentes entram só com o nome e aprovam ou rejeitam.

## Publicar no Render

1. Suba esta pasta para um repositório no GitHub.
2. No Render, clique em **New → Blueprint** e escolha o repositório. O `render.yaml` cria:
   - o serviço web `merys-toys-conferencia`;
   - o banco Postgres `merys-toys-db`.
3. O Render pede o valor de **ADMIN_PASS**: é a senha dos administradores. O usuário é `adm`; para mudar, altere `ADMIN_USER`.
4. Quando o deploy terminar, passe o endereço `https://merys-toys-conferencia.onrender.com` (ou o que o Render mostrar) para a equipe.

## Rodar no computador

```
npm install
npm start
```

Abra http://localhost:3000. Sem `DATABASE_URL`, os dados ficam no arquivo `data.json`.

## Bom saber

- **Plano gratuito do Render:** o serviço "dorme" depois de cerca de 15 minutos sem uso. A primeira pessoa que abrir depois espera uns 50 segundos.
- **Banco gratuito do Render:** ele expira depois de um prazo. Confira a data no painel e passe para um plano pago se for usar por mais tempo.
- **Segurança:**
  - A senha de admin é conferida no servidor.
  - Qualquer pessoa com o link pode entrar como conferente.
  - Não coloque dados reais de clientes ou fornecedores.
- **Página:** `public/index.html` é a mesma página publicada no claude.ai. Ao alterar uma, copie para a outra.
