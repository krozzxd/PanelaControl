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
    // Verificar se é o dono do bot
    if (message.author.id !== "545716531783532565") {
      await message.reply("Apenas o dono pode definir permissões!");
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

    log(`Atualizando cargos permitidos:
      Cargos antigos: ${config.allowedRoles?.join(", ") || "nenhum"}
      Novos cargos: ${allowedRoles.join(", ")}`, "discord");

    await storage.updateGuildConfig(message.guildId!, { allowedRoles });

    const rolesList = message.mentions.roles.map(role => role.name).join(", ");
    await message.reply(`Cargos autorizados atualizados: ${rolesList}`);
    log(`Cargos autorizados atualizados por ${message.author.tag}: ${rolesList}`, "discord");

  } catch (error) {
    log(`Erro ao definir cargos autorizados: ${error}`, "discord");
    await message.reply("Erro ao definir cargos autorizados. Por favor, tente novamente.");
  }
}

async function handleCommands(message: Message) {
  log(`Processando mensagem: ${message.content}`, "discord");

  const args = message.content.toLowerCase().trim().split(/\s+/);
  if (args[0] === "hit!panela") {
    const config = await storage.getGuildConfig(message.guildId!);

    // Se não houver configuração, apenas permitir o comando config pelo dono
    if (!config) {
      if (args[1] === "config") {
        if (message.author.id !== "545716531783532565") {
          await message.reply("Apenas o dono pode configurar o bot!");
          return;
        }
        await handlePanelaConfig(message);
      } else {
        await message.reply("Use hit!panela config primeiro!");
      }
      return;
    }

    // Sempre permitir comandos config e allow apenas para o dono
    if (args[1] === "config" || args[1] === "allow") {
      if (message.author.id !== "545716531783532565") {
        await message.reply("Apenas o dono pode usar este comando!");
        return;
      }
    } else {
      // Para outros comandos, verificar se o usuário tem permissão
      if (config.allowedRoles && config.allowedRoles.length > 0) {
        const hasPermission = message.member?.roles.cache.some(role =>
          config.allowedRoles!.includes(role.id)
        );

        log(`Verificando permissões para ${message.author.tag}:
          Cargos permitidos: ${config.allowedRoles.join(", ")}
          Cargos do usuário: ${message.member?.roles.cache.map(r => r.id).join(", ")}
          Tem permissão: ${hasPermission}`, "discord");

        if (!hasPermission) {
          await message.reply("Você não tem permissão para usar este comando! É necessário ter um dos cargos autorizados.");
          return;
        }
      } else {
        log(`Nenhum cargo autorizado configurado no servidor ${message.guild?.name}`, "discord");
        await message.reply("Nenhum cargo está autorizado a usar o comando. Peça ao dono para configurar com hit!panela allow @cargo");
        return;
      }
    }

    // Processar comandos
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

    // Tentar deletar a mensagem do usuário após processar o comando
    try {
      await message.delete();
      log(`Mensagem do comando apagada: ${message.content}`, "discord");
    } catch (error) {
      log(`Erro ao tentar apagar mensagem do comando: ${error}`, "discord");
    }
  }
}

