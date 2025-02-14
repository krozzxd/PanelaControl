import { ButtonInteraction, EmbedBuilder, PermissionsBitField, Message, TextChannel, GuildMember, Collection } from "discord.js";
import { storage } from "../storage";
import { log } from "../vite";

// Map para armazenar coletores de atribuição de cargo ativos
const roleAssignmentCollectors = new Map();

// Map para armazenar histórico de alterações de cargos
const roleChangeHistory = new Map<string, { roleId: string, action: 'add' | 'remove', timestamp: number }[]>();

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

    // Adiar a resposta para evitar timeout
    await interaction.deferReply({ ephemeral: true });
    log(`Interação adiada para ${interaction.user.tag} - Botão: ${interaction.customId}`, "discord");

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
          await interaction.editReply({
            content: `Cargo ${buttonConfig.name} não configurado!`,
          });
          return;
        }

        // Verificar canal
        if (!(interaction.channel instanceof TextChannel)) {
          await interaction.editReply({
            content: "Este comando só pode ser usado em canais de texto!",
          });
          return;
        }

        await interaction.editReply({
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
            await toggleRole(interaction, buttonConfig.roleId!, buttonConfig.name, targetUser.id);
            await m.delete().catch(() => {
              log(`Não foi possível deletar a mensagem de menção`, "discord");
            });
          }
        });

        collector.on('end', (collected, reason) => {
          roleAssignmentCollectors.delete(collectorKey);
          if (collected.size === 0 && reason === 'time') {
            interaction.followUp({
              content: "Tempo esgotado. Por favor, tente novamente.",
              ephemeral: true
            }).catch(() => {
              log(`Não foi possível enviar mensagem de tempo esgotado`, "discord");
            });
          }
        });
        break;
      }

      case "ver-membros": {
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

      case "rollback": {
        try {
          if (!interaction.member?.permissions.has("Administrator")) {
            await interaction.editReply({
              content: "Você precisa ser administrador para usar o rollback!",
            });
            return;
          }

          const guildHistory = roleChangeHistory.get(interaction.guildId!);
          if (!guildHistory || guildHistory.length === 0) {
            await interaction.editReply({
              content: "Não há alterações recentes para desfazer.",
            });
            return;
          }

          // Pegar a última alteração
          const lastChange = guildHistory[guildHistory.length - 1];
          const targetMember = await interaction.guild.members.fetch(lastChange.roleId);

          if (!targetMember) {
            await interaction.editReply({
              content: "Não foi possível encontrar o membro da última alteração.",
            });
            return;
          }

          // Reverter a última ação
          const role = await interaction.guild.roles.fetch(lastChange.roleId);
          if (!role) {
            await interaction.editReply({
              content: "Cargo não encontrado.",
            });
            return;
          }

          if (lastChange.action === 'add') {
            await targetMember.roles.remove(role);
            log(`Rollback: Cargo ${role.name} removido de ${targetMember.user.tag}`, "discord");
          } else {
            await targetMember.roles.add(role);
            log(`Rollback: Cargo ${role.name} adicionado a ${targetMember.user.tag}`, "discord");
          }

          // Remover a alteração do histórico
          guildHistory.pop();
          roleChangeHistory.set(interaction.guildId!, guildHistory);

          await interaction.editReply({
            content: `Última alteração de cargo desfeita com sucesso!`,
          });
          log(`Rollback executado com sucesso por ${interaction.user.tag}`, "discord");
        } catch (error) {
          log(`Erro ao executar rollback: ${error}`, "discord");
          await interaction.editReply({
            content: "Erro ao executar o rollback. Por favor, tente novamente.",
          });
        }
        break;
      }

      case "fechar": {
        try {
          if (interaction.message.deletable) {
            await interaction.message.delete();
            await interaction.editReply({ content: "Menu fechado!" });
            log(`Menu fechado por ${interaction.user.tag}`, "discord");
          }
        } catch (error) {
          log(`Erro ao fechar menu: ${error}`, "discord");
          await interaction.editReply({
            content: "Erro ao fechar o menu. Tente novamente.",
          });
        }
        break;
      }
    }
  } catch (error) {
    log(`Erro ao processar botão: ${error}`, "discord");
    try {
      if (!interaction.replied) {
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
    const action = hasRole ? 'remove' : 'add';

    // Registrar a ação no histórico
    const guildHistory = roleChangeHistory.get(interaction.guildId!) || [];
    guildHistory.push({
      roleId,
      action,
      timestamp: Date.now()
    });
    roleChangeHistory.set(interaction.guildId!, guildHistory);

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

  function formatMembersList(members: Collection<string, GuildMember> | undefined): string {
    if (!members || members.size === 0) return "• Nenhum membro";
    return Array.from(members.values())
      .map((member: GuildMember) => `• ${member.user.username}`)
      .join("\n");
  }

  return new EmbedBuilder()
    .setTitle("👥 Membros da Panela")
    .setDescription(
      `<:anel:1337954327226093598> **Primeira Dama** (${firstLadyCount}/5)\n${formatMembersList(firstLadyRole?.members)}\n\n` +
      `<:martelo:1337267926452932628> **Antiban** (${antiBanCount}/5)\n${formatMembersList(antiBanRole?.members)}\n\n` +
      `<:cor:1337925018872709230> **4un** (${fourUnitCount}/5)\n${formatMembersList(fourUnitRole?.members)}`
    )
    .setColor("#2F3136")
    .setTimestamp();
}