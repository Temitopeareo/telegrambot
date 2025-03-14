// This is the main entry point for Vercel
const app = require("./bot.js")

// Add a simple root route for testing
app.get("/", (req, res) => {
  res.status(200).send("Bot server is running. Go to /api/debug for more information.")
})

// Export the Express app for Vercel
module.exports = app

