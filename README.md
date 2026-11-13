# Gestão Attiva — Gestão & Controle (NIT)

Aplicativo web da Attiva: login e senha, usuários e permissões, controle de obrigações por competência,
zeramento/exclusão do Simples, demandas entre setores, empresas, carteiras, equipe/férias e ferramentas.

- **Site**: arquivos estáticos (GitHub Pages). Abre sem internet depois do primeiro acesso (service worker).
- **Login e dados**: Firebase Authentication (e-mail/senha) + Cloud Firestore com cache offline.
  Cada alteração grava na hora no aparelho e sincroniza com a nuvem; sem internet, fica na fila e sobe sozinha.
- **Permissões**: valem no servidor (`firestore.rules`), não só na tela.
- **Nenhum dado de cliente fica neste repositório.** O `firebaseConfig` é público por natureza; a proteção são as regras.

## Colocar no ar

1. **Firebase** (console.firebase.google.com, com a conta Google da Attiva)
   - Criar projeto → *Authentication* → método **E-mail/senha** ativado.
   - *Firestore Database* → criar banco (modo produção, região `southamerica-east1`).
   - *Firestore → Regras* → colar o conteúdo de `firestore.rules` → Publicar.
   - *Configurações do projeto → Seus apps → Web* → registrar app → copiar o `firebaseConfig`.
   - *Authentication → Configurações → Domínios autorizados* → adicionar `SEU-USUARIO.github.io`.
2. **Configuração**: colar o `firebaseConfig` em `js/config.js` (no lugar de `null`).
3. **GitHub**: enviar esta pasta para um repositório público → *Settings → Pages* → Branch `main`, pasta `/ (root)`.
4. Abrir o link do Pages → tela **Primeiro acesso** → criar o administrador. A partir daí só entra quem o administrador cadastrar.

## Atualizar a versão
Ao publicar mudanças, altere `V` em `sw.js` e `APP_VERSION` em `js/config.js` para os aparelhos buscarem os arquivos novos.

## Estrutura
`index.html` · `css/app.css` · `js/` (app, core, store, grid, mod-controle, mod-gestao, mod-admin, config) · `vendor/` (Firebase, SheetJS, ExcelJS) · `sw.js` · `firestore.rules`

## Modo local
Com `FIREBASE_CONFIG = null` o app roda só no navegador (testes). Precisa ser servido por http (ex.: `python -m http.server`), não abre por duplo clique.
