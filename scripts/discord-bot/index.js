/**
 * LabelPulse Discord Bot — Beta Community Manager
 *
 * Funzionalità:
 * - Welcome DM ai nuovi membri con link NDA + screening form
 * - Auto-reaction nei canali feedback
 * - Comandi slash: /status, /welcome, @assign-beta
 * - Logging attività in #mod-log
 *
 * Setup: vedi docs/discord-setup-guide.md
 */

require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
  Events,
} = require('discord.js');

// ─── Config ──────────────────────────────────────────────────────
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const BETA_TESTER_ROLE_ID = process.env.BETA_TESTER_ROLE_ID;
const NEWCOMER_ROLE_ID = process.env.NEWCOMER_ROLE_ID;
const FOUNDER_ROLE_ID = process.env.FOUNDER_ROLE_ID;
const SCREENING_FORM_URL = process.env.SCREENING_FORM_URL || 'https://tally.so/r/PENDING';
const NDA_URL = process.env.NDA_URL || 'https://labelpulse.vercel.app/legal/nda';
const APP_VERSION = process.env.APP_VERSION || '2.4.0';

if (!TOKEN) {
  console.error('❌ DISCORD_BOT_TOKEN non configurato. Crea .env da .env.example');
  process.exit(1);
}

// ─── Client Setup ────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ─── Welcome DM ──────────────────────────────────────────────────
async function sendWelcomeDM(member) {
  const embed = new EmbedBuilder()
    .setColor(0x00D084) // Verde LabelPulse
    .setTitle('🎧 Benvenuto in LabelPulse Beta!')
    .setDescription(
      `Ciao **${member.displayName}**! Benvenuto nella beta chiusa di LabelPulse.\n\n` +
      'Per ottenere l\'accesso completo ai canali, segui questi passi:'
    )
    .addFields(
      {
        name: '1️⃣ Firma il NDA',
        value: `Leggi e accetta il NDA: [Firma NDA](${NDA_URL})`,
        inline: false,
      },
      {
        name: '2️⃣ Compila lo screening form',
        value: `Rispondi a 8 domande per aiutarci a capire il tuo profilo: [Screening Form](${SCREENING_FORM_URL})`,
        inline: false,
      },
      {
        name: '3️⃣ Presentati in #benvenuto',
        value: 'Scrivi il tuo nome artistico, il genere che produci e quante demo invii al mese.',
        inline: false,
      },
      {
        name: '4️⃣ Un founder ti assegnerà il ruolo',
        value: 'Dopo la verifica, riceverai il ruolo **Beta Tester** e l\'accesso a tutti i canali.',
        inline: false,
      }
    )
    .addFields({
      name: '🔗 Link utili',
      value: `[App LabelPulse](https://labelpulse.vercel.app) • [Report Bug](https://labelpulse.vercel.app) (usa il bottone in-app)`,
      inline: false,
    })
    .setFooter({ text: `LabelPulse v${APP_VERSION} — Beta Testing Program` })
    .setTimestamp();

  try {
    await member.send({ embeds: [embed] });
    console.log(`✅ Welcome DM inviato a ${member.user.tag}`);
  } catch (err) {
    // DM blocked — post in welcome channel instead
    console.log(`⚠️ DM bloccato per ${member.user.tag}, posto in canale benvenuto`);
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (channel) {
      await channel.send(
        `👋 Ciao ${member}! Non ho potuto inviarti un DM. ` +
        `Leggi le **#regole** e presentati qui per ottenere il ruolo Beta Tester!`
      );
    }
  }
}

// ─── Auto-Reactions ──────────────────────────────────────────────
const AUTO_REACTIONS = {
  'bug-reports': ['🐛', '✅'],
  'feature-requests': ['💡', '👍'],
};

// ─── Slash Commands ──────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Mostra lo stato attuale della beta LabelPulse'),

  new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Re-invia il DM di benvenuto a un membro')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Utente a cui inviare il DM').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('assign-beta')
    .setDescription('Assegna il ruolo Beta Tester a un membro')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Utente da promuovere').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
].map((cmd) => cmd.toJSON());

