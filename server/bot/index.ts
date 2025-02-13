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
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.once("ready", () => {
  log(`Bot está pronto! Logado como ${client.user?.tag}`, "discord");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

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

  log(`Interação de botão recebida de ${interaction.user.tag}: ${interaction.customId}`, "discord");

  try {
    await handleButtons(interaction);
  } catch (error) {
    log(`Erro ao processar interação de botão: ${error}`, "discord");
    // Só tenta responder se a interação ainda não foi respondida
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Ocorreu um erro ao processar o botão. Por favor, tente novamente.",
        ephemeral: true
      });
    }
  }
});

// Adiciona handler para erros não tratados
client.on("error", (error) => {
  log(`Erro não tratado no cliente Discord: ${error}`, "discord");
});

export function startBot() {
  client.login(process.env.DISCORD_TOKEN)
    .catch(error => {
      log(`Erro ao fazer login do bot: ${error}`, "discord");
      process.exit(1);
    });
}