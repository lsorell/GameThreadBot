export const config = {
  // Discord Configuration
  DISCORD_TOKEN: process.env.DISCORD_TOKEN!,
  GUILD_ID: process.env.GUILD_ID!,
  GAME_THREADS_CHANNEL_ID: process.env.GAME_THREADS_CHANNEL_ID!,
  GENERAL_CHANNEL_ID: process.env.GENERAL_CHANNEL_ID!,
  MODERATOR_ROLE_ID: process.env.MODERATOR_ROLE_ID!,

  // Sport-specific channel IDs (optional — game-time alerts skip if unset)
  FOOTBALL_CHANNEL_ID: process.env.FOOTBALL_CHANNEL_ID || "",
  MBB_CHANNEL_ID: process.env.MBB_CHANNEL_ID || "",
  WBB_CHANNEL_ID: process.env.WBB_CHANNEL_ID || "",

  // Kansas State team ID on ESPN
  KSU_TEAM_ID: "2306",

  // Sports configuration
  SPORTS: {
    FOOTBALL: "football",
    MENS_BASKETBALL: "mens-basketball",
    WOMENS_BASKETBALL: "womens-basketball",
  } as const,

  // ESPN API URLs
  ESPN_BASE_URL: "https://site.api.espn.com/apis/site/v2/sports",

  // Scheduling
  WEEKLY_REFRESH_CRON: "1 0 * * 0", // Sunday 12:01 AM ET
  GAME_DAY_THREAD_HOUR: 8, // 8:00 AM ET = 7:00 AM CT
  TIMEZONE: "America/New_York",
};


// Validate required environment variables
const requiredEnvVars = [
  "DISCORD_TOKEN",
  "GUILD_ID",
  "GAME_THREADS_CHANNEL_ID",
  "GENERAL_CHANNEL_ID",
  "MODERATOR_ROLE_ID",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
