// Import required modules
const express = require("express")
const axios = require("axios")
const fs = require("fs").promises
const path = require("path")

// Create Express app
const app = express()
app.use(express.json())

// Replace with your bot token (use environment variables for production)
const botToken = process.env.TELEGRAM_BOT_TOKEN || "8197031252:AAHCWf8rK-dIoWMVogSDco3zBvJ1U4S4kRk"
const apiUrl = `https://api.telegram.org/bot${botToken}`

// Web app URL - replace with your actual deployed URL
const WEB_APP_URL = process.env.WEB_APP_URL || "https://variety-webapp.vercel.app"

// Files to store data - using /tmp for Vercel compatibility
const CHANNELS_FILE = "/tmp/channels.json"
const ADMINS_FILE = "/tmp/admins.json"
const USERS_FILE = "/tmp/users.json"

// Initialize files if they don't exist
async function initializeFiles() {
  try {
    // Check if files exist, if not create them with default values
    try {
      await fs.access(CHANNELS_FILE)
    } catch {
      await fs.writeFile(CHANNELS_FILE, JSON.stringify([]))
    }

    try {
      await fs.access(ADMINS_FILE)
    } catch {
      await fs.writeFile(ADMINS_FILE, JSON.stringify([]))
    }

    try {
      await fs.access(USERS_FILE)
    } catch {
      await fs.writeFile(USERS_FILE, JSON.stringify({}))
    }
  } catch (error) {
    console.error("Error initializing files:", error)
  }
}

//=======================

// Set the menu button
async function setMenuButton() {
  try {
    const response = await axios.post(`${apiUrl}/setChatMenuButton`, {
      menu_button: {
        type: "commands", // Show the list of commands
      },
    })
    console.log("Menu button set successfully:", response.data)
  } catch (error) {
    console.error("Error setting menu button:", error.response?.data || error.message)
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
    })
    console.log("Commands set successfully:", response.data)
  } catch (error) {
    console.error("Error setting commands:", error.response?.data || error.message)
  }
}

//=============JOINED====
async function hasJoinedChannel(userId, channelUsername) {
  try {
    const response = await axios.get(`${apiUrl}/getChatMember`, {
      params: {
        chat_id: channelUsername,
        user_id: userId,
      },
    })
    const chatMember = response.data.result
    return chatMember.status === "member" || chatMember.status === "administrator" || chatMember.status === "creator"
  } catch (error) {
    console.error(`Error checking if user ${userId} has joined channel ${channelUsername}:`, error)
    return false
  }
}

//==========================
async function sendAndFadeOut(chatId, text, delay = 3000, options = {}) {
  try {
    // Send the message
    const response = await axios.post(`${apiUrl}/sendMessage`, {
      chat_id: chatId,
      text,
      ...options,
    })
    const sentMessage = response.data.result

    // Delete the message after the specified delay
    setTimeout(async () => {
      try {
        await axios.post(`${apiUrl}/deleteMessage`, {
          chat_id: chatId,
          message_id: sentMessage.message_id,
        })
      } catch (error) {
        console.error("Error deleting message:", error)
      }
    }, delay)
  } catch (error) {
    console.error("Error sending message:", error)
  }
}

// Load data from file
async function loadData(filename) {
  try {
    const data = await fs.readFile(filename, "utf8")
    return JSON.parse(data)
  } catch (error) {
    if (error.code === "ENOENT") {
      // File doesn't exist, return empty object or array
      return filename === USERS_FILE ? {} : []
    }
    console.error(`Error loading data from ${filename}:`, error)
    return filename === USERS_FILE ? {} : []
  }
}

// Save data to file
async function saveData(filename, data) {
  try {
    // Ensure directory exists
    const dir = path.dirname(filename)
    try {
      await fs.mkdir(dir, { recursive: true })
    } catch (err) {
      // Ignore if directory already exists
    }
    await fs.writeFile(filename, JSON.stringify(data, null, 2))
  } catch (error) {
    console.error(`Error saving data to ${filename}:`, error)
  }
}

