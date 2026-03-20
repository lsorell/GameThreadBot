export const config = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN!,
  GUILD_ID: process.env.GUILD_ID!,
  GAME_THREADS_CHANNEL_ID: process.env.GAME_THREADS_CHANNEL_ID!,
  GENERAL_CHANNEL_ID: process.env.GENERAL_CHANNEL_ID!,
  MODERATOR_ROLE_ID: process.env.MODERATOR_ROLE_ID!,

  FOOTBALL_CHANNEL_ID: process.env.FOOTBALL_CHANNEL_ID || "",
  MBB_CHANNEL_ID: process.env.MBB_CHANNEL_ID || "",
  WBB_CHANNEL_ID: process.env.WBB_CHANNEL_ID || "",

  KSU_TEAM_ID: "2306",

  SPORTS: {
    FOOTBALL: "football",
    MENS_BASKETBALL: "mens-basketball",
    WOMENS_BASKETBALL: "womens-basketball",
  } as const,

  ESPN_BASE_URL: "https://site.api.espn.com/apis/site/v2/sports",

  WEEKLY_REFRESH_CRON: "1 0 * * 0", // Sunday 12:01 AM ET
  GAME_DAY_THREAD_HOUR: 8, // 8:00 AM ET = 7:00 AM CT
  TIMEZONE: "America/New_York",
};

/**
 * Single source of truth for per-sport metadata.
 * To add a new sport: add a SPORTS key above, an env var for its channel,
 * and a new entry here. Everything else derives from this map.
 */
export interface SportMetadata {
  displayName: string;
  emoji: string;
  channelId: string;
  espnPath: string;
  createThreads: boolean;
}

export const SPORT_METADATA: Record<string, SportMetadata> = {
  [config.SPORTS.FOOTBALL]: {
    displayName: "Football",
    emoji: "🏈",
    channelId: config.FOOTBALL_CHANNEL_ID,
    espnPath: "football/college-football",
    createThreads: true,
  },
  [config.SPORTS.MENS_BASKETBALL]: {
    displayName: "Men's Basketball",
    emoji: "🏀",
    channelId: config.MBB_CHANNEL_ID,
    espnPath: "basketball/mens-college-basketball",
    createThreads: true,
  },
  [config.SPORTS.WOMENS_BASKETBALL]: {
    displayName: "Women's Basketball",
    emoji: "🏀",
    channelId: config.WBB_CHANNEL_ID,
    espnPath: "basketball/womens-college-basketball",
    createThreads: true,
  },
};

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
