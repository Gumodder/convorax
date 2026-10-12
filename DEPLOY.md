# Subindo a Convorax na VPS

Testado em Ubuntu 24.04/26.04 (Hostinger KVM). O servidor roda duas coisas:
o **backend de tokens** (Node, porta 3001, interno) e o **frontend estatico**
(arquivos prontos servidos pelo nginx). O LiveKit e o Supabase sao servicos
externos — esta receita nao instala nenhum dos dois.

## 0. O que voce precisa ter em maos

| Item | Onde pegar |
|---|---|
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | painel do LiveKit Cloud (Settings → Keys) ou o `livekit.yaml` do seu servidor |
| `SUPABASE_ANON_KEY` | painel do Supabase → Project Settings → API (é a mesma chave publica do frontend) |
| DNS apontando para o IP da VPS | `convorax.space` (site) e `api.convorax.space` (backend) → `147.79.100.61` |

## 1. Dependencias do sistema

```bash
sudo apt update
sudo apt install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # deve mostrar v22.x
```

## 2. Usuario de servico e clone

O backend nao roda como root nem como seu usuario: um usuario de sistema
proprio, dono do codigo. Assim `git pull` e o servico usam o mesmo dono e voce
nao esbarra em permissao depois.

```bash
sudo useradd --system --create-home --home-dir /opt/convorax --shell /usr/sbin/nologin convorax
sudo -u convorax git clone https://github.com/gumodder/convorax.git /opt/convorax/app
```

> Daqui em diante todo comando que mexe no codigo vai com `sudo -u convorax`.
> O nginx so precisa **ler** `dist/`, e os arquivos ja saem legiveis por todos.

## 3. Backend

```bash
cd /opt/convorax/app/backend
sudo -u convorax npm ci --omit=dev
sudo -u convorax cp .env.example .env
sudo -u convorax nano .env    # preencha as chaves do LiveKit e do Supabase
sudo chmod 600 .env           # so o dono le o segredo
```

> **Formato do `.env`:** o systemd le esse arquivo direto, e ele e mais rigido
> que o shell — escreva `CHAVE=valor` sem aspas, sem espaco em volta do `=` e
> sem `export`. Comentario com `#` no comeco da linha pode.

Confira que subiu antes de virar servico:

```bash
sudo -u convorax npm start
# outro terminal:
curl localhost:3001/health     # {"ok":true,...}
```

Se faltar alguma variavel, ele sai na hora dizendo exatamente qual.

`Ctrl+C` e siga para o systemd.

### Servico systemd

`/etc/systemd/system/convorax-api.service`:

```ini
[Unit]
Description=Convorax - backend de tokens
After=network.target

[Service]
Type=simple
User=convorax
Group=convorax
WorkingDirectory=/opt/convorax/app/backend
EnvironmentFile=/opt/convorax/app/backend/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now convorax-api
sudo systemctl status convorax-api
journalctl -u convorax-api -f      # logs ao vivo
```

## 4. Frontend

```bash
cd /opt/convorax/app/frontend
sudo -u convorax npm ci
sudo -u convorax cp .env.example .env
sudo -u convorax nano .env    # confira VITE_API_URL e VITE_LIVEKIT_URL
sudo -u convorax npm run build
```

> O Vite grava as variaveis **dentro do bundle** na hora do build. Mudou o
> `.env` do frontend? Rode `npm run build` de novo — sem isso nada muda.

## 5. nginx

`/etc/nginx/sites-available/convorax`:

```nginx
# --- site ---
server {
    listen 80;
    server_name convorax.space www.convorax.space;

    root /opt/convorax/app/frontend/dist;
    index index.html;

    # SPA: qualquer rota cai no index.html (sem isso, F5 em /?sala=... da 404)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # assets tem hash no nome: pode cachear para sempre
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}

# --- backend ---
server {
    listen 80;
    server_name api.convorax.space;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/convorax /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 6. HTTPS (obrigatorio)

Microfone, camera e compartilhamento de tela **so funcionam em HTTPS**. Sem
certificado o app abre mas ninguem consegue falar.

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d convorax.space -d www.convorax.space -d api.convorax.space
```

O certbot reescreve os blocos do nginx para a porta 443 e instala a renovacao
automatica.

## 7. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

A porta 3001 **nao** e aberta: o backend so e alcancado pelo nginx, de dentro
da propria maquina.

## 8. Atualizar depois de um push

```bash
cd /opt/convorax/app
sudo -u convorax git pull
sudo -u convorax npm --prefix backend  ci --omit=dev
sudo systemctl restart convorax-api
sudo -u convorax npm --prefix frontend ci
sudo -u convorax npm --prefix frontend run build
```

O nginx serve `dist/` direto do disco — nao precisa recarregar.

## Conferindo se ficou de pe

```bash
curl https://api.convorax.space/health                  # {"ok":true,...}
curl -i https://api.convorax.space/token?room=x         # 401 (tem que exigir login)
```

No navegador: abrir `https://convorax.space`, criar conta, criar servidor,
entrar na voz. Se o microfone nao aparecer, confira o cadeado do HTTPS.

## Quando algo quebra

| Sintoma | Olhe |
|---|---|
| "Nao foi possivel entrar na call" | `journalctl -u convorax-api -n 50` — provavel chave do LiveKit errada ou CORS |
| Pagina em branco | o `npm run build` rodou? `ls /opt/convorax/app/frontend/dist/index.html` |
| F5 numa sala da 404 | falta o `try_files ... /index.html` no nginx |
| Entra na call mas ninguem se ouve | o site esta em HTTPS? o `VITE_LIVEKIT_URL` aponta para um `wss://` valido? |
| 403 ao entrar na voz | o usuario nao e membro daquele servidor (ou a conta esta banida) |
