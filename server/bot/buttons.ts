import { ButtonInteraction, EmbedBuilder, PermissionsBitField, Message, TextChannel, GuildMember, Collection, GuildMemberRoleManager } from "discord.js";
import { storage } from "../storage";
import { log } from "../vite";
import { getRoleLimit } from "@shared/schema";
import type { GuildConfig } from "@shared/schema";

// Map para armazenar coletores de atribuição de cargo ativos
const roleAssignmentCollectors = new Map();

export async function handleButtons(interaction: ButtonInteraction) {
  try {
    // Verificar permissões do bot
    if (!interaction.guild?.members.me?.permissions.has([
      PermissionsBitField.Flags.ManageRoles,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ViewChannel
    ])) {
      await interaction.reply({
        content: "O bot não tem as permissões necessárias! Preciso das permissões: Gerenciar Cargos, Enviar Mensagens, Ver Canal",
        ephemeral: true
      });
      return;
    }

    // Verificar configuração do servidor
    const config = await storage.getGuildConfig(interaction.guildId!);
    if (!config) {
      await interaction.reply({
        content: "Configuração não encontrada! Use hit!panela config primeiro.",
        ephemeral: true
      });
      return;
    }

    switch (interaction.customId) {
      case "primeira-dama":
      case "antiban":
      case "4un": {
        const buttonConfig = {
          "primeira-dama": {
            roleId: config.firstLadyRoleId,
            name: "Primeira Dama",
          },
          "antiban": {
            roleId: config.antiBanRoleId,
            name: "Antiban",
          },
          "4un": {
            roleId: config.fourUnitRoleId,
            name: "4un",
          },
        }[interaction.customId];

        if (!buttonConfig.roleId) {
          await interaction.reply({
            content: `Cargo ${buttonConfig.name} não configurado!`,
            ephemeral: true
          });
          return;
        }

        // Verificar canal
        if (!(interaction.channel instanceof TextChannel)) {
          await interaction.reply({
            content: "Este comando só pode ser usado em canais de texto!",
            ephemeral: true
          });
          return;
        }

        // Primeiro, deferimos a interação original para manter o botão ativo
        await interaction.deferReply({ ephemeral: true });

        // Enviar mensagem pedindo menção
        const responseMessage = await interaction.editReply({
          content: `Mencione o usuário que receberá o cargo de ${buttonConfig.name}`,
        });

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
          const targetUser = m.mentions.users.first();
          if (targetUser) {
            try {
              await toggleRole(interaction, buttonConfig.roleId!, buttonConfig.name, targetUser.id);
              await m.delete().catch(() => {
                log(`Não foi possível deletar a mensagem de menção`, "discord");
              });
            } catch (error) {
              log(`Erro ao processar toggle role: ${error}`, "discord");
              await interaction.followUp({
                content: "Ocorreu um erro ao processar o cargo. Por favor, tente novamente.",
                ephemeral: true
              }).catch(() => {});
            }
          }
        });

        collector.on('end', (collected, reason) => {
          roleAssignmentCollectors.delete(collectorKey);
          if (collected.size === 0 && reason === 'time') {
            interaction.editReply({
              content: "Tempo esgotado. Por favor, tente novamente.",
            }).catch(() => {});
          }
        });
        break;
      }

      case "ver-membros": {
        // Deferimos a interação para manter o botão ativo
        await interaction.deferReply({ ephemeral: true });

        try {
          log(`Gerando embed de membros para ${interaction.guild.name}`, "discord");
          const embed = await createMembersEmbed(interaction);
          await interaction.editReply({ embeds: [embed] });
          log(`Embed de membros enviado com sucesso para ${interaction.user.tag}`, "discord");
        } catch (error) {
          log(`Erro ao processar ver-membros: ${error}`, "discord");
          await interaction.editReply({
            content: "Erro ao mostrar membros. Por favor, tente novamente.",
          });
        }
        break;
      }

      case "fechar": {
        try {
          // Use deferUpdate instead of deferReply to acknowledge the button interaction
          await interaction.deferUpdate();

          if (interaction.message.deletable) {
            await interaction.message.delete();
            // Send a new ephemeral message instead of editing the original
            await interaction.followUp({ 
              content: "Menu fechado!", 
              ephemeral: true 
            });
            log(`Menu fechado por ${interaction.user.tag}`, "discord");
          }
        } catch (error) {
          log(`Erro ao fechar menu: ${error}`, "discord");
          // If there's an error, try to send a new message
          if (!interaction.replied) {
            await interaction.followUp({
              content: "Erro ao fechar o menu. Tente novamente.",
              ephemeral: true
            });
          }
        }
        break;
      }
    }
  } catch (error) {
    log(`Erro ao processar botão: ${error}`, "discord");
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "Ocorreu um erro ao processar o botão. Por favor, tente novamente.",
          ephemeral: true
        });
      } else {
        await interaction.editReply({
          content: "Ocorreu um erro ao processar o botão. Por favor, tente novamente.",
        });
      }
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
      await interaction.editReply({
        content: "Erro: Servidor não encontrado!",
      });
      return;
    }

    const config = await storage.getGuildConfig(interaction.guildId!);
    if (!config) {
      await interaction.editReply({
        content: "Configuração não encontrada!",
      });
      return;
    }

    // Verifica se o usuário tem permissão para usar o comando
    if (config.allowedRoles && config.allowedRoles.length > 0) {
      const memberRoles = interaction.member!.roles as GuildMemberRoleManager;
      const hasPermission = memberRoles.cache.some(role =>
        config.allowedRoles!.includes(role.id)
      );
      if (!hasPermission && !interaction.memberPermissions?.has("Administrator")) {
        await interaction.editReply({
          content: "Você não tem permissão para usar este comando!",
        });
        return;
      }
    }

    const targetMember = await interaction.guild.members.fetch(targetUserId);
    if (!targetMember) {
      await interaction.editReply({
        content: "Erro: Usuário mencionado não encontrado no servidor!",
      });
      return;
    }

    const role = await interaction.guild.roles.fetch(roleId);
    if (!role) {
      await interaction.editReply({
        content: `Erro: Cargo ${roleName} não encontrado!`,
      });
      return;
    }

    // Verificações específicas para o 4un
    if (roleName === "4un") {
      if (config.fourUnitAllowedRoles && config.fourUnitAllowedRoles.length > 0) {
        const canReceive4un = targetMember.roles.cache.some(role =>
          config.fourUnitAllowedRoles!.includes(role.id)
        );
        if (!canReceive4un) {
          await interaction.editReply({
            content: "Este usuário não pode receber o cargo 4un!",
          });
          return;
        }
      }
    }

    // Verifica limites
    const roleMembers = role.members.size;
    const roleLimit = getRoleLimit(config, roleId);

    if (!targetMember.roles.cache.has(roleId) && roleMembers >= roleLimit) {
      await interaction.editReply({
        content: `Limite de ${roleLimit} membros atingido para o cargo ${roleName}!`,
      });
      return;
    }

    if (!interaction.guild.members.me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      await interaction.editReply({
        content: "Erro: Não tenho permissão para gerenciar cargos!",
      });
      return;
    }

    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      await interaction.editReply({
        content: `Erro: Não posso gerenciar o cargo ${roleName} devido à hierarquia de cargos!`,
      });
      return;
    }

    const hasRole = targetMember.roles.cache.has(roleId);
    if (hasRole) {
      await targetMember.roles.remove(role);
      await interaction.editReply({
        content: `Cargo ${roleName} removido de ${targetMember}! ❌`,
      });
      log(`Cargo ${roleName} removido do usuário ${targetMember.user.tag}`, "discord");
    } else {
      await targetMember.roles.add(role);
      await interaction.editReply({
        content: `Cargo ${roleName} adicionado para ${targetMember}! ✅`,
      });
      log(`Cargo ${roleName} adicionado ao usuário ${targetMember.user.tag}`, "discord");
    }
  } catch (error) {
    log(`Erro ao modificar cargo ${roleName}: ${error}`, "discord");
    await interaction.editReply({
      content: `Erro ao modificar o cargo ${roleName}. Por favor, tente novamente.`,
    });
  }
}

