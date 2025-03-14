# Telegram Bot on Vercel

This project is a Telegram bot designed to run on Vercel's serverless platform.

## Setup Instructions

1. **Create a Telegram Bot**:
   - Talk to [@BotFather](https://t.me/botfather) on Telegram
   - Use the `/newbot` command to create a new bot
   - Save the API token provided by BotFather

2. **Deploy to Vercel**:
   - Fork or clone this repository
   - Deploy to Vercel through the Vercel dashboard or CLI

3. **Set Environment Variables**:
   - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token from BotFather
   - `WEBHOOK_URL`: The URL of your deployed Vercel app (e.g., https://your-app.vercel.app)
   - `WEB_APP_URL`: The URL of your web application (if applicable)

4. **Initialize the Webhook**:
   - After deployment, visit `https://your-app.vercel.app/api/setup` to set up the webhook

## How It Works

This bot uses a webhook-based approach instead of long polling, making it compatible with Vercel's serverless functions. When a user interacts with your bot, Telegram sends an update to your webhook endpoint, which processes the request and responds accordingly.

## Features

- User management with balance tracking
- Referral system
- Daily rewards claiming
- Channel subscription verification
- Admin commands
- Web app integration
- USDT wallet address management

## File Storage

Since Vercel functions are stateless, this implementation uses the `/tmp` directory for temporary file storage. For production use, consider implementing a database solution like MongoDB, Firebase, or Supabase.

