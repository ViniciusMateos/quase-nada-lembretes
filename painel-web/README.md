# Quase Nada Lembretes — Painel Web

Versão **web** do app, pra rodar local no PC. Mesmas funcionalidades (chat com IA,
lembretes, calendário, tarefas, ajustes), mas numa cara de **dashboard**: menu
lateral retrátil, navegação animada, responsivo.

Fala com o **mesmo backend** do app (Server 1 `:8000`) — o dev server do Vite faz
proxy de `/api` e `/health` pra lá, então não tem dor de cabeça com CORS e os dados
são os mesmos da sua conta no app.

## Stack

- Vite + React 18 + TypeScript
- Tailwind CSS (tema escuro, paleta do app)
- framer-motion (animações), React Router, TanStack Query
- lucide-react (ícones), axios

## Sempre ligado (uso do dia a dia)

O painel fica no ar sozinho em **http://quase-nada-lembretes.localhost:5178**:

- `serve.mjs` — servidor de produção sem dependências: serve o `dist/` e faz o
  proxy de `/api` e `/health` pro backend (o mesmo papel do proxy do Vite).
  Log em `serve.log`.
- `supervisor.vbs` — roda o `serve.mjs` escondido e re-sobe se cair. Se a porta
  já tem outra instância, sai sozinho (o `serve.mjs` devolve código 3).
- `QuaseNada-Lembretes-Painel.vbs` na pasta **Inicializar** do Windows chama o
  `supervisor.vbs` no login.

Mexeu no código? `npm run build` e pronto: o servidor lê o `dist/` a cada
request, não precisa reiniciar.

**Ícone na barra de tarefas:** `criar-atalho.ps1` cria o atalho "Quase Nada
Lembretes" no Menu Iniciar (Chrome em modo app, sem barra de endereço, ícone
`public/app.ico`) com o mesmo AppUserModelID da janela, pra atalho e janela
virarem um botão só. O Windows 11 não deixa script fixar na barra: com a janela
aberta, botão direito no ícone > **Fixar na barra de tarefas**.

```powershell
powershell -ExecutionPolicy Bypass -File criar-atalho.ps1 -Nome "Quase Nada Lembretes" `
  -Url "http://quase-nada-lembretes.localhost:5178" -Icone "$PWD\public\app.ico" `
  -TituloJanela "Quase Nada Lembretes"
```

## Rodar em modo dev

```bash
cd painel-web
npm install        # (só na primeira vez)
npm run dev        # http://localhost:5178 (pare o supervisor antes: mesma porta)
```

Entra com a **mesma conta** do app (e-mail + senha). O token fica no
`localStorage`, que é por endereço: login feito em `localhost:5178` não vale em
`quase-nada-lembretes.localhost:5178`.

## Estrutura

```
src/
  lib/        api.ts (axios + refresh), auth.tsx, utils.ts
  components/ Layout (sidebar retrátil), ui, Modal, Toast, ReminderFormModal
  pages/      Login, Chat, Reminders, Calendar, Tasks, Settings
  types.ts
vite.config.ts  # proxy pro backend (altere BACKEND se mudar o server)
```

## Notas

- É só pra uso **local** (o servidor escuta só em 127.0.0.1).
- O chat usa o Gemini do backend; se o free-tier estiver no pico, pode demorar uns
  segundos (o front espera até 95s, igual ao app).
- Pra apontar pra outro backend, edite `BACKEND` em `vite.config.ts` **e** em `serve.mjs`.
