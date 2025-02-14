import { ButtonInteraction, EmbedBuilder, PermissionsBitField, Message, TextChannel } from "discord.js";
import { storage } from "../storage";
import { log } from "../vite";

export async function handleButtons(interaction: ButtonInteraction) {
  try {
    log(`Processando botão: ${interaction.customId}`, "discord");

    // Verificar permissões necessárias do bot
    const requiredPermissions = [
      PermissionsBitField.Flags.ManageRoles,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ViewChannel
    ];

    if (!interaction.guild?.members.me?.permissions.has(requiredPermissions)) {
      await interaction.reply({
        content: "O bot não tem as permissões necessárias! Preciso das permissões: Gerenciar Cargos, Enviar Mensagens, Ver Canal",
        ephemeral: true
      });
      return;
    }

    // Verificar se é um canal de texto
    if (!(interaction.channel instanceof TextChannel)) {
      await interaction.reply({
        content: "Este comando só pode ser usado em canais de texto!",
        ephemeral: true
      });
      return;
    }

    // Tratar o botão fechar primeiro
    if (interaction.customId === "fechar") {
      try {
        log("Tentando fechar o menu", "discord");
        const message = interaction.message;

        try {
          if (message.deletable) {
            await message.delete();
            log("Mensagem deletada com sucesso", "discord");
          }
        } catch (deleteError) {
          log(`Erro ao deletar mensagem: ${deleteError}`, "discord");
        }

        if (!interaction.replied) {
          await interaction.reply({
            content: "Menu fechado!",
            ephemeral: true
          });
        }
        return;
      } catch (error) {
        log(`Erro ao fechar menu: ${error}`, "discord");
        if (!interaction.replied) {
          await interaction.reply({
            content: "Erro ao fechar o menu. Tente novamente.",
            ephemeral: true
          });
        }
        return;
      }
    }

    // Para outros botões, verificar configuração
    const config = await storage.getGuildConfig(interaction.guildId!);
    if (!config) {
      await interaction.reply({
        content: "Configuração não encontrada! Use hit!panela config primeiro.",
        ephemeral: true
      });
      return;
    }

    // Verificar se os cargos existem
    const roles = await interaction.guild.roles.fetch();
    const roleIds = [config.firstLadyRoleId, config.antiBanRoleId, config.fourUnitRoleId].filter(Boolean);

    for (const roleId of roleIds) {
      const role = roles.get(roleId!);
      if (!role) {
        await interaction.reply({
          content: "Um ou mais cargos configurados não foram encontrados. Use hit!panela config para reconfigurar.",
          ephemeral: true
        });
        return;
      }
      if (role.position >= interaction.guild.members.me.roles.highest.position) {
        await interaction.reply({
          content: "Erro: Um ou mais cargos estão acima do meu cargo mais alto. Por favor, mova meu cargo para cima deles.",
          ephemeral: true
        });
        return;
      }
    }

    switch (interaction.customId) {
      case "primeira-dama":
      case "antiban":
      case "4un": {
        const buttonConfig = {
          "primeira-dama": {
            roleId: config.firstLadyRoleId,
            name: "Primeira Dama",
            limit: 5
          },
          "antiban": {
            roleId: config.antiBanRoleId,
            name: "Antiban",
            limit: 5
          },
          "4un": {
            roleId: config.fourUnitRoleId,
            name: "4un",
            limit: 5
          }
        }[interaction.customId];

        const role = roles.get(buttonConfig.roleId!);
        if (!role) {
          await interaction.reply({
            content: `Cargo ${buttonConfig.name} não encontrado! Use hit!panela config para reconfigurar.`,
            ephemeral: true
          });
          return;
        }

        if (role.members.size >= buttonConfig.limit) {
          await interaction.reply({
            content: `O cargo ${buttonConfig.name} já atingiu o limite de ${buttonConfig.limit} membros!`,
            ephemeral: true
          });
          return;
        }

        log(`Iniciando coleta de menção para o cargo ${buttonConfig.name}`, "discord");
        await interaction.reply({
          content: `Mencione o usuário que receberá o cargo de ${buttonConfig.name}`,
          ephemeral: true
        });

        const collector = interaction.channel.createMessageCollector({
          filter: (m) => m.author.id === interaction.user.id && m.mentions.users.size > 0,
          time: 30000,
          max: 1
        });

        collector.on('collect', async (m) => {
          try {
            const targetUser = m.mentions.users.first();
            if (targetUser) {
              log(`Menção coletada para ${targetUser.tag}`, "discord");
              await toggleRole(interaction, buttonConfig.roleId!, buttonConfig.name, targetUser.id);
              try {
                await m.delete();
              } catch (error) {
                log(`Não foi possível deletar a mensagem de menção: ${error}`, "discord");
              }
            }
          } catch (error) {
            log(`Erro ao processar menção: ${error}`, "discord");
            if (!interaction.replied) {
              await interaction.followUp({
                content: "Erro ao processar a menção. Por favor, tente novamente.",
                ephemeral: true
              });
            }
          }
        });

        collector.on('end', collected => {
          if (collected.size === 0) {
            log("Tempo de coleta esgotado", "discord");
            if (!interaction.replied) {
              interaction.followUp({
                content: "Tempo esgotado. Por favor, tente novamente.",
                ephemeral: true
              }).catch(error => {
                log(`Erro ao enviar mensagem de tempo esgotado: ${error}`, "discord");
              });
            }
          }
        });
        break;
      }

      case "ver-membros": {
        try {
          log("Gerando embed de membros", "discord");
          const embed = await createMembersEmbed(interaction);
          if (!interaction.replied) {
            await interaction.reply({ embeds: [embed], ephemeral: true });
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
    }
  } catch (error) {
    log(`Erro ao processar botão: ${error}`, "discord");
    if (!interaction.replied) {
      await interaction.reply({
        content: "Ocorreu um erro ao processar o botão. Por favor, tente novamente.",
        ephemeral: true
      }).catch((e) => {
        log(`Erro ao enviar mensagem de erro: ${e}`, "discord");
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
        ephemeral: true
      });
      return;
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

    if (!interaction.guild.members.me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      await interaction.followUp({
        content: "Erro: Não tenho permissão para gerenciar cargos!",
        ephemeral: true
      });
      return;
    }

    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      await interaction.followUp({
        content: `Erro: Não posso gerenciar o cargo ${roleName} devido à hierarquia de cargos!`,
        ephemeral: true
      });
      return;
    }

    // Verificar limite do cargo
    const memberCount = role.members.size;
    if (!targetMember.roles.cache.has(roleId) && memberCount >= 5) {
      await interaction.followUp({
        content: `O cargo ${roleName} já atingiu o limite de 5 membros!`,
        ephemeral: true
      });
      return;
    }

    if (targetMember.roles.cache.has(roleId)) {
      await targetMember.roles.remove(role);
      log(`Cargo ${roleName} removido de ${targetMember.user.tag}`, "discord");
      await interaction.followUp({
        content: `Cargo ${roleName} removido de ${targetMember}! ❌`,
        ephemeral: true
      });
    } else {
      await targetMember.roles.add(role);
      log(`Cargo ${roleName} adicionado para ${targetMember.user.tag}`, "discord");
      await interaction.followUp({
        content: `Cargo ${roleName} adicionado para ${targetMember}! ✅`,
        ephemeral: true
      });
    }
  } catch (error) {
    log(`Erro ao modificar cargo ${roleName}: ${error}`, "discord");
    await interaction.followUp({
      content: `Erro ao modificar o cargo ${roleName}. Por favor, tente novamente.`,
      ephemeral: true
    }).catch(() => {
      log(`Não foi possível enviar mensagem de erro`, "discord");
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

  const formatMembersList = (role: any) => {
    if (!role || !role.members) return "• Nenhum membro";
    return Array.from(role.members.values())
      .map((member: any) => `• ${member.user.username}`)
      .join("\n");
  };

  const firstLadyCount = firstLadyRole?.members.size || 0;
  const antiBanCount = antiBanRole?.members.size || 0;
  const fourUnitCount = fourUnitRole?.members.size || 0;

  return new EmbedBuilder()
    .setTitle("👥 Membros da Panela")
    .setDescription(
      `<:anel:1337954327226093598> **Primeira Dama** (${firstLadyCount}/5)\n${formatMembersList(firstLadyRole)}\n\n` +
      `<:martelo:1337267926452932628> **Antiban** (${antiBanCount}/5)\n${formatMembersList(antiBanRole)}\n\n` +
      `<:cor:1337925018872709230> **4un** (${fourUnitCount}/5)\n${formatMembersList(fourUnitRole)}`
    )
    .setColor("#2F3136")
    .setTimestamp();
}