// ─── Register Commands ──────────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('🔄 Registrazione slash commands...');
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), {
      body: commands,
    });
    console.log('✅ Slash commands registrati');
  } catch (err) {
    console.error('❌ Errore registrazione commands:', err);
  }
}

// ─── Event Handlers ──────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
  console.log(`🤖 LabelPulse Bot online come ${client.user.tag}`);
  console.log(`📡 Server: ${client.guilds.cache.size}`);
  await registerCommands();
});

// New member join → welcome DM + Newcomer role
client.on(Events.GuildMemberAdd, async (member) => {
  console.log(`👋 Nuovo membro: ${member.user.tag}`);

  // Assign Newcomer role
  if (NEWCOMER_ROLE_ID) {
    try {
      await member.roles.add(NEWCOMER_ROLE_ID);
      console.log(`  → Ruolo Newcomer assegnato`);
    } catch (err) {
      console.error(`  ❌ Errore assegnazione ruolo Newcomer:`, err.message);
    }
  }

  // Send welcome DM
  await sendWelcomeDM(member);
});

// Auto-reactions in feedback channels
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const channelName = message.channel.name;
  const reactions = AUTO_REACTIONS[channelName];

  if (reactions) {
    for (const emoji of reactions) {
      try {
        await message.react(emoji);
      } catch (err) {
        // Emoji might not be available, skip silently
      }
    }
  }
});

// Slash command handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, member } = interaction;

  switch (commandName) {
    case 'status': {
      const guild = interaction.guild;
      const memberCount = guild.memberCount;
      const betaTesterRole = guild.roles.cache.get(BETA_TESTER_ROLE_ID);
      const betaTesterCount = betaTesterRole ? betaTesterRole.members.size : 0;

      const embed = new EmbedBuilder()
        .setColor(0x00D084)
        .setTitle('📊 LabelPulse Beta — Status')
        .addFields(
          { name: 'Versione app', value: `v${APP_VERSION}`, inline: true },
          { name: 'Membri server', value: `${memberCount}`, inline: true },
          { name: 'Beta Tester attivi', value: `${betaTesterCount}`, inline: true },
          { name: 'Fase attuale', value: 'FASE 0 — Foundation', inline: true },
          { name: 'Prossimo task', value: 'Punto 0.5 — NDA + Screening Form', inline: true },
          { name: 'URL app', value: 'https://labelpulse.vercel.app', inline: false }
        )
        .setFooter({ text: 'LabelPulse Beta Program' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'welcome': {
      const targetUser = options.getUser('user');
      const targetMember = await interaction.guild.members.fetch(targetUser.id);
      await sendWelcomeDM(targetMember);
      await interaction.reply({
        content: `✅ DM di benvenuto re-inviato a ${targetUser}`,
        ephemeral: true,
      });
      break;
    }

    case 'assign-beta': {
      const targetUser = options.getUser('user');
      const targetMember = await interaction.guild.members.fetch(targetUser.id);

      // Remove Newcomer, add Beta Tester
      if (NEWCOMER_ROLE_ID) {
        await targetMember.roles.remove(NEWCOMER_ROLE_ID);
      }
      await targetMember.roles.add(BETA_TESTER_ROLE_ID);

      await interaction.reply({
        content: `✅ Ruolo **Beta Tester** assegnato a ${targetUser}! Benvenuto nella beta! 🎧`,
        ephemeral: false, // Visible in channel for transparency
      });

      // Log in mod-log channel if it exists
      const modLogChannel = interaction.guild.channels.cache.find(
        (ch) => ch.name === 'mod-log'
      );
      if (modLogChannel) {
        await modLogChannel.send(
          `📋 ${interaction.user} ha assegnato il ruolo Beta Tester a ${targetUser}`
        );
      }
      break;
    }
  }
});

// ─── Start ───────────────────────────────────────────────────────
client.login(TOKEN);
