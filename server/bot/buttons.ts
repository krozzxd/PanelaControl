import { ButtonInteraction, EmbedBuilder, PermissionsBitField, Message, TextChannel, GuildMember, Collection, GuildMemberRoleManager } from "discord.js";
import { storage } from "../storage";
import { log } from "../vite";
import { getRoleLimit } from "@shared/schema";

// Map para armazenar coletores de atribuição de cargo ativos
const roleAssignmentCollectors = new Map();

export async function handleButtons(interaction: ButtonInteraction) {
  try {
    // Sempre deferir a interação primeiro, antes de qualquer outra operação
    await interaction.deferUpdate();
    log(`Interação inicial deferida: ${interaction.customId}`, "discord");

    // Verificar configuração do servidor
    const config = await storage.getGuildConfig(interaction.guildId!);
    if (!config) {
      await interaction.followUp({
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
          await interaction.followUp({
            content: `Cargo ${buttonConfig.name} não configurado!`,
            ephemeral: true
          });
          return;
        }

        // Enviar mensagem pedindo menção
        await interaction.followUp({
          content: `Mencione o usuário que receberá o cargo de ${buttonConfig.name}`,
          ephemeral: true
        });

        // Configurar coletor
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
              await interaction.followUp({
                content: "Ocorreu um erro ao processar o cargo. Por favor, tente novamente.",
                ephemeral: true
              });
            }
          });

          collector.on('end', (collected, reason) => {
            roleAssignmentCollectors.delete(collectorKey);
            if (collected.size === 0 && reason === 'time') {
              interaction.followUp({
                content: "Tempo esgotado. Por favor, tente novamente.",
                ephemeral: true
              });
            }
          });
        }
        break;
      }

      case "ver-membros": {
        try {
          const embed = await createMembersEmbed(interaction);
          await interaction.followUp({
            embeds: [embed],
            ephemeral: true
          });
          log(`Lista de membros enviada para ${interaction.user.tag}`, "discord");
        } catch (error) {
          log(`Erro ao processar ver-membros: ${error}`, "discord");
          await interaction.followUp({
            content: "Erro ao mostrar membros. Por favor, tente novamente.",
            ephemeral: true
          });
        }
        break;
      }

      case "fechar": {
        try {
          // Versão mais simples possível do botão fechar
          const message = interaction.message;
          const embeds = message.embeds;
          await message.edit({
            embeds: embeds,
            components: []
          });
          log(`Menu fechado por ${interaction.user.tag}`, "discord");
        } catch (error) {
          log(`Erro ao fechar menu: ${error}`, "discord");
        }
        break;
      }
    }
  } catch (error) {
    log(`Erro ao processar botão: ${error}`, "discord");
    try {
      await interaction.followUp({
        content: "Ocorreu um erro ao processar o botão. Por favor, tente novamente.",
        ephemeral: true
      });
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
      await interaction.followUp({
        content: "Erro: Servidor não encontrado!",
        ephemeral: true
      });
      return;
    }

    const config = await storage.getGuildConfig(interaction.guildId!);
    if (!config) {
      await interaction.followUp({
        content: "Configuração não encontrada!",
        ephemeral: true
      });
      return;
    }

    // Verificar permissão do usuário
    if (config.allowedRoles && config.allowedRoles.length > 0) {
      const memberRoles = interaction.member!.roles as GuildMemberRoleManager;
      const hasPermission = memberRoles.cache.some(role =>
        config.allowedRoles!.includes(role.id)
      );
      if (!hasPermission && !interaction.memberPermissions?.has("Administrator")) {
        await interaction.followUp({
          content: "Você não tem permissão para usar este comando!",
          ephemeral: true
        });
        return;
      }
    }

    const targetMember = await interaction.guild.members.fetch(targetUserId);
    if (!targetMember) {
      await interaction.followUp({
        content: "Erro: Usuário mencionado não encontrado no servidor!",
        ephemeral: true
      });
      return;
    }

    const role = await interaction.guild.roles.fetch(roleId);
    if (!role) {
      await interaction.followUp({
        content: `Erro: Cargo ${roleName} não encontrado!`,
        ephemeral: true
      });
      return;
    }

    // Verificar limitações do 4un
    if (roleName === "4un") {
      if (config.fourUnitAllowedRoles && config.fourUnitAllowedRoles.length > 0) {
        const canReceive4un = targetMember.roles.cache.some(role =>
          config.fourUnitAllowedRoles!.includes(role.id)
        );
        if (!canReceive4un) {
          await interaction.followUp({
            content: "Este usuário não pode receber o cargo 4un!",
            ephemeral: true
          });
          return;
        }
      }
    }

    // Verificar limites
    const roleMembers = role.members.size;
    const roleLimit = getRoleLimit(config, roleId);

    if (!targetMember.roles.cache.has(roleId) && roleMembers >= roleLimit) {
      await interaction.followUp({
        content: `Limite de ${roleLimit} membros atingido para o cargo ${roleName}!`,
        ephemeral: true
      });
      return;
    }

    // Adicionar ou remover o cargo
    const hasRole = targetMember.roles.cache.has(roleId);
    if (hasRole) {
      await targetMember.roles.remove(role);
      await interaction.followUp({
        content: `Cargo ${roleName} removido de ${targetMember}! ❌`,
        ephemeral: true
      });
      log(`Cargo ${roleName} removido do usuário ${targetMember.user.tag}`, "discord");
    } else {
      await targetMember.roles.add(role);
      await interaction.followUp({
        content: `Cargo ${roleName} adicionado para ${targetMember}! ✅`,
        ephemeral: true
      });
      log(`Cargo ${roleName} adicionado ao usuário ${targetMember.user.tag}`, "discord");
    }
  } catch (error) {
    log(`Erro ao modificar cargo ${roleName}: ${error}`, "discord");
    await interaction.followUp({
      content: `Erro ao modificar o cargo ${roleName}. Por favor, tente novamente.`,
      ephemeral: true
    });
  }
}

function formatMembersList(members: Collection<string, GuildMember> | undefined): string {
  if (!members || members.size === 0) return "• Nenhum membro";
  return Array.from(members.values())
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