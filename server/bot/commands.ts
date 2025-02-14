import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, PermissionsBitField } from "discord.js";
import { storage } from "../storage";
import { log } from "../vite";

export async function handleCommands(message: Message) {
  // Log para debug
  log(`Processando mensagem: ${message.content}`, "discord");

  const lowerContent = message.content.toLowerCase().trim();

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
    log(`Cargos encontrados: ${firstLady.name}, ${antiBan.name}, ${fourUnit.name}`, "discord");

    // Verificar se o guildId existe
    if (!message.guildId) {
      await message.reply("Erro: Não foi possível identificar o servidor!");
      return;
    }

    // Verificar se já existe uma configuração
    const existingConfig = await storage.getGuildConfig(message.guildId);

    let guildConfig;
    if (existingConfig) {
      // Atualizar configuração existente
      guildConfig = await storage.updateGuildConfig(message.guildId, {
        firstLadyRoleId: firstLady.id,
        antiBanRoleId: antiBan.id,
        fourUnitRoleId: fourUnit.id,
      });
      log(`Configuração atualizada para o servidor ${message.guildId}`, "discord");
    } else {
      // Criar nova configuração
      guildConfig = await storage.saveGuildConfig({
        guildId: message.guildId,
        firstLadyRoleId: firstLady.id,
        antiBanRoleId: antiBan.id,
        fourUnitRoleId: fourUnit.id,
      });
      log(`Nova configuração criada para o servidor ${message.guildId}`, "discord");
    }

    await message.reply(
      `Configuração ${existingConfig ? 'atualizada' : 'salva'} com sucesso!\n` +
      `Cargos configurados:\n` +
      `- Primeira Dama: ${firstLady.name}\n` +
      `- Antiban: ${antiBan.name}\n` +
      `- 4un: ${fourUnit.name}`
    );

  } catch (error) {
    log(`Erro ao configurar cargos: ${error}`, "discord");
    await message.reply("Erro ao configurar os cargos. Certifique-se de mencionar os cargos corretamente usando @.");
  }
}

async function handlePanelaMenu(message: Message) {
  try {
    // Verificar se o bot tem as permissões necessárias
    if (!message.guild?.members.me?.permissions.has([
      PermissionsBitField.Flags.ManageRoles,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ViewChannel
    ])) {
      await message.reply("O bot não tem as permissões necessárias! Preciso das permissões: Gerenciar Cargos, Enviar Mensagens, Ver Canal");
      return;
    }

    const config = await storage.getGuildConfig(message.guildId!);

    if (!config) {
      await message.reply("Use hit!panela config primeiro para configurar os cargos!");
      return;
    }

    // Obter contagem de cargos
    const roles = await message.guild.roles.fetch();
    const firstLadyRole = roles.get(config.firstLadyRoleId!);
    const antiBanRole = roles.get(config.antiBanRoleId!);
    const fourUnitRole = roles.get(config.fourUnitRoleId!);

    const firstLadyCount = firstLadyRole?.members.size || 0;
    const antiBanCount = antiBanRole?.members.size || 0;
    const fourUnitCount = fourUnitRole?.members.size || 0;

    const embed = new EmbedBuilder()
      .setTitle("🎮 Sistema de Cargos - Panela")
      .setDescription(
        "**Como usar:**\n\n" +
        "1. Clique em um dos botões abaixo\n" +
        "2. Mencione o usuário que receberá o cargo\n\n" +
        "**Disponível:**\n" +
        `<:anel:1337954327226093598> **Primeira Dama** (${firstLadyCount}/5)\n` +
        `<:martelo:1337267926452932628> **Antiban** (${antiBanCount}/5)\n` +
        `<:cor:1337925018872709230> **4un** (${fourUnitCount}/5)\n\n` +
        "💡 *Dica: Você tem 30 segundos para mencionar o usuário após clicar no botão.*"
      )
      .setThumbnail(message.author.displayAvatarURL())
      .setColor("#2F3136")
      .setTimestamp();

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("primeira-dama")
          .setEmoji({ id: '1337954327226093598', name: 'anel' })
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("antiban")
          .setEmoji({ id: '1337267926452932628', name: 'martelo' })
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("4un")
          .setEmoji({ id: '1337925018872709230', name: 'cor' })
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("ver-membros")
          .setLabel("Ver Membros")
          .setEmoji("👥")
          .setStyle(ButtonStyle.Secondary),
      );

    const closeButton = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("fechar")
          .setLabel("Fechar")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Secondary),
      );

    if (!message.channel || !(message.channel instanceof TextChannel)) {
      await message.reply("Este comando só pode ser usado em canais de texto!");
      return;
    }

    try {
      const sentMessage = await message.channel.send({
        embeds: [embed],
        components: [buttons, closeButton],
      });
      log(`Menu enviado com sucesso. ID da mensagem: ${sentMessage.id}`, "discord");
    } catch (error) {
      log(`Erro ao enviar mensagem: ${error}`, "discord");
      await message.reply("Não foi possível enviar a mensagem no canal. Verifique as permissões do bot.");
    }
  } catch (error) {
    log(`Erro ao criar menu: ${error}`, "discord");
    await message.reply("Ocorreu um erro ao criar o menu. Tente novamente.");
  }
}