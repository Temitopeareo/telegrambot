const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs").promises;
const axios = require("axios");

// Replace with your bot token (use environment variables for production)
const botToken = "8197031252:AAHCWf8rK-dIoWMVogSDco3zBvJ1U4S4kRk";
const apiUrl = `https://api.telegram.org/bot${botToken}`;
const bot = new TelegramBot(botToken, { polling: true });

// Web app URL - replace with your actual deployed URL
const WEB_APP_URL = "https://variety-webapp.vercel.app";

// Files to store data
const CHANNELS_FILE = "channels.json"; // Store multiple channels here
const ADMINS_FILE = "admins.json";
const USERS_FILE = "users.json";

//=======================

// Set the menu button
async function setMenuButton() {
  try {
    const response = await axios.post(`${apiUrl}/setChatMenuButton`, {
      menu_button: {
        type: "commands", // Show the list of commands
      },
    });
    console.log("Menu button set successfully:", response.data);
  } catch (error) {
    console.error("Error setting menu button:", error.response?.data || error.message);
  }
}

// Set the list of commands
async function setMyCommands() {
  try {
    const response = await axios.post(`${apiUrl}/setMyCommands`, {
      commands: [
        { command: "start", description: "Start the bot" },
        { command: "balance", description: "Check your balance" },
        { command: "referrals", description: "View your referrals" },
        { command: "claim", description: "Claim your daily reward" },
        { command: "addaddress", description: "Add USDT wallet address" },
        { command: "webapp", description: "Open the web app" },
      ],
    });
    console.log("Commands set successfully:", response.data);
  } catch (error) {
    console.error("Error setting commands:", error.response?.data || error.message);
  }
}

// Set up the menu and commands
setMenuButton();
setMyCommands();

//=============JOINED====
async function hasJoinedChannel(userId, channelUsername) {
  try {
    const chatMember = await bot.getChatMember(channelUsername, userId);
    return chatMember.status === 'member' || chatMember.status === 'administrator' || chatMember.status === 'creator';
  } catch (error) {
    console.error(`Error checking if user ${userId} has joined channel ${channelUsername}:`, error);
    return false;
  }
}

