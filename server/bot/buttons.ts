import { ButtonInteraction, EmbedBuilder, PermissionsBitField, Message, TextChannel, GuildMember, Collection, GuildMemberRoleManager } from "discord.js";
import { storage } from "../storage";
import { log } from "../vite";
import { getRoleLimit } from "@shared/schema";

// Map para armazenar coletores de atribuição de cargo ativos
const roleAssignmentCollectors = new Map();

export async function handleButtons(interaction: ButtonInteraction) {
  try {
    await interaction.deferUpdate();
    log(`Interação inicial deferida: ${interaction.customId}`, "discord");

    const config = await storage.getGuildConfig(interaction.guildId!);
    if (!config) {
      const reply = await interaction.followUp({
        content: "Configuração não encontrada! Use h!panela config primeiro.",
        ephemeral: true
      });
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    // Verificar permissões do usuário
    if (config.allowedRoles && config.allowedRoles.length > 0) {
      const memberRoles = interaction.member!.roles as GuildMemberRoleManager;
      if (interaction.user.id !== "545716531783532565") {
        const hasPermission = memberRoles.cache.some(role =>
          config.allowedRoles!.includes(role.id)
        );
        if (!hasPermission) {
          const reply = await interaction.followUp({
            content: "Você não tem permissão para usar este comando!",
            ephemeral: true
          });
          setTimeout(() => reply.delete().catch(() => {}), 120000);
          return;
        }
      }
    }

    switch (interaction.customId) {
      case "primeira-dama":
      case "antiban":
      case "us": {
        const buttonConfig = {
          "primeira-dama": {
            roleId: config.firstLadyRoleId,
            name: "Primeira Dama",
          },
          "antiban": {
            roleId: config.antiBanRoleId,
            name: "Antiban",
          },
          "us": {
            roleId: config.usRoleId,
            name: "Us",
          },
        }[interaction.customId];

        if (!buttonConfig.roleId) {
          const reply = await interaction.followUp({
            content: `Cargo ${buttonConfig.name} não configurado!`,
            ephemeral: true
          });
          setTimeout(() => reply.delete().catch(() => {}), 120000);
          return;
        }

        const reply = await interaction.followUp({
          content: `Mencione o usuário que receberá o cargo de ${buttonConfig.name}`,
          ephemeral: true
        });
        setTimeout(() => reply.delete().catch(() => {}), 120000);

        if (interaction.channel instanceof TextChannel) {
          const collectorKey = `${interaction.user.id}-${interaction.customId}`;
          if (roleAssignmentCollectors.has(collectorKey)) {
            roleAssignmentCollectors.get(collectorKey).stop();
          }

          const collector = interaction.channel.createMessageCollector({
            filter: (m: Message) => m.author.id === interaction.user.id && m.mentions.users.size > 0,
            time: 30000,
            max: 1
          });

          roleAssignmentCollectors.set(collectorKey, collector);

          collector.on('collect', async (m: Message) => {
            try {
              const targetUser = m.mentions.users.first();
              if (targetUser) {
                await toggleRole(interaction, buttonConfig.roleId!, buttonConfig.name, targetUser.id);
                await m.delete().catch(() => {
                  log(`Não foi possível deletar a mensagem de menção`, "discord");
                });
              }
            } catch (error) {
              log(`Erro ao processar toggle role: ${error}`, "discord");
              const errorReply = await interaction.followUp({
                content: "Ocorreu um erro ao processar o cargo. Por favor, tente novamente.",
                ephemeral: true
              });
              setTimeout(() => errorReply.delete().catch(() => {}), 120000);
            }
          });

          collector.on('end', (collected, reason) => {
            roleAssignmentCollectors.delete(collectorKey);
            if (collected.size === 0 && reason === 'time') {
              interaction.followUp({
                content: "Tempo esgotado. Por favor, tente novamente.",
                ephemeral: true
              }).then(reply => {
                setTimeout(() => reply.delete().catch(() => {}), 120000);
              });
            }
          });
        }
        break;
      }

      case "ver-membros": {
        try {
          const embed = await createMembersEmbed(interaction);
          const reply = await interaction.followUp({
            embeds: [embed],
            ephemeral: true
          });
          setTimeout(() => reply.delete().catch(() => {}), 120000);
          log(`Lista de membros enviada para ${interaction.user.tag}`, "discord");
        } catch (error) {
          log(`Erro ao processar ver-membros: ${error}`, "discord");
          const errorReply = await interaction.followUp({
            content: "Erro ao mostrar membros. Por favor, tente novamente.",
            ephemeral: true
          });
          setTimeout(() => errorReply.delete().catch(() => {}), 120000);
        }
        break;
      }

      case "fechar": {
        try {
          if (interaction.message.interaction?.user.id !== interaction.user.id &&
              interaction.user.id !== "545716531783532565") {
            const reply = await interaction.followUp({
              content: "Apenas quem criou o menu pode fechá-lo!",
              ephemeral: true
            });
            setTimeout(() => reply.delete().catch(() => {}), 120000);
            return;
          }

          await interaction.message.delete();
          log(`Menu fechado e apagado por ${interaction.user.tag}`, "discord");
        } catch (error) {
          log(`Erro ao fechar menu: ${error}`, "discord");
          const errorReply = await interaction.followUp({
            content: "Erro ao fechar o menu. Por favor, tente novamente.",
            ephemeral: true
          });
          setTimeout(() => errorReply.delete().catch(() => {}), 120000);
        }
        break;
      }
    }
  } catch (error) {
    log(`Erro ao processar botão: ${error}`, "discord");
    try {
      const errorReply = await interaction.followUp({
        content: "Ocorreu um erro ao processar o botão. Por favor, tente novamente.",
        ephemeral: true
      });
      setTimeout(() => errorReply.delete().catch(() => {}), 120000);
    } catch (followUpError) {
      log(`Erro ao enviar mensagem de erro: ${followUpError}`, "discord");
    }
  }
}

async function toggleRole(
  interaction: ButtonInteraction,
  roleId: string,
  roleName: string,
  targetUserId: string
) {
  try {
    if (!interaction.guild) {
      const reply = await interaction.followUp({
        content: "Erro: Servidor não encontrado!",
        ephemeral: true
      });
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    // Verificar se o usuário que clicou tem permissão
    const config = await storage.getGuildConfig(interaction.guildId!);
    if (!config) {
      const reply = await interaction.followUp({
        content: "Configuração não encontrada!",
        ephemeral: true
      });
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    // Verificar permissões do usuário que está tentando adicionar/remover
    if (config.allowedRoles && config.allowedRoles.length > 0) {
      const memberRoles = interaction.member!.roles as GuildMemberRoleManager;
      if (interaction.user.id !== "545716531783532565") { // Se não for o dono
        const hasPermission = memberRoles.cache.some(role =>
          config.allowedRoles!.includes(role.id)
        );
        if (!hasPermission) {
          const reply = await interaction.followUp({
            content: "Você não tem permissão para usar este comando!",
            ephemeral: true
          });
          setTimeout(() => reply.delete().catch(() => {}), 120000);
          return;
        }
      }
    } else {
      const reply = await interaction.followUp({
        content: "Nenhum cargo está autorizado a usar o comando. Peça ao dono para configurar com h!panela allow @cargo",
        ephemeral: true
      });
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    const targetMember = await interaction.guild.members.fetch(targetUserId);
    if (!targetMember) {
      const reply = await interaction.followUp({
        content: "Erro: Usuário mencionado não encontrado no servidor!",
        ephemeral: true
      });
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    const role = await interaction.guild.roles.fetch(roleId);
    if (!role) {
      const reply = await interaction.followUp({
        content: `Erro: Cargo ${roleName} não encontrado!`,
        ephemeral: true
      });
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    // Proteção especial para o cargo us
    if (roleName === "Us") {
      try {
        // Garantir que o cargo ainda está com as permissões corretas
        await role.setPermissions([]);
        await role.setMentionable(false);

        if (config.usAllowedRoles && config.usAllowedRoles.length > 0) {
          const canReceiveUs = targetMember.roles.cache.some(role =>
            config.usAllowedRoles!.includes(role.id)
          );
          if (!canReceiveUs) {
            const reply = await interaction.followUp({
              content: "Este usuário não pode receber o cargo us!",
              ephemeral: true
            });
            setTimeout(() => reply.delete().catch(() => {}), 120000);
            return;
          }
        }
      } catch (error) {
        log(`Erro ao verificar permissões do cargo us: ${error}`, "discord");
        const reply = await interaction.followUp({
          content: "Erro ao verificar permissões do cargo us. Por favor, tente novamente.",
          ephemeral: true
        });
        setTimeout(() => reply.delete().catch(() => {}), 120000);
        return;
      }
    }

    // Verificar se quem está tentando adicionar/remover tem o cargo necessário
    if (!interaction.member?.roles.cache.has(roleId) && interaction.user.id !== "545716531783532565") {
      const reply = await interaction.followUp({
        content: `Você precisa ter o cargo ${roleName} para poder adicioná-lo a outros membros!`,
        ephemeral: true
      });
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    const roleMembers = role.members.size;
    const roleLimit = getRoleLimit(config, roleId);

    if (!targetMember.roles.cache.has(roleId) && roleMembers >= roleLimit) {
      const reply = await interaction.followUp({
        content: `Limite de ${roleLimit} membros atingido para o cargo ${roleName}!`,
        ephemeral: true
      });
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      return;
    }

    const hasRole = targetMember.roles.cache.has(roleId);
    if (hasRole) {
      await targetMember.roles.remove(role);
      const reply = await interaction.followUp({
        content: `Cargo ${roleName} removido de ${targetMember}! ❌`,
        ephemeral: true
      });
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      log(`Cargo ${roleName} removido do usuário ${targetMember.user.tag} por ${interaction.user.tag}`, "discord");
    } else {
      await targetMember.roles.add(role);
      const reply = await interaction.followUp({
        content: `Cargo ${roleName} adicionado para ${targetMember}! ✅`,
        ephemeral: true
      });
      setTimeout(() => reply.delete().catch(() => {}), 120000);
      log(`Cargo ${roleName} adicionado ao usuário ${targetMember.user.tag} por ${interaction.user.tag}`, "discord");
    }
  } catch (error) {
    log(`Erro ao modificar cargo ${roleName}: ${error}`, "discord");
    const errorReply = await interaction.followUp({
      content: `Erro ao modificar o cargo ${roleName}. Por favor, tente novamente.`,
      ephemeral: true
    });
    setTimeout(() => errorReply.delete().catch(() => {}), 120000);
  }
}

function formatMembersList(members: Collection<string, GuildMember>, requesterRoles: Collection<string, any>): string {
  if (!members || members.size === 0) return "• Nenhum membro";

  // Filtrar apenas os membros que foram adicionados por quem está vendo
  const filteredMembers = members.filter(member => {
    // Se o membro foi adicionado pelo dono, mostrar para todos
    const addedByOwner = member.roles.cache.find(role => 
      role.members.has("545716531783532565")
    );
    if (addedByOwner) return true;

    // Se não, só mostrar se foi adicionado por alguém com o mesmo cargo
    return member.roles.cache.some(role => requesterRoles.has(role.id));
  });

  if (filteredMembers.size === 0) return "• Nenhum membro";

  return Array.from(filteredMembers.values())
    .map((member: GuildMember) => `• ${member.user.username}`)
    .join("\n");
}

async function createMembersEmbed(interaction: ButtonInteraction): Promise<EmbedBuilder> {
  if (!interaction.guild) {
    throw new Error("Servidor não encontrado");
  }

  const config = await storage.getGuildConfig(interaction.guildId!);
  if (!config) {
    throw new Error("Configuração não encontrada");
  }

  // Garantir que estamos pegando os roles do servidor correto
  const roles = await interaction.guild.roles.fetch();
  const firstLadyRole = roles.get(config.firstLadyRoleId!);
  const antiBanRole = roles.get(config.antiBanRoleId!);
  const usRole = roles.get(config.usRoleId!);

  // Verificar se os cargos ainda existem
  if (!firstLadyRole || !antiBanRole || !usRole) {
    throw new Error("Um ou mais cargos configurados não existem mais neste servidor");
  }

  const memberRoles = (interaction.member?.roles as GuildMemberRoleManager).cache;

  // Filtrar membros apenas deste servidor e que foram adicionados pelo usuário que está vendo
  const firstLadyMembers = firstLadyRole.members.filter(member => member.guild.id === interaction.guildId);
  const antiBanMembers = antiBanRole.members.filter(member => member.guild.id === interaction.guildId);
  const usMembers = usRole.members.filter(member => member.guild.id === interaction.guildId);

  const firstLadyCount = firstLadyMembers.size;
  const antiBanCount = antiBanMembers.size;
  const usCount = usMembers.size;

  const firstLadyLimit = getRoleLimit(config, config.firstLadyRoleId!);
  const antiBanLimit = getRoleLimit(config, config.antiBanRoleId!);
  const usLimit = getRoleLimit(config, config.usRoleId!);

  return new EmbedBuilder()
    .setTitle("👥 Membros da Panela")
    .setDescription(
      `<:anel:1337954327226093598> **Primeira Dama** (${firstLadyCount}/${firstLadyLimit})\n${formatMembersList(firstLadyMembers, memberRoles)}\n\n` +
      `<:martelo:1337267926452932628> **Antiban** (${antiBanCount}/${antiBanLimit})\n${formatMembersList(antiBanMembers, memberRoles)}\n\n` +
      `<:cor:1337925018872709230> **Us** (${usCount}/${usLimit})\n${formatMembersList(usMembers, memberRoles)}`
    )
    .setColor("#2F3136")
    .setTimestamp();
}