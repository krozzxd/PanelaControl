import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { storage } from "../storage";
import { log } from "../vite";

export async function handleCommands(message: Message) {
  // Log para debug
  log(`Mensagem recebida: ${message.content}`, "discord");

  const lowerContent = message.content.toLowerCase().trim(); //Added for case-insensitive command handling

  if (lowerContent.startsWith("hit!panela")) {
    if (lowerContent.includes("config")) {
      await handlePanelaConfig(message);
    } else if (lowerContent === "hit!panela") {
      await handlePanelaMenu(message);
    }
  }
}

async function handlePanelaConfig(message: Message) {
  try {
    if (!message.member?.permissions.has("Administrator")) {
      await message.reply("Você precisa ser administrador para usar este comando!");
      return;
    }

    // Log para debug
    log(`Processando comando config - Mensagem: ${message.content}`, "discord");
    log(`Menções de cargos: ${JSON.stringify(Array.from(message.mentions.roles.values()).map(r => r.name))}`, "discord");

    const roles = Array.from(message.mentions.roles.values());

    if (roles.length !== 3) {
      await message.reply(
        "Use: hit!panela config @primeira-dama @antiban @4un\n" +
        "Certifique-se de mencionar exatamente 3 cargos!"
      );
      return;
    }

    const [firstLady, antiBan, fourUnit] = roles;

    // Log para debug
    log(`Cargos identificados: ${firstLady.name}, ${antiBan.name}, ${fourUnit.name}`, "discord");

    const guildConfig = {
      guildId: message.guildId!,
      firstLadyRoleId: firstLady.id,
      antiBanRoleId: antiBan.id,
      fourUnitRoleId: fourUnit.id,
    };

    await storage.saveGuildConfig(guildConfig);

    await message.reply(`Configuração salva com sucesso!\nCargos configurados:\n- Primeira Dama: ${firstLady.name}\n- Antiban: ${antiBan.name}\n- 4un: ${fourUnit.name}`);
  } catch (error) {
    log(`Erro ao configurar cargos: ${error}`, "discord");
    await message.reply("Erro ao configurar os cargos. Certifique-se de mencionar os cargos corretamente usando @.");
  }
}

async function handlePanelaMenu(message: Message) {
  try {
    const config = await storage.getGuildConfig(message.guildId!);

    if (!config) {
      await message.reply("Use hit!panela config primeiro para configurar os cargos!");
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🎮 Controle do sistema de panela")
      .setThumbnail(message.author.displayAvatarURL())
      .setColor("#2F3136");

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("primeira-dama")
          .setLabel("Primeira Dama")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("antiban")
          .setLabel("Antiban")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("4un")
          .setLabel("4un")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("ver-membros")
          .setLabel("Ver Membros")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("fechar")
          .setLabel("Fechar")
          .setStyle(ButtonStyle.Danger),
      );

    try {
      await message.channel.send({
        embeds: [embed],
        components: [buttons],
      });
    } catch (error) {
      log(`Erro ao enviar mensagem: ${error}`, "discord");
      await message.reply("Não foi possível enviar a mensagem no canal. Verifique as permissões do bot.");
    }
  } catch (error) {
    log(`Erro ao criar menu: ${error}`, "discord");
    await message.reply("Ocorreu um erro ao criar o menu. Tente novamente.");
  }
}