//==========================
async function sendAndFadeOut(chatId, text, delay = 3000) {
  try {
    // Send the message
    const sentMessage = await bot.sendMessage(chatId, text);

    // Delete the message after the specified delay
    setTimeout(async () => {
      try {
        await bot.deleteMessage(chatId, sentMessage.message_id);
      } catch (error) {
        console.error("Error deleting message:", error);
      }
    }, delay);
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

// Load data from file
async function loadData(filename) {
  try {
    const data = await fs.readFile(filename, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      // File doesn't exist, return empty object or array
      return filename === USERS_FILE ? {} : [];
    }
    console.error(`Error loading data from ${filename}:`, error);
    return filename === USERS_FILE ? {} : [];
  }
}

// Save data to file
async function saveData(filename, data) {
  try {
    await fs.writeFile(filename, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error saving data to ${filename}:`, error);
  }
}

// Load admins from file
async function loadAdmins() {
  try {
    const data = await fs.readFile(ADMINS_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      // File doesn't exist, return empty array
      return [];
    }
    console.error("Error loading admins:", error);
    return [];
  }
}

// Save admins to file
async function saveAdmins(admins) {
  try {
    await fs.writeFile(ADMINS_FILE, JSON.stringify(admins, null, 2));
  } catch (error) {
    console.error("Error saving admins:", error);
  }
}

// Check if user is an admin
async function isAdmin(userId) {
  const admins = await loadData(ADMINS_FILE);
  return admins.includes(userId);
}

// Initialize or get user
async function getUser(userId) {
  const users = await loadData(USERS_FILE);
  if (!users[userId]) {
    users[userId] = {
      balance: 10000,
      referrals: 0,
      joinedChannels: false,
      referredBy: null,
      lastClaimDate: null, // Track the last date the user claimed the reward
    };
    await saveData(USERS_FILE, users);
  }
  return users[userId];
}

// Update user data
async function updateUser(userId, userData) {
  const users = await loadData(USERS_FILE);
  users[userId] = { ...users[userId], ...userData };
  await saveData(USERS_FILE, users);
  
  // Sync with web app
  await syncUserWithWebApp(userId, users[userId]);
}

// Function to sync user data with the web app
async function syncUserWithWebApp(userId, userData) {
  try {
    const response = await axios.post(`${WEB_APP_URL}/api/telegram-webhook`, {
      action: 'update_user',
      userId,
      data: userData
    });
    
    console.log('User data synced with web app:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error syncing user data with web app:', error);
    return null;
  }
}

// Function to verify if a user has joined a channel via the web app
async function verifyChannelJoin(userId, channelUsername) {
  try {
    const chatMember = await bot.getChatMember(channelUsername, userId);
    return ["member", "administrator", "creator"].includes(chatMember.status);
  } catch (error) {
    console.error(`Error verifying channel join for ${channelUsername}:`, error);
    return false;
  }
}

// Generate referral link
function generateReferralLink(userId) {
  return `https://t.me/variety_earn_bot?start=ref${userId}`;
}

// Generate web app link
function generateWebAppLink(userId) {
  return `${WEB_APP_URL}?userId=${userId}`;
}

// Check if user is subscribed to all channels
async function checkSubscriptions(userId) {
  const channels = await loadData(CHANNELS_FILE);
  console.log(`Checking subscriptions for user ${userId} to channels:`, channels);

  for (const channel of channels) {
    try {
      console.log(`Checking subscription for channel: ${channel}`);
      const chatMember = await bot.getChatMember(channel, userId);
      console.log(`User status in ${channel}:`, chatMember.status);

      // Check if the user is a member, admin, or creator
      if (!["member", "administrator", "creator"].includes(chatMember.status)) {
        console.log(`User ${userId} is not subscribed to ${channel}`);
        return false;
      }
    } catch (error) {
      console.error(`Error checking subscription for ${channel}:`, error);

      // If there's an error, assume the user is not subscribed
      return false;
    }
  }

  console.log(`User ${userId} is subscribed to all channels`);
  return true;
}

// Create inline keyboard for channels with custom button text
async function createChannelsKeyboard() {
  const channels = await loadData(CHANNELS_FILE);
  const keyboard = channels.map((channel, index) => [
    {
      text: `VARIETY ${index + 1}`, // Custom button text (e.g., VARIETY 1, VARIETY 2)
      url: `https://t.me/${channel.replace("@", "")}`, // Channel link
    },
  ]);
  keyboard.push([{ text: "Submit", callback_data: "check_subscriptions" }]); // Submit button
  return {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  };
}

// Main menu keyboard
const mainMenuKeyboard = {
  reply_markup: {
    keyboard: [
      ["💰 Balance", "👥 Referrals"],
      ["🔗 My Referral Link", "⭐ Rate"],
      ["💳 Add USDT Wallet", "🌐 Open Web App"],
      ["🎁 Claim Today's Reward"], // New button for daily reward
    ],
    resize_keyboard: true,
  },
};

// Start command
bot.onText(/\/start(.*)/, async (msg, match) => {
  const userId = msg.from.id;
  const user = await getUser(  async (msg, match) => {
  const userId = msg.from.id;
  const user = await getUser(userId);
  const referralCode = match[1].trim();

  // Create an inline keyboard with the specified buttons
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '💰 Balance', callback_data: 'balance' }],
        [{ text: '👥 Referrals', callback_data: 'referrals' }],
        [{ text: '🎁 Claim Today's Reward', callback_data: 'claim_reward' }],
        [{ text: '🌐 Open Web App', url: generateWebAppLink(userId) }],
        [{ text: '📚 How to Earn', callback_data: 'how_to_earn' }],
      ],
    },
  };

  // Check if the user was referred by someone
  if (referralCode.startsWith('ref') && !user.referredBy) {
    const referrerId = referralCode.substring(3);
    
    // Make sure the referrer exists and is not the same as the user
    if (referrerId !== userId.toString()) {
      const referrer = await getUser(referrerId);
      
      // Update the referrer's stats
      await updateUser(referrerId, {
        referrals: referrer.referrals + 1,
        balance: referrer.balance + 2000, // Reward for referring a user
      });
      
      // Update the user's referrer
      await updateUser(userId, {
        referredBy: referrerId,
      });
      
      // Notify the referrer
      bot.sendMessage(referrerId, `🎉 You have a new referral! 2000 VAR has been added to your balance.`);
    }
  }

  await bot.sendMessage(userId, `*Welcome Back, ${msg.from.first_name}!*\nYou've Successfully Joined All channel\n\n` +
      `"Earn Coins, Grow Your Wallet, and Unlock Rewards! 💰🚀"\n\n` +
      `*Core Features:*\n\n` +
      `1. *Earn Coins Daily* 📅\n` +
      `   - Claim your daily reward of 1000 VAR coins just by checking in!\n\n` +
      `2. *Referral System* 👤\n` +
      `   - Earn 2000 VAR coins for every friend you refer!\n\n` +
      `3. *Complete Tasks for Coins* ✔️\n` +
      `   - Join our Telegram channels, watch ads, or complete surveys to earn more coins.\n\n` +
      `4. *Wallet System* 💳\n` +
      `   - Your VAR coins are safe and secure in your digital wallet.\n\n` +
      `5. *Redeem Rewards* 🎁\n` +
      `   - Redeem your coins for real-world rewards like cash or exclusive perks.\n\n` +
      `6. *Leaderboard* 🏆\n` +
      `   - Climb the leaderboard and win exclusive rewards!\n\n` +
      `*How It Works:*\n\n` +
      `1. *Sign Up*\n` +
      `   - Click the "Start" button and follow the INFO channel to receive a welcome bonus of 10,000 VAR coins! 💯\n\n` +
      `2. *Earn Coins*\n` +
      `   - Claim daily rewards, refer friends, and complete tasks to grow your balance.\n\n` +
      `3. *Track Earnings*\n` +
      `   - Check your balance and transaction history in your wallet.\n\n` +
      `4. *Redeem Rewards*\n` +
      `   - Redeem your coins for amazing rewards once you reach the minimum threshold.\n\n` +
      `💰 *VARIETY AT THE TOP!* 🚀`, {
        parse_mode: 'Markdown',
        ...keyboard
      });
});

// Handle button presses
bot.on('callback_query', async (callbackQuery) => {
  const userId = callbackQuery.from.id;
  const chatId = callbackQuery.message.chat.id;
  const callbackData = callbackQuery.data;

  if (callbackData === 'balance') {
    await bot.answerCallbackQuery(callbackQuery.id, { text: '💰 Your balance is displayed below.' });
    const user = await getUser(userId);
    await bot.sendMessage(chatId, `💰 Balance: ${user.balance} VAR coins`);
  } 
  else if (callbackData === 'referrals') {
    await bot.answerCallbackQuery(callbackQuery.id, { text: '👥 Your referral stats are displayed below.' });
    const user = await getUser(userId);
    await bot.sendMessage(chatId, `👥 Referrals: ${user.referrals} people`);
  } 
  else if (callbackData === 'claim_reward') {   
    const user = await getUser(userId);
    const today = new Date(); // Get today's date as a Date object
    const lastClaimDate = user.lastClaimDate ? new Date(user.lastClaimDate) : null;

    // Check if the user has already claimed the reward today
    if (lastClaimDate && lastClaimDate.toDateString() === today.toDateString()) {
      await bot.sendMessage(userId, "Today's reward has already been claimed.", {
        reply_markup: mainMenuKeyboard.reply_markup,
      });
    } else {
      // User hasn't claimed today's reward
      await updateUser(userId, {
        balance: user.balance + 1000, // Add 1000 VAR to the user's balance
        lastClaimDate: today.toISOString(), // Update the last claim date
      });
      await bot.sendMessage(
        userId,
        `You have successfully claimed today's reward of 1000 VAR! Your new balance is ${user.balance + 1000} VAR.`,
        {
          reply_markup: mainMenuKeyboard.reply_markup,
        },
      );
    }
  } 
  else if (callbackData === 'how_to_earn') {
    const user = await getUser(chatId);
    // Check if the user has already claimed the reward
    if (user.claimedReward) {
      // Notify the user that the reward has already been claimed
      await bot.sendMessage(chatId, '⚠️ You have already claimed your 2000 VAR coins today.');
      return;
    }

    // Display a list of platforms with links
    const earningPlatformsKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Follow us on Facebook', url: 'https://facebook.com/yourpage' }],
          [{ text: 'Follow us on Twitter', url: 'https://twitter.com/yourprofile' }],
          [{ text: 'Follow us on Instagram', url: 'https://instagram.com/yourprofile' }],
          [{ text: 'Join our Telegram Channel', url: 'https://t.me/varieti02' }],
          // Adding the "Submit" button under the links
          [{ text: 'Submit', callback_data: 'submit_reward' }],
        ],
      },
    };
    await bot.sendMessage(chatId, 'Here are the platforms you can join to earn more:', earningPlatformsKeyboard);
  } 
  else if (callbackData === 'join_channel') {
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Please follow the Telegram channel to continue.' });

    // Inform the user that they need to follow the channel before clicking submit
    await bot.sendMessage(userId, 'Make sure you have joined the Telegram channel. Once you have joined, click "Submit" to claim your reward.');
  } 
  else if (callbackData === 'submit_reward') {
    const channelUsername = '@varieti02'; // Replace with your Telegram channel username

    // Check if the user has joined the channel
    const hasJoined = await hasJoinedChannel(userId, channelUsername);
    const user = await getUser(chatId);
    
    if (hasJoined) {
      // Check if the reward has already been claimed
      if (user.claimedReward) {
        const messageId = callbackQuery.message.message_id;
        const chatId = callbackQuery.message.chat.id;
        // Notify the user that the reward has already been claimed
        await bot.sendMessage(userId, '⚠️ You have already claimed your 2000 VAR coins today.');
      } else {
        // Add 2000 VAR coins to the user's balance
        await updateUser(userId, { balance: user.balance + 2000, claimedReward: true });

        // Notify the user
        await bot.sendMessage(userId, '🎉 You have successfully claimed today's reward! 2000 VAR coins have been added to your balance.');

        // Delete the message with the instructions once the reward is successfully claimed
        await bot.deleteMessage(chatId, callbackQuery.message.message_id);
      }
    } else {
      // If the user has not joined the channel, notify them
      await bot.sendMessage(userId, '⚠️ You must join the Telegram channel before you can claim your reward. Please join and press "Submit" again.');
    }
  }
});

// Handle /referrals command
bot.onText(/\/referrals/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await getUser(chatId);
  bot.sendMessage(chatId, `You have referred ${user.referrals} users.`);
});