// Load admins from file
async function loadAdmins() {
  try {
    const data = await fs.readFile(ADMINS_FILE, "utf8")
    return JSON.parse(data)
  } catch (error) {
    if (error.code === "ENOENT") {
      // File doesn't exist, return empty array
      return []
    }
    console.error("Error loading admins:", error)
    return []
  }
}

// Save admins to file
async function saveAdmins(admins) {
  try {
    await fs.writeFile(ADMINS_FILE, JSON.stringify(admins, null, 2))
  } catch (error) {
    console.error("Error saving admins:", error)
  }
}

// Check if user is an admin
async function isAdmin(userId) {
  const admins = await loadData(ADMINS_FILE)
  return admins.includes(userId)
}

// Initialize or get user
async function getUser(userId) {
  const users = await loadData(USERS_FILE)
  if (!users[userId]) {
    users[userId] = {
      balance: 10000,
      referrals: 0,
      joinedChannels: false,
      referredBy: null,
      lastClaimDate: null, // Track the last date the user claimed the reward
    }
    await saveData(USERS_FILE, users)
  }
  return users[userId]
}

// Update user data
async function updateUser(userId, userData) {
  const users = await loadData(USERS_FILE)
  users[userId] = { ...users[userId], ...userData }
  await saveData(USERS_FILE, users)

  // Sync with web app
  await syncUserWithWebApp(userId, users[userId])
}

// Function to sync user data with the web app
async function syncUserWithWebApp(userId, userData) {
  try {
    const response = await axios.post(`${WEB_APP_URL}/api/telegram-webhook`, {
      action: "update_user",
      userId,
      data: userData,
    })

    console.log("User data synced with web app:", response.data)
    return response.data
  } catch (error) {
    console.error("Error syncing user data with web app:", error)
    return null
  }
}

// Function to verify if a user has joined a channel via the web app
async function verifyChannelJoin(userId, channelUsername) {
  try {
    const response = await axios.get(`${apiUrl}/getChatMember`, {
      params: {
        chat_id: channelUsername,
        user_id: userId,
      },
    })
    const chatMember = response.data.result
    return ["member", "administrator", "creator"].includes(chatMember.status)
  } catch (error) {
    console.error(`Error verifying channel join for ${channelUsername}:`, error)
    return false
  }
}

// Generate referral link
function generateReferralLink(userId) {
  return `https://t.me/variety_earn_bot?start=ref${userId}`
}

// Generate web app link
function generateWebAppLink(userId) {
  return `${WEB_APP_URL}?userId=${userId}`
}

// Check if user is subscribed to all channels
async function checkSubscriptions(userId) {
  const channels = await loadData(CHANNELS_FILE)
  console.log(`Checking subscriptions for user ${userId} to channels:`, channels)

  for (const channel of channels) {
    try {
      console.log(`Checking subscription for channel: ${channel}`)
      const response = await axios.get(`${apiUrl}/getChatMember`, {
        params: {
          chat_id: channel,
          user_id: userId,
        },
      })
      const chatMember = response.data.result
      console.log(`User status in ${channel}:`, chatMember.status)

      // Check if the user is a member, admin, or creator
      if (!["member", "administrator", "creator"].includes(chatMember.status)) {
        console.log(`User ${userId} is not subscribed to ${channel}`)
        return false
      }
    } catch (error) {
      console.error(`Error checking subscription for ${channel}:`, error)

      // If there's an error, assume the user is not subscribed
      return false
    }
  }

  console.log(`User ${userId} is subscribed to all channels`)
  return true
}

// Create inline keyboard for channels with custom button text
async function createChannelsKeyboard() {
  const channels = await loadData(CHANNELS_FILE)
  const keyboard = channels.map((channel, index) => [
    {
      text: `VARIETY ${index + 1}`, // Custom button text (e.g., VARIETY 1, VARIETY 2)
      url: `https://t.me/${channel.replace("@", "")}`, // Channel link
    },
  ])
  keyboard.push([{ text: "Submit", callback_data: "check_subscriptions" }]) // Submit button
  return {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  }
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
}

