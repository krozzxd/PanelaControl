import { ButtonInteraction, EmbedBuilder, PermissionsBitField, Message, TextChannel, GuildMember, Collection } from "discord.js";
import { storage } from "../storage";
import { log } from "../vite";

// Map to store ongoing role assignments
const roleAssignmentCollectors = new Map();

export async function handleButtons(interaction: ButtonInteraction) {
  if (!interaction.guild?.members.me?.permissions.has([
    PermissionsBitField.Flags.ManageRoles,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.ViewChannel
  ])) {
    try {
      await interaction.reply({
        content: "O bot não tem as permissões necessárias! Preciso das permissões: Gerenciar Cargos, Enviar Mensagens, Ver Canal",
        ephemeral: true
      });
    } catch (error) {
      log(`Erro ao verificar permissões: ${error}`, "discord");
    }
    return;
  }

  const config = await storage.getGuildConfig(interaction.guildId!);
  if (!config) {
    try {
      await interaction.reply({
        content: "Configuração não encontrada! Use hit!panela config primeiro.",
        ephemeral: true
      });
    } catch (error) {
      log(`Erro ao verificar config: ${error}`, "discord");
    }
    return;
  }

  try {
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
            ephemeral: true,
          });
          return;
        }

        await interaction.reply({
          content: `Mencione o usuário que receberá o cargo de ${buttonConfig.name}`,
          ephemeral: true
        });

        if (!(interaction.channel instanceof TextChannel)) {
          await interaction.followUp({
            content: "Este comando só pode ser usado em canais de texto!",
            ephemeral: true
          });
          return;
        }

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
          log(`Iniciando geração do embed de membros para ${interaction.guild.name}`, "discord");
          const embed = await createMembersEmbed(interaction);

          if (!interaction.replied) {
            await interaction.reply({ embeds: [embed], ephemeral: true });
            log(`Embed de membros enviado com sucesso`, "discord");
          }
        } catch (error) {
          log(`Erro ao processar botão ver-membros: ${error}`, "discord");
          if (!interaction.replied) {
            await interaction.reply({
              content: "Erro ao mostrar membros. Por favor, tente novamente.",
              ephemeral: true
            });
          }
        }
        break;
      }

      case "fechar": {
        try {
          if (interaction.message.deletable) {
            await interaction.message.delete();
            await interaction.reply({
              content: "Menu fechado!",
              ephemeral: true
            });
            log(`Menu fechado por ${interaction.user.tag}`, "discord");
          }
        } catch (error) {
          log(`Erro ao fechar menu: ${error}`, "discord");
          if (!interaction.replied) {
            await interaction.reply({
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
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Ocorreu um erro ao processar o botão. Por favor, tente novamente.",
        ephemeral: true
      });
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
        ephemeral: true,
      });
      return;
    }

    const targetMember = await interaction.guild.members.fetch(targetUserId);
    if (!targetMember) {
      await interaction.followUp({
        content: "Erro: Usuário mencionado não encontrado no servidor!",
        ephemeral: true,
      });
      return;
    }

    const role = await interaction.guild.roles.fetch(roleId);
    if (!role) {
      await interaction.followUp({
        content: `Erro: Cargo ${roleName} não encontrado!`,
        ephemeral: true,
      });
      return;
    }

    if (!interaction.guild.members.me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      await interaction.followUp({
        content: "Erro: Não tenho permissão para gerenciar cargos!",
        ephemeral: true,
      });
      return;
    }

    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      await interaction.followUp({
        content: `Erro: Não posso gerenciar o cargo ${roleName} devido à hierarquia de cargos!`,
        ephemeral: true,
      });
      return;
    }

    if (targetMember.roles.cache.has(roleId)) {
      await targetMember.roles.remove(role);
      await interaction.followUp({
        content: `Cargo ${roleName} removido de ${targetMember}! ❌`,
        ephemeral: true,
      });
      log(`Cargo ${roleName} removido do usuário ${targetMember.user.tag}`, "discord");
    } else {
      await targetMember.roles.add(role);
      await interaction.followUp({
        content: `Cargo ${roleName} adicionado para ${targetMember}! ✅`,
        ephemeral: true,
      });
      log(`Cargo ${roleName} adicionado ao usuário ${targetMember.user.tag}`, "discord");
    }
  } catch (error) {
    log(`Erro ao modificar cargo ${roleName}: ${error}`, "discord");
    await interaction.followUp({
      content: `Erro ao modificar o cargo ${roleName}. Por favor, tente novamente.`,
      ephemeral: true,
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