// Handle /claim command
bot.onText(/\/claim/, async (msg) => {
  const userId = msg.from.id;
  const user = await getUser(userId);
  const today = new Date(); // Get today's date as a Date object
  const lastClaimDate = user.lastClaimDate ? new Date(user.lastClaimDate) : null;

  // Check if the user has already claimed the reward today
  if (lastClaimDate && lastClaimDate.toDateString() === today.toDateString()) {
    sendAndFadeOut(userId, "Today's reward has already been claimed.", 5000, {
      reply_markup: mainMenuKeyboard.reply_markup,
    });
  } else {
    // User hasn't claimed today's reward
    await updateUser(userId, {
      balance: user.balance + 1000, // Add 1000 VAR to the user's balance
      lastClaimDate: today.toISOString(), // Update the last claim date
    });
    await bot.sendMessage(
      userId,
      `You have successfully claimed today's reward of 1000 VAR! Your new balance is ${user.balance + 1000} VAR.`,
      {
        reply_markup: mainMenuKeyboard.reply_markup,
      },
    );
  }
});

// Handle /webapp command to open the web app
bot.onText(/\/webapp/, async (msg) => {
  const userId = msg.from.id;
  const webAppUrl = generateWebAppLink(userId);
  
  await bot.sendMessage(
    userId,
    `🌐 Access our web app to earn more VAR coins!\n\nClick the button below to open the web app:`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Open Web App", url: webAppUrl }]
        ]
      }
    }
  );
});

