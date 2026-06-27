# LabelPulse Discord Bot

Bot Discord per la gestione della community beta di LabelPulse.

## Setup rapido

```bash
# 1. Installa dipendenze
npm install

# 2. Configura environment
cp .env.example .env
# Modifica .env con i tuoi valori (vedi sotto)

# 3. Avvia il bot
npm start
```

## Configurazione .env

Vedi `.env.example` per la lista completa. I campi obbligatori sono:

| Variabile | Dove trovarla |
|-----------|---------------|
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → tua app → Bot → Token |
| `DISCORD_GUILD_ID` | Clicca destro sul server → Copia ID (serve Developer Mode attivo) |
| `BETA_TESTER_ROLE_ID` | Impostazioni Server → Ruoli → Beta Tester → Copia ID |
| `NEWCOMER_ROLE_ID` | Impostazioni Server → Ruoli → Newcomer → Copia ID |

## Funzionalità

### 🎫 Welcome DM automatico
Quando un nuovo membro entra nel server, il bot:
1. Assegna il ruolo **Newcomer** (accesso limitato ai canali WELCOME)
2. Invia un DM con le istruzioni per diventare Beta Tester
3. Se i DM sono bloccati, posta un messaggio nel canale #benvenuto

### 🤖 Auto-reactions
- Canale `#bug-reports`: aggiunge 🐛 e ✅ automaticamente
- Canale `#feature-requests`: aggiunge 💡 e 👍 automaticamente

### ⌨️ Comandi Slash

| Comando | Permessi | Descrizione |
|---------|----------|-------------|
| `/status` | Tutti | Mostra versione app, numero tester, fase beta |
| `/welcome @user` | Manage Roles | Re-invia il DM di benvenuto a un membro |
| `/assign-beta @user` | Manage Roles | Assegna ruolo Beta Tester (rimuove Newcomer) |

## Deploy su VPS (opzionale, per 24/7)

```bash
# Con PM2
npm install -g pm2
pm2 start index.js --name labelpulse-bot
pm2 save
pm2 startup

# Con systemd
cat > /etc/systemd/system/labelpulse-bot.service << EOF
[Unit]
Description=LabelPulse Discord Bot
After=network.target

[Service]
Type=simple
User=bot
WorkingDirectory=/path/to/scripts/discord-bot
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
systemctl enable labelpulse-bot
systemctl start labelpulse-bot
```

## Troubleshooting

| Problema | Soluzione |
|----------|-----------|
| Bot non risponde | Verifica DISCORD_BOT_TOKEN in .env |
| Slash commands non appaiono | Verifica DISCORD_GUILD_ID + riavvia bot |
| Welcome DM non arriva | Verifica "Server Members Intent" attivo nel Developer Portal |
| Errore "Missing Access" | Verifica permessi bot nel server (Manage Roles) |