async function createMembersEmbed(interaction: ButtonInteraction): Promise<EmbedBuilder> {
  if (!interaction.guild) {
    throw new Error("Servidor não encontrado");
  }

  const config = await storage.getGuildConfig(interaction.guildId!);
  if (!config) {
    throw new Error("Configuração não encontrada");
  }

  const roles = await interaction.guild.roles.fetch();
  const firstLadyRole = roles.get(config.firstLadyRoleId!);
  const antiBanRole = roles.get(config.antiBanRoleId!);
  const fourUnitRole = roles.get(config.fourUnitRoleId!);

  const firstLadyCount = firstLadyRole?.members.size || 0;
  const antiBanCount = antiBanRole?.members.size || 0;
  const fourUnitCount = fourUnitRole?.members.size || 0;

  const firstLadyLimit = getRoleLimit(config, config.firstLadyRoleId!);
  const antiBanLimit = getRoleLimit(config, config.antiBanRoleId!);
  const fourUnitLimit = getRoleLimit(config, config.fourUnitRoleId!);

  return new EmbedBuilder()
    .setTitle("👥 Membros da Panela")
    .setDescription(
      `<:anel:1337954327226093598> **Primeira Dama** (${firstLadyCount}/${firstLadyLimit})\n${formatMembersList(firstLadyRole?.members)}\n\n` +
      `<:martelo:1337267926452932628> **Antiban** (${antiBanCount}/${antiBanLimit})\n${formatMembersList(antiBanRole?.members)}\n\n` +
      `<:cor:1337925018872709230> **4un** (${fourUnitCount}/${fourUnitLimit})\n${formatMembersList(fourUnitRole?.members)}`
    )
    .setColor("#2F3136")
    .setTimestamp();
}

function formatMembersList(members: Collection<string, GuildMember> | undefined): string {
  if (!members || members.size === 0) return "• Nenhum membro";
  return Array.from(members.values())
    .map((member: GuildMember) => `• ${member.user.username}`)
    .join("\n");
}