// Listen for the /addaddress command
bot.onText(/\/addaddress/, (msg) => {
  const chatId = msg.chat.id;

  // Send a message asking for the USDT wallet address
  bot.sendMessage(chatId, "Copy Your USDT Wallet and Paste Here.", {
    reply_markup: mainMenuKeyboard.reply_markup,
  });

  // Listen for the user's response
  bot.once('message', async (msg) => {
    const userId = msg.from.id;
    const walletAddress = msg.text;

    // Update the user's wallet address
    const user = await getUser(userId);
    await updateUser(userId, { walletAddress });

    // Send a confirmation message
    bot.sendMessage(chatId, "Your USDT wallet address has been saved successfully!");
  });
});

// Handle callback queries
bot.on("callback_query", async (callbackQuery) => {
  const userId = callbackQuery.from.id;

  if (callbackQuery.data === "check_subscriptions") {
    console.log(`User ${userId} clicked Submit button`);

    // Check if the user is subscribed to all channels
    const isSubscribed = await checkSubscriptions(userId);
    console.log(`Subscription check result for user ${userId}:`, isSubscribed);

    if (isSubscribed) {
      // Update user as joined channels
      await updateUser(userId, { joinedChannels: true });

      // Respond to the callback query
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: "Successfully joined all channels!",
      });

      // Notify the user that they've successfully joined all channels
      await bot.sendMessage(userId, "You have successfully joined all required channels!", mainMenuKeyboard);

    } else {
      const channels = await loadData(CHANNELS_FILE);

      // Respond to the callback query with alert
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: "Please join all channels before submitting.",
        show_alert: true,
      });

      // Send the user the list of channels they need to join
      await bot.sendMessage(
        userId,
        `Please make sure to join all channels before submitting:\n${channels.join("\n")}`,
        await createChannelsKeyboard() // Provide an option to click and join the channels
      );
    }
  }
});

