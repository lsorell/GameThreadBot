import {
  Client,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { ScheduleManager } from "../managers/ScheduleManager";
import { ThreadManager } from "../managers/ThreadManager";
import { config, SPORT_METADATA } from "../../config";
import { extractOpponent } from "../../utils/gameUtils";
import { logger } from "../../utils/logger";

const LOG = "Command";

export class CommandHandler {
  private scheduleManager: ScheduleManager;
  private threadManager: ThreadManager;

  constructor(scheduleManager: ScheduleManager, threadManager: ThreadManager) {
    this.scheduleManager = scheduleManager;
    this.threadManager = threadManager;
  }

  public async registerCommands(client: Client): Promise<void> {
    const commands = [
      new SlashCommandBuilder()
        .setName("refresh-schedule")
        .setDescription("Manually refresh the game schedule and create pending threads")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
      new SlashCommandBuilder()
        .setName("check-games-today")
        .setDescription("Check for games today and create threads if needed")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
      new SlashCommandBuilder()
        .setName("bot-status")
        .setDescription("Check the bot status and schedule information")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    ];

    try {
      const guild = client.guilds.cache.get(config.GUILD_ID);
      if (guild) {
        await guild.commands.set(commands.map((cmd) => cmd.toJSON()));
        logger.info(LOG, "Slash commands registered");
      } else {
        logger.error(LOG, `Could not find guild with ID: ${config.GUILD_ID}`);
      }
    } catch (error) {
      logger.error(LOG, "Error registering slash commands", error);
    }
  }

  public async handleInteraction(interaction: any): Promise<void> {
    if (!interaction.isChatInputCommand()) return;

    const member = interaction.member;
    if (!member?.roles?.cache?.has(config.MODERATOR_ROLE_ID)) {
      await interaction.reply({
        content: "You do not have permission to use this command. Moderator role required.",
        ephemeral: true,
      });
      return;
    }

    try {
      switch (interaction.commandName) {
        case "refresh-schedule":
          await this.handleRefreshSchedule(interaction);
          break;
        case "check-games-today":
          await this.handleCheckGamesToday(interaction);
          break;
        case "bot-status":
          await this.handleBotStatus(interaction);
          break;
        default:
          await interaction.reply({ content: "Unknown command", ephemeral: true });
      }
    } catch (error) {
      logger.error(LOG, `Error handling /${interaction.commandName}`, error);

      const msg = "An error occurred while processing your command. Please check the console for details.";
      if (interaction.deferred) {
        await interaction.editReply(msg);
      } else if (!interaction.replied) {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    }
  }

  private async handleRefreshSchedule(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      await this.scheduleManager.refreshAllSchedules(this.threadManager);
      await interaction.editReply("✅ Schedule refreshed successfully for all sports!");
    } catch (error) {
      logger.error(LOG, "Error refreshing schedule", error);
      await interaction.editReply("❌ Error refreshing schedule. Check console for details.");
    }
  }

  private async handleCheckGamesToday(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const todaysGames = await this.scheduleManager.getTodaysGames();
      let scheduledCount = 0;
      for (const { game, sport } of todaysGames) {
        if (!this.scheduleManager.hasGameDayTask(sport, game.id)) {
          this.scheduleManager.addGameDayTask(sport, game, this.threadManager);
          scheduledCount++;
        }
      }

      const threadsCreated = await this.threadManager.checkAndCreateTodayThreads();

      let reply = `✅ Checked today's games. Created ${threadsCreated} thread(s).`;
      reply += scheduledCount > 0
        ? `\nScheduled ${scheduledCount} new game day cron job(s).`
        : `\nNo new game day cron jobs needed.`;

      await interaction.editReply(reply);
    } catch (error) {
      logger.error(LOG, "Error checking today's games", error);
      await interaction.editReply("❌ Error checking today's games. Check console for details.");
    }
  }

  private async handleBotStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const sportEntries = Object.entries(SPORT_METADATA);

      const today = new Date().toLocaleString("en-US", {
        timeZone: config.TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

      let upcomingSection = "";
      let todaySection = "";

      for (const [sportKey, meta] of sportEntries) {
        const sportGames = this.scheduleManager.getScheduledGamesBySport(sportKey as any);

        if (sportGames.length === 0) {
          upcomingSection += `### ${meta.emoji} ${meta.displayName}:\n- No games tracked\n`;
        } else {
          upcomingSection += `### ${meta.emoji} ${meta.displayName}:\n`;
          for (const { game } of sportGames) {
            const dateStr = new Date(game.date).toLocaleDateString("en-US", {
              year: "2-digit",
              month: "2-digit",
              day: "2-digit",
              timeZone: config.TIMEZONE,
            });
            upcomingSection += `- ${game.shortName} - ${dateStr}\n`;
          }
        }

        const todayGames = sportGames.filter(({ game }) => {
          const gameDateStr = new Date(game.date).toLocaleString("en-US", {
            timeZone: config.TIMEZONE,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          return gameDateStr === today;
        });

        for (const { game } of todayGames) {
          const opponent = extractOpponent(game);
          todaySection += `- ${meta.displayName}: vs ${opponent?.displayName || "Unknown"}\n`;
        }
      }

      const nextSunday = this.getNextSundayLabel();

      const statusMessage =
        `# 🤖 Bot Status Report\n` +
        `## 📊 Upcoming Games (Tracked)\n` +
        upcomingSection +
        `## 📅 Today's Games\n` +
        `${todaySection || "No games tracked for today"}\n` +
        `## ⏰ Next Scheduled Refresh\n` +
        `- ${nextSunday}\n\n` +
        `✅ Bot is running normally`;

      await interaction.editReply(statusMessage);
    } catch (error) {
      logger.error(LOG, "Error getting bot status", error);
      await interaction.editReply("❌ Error retrieving bot status. Check console for details.");
    }
  }

  private getNextSundayLabel(): string {
    const now = new Date();
    const daysToAdd = 7 - now.getDay();
    const nextSunday = new Date(now.getTime());
    nextSunday.setDate(now.getDate() + daysToAdd);
    return (
      nextSunday.toLocaleString("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "long",
        day: "numeric",
      }) + " at 12:01 AM ET"
    );
  }
}
