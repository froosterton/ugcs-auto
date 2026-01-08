const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');

const TOKENS = [
  process.env.DISCORD_TOKEN_1,
  process.env.DISCORD_TOKEN_2,
  process.env.DISCORD_TOKEN_3,
  process.env.DISCORD_TOKEN_4,
  process.env.DISCORD_TOKEN_5,
  process.env.DISCORD_TOKEN_6,
  process.env.DISCORD_TOKEN_7,
  process.env.DISCORD_TOKEN_8,
  process.env.DISCORD_TOKEN_9,
  process.env.DISCORD_TOKEN_10,
].filter(token => token && token.trim() !== '');

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://discord.com/api/webhooks/1456800235715166250/qFw7rxTRuQVqI8-aSflPcuS2EFkWGyO6-w5opCrADq5FG7277gtY7FlW9tFIp2IhApVS';

const clients = [];
const clientTokens = []; // Store tokens with clients for reconnection

async function sendWebhook(accountName, accountAvatar, authorTag, authorId, content, attachments, timestamp) {
  try {
    const embed = {
      title: `On ${accountName}`,
      color: 0x5865F2,
      fields: [
        {
          name: 'From',
          value: `${authorTag} (${authorId})`,
          inline: false
        },
        {
          name: 'Content',
          value: content.substring(0, 1024),
          inline: false
        }
      ],
      thumbnail: {
        url: accountAvatar
      },
      timestamp: new Date().toISOString(),
      footer: {
        text: `Received at ${timestamp}`
      }
    };

    if (attachments && attachments.length > 0) {
      const attachmentList = attachments
        .map((att, idx) => `${idx + 1}. ${att.filename || att.name || 'Unnamed'}`)
        .join('\n');
      embed.fields.push({
        name: `Attachments (${attachments.length})`,
        value: attachmentList.substring(0, 1024),
        inline: false
      });
    }

    await axios.post(WEBHOOK_URL, { embeds: [embed] });
  } catch (error) {
    console.error(`❌ Webhook error:`, error.message);
  }
}

function createClient(token, index) {
  const client = new Client({ checkUpdate: false });

  client.on('ready', () => {
    const accountName = client.user.tag;
    console.log(`✅ Account ${index + 1} ready: ${accountName}`);
  });

  // Process raw events (works on Railway)
  client.on('raw', async (packet) => {
    if (packet.t === 'MESSAGE_CREATE') {
      const data = packet.d;
      
      // Skip server messages
      if (data.guild_id) return;
      
      // Skip bot messages
      if (data.author?.bot) return;
      
      // Skip messages sent BY the token account (only track messages TO the token account)
      if (data.author?.id === client.user?.id) return;

      const timestamp = new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      const authorTag = data.author ? `${data.author.username}#${data.author.discriminator}` : 'Unknown';
      const authorId = data.author?.id || 'Unknown';
      const content = data.content || '*[No text content]*';
      const accountName = client.user.tag;
      const accountAvatar = client.user.displayAvatarURL({ dynamic: true, size: 256 });

      await sendWebhook(accountName, accountAvatar, authorTag, authorId, content, data.attachments, timestamp);
    }
  });

  // Also keep messageCreate as backup (works locally)
  client.on('messageCreate', async (message) => {
    if (message.guild) return;
    if (message.author.bot) return;
    
    // Skip messages sent BY the token account (only track messages TO the token account)
    if (message.author.id === client.user.id) return;

    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    const accountName = client.user.tag;
    const accountAvatar = client.user.displayAvatarURL({ dynamic: true, size: 256 });
    const authorTag = message.author.tag;
    const authorId = message.author.id;
    const content = message.content || '*[No text content]*';
    const attachments = Array.from(message.attachments.values());

    await sendWebhook(accountName, accountAvatar, authorTag, authorId, content, attachments, timestamp);
  });

  client.on('error', (error) => {
    if (error && error.message && (
      error.message.includes("Cannot read properties of null (reading 'all')") ||
      error.message.includes('ClientUserSettingManager')
    )) {
      return;
    }
    console.error(`❌ Discord client error (Account ${index + 1}):`, error.message);
  });

  client.on('disconnect', () => {
    console.log(`⚠️  Account ${index + 1} disconnected from Discord`);
  });

  // Handle reconnection
  client.on('reconnecting', () => {
    console.log(`🔄 Account ${index + 1} reconnecting...`);
  });

  client.on('resume', () => {
    console.log(`✅ Account ${index + 1} resumed connection`);
  });

  return client;
}

// Reconnect function
async function reconnectClient(index, token) {
  try {
    console.log(`🔄 Attempting to reconnect account ${index + 1}...`);
    
    // Destroy old client if it exists
    if (clients[index]) {
      try {
        clients[index].destroy();
      } catch (error) {
        // Ignore destroy errors
      }
    }
    
    // Create new client
    const client = createClient(token, index);
    clients[index] = client;
    
    // Login
    await client.login(token);
    console.log(`✅ Account ${index + 1} reconnected successfully`);
  } catch (error) {
    console.error(`❌ Failed to reconnect account ${index + 1}:`, error.message);
    // Retry after 30 seconds
    setTimeout(() => reconnectClient(index, token), 30000);
  }
}

// Health check - verify all clients are connected
function healthCheck() {
  setInterval(() => {
    TOKENS.forEach((token, index) => {
      const client = clients[index];
      if (!client || !client.user) {
        console.log(`⚠️  Account ${index + 1} appears disconnected, attempting reconnect...`);
        reconnectClient(index, token);
      } else if (!client.ws || client.ws.status !== 0) {
        // Status 0 = READY, other statuses mean disconnected
        console.log(`⚠️  Account ${index + 1} WebSocket status: ${client.ws?.status}, attempting reconnect...`);
        reconnectClient(index, token);
      }
    });
  }, 60000); // Check every minute
}

// Test webhook on startup
async function testWebhook() {
  try {
    await axios.post(WEBHOOK_URL, {
      content: '🔔 DM Monitor started! Monitoring DMs on all accounts...'
    });
    console.log('✅ Webhook test successful\n');
  } catch (error) {
    console.error('❌ Webhook test failed:', error.message);
  }
}

console.log('🚀 Starting DM Monitor...\n');
console.log(`📊 Initializing ${TOKENS.length} account(s)...\n`);

if (TOKENS.length === 0) {
  console.error('❌ No valid tokens found!');
  console.error('   Set DISCORD_TOKEN_1, DISCORD_TOKEN_2, etc. environment variables.');
  process.exit(1);
}

testWebhook();

// Login all clients
TOKENS.forEach((token, index) => {
  try {
    const client = createClient(token, index);
    clients.push(client);
    clientTokens.push(token);
    
    client.login(token).catch(error => {
      console.error(`❌ Failed to login account ${index + 1}:`, error.message);
      // Retry login after 30 seconds
      setTimeout(() => reconnectClient(index, token), 30000);
    });
  } catch (error) {
    console.error(`❌ Error creating client for account ${index + 1}:`, error.message);
  }
});

// Start health check
healthCheck();

process.on('unhandledRejection', (error) => {
  if (error && error.message && (
    error.message.includes("Cannot read properties of null (reading 'all')") ||
    error.message.includes('ClientUserSettingManager')
  )) {
    return;
  }
  console.error('❌ Unhandled promise rejection:', error.message);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down DM monitor...');
  clients.forEach(client => {
    try {
      client.destroy();
    } catch (error) {
      // Ignore errors during shutdown
    }
  });
  process.exit(0);
});

console.log('🔔 Monitoring DMs on all accounts...\n');