// Handle button clicks
bot.on("message", async (msg) => {
  const userId = msg.from.id;
  const user = await getUser(userId);

  switch (msg.text) {
    case "💰 Balance":
      await bot.sendMessage(userId, `Your current balance is: ${user.balance} VAR`);
      break;

    case "👥 Referrals":
      sendAndFadeOut(userId, `You have referred ${user.referrals} users.`, 3000);
      break;

    case "🔗 My Referral Link":
      const referralLink = generateReferralLink(userId);
      await bot.sendMessage(userId, `Share this link to earn 2000 VAR for each new user: ${referralLink}`);
      break;

    case "🎁 Claim Today's Reward":
      const today = new Date(); // Get today's date as a Date object
      const lastClaimDate = user.lastClaimDate ? new Date(user.lastClaimDate) : null;

      // Check if the user has already claimed the reward today
      if (lastClaimDate && lastClaimDate.toDateString() === today.toDateString()) {
        await bot.sendMessage(userId, "Today's reward has already been claimed.", {
          reply_markup: mainMenuKeyboard.reply_markup,
        });
      } else {
        // User hasn't claimed today's reward
        await updateUser(userId, {
          balance: user.balance + 1000, // Add 1000 VAR to the user's balance
          lastClaimDate: today.toISOString(), // Update the last claim date
        });
        await bot.sendMessage(
          userId,
          `You have successfully claimed today's reward of 1000 VAR! Your new balance is ${user.balance + 1000} VAR.`,
          {
            reply_markup: mainMenuKeyboard.reply_markup,
          },
        );
      }
      break;
          
    case "💳 Add USDT Wallet":
      const chatId = msg.chat.id;

      bot.sendMessage(chatId, "Copy Your USDT Wallet and Paste Here.", {
        reply_markup: mainMenuKeyboard.reply_markup,
      });

      // Listen for the user's response
      bot.once('message', async (msg) => {
        const userId = msg.from.id;
        const walletAddress = msg.text;

        // Update the user's wallet address
        const user = await getUser(userId);
        await updateUser(userId, { walletAddress });

        // Send a confirmation message
        bot.sendMessage(chatId, "Your USDT wallet address has been saved successfully!");
      });
      break;
      
    case "🌐 Open Web App":
      const webAppUrl = generateWebAppLink(userId);
      
      await bot.sendMessage(
        userId,
        `🌐 Access our web app to earn more VAR coins!\n\nClick the button below to open the web app:`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Open Web App", url: webAppUrl }]
            ]
          }
        }
      );
      break;
  }
});

