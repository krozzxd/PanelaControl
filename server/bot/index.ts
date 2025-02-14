import { Client, GatewayIntentBits, Partials, GuildMember, AuditLogEvent, PermissionsBitField, PartialGuildMember } from "discord.js";
import { handleCommands } from "./commands";
import { handleButtons } from "./buttons";
import { log } from "../vite";
import { storage } from "../storage";

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
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildModeration, // Use this instead of GuildAuditLogs
  ],
  partials: [
    Partials.Message, 
    Partials.Channel, 
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember
  ],
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
  log(`Interação recebida de ${interaction.user.tag} - Tipo: ${interaction.type}`, "discord");

  if (interaction.isButton()) {
    log(`Interação de botão recebida - ID: ${interaction.customId}`, "discord");

    try {
      await handleButtons(interaction);
    } catch (error) {
      log(`Erro ao processar interação de botão: ${error}`, "discord");
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "Ocorreu um erro ao processar o botão. Por favor, tente novamente.",
          ephemeral: true
        });
      }
    }
  }
});

// Monitorar mudanças nos cargos dos membros
client.on("guildMemberUpdate", async (oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) => {
  try {
    // Verificar se existe configuração para o servidor
    const config = await storage.getGuildConfig(newMember.guild.id);
    if (!config) return;

    // Lista de cargos protegidos
    const protectedRoles = [
      config.firstLadyRoleId,
      config.antiBanRoleId,
      config.fourUnitRoleId
    ].filter(Boolean) as string[];

    // Se não há cargos protegidos, retorna
    if (protectedRoles.length === 0) return;

    // Verificar se o bot tem as permissões necessárias
    if (!newMember.guild.members.me?.permissions.has([
      PermissionsBitField.Flags.ManageRoles,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ViewChannel
    ])) {
      log(`Bot não tem as permissões necessárias no servidor ${newMember.guild.name}`, "discord");
      return;
    }

    // Se não houve mudanças nos cargos, retorna
    const addedRoles = newMember.roles.cache
      .filter(role => !oldMember.roles.cache.has(role.id))
      .map(role => role.id);

    const removedRoles = oldMember.roles.cache
      .filter(role => !newMember.roles.cache.has(role.id))
      .map(role => role.id);

    if (addedRoles.length === 0 && removedRoles.length === 0) return;

    // Verificar se algum cargo protegido foi alterado
    const protectedAdded = addedRoles.some(roleId => protectedRoles.includes(roleId));
    const protectedRemoved = removedRoles.some(roleId => protectedRoles.includes(roleId));

    if (protectedAdded || protectedRemoved) {
      // Buscar logs de auditoria para verificar quem fez a mudança
      const auditLogs = await newMember.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberRoleUpdate,
        limit: 1,
      });

      const roleUpdateLog = auditLogs.entries.first();

      // Se a mudança foi feita pelo bot, permite
      if (roleUpdateLog?.executor?.id === client.user?.id) {
        log(`Mudança de cargo feita pelo bot para ${newMember.user.tag}`, "discord");
        return;
      }

      log(`Tentativa de alteração manual de cargo protegido detectada para ${newMember.user.tag}`, "discord");

      // Verificar hierarquia de cargos
      const botMember = newMember.guild.members.me;
      if (!botMember) {
        log(`Bot não encontrado no servidor ${newMember.guild.name}`, "discord");
        return;
      }

      // Verificar se o bot pode gerenciar os cargos
      const roles = await newMember.guild.roles.fetch();
      const canManageAllRoles = protectedRoles.every(roleId => {
        const role = roles.get(roleId);
        return role && role.position < botMember.roles.highest.position;
      });

      if (!canManageAllRoles) {
        log(`Bot não tem hierarquia suficiente para gerenciar alguns cargos protegidos`, "discord");
        return;
      }

      // Reverter para os cargos anteriores
      try {
        await newMember.roles.set(oldMember.roles.cache);
        log(`Cargos revertidos com sucesso para ${newMember.user.tag}`, "discord");

        // Tentar notificar no canal
        const channel = newMember.guild.systemChannel;
        if (channel) {
          await channel.send({
            content: `⚠️ Tentativa de modificação manual de cargo protegido detectada.\nOs cargos da Panela só podem ser gerenciados através do bot.`,
          });
        }
      } catch (error) {
        log(`Erro ao reverter cargos para ${newMember.user.tag}: ${error}`, "discord");
      }
    }
  } catch (error) {
    log(`Erro ao processar mudança de cargo: ${error}`, "discord");
  }
});

// Adiciona handler para erros não tratados
client.on("error", (error) => {
  log(`Erro não tratado no cliente Discord: ${error}`, "discord");
});

export function startBot() {
  client.login(process.env.DISCORD_TOKEN)
    .then(() => {
      log("Bot logado com sucesso!", "discord");
    })
    .catch(error => {
      log(`Erro ao fazer login do bot: ${error}`, "discord");
      process.exit(1);
    });
}