// Atualizar a função handlePanelaLimit
async function handlePanelaLimit(message: Message, args: string[]) {
  try {
    if (!message.member?.permissions.has("Administrator")) {
      await message.reply("Apenas administradores podem definir limites!");
      return;
    }

    if (args.length !== 3 || message.mentions.roles.size !== 1) {
      await message.reply(
        "Use: hit!panela limit [pd/antiban/us] @cargo número\n" +
        "Exemplo: hit!panela limit pd @cargo 5"
      );
      return;
    }

    const config = await storage.getGuildConfig(message.guildId!);
    if (!config) {
      await message.reply("Use hit!panela config primeiro!");
      return;
    }

    const [type, , limitStr] = args;
    const role = message.mentions.roles.first();
    const limit = parseInt(limitStr);

    if (!role) {
      await message.reply("Por favor, mencione um cargo válido!");
      return;
    }

    if (isNaN(limit) || limit < 1) {
      await message.reply("O limite deve ser um número positivo!");
      return;
    }

    // Mapear o tipo para o ID do cargo configurado
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
        await message.reply("Tipo inválido! Use: pd, antiban ou us");
        return;
    }

    if (!targetRoleId) {
      await message.reply(`Cargo ${type} não está configurado!`);
      return;
    }

    // Atualizar o limite para o cargo específico
    const newLimits = setRoleLimit(config, targetRoleId, limit); 
    await storage.updateGuildConfig(message.guildId!, { roleLimits: newLimits });

    await message.reply(`Limite do cargo ${role.name} atualizado para ${limit}!`);
    log(`Limite do cargo ${role.name} atualizado para ${limit} por ${message.author.tag}`, "discord");

  } catch (error) {
    log(`Erro ao definir limite: ${error}`, "discord");
    await message.reply("Erro ao definir limite. Por favor, tente novamente.");
  }
}

async function handleUsAllow(message: Message, args: string[]) {
  try {
    if (!message.member?.permissions.has("Administrator")) {
      await message.reply("Apenas administradores podem definir permissões do us!");
      return;
    }

    if (message.mentions.roles.size === 0) {
      await message.reply("Mencione os cargos que poderão receber us!");
      return;
    }

    const config = await storage.getGuildConfig(message.guildId!);
    if (!config) {
      await message.reply("Use hit!panela config primeiro!");
      return;
    }

    const usAllowedRoles = Array.from(message.mentions.roles.values()).map(role => role.id);
    await storage.updateGuildConfig(message.guildId!, { usAllowedRoles });

    const rolesList = message.mentions.roles.map(role => role.name).join(", ");
    await message.reply(`Cargos que podem receber us atualizados: ${rolesList}`);
    log(`Cargos permitidos para us atualizados por ${message.author.tag}: ${rolesList}`, "discord");

  } catch (error) {
    log(`Erro ao definir cargos permitidos para us: ${error}`, "discord");
    await message.reply("Erro ao definir cargos permitidos para us. Por favor, tente novamente.");
  }
}

async function handlePanelaConfig(message: Message) {
  try {
    const roles = Array.from(message.mentions.roles.values());

    if (roles.length !== 3) {
      await message.reply(
        "Use: hit!panela config @primeira-dama @antiban @us\n" +
        "Certifique-se de mencionar exatamente 3 cargos!"
      );
      return;
    }

    const [firstLady, antiBan, us] = roles;
    log(`Cargos encontrados: ${firstLady.name}, ${antiBan.name}, ${us.name}`, "discord");

    if (!message.guildId) {
      await message.reply("Erro: Não foi possível identificar o servidor!");
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

    await message.reply(
      `Configuração ${existingConfig ? 'atualizada' : 'salva'} com sucesso!\n` +
      `Cargos configurados:\n` +
      `- Primeira Dama: ${firstLady.name}\n` +
      `- Antiban: ${antiBan.name}\n` +
      `- Us: ${us.name}`
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

    // Verificar se o usuário tem permissão para usar o comando
    if (config.allowedRoles && config.allowedRoles.length > 0) {
      const hasPermission = message.member?.roles.cache.some(role =>
        config.allowedRoles!.includes(role.id)
      );

      log(`Verificando permissões no menu para ${message.author.tag}:
        Cargos permitidos: ${config.allowedRoles.join(", ")}
        Cargos do usuário: ${message.member?.roles.cache.map(r => r.id).join(", ")}
        Tem permissão: ${hasPermission}`, "discord");

      if (!hasPermission) {
        await message.reply("Você não tem permissão para usar este comando! É necessário ter um dos cargos autorizados.");
        return;
      }
    } else {
      log(`Nenhum cargo autorizado configurado no servidor ${message.guild?.name}`, "discord");
      await message.reply("Nenhum cargo está autorizado a usar o comando. Peça ao dono para configurar com hit!panela allow @cargo");
      return;
    }

    // Obter contagem de cargos
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