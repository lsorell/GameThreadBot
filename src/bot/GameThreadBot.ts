import { Client, GatewayIntentBits } from "discord.js";
import { CommandHandler } from "./commands/CommandHandler";
import { ScheduleManager } from "./utils/ScheduleManager";
import { ThreadManager } from "./utils/ThreadManager";
import { config } from "../config";

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
      this.threadManager
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once("ready", async () => {
      console.log(`Bot logged in as ${this.client.user?.tag}`);

      // Register commands
      await this.commandHandler.registerCommands(this.client);

      // Start scheduled jobs
      this.scheduleManager.startScheduledJobs(this.threadManager);

      console.log("Bot is ready and scheduled jobs are running!");
    });

    this.client.on("interactionCreate", async (interaction) => {
      await this.commandHandler.handleInteraction(interaction);
    });

    this.client.on("error", (error) => {
      console.error("Discord client error:", error);
    });
  }

  public async start(): Promise<void> {
    try {
      await this.client.login(config.DISCORD_TOKEN);
    } catch (error) {
      console.error("Error starting bot:", error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    this.scheduleManager.stopScheduledJobs();
    this.client.destroy();
  }
}