//===========Add-Admin============
bot.onText(/\/addadmin (\d+)/, async (msg, match) => {
  const adminId = msg.from.id; // ID of the user executing the command
  const userIdToAdd = Number(match[1]); 

  if (!(await isAdmin(adminId))) {
    return bot.sendMessage(adminId, "You are not authorized to use this command.");
  }

  // Load the current list of admins
  const admins = await loadAdmins();

  // Check if the user is already an admin
  if (admins.includes(userIdToAdd)) {
    return bot.sendMessage(adminId, `User ${userIdToAdd} is already an admin.`);
  }

  // Add the user to the admins list
  admins.push(userIdToAdd);
  await saveAdmins(admins);

  // Notify the admin
  bot.sendMessage(adminId, `User ${userIdToAdd} has been added as an admin.`);
});

// Admin command to add a channel
bot.onText(/\/addchannel (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!(await isAdmin(userId))) {
    return bot.sendMessage(userId, "You are not authorized to use this command.");
  }

  const channelToAdd = match[1];
  const channels = await loadData(CHANNELS_FILE);
  if (!channels.includes(channelToAdd)) {
    channels.push(channelToAdd);
    await saveData(CHANNELS_FILE, channels);
    await bot.sendMessage(userId, `Channel ${channelToAdd} has been added successfully.`);
  } else {
    await bot.sendMessage(userId, `Channel ${channelToAdd} is already in the list.`);
  }
});

// Admin command to remove a channel
bot.onText(/\/removechannel (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!(await isAdmin(userId))) {
    return bot.sendMessage(userId, "You are not authorized to use this command.");
  }

  const channelToRemove = match[1];
  let channels = await loadData(CHANNELS_FILE);
  const initialLength = channels.length;
  channels = channels.filter((channel) => channel !== channelToRemove);

  if (channels.length < initialLength) {
    await saveData(CHANNELS_FILE, channels);
    await bot.sendMessage(userId, `Channel ${channelToRemove} has been removed successfully.`);
  } else {
    await bot.sendMessage(userId, `Channel ${channelToRemove} was not found in the list.`);
  }
});

// Admin command to list all channels
bot.onText(/\/listchannels/, async (msg) => {
  const userId = msg.from.id;
  if (!(await isAdmin(userId))) {
    return bot.sendMessage(userId, "You are not authorized to use this command.");
  }

  const channels = await loadData(CHANNELS_FILE);
  if (channels.length > 0) {
    await bot.sendMessage(userId, `Current channels:\n${channels.join("\n")}`);
  } else {
    await bot.sendMessage(userId, "No channels are currently set.");
  }
});

// Admin command to view user info
bot.onText(/\/userinfo (.+)/, async (msg, match) => {
  const adminId = msg.from.id;
  if (!(await isAdmin(adminId))) {
    return bot.sendMessage(adminId, "You are not authorized to use this command.");
  }

  const userId = match[1];
  const users = await loadData(USERS_FILE);
  const user = users[userId];

  if (user) {
    const userInfo = `
User ID: ${userId}
Balance: ${user.balance} VAR
Referrals: ${user.referrals}
Joined Channels: ${user.joinedChannels ? "Yes" : "No"}
Referred By: ${user.referredBy || "None"}
Last Claim Date: ${user.lastClaimDate || "Never"}
Wallet Address: ${user.walletAddress || "Not set"}
    `;
    await bot.sendMessage(adminId, userInfo);
  } else {
    await bot.sendMessage(adminId, "User not found.");
  }
});

// Add this new command to check subscriptions manually (for debugging)
bot.onText(/\/checkchannels/, async (msg) => {
  const userId = msg.from.id;
  const isSubscribed = await checkSubscriptions(userId);
  await bot.sendMessage(
    userId,
    `Subscription status: ${isSubscribed ? "Subscribed to all channels" : "Not subscribed to all channels"}`,
  );
});

console.log("Bot is running...");
