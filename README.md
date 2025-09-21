# 3MAW Game Thread Discord Bot

This is a Game Thread scheduling Discord bot for the [3MAW Podcast Discord server](https://www.patreon.com/c/3MAW/).

## What does it do?

The bot automatically creates game threads on game days for Kansas State football, men's basketball, and women's basketball. Over 250+ members use these threads to chat during games. This bot replaces the manual process for moderators, who previously had to create over 100 game threads per sport season.

## Commands

All commands require the user to have the moderator role (see `MODERATOR_ROLE_ID` in your .env file).

| Command              | Description                                                    |
| -------------------- | -------------------------------------------------------------- |
| `/refresh-schedule`  | Manually refresh the game schedule and create pending threads. |
| `/check-games-today` | Check for games today and create threads if needed.            |
| `/bot-status`        | Check the bot status and schedule information.                 |

## Setup

1. **Clone the repository and install dependencies:**

   ```sh
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
   cd GameThreadBot
   npm install
   ```

2. **Configure your `.env` file:**

   See the provided `.env` example. You will need your Discord bot token, guild ID, channel IDs, and your moderator role ID:

   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   GUILD_ID=your_server_guild_id_here
   GAME_THREADS_CHANNEL_ID=your_game_threads_channel_id
   GENERAL_CHANNEL_ID=your_3maw_general_channel_id
   MODERATOR_ROLE_ID=your_moderator_role_id
   ```

3. **Build and run the bot:**
   ```sh
   npm run build
   npm start
   ```

## License

MIT

---

This project is not affiliated with Kansas State University