// Send message helper function
async function sendMessage(chatId, text, options = {}) {
  try {
    const response = await axios.post(`${apiUrl}/sendMessage`, {
      chat_id: chatId,
      text,
      ...options,
    })
    return response.data.result
  } catch (error) {
    console.error("Error sending message:", error.response?.data || error.message)
    return null
  }
}

// Handle start command
async function handleStart(msg, match) {
  const userId = msg.from.id
  const user = await getUser(userId)
  const referralCode = match ? match[1].trim() : ""

  // Create an inline keyboard with the specified buttons
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💰 Balance", callback_data: "balance" }],
        [{ text: "👥 Referrals", callback_data: "referrals" }],
        [{ text: "🎁 Claim Today's Reward", callback_data: "claim_reward" }],
        [{ text: "🌐 Open Web App", url: generateWebAppLink(userId) }],
        [{ text: "📚 How to Earn", callback_data: "how_to_earn" }],
      ],
    },
  }

  // Check if the user was referred by someone
  if (referralCode.startsWith("ref") && !user.referredBy) {
    const referrerId = referralCode.substring(3)

    // Make sure the referrer exists and is not the same as the user
    if (referrerId !== userId.toString()) {
      const referrer = await getUser(referrerId)

      // Update the referrer's stats
      await updateUser(referrerId, {
        referrals: referrer.referrals + 1,
        balance: referrer.balance + 2000, // Reward for referring a user
      })

      // Update the user's referrer
      await updateUser(userId, {
        referredBy: referrerId,
      })

      // Notify the referrer
      await sendMessage(referrerId, `🎉 You have a new referral! 2000 VAR has been added to your balance.`)
    }
  }

  await sendMessage(
    userId,
    `*Welcome Back, ${msg.from.first_name}!*\nYou've Successfully Joined All channel\n\n` +
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
      `💰 *VARIETY AT THE TOP!* 🚀`,
    {
      parse_mode: "Markdown",
      ...keyboard,
    },
  )
}

// Handle claim command
async function handleClaim(userId) {
  const user = await getUser(userId)
  const today = new Date() // Get today's date as a Date object
  const lastClaimDate = user.lastClaimDate ? new Date(user.lastClaimDate) : null

  // Check if the user has already claimed the reward today
  if (lastClaimDate && lastClaimDate.toDateString() === today.toDateString()) {
    return {
      success: false,
      message: "Today's reward has already been claimed.",
    }
  } else {
    // User hasn't claimed today's reward
    await updateUser(userId, {
      balance: user.balance + 1000, // Add 1000 VAR to the user's balance
      lastClaimDate: today.toISOString(), // Update the last claim date
    })
    return {
      success: true,
      message: `You have successfully claimed today's reward of 1000 VAR! Your new balance is ${user.balance + 1000} VAR.`,
    }
  }
}

