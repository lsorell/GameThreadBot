import { Client, GatewayIntentBits } from "discord.js";
import { CommandHandler } from "./commands/CommandHandler";
import { ScheduleManager } from "./managers/ScheduleManager";
import { ThreadManager } from "./managers/ThreadManager";
import { config } from "../config";
import { logger } from "../utils/logger";

const LOG = "Bot";

export class GameThreadBot {
  private client: Client;
  private commandHandler: CommandHandler;
  private scheduleManager: ScheduleManager;
  private threadManager: ThreadManager;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.scheduleManager = new ScheduleManager();
    this.threadManager = new ThreadManager(this.client, this.scheduleManager);
    this.commandHandler = new CommandHandler(
      this.scheduleManager,
      this.threadManager,
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once("ready", async () => {
      logger.info(LOG, `Logged in as ${this.client.user?.tag}`);
      await this.commandHandler.registerCommands(this.client);
      this.scheduleManager.startScheduledJobs(this.threadManager);
      logger.info(LOG, "Ready — scheduled jobs running");
    });

    this.client.on("interactionCreate", async (interaction) => {
      if (
        interaction.isButton() &&
        interaction.customId.startsWith("join_thread_")
      ) {
        await this.threadManager.handleJoinThreadButton(interaction);
        return;
      }
      await this.commandHandler.handleInteraction(interaction);
    });

    this.client.on("threadUpdate", async (oldThread, newThread) => {
      if (!oldThread.locked && newThread.locked) {
        await this.threadManager.handleThreadLocked(newThread);
      }
    });

    this.client.on("error", (error) => {
      logger.error(LOG, "Discord client error", error);
    });
  }

  public async start(): Promise<void> {
    try {
      await this.client.login(config.DISCORD_TOKEN);
    } catch (error) {
      logger.error(LOG, "Error starting bot", error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    this.scheduleManager.stopScheduledJobs();
    this.client.destroy();
    logger.info(LOG, "Bot stopped");
  }
}
