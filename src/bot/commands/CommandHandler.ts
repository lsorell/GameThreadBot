import {
  Client,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { ScheduleManager } from "../utils/ScheduleManager";
import { ThreadManager } from "../utils/ThreadManager";
import { config } from "../../config";

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
        .setDescription(
          "Manually refresh the game schedule and create pending threads",
        )
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
        console.log("Slash commands registered successfully");
      } else {
        console.error(`Could not find guild with ID: ${config.GUILD_ID}`);
      }
    } catch (error) {
      console.error("Error registering slash commands:", error);
    }
  }

  public async handleInteraction(interaction: any): Promise<void> {
    if (!interaction.isChatInputCommand()) return;

    // Check for moderator role
    const member = interaction.member;
    const modRoleId = config.MODERATOR_ROLE_ID;
    if (!member || !member.roles || !member.roles.cache?.has(modRoleId)) {
      await interaction.reply({
        content:
          "You do not have permission to use this command. Moderator role required.",
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
          await interaction.reply({
            content: "Unknown command",
            ephemeral: true,
          });
      }
    } catch (error) {
      console.error("Error handling interaction:", error);

      const errorMessage =
        "An error occurred while processing your command. Please check the console for details.";

      if (interaction.deferred) {
        await interaction.editReply(errorMessage);
      } else if (!interaction.replied) {
        await interaction.reply({
          content: errorMessage,
          ephemeral: true,
        });
      }
    }
  }

  private async handleRefreshSchedule(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Refresh all schedules and set up per-game cron jobs
      await this.scheduleManager.refreshAllSchedules(this.threadManager);
      await interaction.editReply(
        "✅ Schedule refreshed successfully for all sports!",
      );
    } catch (error) {
      console.error("Error refreshing schedule:", error);
      await interaction.editReply(
        "❌ Error refreshing schedule. Check console for details.",
      );
    }
  }

  private async handleCheckGamesToday(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Get today's games
      const todaysGames = await this.scheduleManager.getTodaysGames();
      let scheduledCount = 0;
      for (const { game, sport } of todaysGames) {
        if (!this.scheduleManager.hasGameDayTask(sport, game.id)) {
          this.scheduleManager.addGameDayTask(sport, game, this.threadManager);
          scheduledCount++;
        }
      }
      // Run the thread check for today
      const threadsCreated =
        await this.threadManager.checkAndCreateTodayThreads();

      let reply = `✅ Checked today's games. Created ${threadsCreated} thread(s).`;
      if (scheduledCount > 0) {
        reply += `\nScheduled ${scheduledCount} new game day cron job(s).`;
      } else {
        reply += `\nNo new game day cron jobs needed.`;
      }
      await interaction.editReply(reply);
    } catch (error) {
      console.error("Error checking today's games:", error);
      await interaction.editReply(
        "❌ Error checking today's games. Check console for details.",
      );
    }
  }

  private async handleBotStatus(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const sports = [
        { key: config.SPORTS.FOOTBALL, name: "Football", emoji: "🏈" },
        {
          key: config.SPORTS.MENS_BASKETBALL,
          name: "Men's Basketball",
          emoji: "🏀",
        },
        {
          key: config.SPORTS.WOMENS_BASKETBALL,
          name: "Women's Basketball",
          emoji: "🏀",
        },
      ];

      const today = new Date().toLocaleString("en-US", {
        timeZone: config.TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

      let upcomingSection = "";
      let todaySection = "";

      for (const { key, name, emoji } of sports) {
        const sportGames = this.scheduleManager.getScheduledGamesBySport(key);

        if (sportGames.length === 0) {
          upcomingSection += `### ${emoji} ${name}:\n- No games tracked\n`;
        } else {
          upcomingSection += `### ${emoji} ${name}:\n`;
          for (const { game } of sportGames) {
            const gameDate = new Date(game.date);
            const dateStr = gameDate.toLocaleDateString("en-US", {
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
          const opponent = this.extractOpponentName(game);
          todaySection += `- ${name}: vs ${opponent}\n`;
        }
      }

      function getNextSundayDate() {
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

      const statusMessage =
        `# 🤖 Bot Status Report\n` +
        `## 📊 Upcoming Games (Tracked)\n` +
        upcomingSection +
        `## 📅 Today's Games\n` +
        `${todaySection || "No games scheduled for today"}\n` +
        `## ⏰ Next Scheduled Refresh\n` +
        `- ${getNextSundayDate()}\n\n` +
        `✅ Bot is running normally`;

      await interaction.editReply(statusMessage);
    } catch (error) {
      console.error("Error getting bot status:", error);
      await interaction.editReply(
        "❌ Error retrieving bot status. Check console for details.",
      );
    }
  }

  private extractOpponentName(game: any): string {
    try {
      const competition = game.competitions?.[0];
      if (!competition) return "Unknown";

      const ksuTeam = competition.competitors?.find(
        (comp: any) =>
          comp.team?.displayName?.includes("Kansas State") ||
          comp.team?.abbreviation === "KSU",
      );

      const opponent = competition.competitors?.find(
        (comp: any) => comp !== ksuTeam,
      );
      return opponent?.team?.displayName || "Unknown";
    } catch {
      return "Unknown";
    }
  }
}