// Handle callback queries
async function handleCallbackQuery(callbackQuery) {
  const userId = callbackQuery.from.id
  const chatId = callbackQuery.message.chat.id
  const callbackData = callbackQuery.data

  // Answer the callback query to remove the loading state
  await axios.post(`${apiUrl}/answerCallbackQuery`, {
    callback_query_id: callbackQuery.id,
  })

  if (callbackData === "balance") {
    const user = await getUser(userId)
    await sendMessage(chatId, `💰 Balance: ${user.balance} VAR coins`)
  } else if (callbackData === "referrals") {
    const user = await getUser(userId)
    await sendMessage(chatId, `👥 Referrals: ${user.referrals} people`)
  } else if (callbackData === "claim_reward") {
    const result = await handleClaim(userId)
    await sendMessage(chatId, result.message, {
      reply_markup: mainMenuKeyboard.reply_markup,
    })
  } else if (callbackData === "how_to_earn") {
    const user = await getUser(chatId)
    // Check if the user has already claimed the reward
    if (user.claimedReward) {
      // Notify the user that the reward has already been claimed
      await sendMessage(chatId, "⚠️ You have already claimed your 2000 VAR coins today.")
      return
    }

    // Display a list of platforms with links
    const earningPlatformsKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Follow us on Facebook", url: "https://facebook.com/yourpage" }],
          [{ text: "Follow us on Twitter", url: "https://twitter.com/yourprofile" }],
          [{ text: "Follow us on Instagram", url: "https://instagram.com/yourprofile" }],
          [{ text: "Join our Telegram Channel", url: "https://t.me/varieti02" }],
          // Adding the "Submit" button under the links
          [{ text: "Submit", callback_data: "submit_reward" }],
        ],
      },
    }
    await sendMessage(chatId, "Here are the platforms you can join to earn more:", earningPlatformsKeyboard)
  } else if (callbackData === "join_channel") {
    // Inform the user that they need to follow the channel before clicking submit
    await sendMessage(
      userId,
      'Make sure you have joined the Telegram channel. Once you have joined, click "Submit" to claim your reward.',
    )
  } else if (callbackData === "submit_reward") {
    const channelUsername = "@varieti02" // Replace with your Telegram channel username

    // Check if the user has joined the channel
    const hasJoined = await hasJoinedChannel(userId, channelUsername)
    const user = await getUser(chatId)

    if (hasJoined) {
      // Check if the reward has already been claimed
      if (user.claimedReward) {
        const messageId = callbackQuery.message.message_id
        // Notify the user that the reward has already been claimed
        await sendMessage(userId, "⚠️ You have already claimed your 2000 VAR coins today.")
      } else {
        // Add 2000 VAR coins to the user's balance
        await updateUser(userId, { balance: user.balance + 2000, claimedReward: true })

        // Notify the user
        await sendMessage(
          userId,
          "🎉 You have successfully claimed today's reward! 2000 VAR coins have been added to your balance.",
        )

        // Delete the message with the instructions once the reward is successfully claimed
        await axios.post(`${apiUrl}/deleteMessage`, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
        })
      }
    } else {
      // If the user has not joined the channel, notify them
      await sendMessage(
        userId,
        '⚠️ You must join the Telegram channel before you can claim your reward. Please join and press "Submit" again.',
      )
    }
  } else if (callbackData === "check_subscriptions") {
    console.log(`User ${userId} clicked Submit button`)

    // Check if the user is subscribed to all channels
    const isSubscribed = await checkSubscriptions(userId)
    console.log(`Subscription check result for user ${userId}:`, isSubscribed)

    if (isSubscribed) {
      // Update user as joined channels
      await updateUser(userId, { joinedChannels: true })

      // Notify the user that they've successfully joined all channels
      await sendMessage(userId, "You have successfully joined all required channels!", mainMenuKeyboard)
    } else {
      const channels = await loadData(CHANNELS_FILE)

      // Send the user the list of channels they need to join
      await sendMessage(
        userId,
        `Please make sure to join all channels before submitting:\n${channels.join("\n")}`,
        await createChannelsKeyboard(), // Provide an option to click and join the channels
      )
    }
  }
}

// Handle text messages
async function handleTextMessage(msg) {
  const userId = msg.from.id
  const text = msg.text
  const user = await getUser(userId)

  switch (text) {
    case "💰 Balance":
      await sendMessage(userId, `Your current balance is: ${user.balance} VAR`)
      break

    case "👥 Referrals":
      await sendAndFadeOut(userId, `You have referred ${user.referrals} users.`, 3000)
      break

    case "🔗 My Referral Link":
      const referralLink = generateReferralLink(userId)
      await sendMessage(userId, `Share this link to earn 2000 VAR for each new user: ${referralLink}`)
      break

    case "🎁 Claim Today's Reward":
      const result = await handleClaim(userId)
      await sendMessage(userId, result.message, {
        reply_markup: mainMenuKeyboard.reply_markup,
      })
      break

    case "💳 Add USDT Wallet":
      await sendMessage(userId, "Copy Your USDT Wallet and Paste Here.", {
        reply_markup: mainMenuKeyboard.reply_markup,
      })
      break

    case "🌐 Open Web App":
      const webAppUrl = generateWebAppLink(userId)

      await sendMessage(
        userId,
        `🌐 Access our web app to earn more VAR coins!\n\nClick the button below to open the web app:`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: "Open Web App", url: webAppUrl }]],
          },
        },
      )
      break
  }
}

