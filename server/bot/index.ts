import { Client, GatewayIntentBits, Partials } from "discord.js";
import { handleCommands } from "./commands";
import { handleButtons } from "./buttons";
import { log } from "../vite";

if (!process.env.DISCORD_TOKEN) {
  throw new Error("Missing DISCORD_TOKEN environment variable");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.once("ready", () => {
  log("Bot is ready!", "discord");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Debug log para cada mensagem recebida
  log(`Mensagem recebida de ${message.author.tag}: ${message.content}`, "discord");

  try {
    await handleCommands(message);
  } catch (error) {
    log(`Erro ao processar comando: ${error}`, "discord");
    await message.reply("Ocorreu um erro ao processar o comando. Por favor, tente novamente.");
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  try {
    await handleButtons(interaction);
  } catch (error) {
    log(`Erro ao processar interação de botão: ${error}`, "discord");
    await interaction.reply({
      content: "Ocorreu um erro ao processar o botão. Por favor, tente novamente.",
      ephemeral: true
    });
  }
});

export function startBot() {
  client.login(process.env.DISCORD_TOKEN);
}