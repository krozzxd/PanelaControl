import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, PermissionsBitField, Role, GuildMember } from "discord.js";
import { storage } from "../storage";
import { log } from "../vite";
import { getRoleLimit, setRoleLimit } from "@shared/schema";
import type { GuildConfig } from "@shared/schema";

async function handleCommands(message: Message) {
  log(`Processando mensagem: ${message.content}`, "discord");

  const args = message.content.toLowerCase().trim().split(/\s+/);
  if (args[0] === "hit!panela") {
    // Verifica se o usuário tem permissão
    const config = await storage.getGuildConfig(message.guildId!);
    if (config?.allowedRoles && config.allowedRoles.length > 0) {
      const hasPermission = message.member?.roles.cache.some(role =>
        config.allowedRoles!.includes(role.id)
      );
      if (!hasPermission && !message.member?.permissions.has("Administrator")) {
        await message.reply("Você não tem permissão para usar este comando!");
        return;
      }
    }

    switch (args[1]) {
      case "config":
        await handlePanelaConfig(message);
        break;
      case "limit":
        await handlePanelaLimit(message, args.slice(2));
        break;
      case "allow":
        await handlePanelaAllow(message, args.slice(2));
        break;
      case "4un":
        if (args[2] === "allow") {
          await handle4unAllow(message, args.slice(3));
        }
        break;
      default:
        if (args.length === 1) {
          await handlePanelaMenu(message);
        }
    }
  }
}

async function handlePanelaLimit(message: Message, args: string[]) {
  try {
    if (!message.member?.permissions.has("Administrator")) {
      await message.reply("Apenas administradores podem definir limites!");
      return;
    }

    if (message.mentions.roles.size !== 1 || args.length !== 1) {
      await message.reply(
        "Use: hit!panela limit @cargo número\n" +
        "Exemplo: hit!panela limit @Primeira-Dama 5"
      );
      return;
    }

    const role = message.mentions.roles.first();
    const limit = parseInt(args[0]);

    if (!role) {
      await message.reply("Por favor, mencione um cargo válido!");
      return;
    }

    if (isNaN(limit) || limit < 1) {
      await message.reply("O limite deve ser um número positivo!");
      return;
    }

    const config = await storage.getGuildConfig(message.guildId!);
    if (!config) {
      await message.reply("Use hit!panela config primeiro!");
      return;
    }

    // Atualizar o limite para o cargo específico
    const newLimits = setRoleLimit(config, role.id, limit);
    await storage.updateGuildConfig(message.guildId!, { roleLimits: newLimits });

    await message.reply(`Limite do cargo ${role.name} atualizado para ${limit}!`);
    log(`Limite do cargo ${role.name} atualizado para ${limit} por ${message.author.tag}`, "discord");

  } catch (error) {
    log(`Erro ao definir limite: ${error}`, "discord");
    await message.reply("Erro ao definir limite. Por favor, tente novamente.");
  }
}

async function handlePanelaAllow(message: Message, args: string[]) {
  try {
    if (!message.member?.permissions.has("Administrator")) {
      await message.reply("Apenas administradores podem definir permissões!");
      return;
    }

    if (message.mentions.roles.size === 0) {
      await message.reply("Mencione os cargos que poderão usar o comando!");
      return;
    }

    const config = await storage.getGuildConfig(message.guildId!);
    if (!config) {
      await message.reply("Use hit!panela config primeiro!");
      return;
    }

    const allowedRoles = Array.from(message.mentions.roles.values()).map(role => role.id);
    await storage.updateGuildConfig(message.guildId!, { allowedRoles });

    const rolesList = message.mentions.roles.map(role => role.name).join(", ");
    await message.reply(`Cargos autorizados atualizados: ${rolesList}`);
    log(`Cargos autorizados atualizados por ${message.author.tag}: ${rolesList}`, "discord");

  } catch (error) {
    log(`Erro ao definir cargos autorizados: ${error}`, "discord");
    await message.reply("Erro ao definir cargos autorizados. Por favor, tente novamente.");
  }
}

async function handle4unAllow(message: Message, args: string[]) {
  try {
    if (!message.member?.permissions.has("Administrator")) {
      await message.reply("Apenas administradores podem definir permissões do 4un!");
      return;
    }

    if (message.mentions.roles.size === 0) {
      await message.reply("Mencione os cargos que poderão receber 4un!");
      return;
    }

    const config = await storage.getGuildConfig(message.guildId!);
    if (!config) {
      await message.reply("Use hit!panela config primeiro!");
      return;
    }

    const fourUnitAllowedRoles = Array.from(message.mentions.roles.values()).map(role => role.id);
    await storage.updateGuildConfig(message.guildId!, { fourUnitAllowedRoles });

    const rolesList = message.mentions.roles.map(role => role.name).join(", ");
    await message.reply(`Cargos que podem receber 4un atualizados: ${rolesList}`);
    log(`Cargos permitidos para 4un atualizados por ${message.author.tag}: ${rolesList}`, "discord");

  } catch (error) {
    log(`Erro ao definir cargos permitidos para 4un: ${error}`, "discord");
    await message.reply("Erro ao definir cargos permitidos para 4un. Por favor, tente novamente.");
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
        roleLimits: [],
        allowedRoles: [],
        fourUnitAllowedRoles: [],
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

function formatRoleInfo(role: Role | undefined | null, config: GuildConfig): string {
  if (!role) return "• Nenhum membro";
  const members = role.members;
  const limit = getRoleLimit(config, role.id);
  const count = members.size;

  if (!members || count === 0) return `• Nenhum membro (0/${limit})`;
  return Array.from(members.values())
    .map((member: GuildMember) => `• ${member.user.username}`)
    .join("\n");
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
        `<:anel:1337954327226093598> **Primeira Dama** (${firstLadyCount}/${getRoleLimit(config, config.firstLadyRoleId!)})\n` +
        `<:martelo:1337267926452932628> **Antiban** (${antiBanCount}/${getRoleLimit(config, config.antiBanRoleId!)})\n` +
        `<:cor:1337925018872709230> **4un** (${fourUnitCount}/${getRoleLimit(config, config.fourUnitRoleId!)})\n\n` +
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
          .setEmoji({ id: '1337509080142450719', name: 'peop' })
          .setStyle(ButtonStyle.Secondary),
      );

    const closeButton = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("fechar")
          .setLabel("Fechar")
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

export { handleCommands };