// Handle admin commands
async function handleAdminCommands(msg) {
  const userId = msg.from.id
  const text = msg.text

  // Check if it's an admin command
  if (text.startsWith("/addadmin") && text.split(" ").length > 1) {
    if (!(await isAdmin(userId))) {
      return sendMessage(userId, "You are not authorized to use this command.")
    }

    const userIdToAdd = Number(text.split(" ")[1])
    const admins = await loadAdmins()

    if (admins.includes(userIdToAdd)) {
      return sendMessage(userId, `User ${userIdToAdd} is already an admin.`)
    }

    admins.push(userIdToAdd)
    await saveAdmins(admins)
    return sendMessage(userId, `User ${userIdToAdd} has been added as an admin.`)
  } else if (text.startsWith("/addchannel") && text.split(" ").length > 1) {
    if (!(await isAdmin(userId))) {
      return sendMessage(userId, "You are not authorized to use this command.")
    }

    const channelToAdd = text.split(" ")[1]
    const channels = await loadData(CHANNELS_FILE)

    if (!channels.includes(channelToAdd)) {
      channels.push(channelToAdd)
      await saveData(CHANNELS_FILE, channels)
      return sendMessage(userId, `Channel ${channelToAdd} has been added successfully.`)
    } else {
      return sendMessage(userId, `Channel ${channelToAdd} is already in the list.`)
    }
  } else if (text.startsWith("/removechannel") && text.split(" ").length > 1) {
    if (!(await isAdmin(userId))) {
      return sendMessage(userId, "You are not authorized to use this command.")
    }

    const channelToRemove = text.split(" ")[1]
    let channels = await loadData(CHANNELS_FILE)
    const initialLength = channels.length

    channels = channels.filter((channel) => channel !== channelToRemove)

    if (channels.length < initialLength) {
      await saveData(CHANNELS_FILE, channels)
      return sendMessage(userId, `Channel ${channelToRemove} has been removed successfully.`)
    } else {
      return sendMessage(userId, `Channel ${channelToRemove} was not found in the list.`)
    }
  } else if (text === "/listchannels") {
    if (!(await isAdmin(userId))) {
      return sendMessage(userId, "You are not authorized to use this command.")
    }

    const channels = await loadData(CHANNELS_FILE)

    if (channels.length > 0) {
      return sendMessage(userId, `Current channels:\n${channels.join("\n")}`)
    } else {
      return sendMessage(userId, "No channels are currently set.")
    }
  } else if (text.startsWith("/userinfo") && text.split(" ").length > 1) {
    if (!(await isAdmin(userId))) {
      return sendMessage(userId, "You are not authorized to use this command.")
    }

    const targetUserId = text.split(" ")[1]
    const users = await loadData(USERS_FILE)
    const user = users[targetUserId]

    if (user) {
      const userInfo = `
User ID: ${targetUserId}
Balance: ${user.balance} VAR
Referrals: ${user.referrals}
Joined Channels: ${user.joinedChannels ? "Yes" : "No"}
Referred By: ${user.referredBy || "None"}
Last Claim Date: ${user.lastClaimDate || "Never"}
Wallet Address: ${user.walletAddress || "Not set"}
      `
      return sendMessage(userId, userInfo)
    } else {
      return sendMessage(userId, "User not found.")
    }
  } else if (text === "/checkchannels") {
    const isSubscribed = await checkSubscriptions(userId)
    return sendMessage(
      userId,
      `Subscription status: ${isSubscribed ? "Subscribed to all channels" : "Not subscribed to all channels"}`,
    )
  }

  return false // Not an admin command
}

