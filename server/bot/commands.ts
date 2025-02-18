import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, PermissionsBitField, Role, GuildMember, Collection } from "discord.js";
import { storage } from "../storage";
import { log } from "../vite";
import { getRoleLimit, setRoleLimit } from "@shared/schema";
import type { GuildConfig } from "@shared/schema";

// Função atualizada para formatar a lista de membros corretamente
function formatMembersList(members: Collection<string, GuildMember> | undefined): string {
  if (!members || members.size === 0) return "• Nenhum membro";
  return Array.from(members.values())
    .map((member: GuildMember) => `• ${member.user.username}`)
    .join("\n");
}

async function handlePanelaAllow(message: Message, args: string[]) {
  try {
    if (message.author.id !== "545716531783532565") {
      const reply = await message.reply("Apenas o dono pode definir permissões!");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    if (message.mentions.roles.size === 0) {
      const reply = await message.reply("Mencione os cargos que poderão usar o comando!");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    const config = await storage.getGuildConfig(message.guildId!);
    if (!config) {
      const reply = await message.reply("Use h!panela config primeiro!");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    const allowedRoles = Array.from(message.mentions.roles.values()).map(role => role.id);

    log(`Atualizando cargos permitidos:
      Cargos antigos: ${config.allowedRoles?.join(", ") || "nenhum"}
      Novos cargos: ${allowedRoles.join(", ")}`, "discord");

    await storage.updateGuildConfig(message.guildId!, { allowedRoles });

    const rolesList = message.mentions.roles.map(role => role.name).join(", ");
    const reply = await message.reply(`Cargos autorizados atualizados: ${rolesList}`);
    setTimeout(() => reply.delete().catch(() => {}), 120000);

    log(`Cargos autorizados atualizados por ${message.author.tag}: ${rolesList}`, "discord");

  } catch (error) {
    log(`Erro ao definir cargos autorizados: ${error}`, "discord");
    const reply = await message.reply("Erro ao definir cargos autorizados. Por favor, tente novamente.");
    setTimeout(() => reply.delete().catch(() => {}), 120000);
  }
}

async function handleCommands(message: Message) {
  log(`Processando mensagem: ${message.content}`, "discord");

  const args = message.content.toLowerCase().trim().split(/\s+/);
  if (args[0] === "h!panela") {
    const config = await storage.getGuildConfig(message.guildId!);

    if (!config) {
      if (args[1] === "config") {
        if (message.author.id !== "545716531783532565") {
          const reply = await message.reply("Apenas o dono pode configurar o bot!");
          setTimeout(() => reply.delete().catch(() => {}), 120000);
          return;
        }
        await handlePanelaConfig(message);
      } else {
        const reply = await message.reply("Use h!panela config primeiro!");
        setTimeout(() => reply.delete().catch(() => {}), 120000);
      }
      return;
    }

    if (args[1] === "config" || args[1] === "allow") {
      if (message.author.id !== "545716531783532565") {
        const reply = await message.reply("Apenas o dono pode usar este comando!");
        setTimeout(() => reply.delete().catch(() => {}), 120000);
        return;
      }
    } else {
      // Se o usuário for o dono, ignorar verificação de cargos
      if (message.author.id !== "545716531783532565") {
        if (config.allowedRoles && config.allowedRoles.length > 0) {
          const hasPermission = message.member?.roles.cache.some(role =>
            config.allowedRoles!.includes(role.id)
          );

          if (!hasPermission) {
            const reply = await message.reply("Você não tem permissão para usar este comando! É necessário ter um dos cargos autorizados.");
            setTimeout(() => reply.delete().catch(() => {}), 120000);
            return;
          }
        } else {
          const reply = await message.reply("Nenhum cargo está autorizado a usar o comando. Peça ao dono para configurar com h!panela allow @cargo");
          setTimeout(() => reply.delete().catch(() => {}), 120000);
          return;
        }
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
      case "us":
        if (args[2] === "allow") {
          await handleUsAllow(message, args.slice(3));
        }
        break;
      default:
        if (args.length === 1) {
          await handlePanelaMenu(message);
        }
    }

    try {
      await message.delete();
      log(`Mensagem do comando apagada: ${message.content}`, "discord");
    } catch (error) {
      log(`Erro ao tentar apagar mensagem do comando: ${error}`, "discord");
    }
  }
}

async function handlePanelaLimit(message: Message, args: string[]) {
  try {
    if (!message.member?.permissions.has("Administrator")) {
      const reply = await message.reply("Apenas administradores podem definir limites!");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    if (args.length !== 3 || message.mentions.roles.size !== 1) {
      const reply = await message.reply(
        "Use: h!panela limit [pd/antiban/us] @cargo número\n" +
        "Exemplo: h!panela limit pd @cargo 5"
      );
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    const config = await storage.getGuildConfig(message.guildId!);
    if (!config) {
      const reply = await message.reply("Use h!panela config primeiro!");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    const [type, , limitStr] = args;
    const role = message.mentions.roles.first();
    const limit = parseInt(limitStr);

    if (!role) {
      const reply = await message.reply("Por favor, mencione um cargo válido!");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    if (isNaN(limit) || limit < 1) {
      const reply = await message.reply("O limite deve ser um número positivo!");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    let targetRoleId: string | null = null;
    switch (type.toLowerCase()) {
      case "pd":
        targetRoleId = config.firstLadyRoleId;
        break;
      case "antiban":
        targetRoleId = config.antiBanRoleId;
        break;
      case "us":
        targetRoleId = config.usRoleId;
        break;
      default:
        const reply = await message.reply("Tipo inválido! Use: pd, antiban ou us");
        setTimeout(() => reply.delete().catch(() => {}), 120000);
        return;
    }

    if (!targetRoleId) {
      const reply = await message.reply(`Cargo ${type} não está configurado!`);
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    const newLimits = setRoleLimit(config, targetRoleId, limit);
    await storage.updateGuildConfig(message.guildId!, { roleLimits: newLimits });

    const reply = await message.reply(`Limite do cargo ${role.name} atualizado para ${limit}!`);
    setTimeout(() => reply.delete().catch(() => {}), 120000);
    log(`Limite do cargo ${role.name} atualizado para ${limit} por ${message.author.tag}`, "discord");

  } catch (error) {
    log(`Erro ao definir limite: ${error}`, "discord");
    const reply = await message.reply("Erro ao definir limite. Por favor, tente novamente.");
    setTimeout(() => reply.delete().catch(() => {}), 120000);
  }
}

async function handleUsAllow(message: Message, args: string[]) {
  try {
    if (!message.member?.permissions.has("Administrator")) {
      const reply = await message.reply("Apenas administradores podem definir permissões do us!");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    if (message.mentions.roles.size === 0) {
      const reply = await message.reply("Mencione os cargos que poderão receber us!");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    const config = await storage.getGuildConfig(message.guildId!);
    if (!config) {
      const reply = await message.reply("Use h!panela config primeiro!");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    // Pegar o cargo us
    const usRole = message.guild?.roles.cache.get(config.usRoleId!);
    if (!usRole) {
      const reply = await message.reply("Cargo us não encontrado!");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    // Configurar permissões do cargo para prevenir manipulação manual
    try {
      await usRole.setPermissions([]);
      await usRole.setMentionable(false);
    } catch (error) {
      log(`Erro ao configurar permissões do cargo us: ${error}`, "discord");
      const reply = await message.reply("Erro ao configurar permissões do cargo us. Certifique-se que o bot tem permissões adequadas.");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    const usAllowedRoles = Array.from(message.mentions.roles.values()).map(role => role.id);
    await storage.updateGuildConfig(message.guildId!, { usAllowedRoles });

    const rolesList = message.mentions.roles.map(role => role.name).join(", ");
    const reply = await message.reply(`Cargos que podem receber us atualizados: ${rolesList}`);
    setTimeout(() => reply.delete().catch(() => {}), 120000);
    log(`Cargos permitidos para us atualizados por ${message.author.tag}: ${rolesList}`, "discord");

  } catch (error) {
    log(`Erro ao definir cargos permitidos para us: ${error}`, "discord");
    const reply = await message.reply("Erro ao definir cargos permitidos para us. Por favor, tente novamente.");
    setTimeout(() => reply.delete().catch(() => {}), 120000);
  }
}

async function handlePanelaConfig(message: Message) {
  try {
    const roles = Array.from(message.mentions.roles.values());

    if (roles.length !== 3) {
      const reply = await message.reply(
        "Use: h!panela config @primeira-dama @antiban @us\n" +
        "Certifique-se de mencionar exatamente 3 cargos!"
      );
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    const [firstLady, antiBan, us] = roles;
    log(`Cargos encontrados: ${firstLady.name}, ${antiBan.name}, ${us.name}`, "discord");

    if (!message.guildId) {
      const reply = await message.reply("Erro: Não foi possível identificar o servidor!");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    // Configurar permissões do cargo us
    try {
      await us.setPermissions([]);
      await us.setMentionable(false);
    } catch (error) {
      log(`Erro ao configurar permissões do cargo us: ${error}`, "discord");
      const reply = await message.reply("Erro ao configurar permissões do cargo us. Certifique-se que o bot tem permissões adequadas.");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    const existingConfig = await storage.getGuildConfig(message.guildId);

    let guildConfig;
    if (existingConfig) {
      guildConfig = await storage.updateGuildConfig(message.guildId, {
        firstLadyRoleId: firstLady.id,
        antiBanRoleId: antiBan.id,
        usRoleId: us.id,
      });
      log(`Configuração atualizada para o servidor ${message.guildId}`, "discord");
    } else {
      guildConfig = await storage.saveGuildConfig({
        guildId: message.guildId,
        firstLadyRoleId: firstLady.id,
        antiBanRoleId: antiBan.id,
        usRoleId: us.id,
        roleLimits: [],
        allowedRoles: [],
        usAllowedRoles: [],
      });
      log(`Nova configuração criada para o servidor ${message.guildId}`, "discord");
    }

    const reply = await message.reply(
      `Configuração ${existingConfig ? 'atualizada' : 'salva'} com sucesso!\n` +
      `Cargos configurados:\n` +
      `- Primeira Dama: ${firstLady.name}\n` +
      `- Antiban: ${antiBan.name}\n` +
      `- Us: ${us.name}`
    );
    setTimeout(() => reply.delete().catch(() => {}), 120000);

  } catch (error) {
    log(`Erro ao configurar cargos: ${error}`, "discord");
    const reply = await message.reply("Erro ao configurar os cargos. Certifique-se de mencionar os cargos corretamente usando @.");
    setTimeout(() => reply.delete().catch(() => {}), 120000);
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
    if (!message.guild?.members.me?.permissions.has([
      PermissionsBitField.Flags.ManageRoles,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ViewChannel
    ])) {
      const reply = await message.reply("O bot não tem as permissões necessárias! Preciso das permissões: Gerenciar Cargos, Enviar Mensagens, Ver Canal");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    const config = await storage.getGuildConfig(message.guildId!);

    if (!config) {
      const reply = await message.reply("Use h!panela config primeiro para configurar os cargos!");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    if (config.allowedRoles && config.allowedRoles.length > 0) {
      const hasPermission = message.member?.roles.cache.some(role =>
        config.allowedRoles!.includes(role.id)
      );

      if (!hasPermission && message.author.id !== "545716531783532565") {
        const reply = await message.reply("Você não tem permissão para usar este comando! É necessário ter um dos cargos autorizados.");
        setTimeout(() => reply.delete().catch(() => {}), 120000);
        return;
      }
    } else {
      const reply = await message.reply("Nenhum cargo está autorizado a usar o comando. Peça ao dono para configurar com h!panela allow @cargo");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    const roles = await message.guild.roles.fetch();
    const firstLadyRole = roles.get(config.firstLadyRoleId!);
    const antiBanRole = roles.get(config.antiBanRoleId!);
    const usRole = roles.get(config.usRoleId!);

    const firstLadyCount = firstLadyRole?.members.size || 0;
    const antiBanCount = antiBanRole?.members.size || 0;
    const usCount = usRole?.members.size || 0;

    const firstLadyLimit = getRoleLimit(config, config.firstLadyRoleId!);
    const antiBanLimit = getRoleLimit(config, config.antiBanRoleId!);
    const usLimit = getRoleLimit(config, config.usRoleId!);

    const embed = new EmbedBuilder()
      .setTitle("🎮 Sistema de Cargos - Panela")
      .setDescription(
        "**Como usar:**\n\n" +
        "1. Clique em um dos botões abaixo\n" +
        "2. Mencione o usuário que receberá o cargo\n\n" +
        "**Disponível:**\n" +
        `<:anel:1337954327226093598> **Primeira Dama** (${firstLadyCount}/${firstLadyLimit})\n` +
        `<:martelo:1337267926452932628> **Antiban** (${antiBanCount}/${antiBanLimit})\n` +
        `<:cor:1337925018872709230> **Us** (${usCount}/${usLimit})\n\n` +
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
          .setCustomId("us")
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
      const reply = await message.reply("Este comando só pode ser usado em canais de texto!");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
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
      const reply = await message.reply("Não foi possível enviar a mensagem no canal. Verifique as permissões do bot.");
      setTimeout(() => reply.delete().catch(() => {}), 120000);
    }
  } catch (error) {
    log(`Erro ao criar menu: ${error}`, "discord");
    const reply = await message.reply("Ocorreu um erro ao criar o menu. Tente novamente.");
    setTimeout(() => reply.delete().catch(() => {}), 120000);
  }
}

export { handleCommands };