// Handle update from Telegram
async function handleUpdate(update) {
  try {
    if (update.message) {
      const msg = update.message

      // Check if it's a command
      if (msg.text && msg.text.startsWith("/")) {
        if (msg.text.startsWith("/start")) {
          const match = msg.text.match(/\/start(.*)/) || [null, ""]
          await handleStart(msg, match)
        } else if (msg.text === "/balance") {
          const user = await getUser(msg.from.id)
          await sendMessage(msg.chat.id, `You have ${user.balance} VAR coins.`)
        } else if (msg.text === "/referrals") {
          const user = await getUser(msg.from.id)
          await sendMessage(msg.chat.id, `You have referred ${user.referrals} users.`)
        } else if (msg.text === "/claim") {
          const result = await handleClaim(msg.from.id)
          await sendMessage(msg.chat.id, result.message, {
            reply_markup: mainMenuKeyboard.reply_markup,
          })
        } else if (msg.text === "/webapp") {
          const webAppUrl = generateWebAppLink(msg.from.id)
          await sendMessage(
            msg.chat.id,
            `🌐 Access our web app to earn more VAR coins!\n\nClick the button below to open the web app:`,
            {
              reply_markup: {
                inline_keyboard: [[{ text: "Open Web App", url: webAppUrl }]],
              },
            },
          )
        } else if (msg.text === "/addaddress") {
          await sendMessage(msg.chat.id, "Copy Your USDT Wallet and Paste Here.", {
            reply_markup: mainMenuKeyboard.reply_markup,
          })
        } else {
          // Check if it's an admin command
          const isAdminCommand = await handleAdminCommands(msg)

          // If not an admin command and not handled above, it's an unknown command
          if (!isAdminCommand) {
            await sendMessage(msg.chat.id, "Unknown command. Try /start to see available commands.")
          }
        }
      }
      // Handle regular text messages
      else if (msg.text) {
        await handleTextMessage(msg)
      }
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query)
    }
  } catch (error) {
    console.error("Error handling update:", error)
  }
}

// Setup webhook
async function setupWebhook() {
  const webhookUrl = process.env.WEBHOOK_URL || ""

  if (!webhookUrl) {
    console.error("WEBHOOK_URL environment variable is not set")
    return false
  }

  try {
    const response = await axios.post(`${apiUrl}/setWebhook`, {
      url: `${webhookUrl}/api/webhook`,
      allowed_updates: ["message", "callback_query"],
    })

    console.log("Webhook set up successfully:", response.data)
    return true
  } catch (error) {
    console.error("Error setting up webhook:", error.response?.data || error.message)
    return false
  }
}

// Initialize the bot
async function initBot() {
  await initializeFiles()
  await setMenuButton()
  await setMyCommands()

  // Set up webhook for Vercel
  const webhookSuccess = await setupWebhook()
  if (webhookSuccess) {
    console.log("Bot initialized successfully with webhook")
  } else {
    console.log("Bot initialized, but webhook setup failed")
  }
}

// Express routes
// Webhook endpoint to receive updates from Telegram
app.post("/api/webhook", async (req, res) => {
  try {
    const update = req.body
    // Process the update asynchronously
    handleUpdate(update).catch(console.error)
    // Respond quickly to Telegram
    res.status(200).send("OK")
  } catch (error) {
    console.error("Error in webhook handler:", error)
    res.status(500).send("Internal Server Error")
  }
})

// Setup endpoint to initialize the bot
app.get("/api/setup", async (req, res) => {
  try {
    await initBot()
    res.status(200).json({ success: true, message: "Bot setup completed successfully" })
  } catch (error) {
    console.error("Error setting up bot:", error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() })
})

// Initialize the bot when the server starts
initBot().catch(console.error)

// Export the Express app for Vercel
module.exports = app

