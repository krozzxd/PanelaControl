import { ButtonInteraction, EmbedBuilder, PermissionsBitField, Message, TextChannel, Collection } from "discord.js";
import { storage } from "../storage";
import { log } from "../vite";

export async function handleButtons(interaction: ButtonInteraction) {
  try {
    // Verificar se o bot tem as permissões necessárias
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

    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: "Erro: Servidor não encontrado!",
        ephemeral: true,
      });
      return;
    }

    const config = await storage.getGuildConfig(interaction.guildId);
    if (!config) {
      await interaction.reply({
        content: "Configuração não encontrada! Use hit!panela config primeiro.",
        ephemeral: true
      });
      return;
    }

    log(`Processando botão: ${interaction.customId}`, "discord");

    switch (interaction.customId) {
      case "primeira-dama":
      case "antiban":
      case "4un": {
        // Definir a mensagem e o roleId baseado no botão
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

        // Cria um novo coletor para esta interação específica
        await interaction.reply({
          content: `Mencione o usuário que receberá o cargo de ${buttonConfig.name}`,
          ephemeral: true
        });

        const filter = (m: Message) => m.author.id === interaction.user.id && m.mentions.users.size > 0;

        // Verifica se o canal é um TextChannel
        if (!(interaction.channel instanceof TextChannel)) {
          await interaction.followUp({
            content: "Este comando só pode ser usado em canais de texto!",
            ephemeral: true
          });
          return;
        }

        const collector = interaction.channel.createMessageCollector({
          filter,
          time: 30000,
          max: 1
        });

        if (!collector) {
          await interaction.followUp({
            content: "Erro ao criar coletor de mensagens. Tente novamente.",
            ephemeral: true
          });
          return;
        }

        collector.on('collect', async (m: Message) => {
          const targetUser = m.mentions.users.first();
          if (targetUser) {
            await toggleRole(interaction, buttonConfig.roleId!, buttonConfig.name, targetUser.id);
            await m.delete().catch(() => {
              log(`Não foi possível deletar a mensagem de menção`, "discord");
            });
          }
        });

        collector.on('end', (collected: Collection<string, Message>) => {
          if (collected.size === 0) {
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
        await showMembers(interaction);
        break;
      }

      case "fechar": {
        if (interaction.message.deletable) {
          await interaction.message.delete();
          await interaction.reply({
            content: "Menu fechado!",
            ephemeral: true,
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
          ephemeral: true,
        });
      }
    } catch (e) {
      log(`Erro ao enviar mensagem de erro: ${e}`, "discord");
    }
  }
}

async function toggleRole(interaction: ButtonInteraction, roleId: string, roleName: string, targetUserId: string) {
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

    // Verifica se o bot tem permissão para gerenciar o cargo
    if (!interaction.guild.members.me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      await interaction.followUp({
        content: "Erro: Não tenho permissão para gerenciar cargos!",
        ephemeral: true,
      });
      return;
    }

    // Verifica se o bot pode gerenciar o cargo específico (hierarquia de cargos)
    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      await interaction.followUp({
        content: `Erro: Não posso gerenciar o cargo ${roleName} devido à hierarquia de cargos!`,
        ephemeral: true,
      });
      return;
    }

    try {
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
  } catch (error) {
    log(`Erro ao processar toggleRole para ${roleName}: ${error}`, "discord");
    await interaction.followUp({
      content: "Ocorreu um erro inesperado. Por favor, tente novamente.",
      ephemeral: true,
    });
  }
}

async function showMembers(interaction: ButtonInteraction) {
  try {
    log(`Iniciando função showMembers para servidor ${interaction.guildId}`, "discord");

    if (!interaction.guild) {
      await interaction.reply({
        content: "Erro: Servidor não encontrado!",
        ephemeral: true
      });
      return;
    }

    const config = await storage.getGuildConfig(interaction.guildId!);
    if (!config) {
      await interaction.reply({
        content: "Configuração não encontrada! Use hit!panela config primeiro.",
        ephemeral: true
      });
      return;
    }

    log(`Buscando informações dos cargos para o servidor ${interaction.guildId}`, "discord");

    // Get roles and their members
    const roles = await interaction.guild.roles.fetch();
    const firstLadyRole = roles.get(config.firstLadyRoleId!);
    const antiBanRole = roles.get(config.antiBanRoleId!);
    const fourUnitRole = roles.get(config.fourUnitRoleId!);

    const firstLadyCount = firstLadyRole?.members.size || 0;
    const antiBanCount = antiBanRole?.members.size || 0;
    const fourUnitCount = fourUnitRole?.members.size || 0;

    log(`Contagem de membros - Primeira Dama: ${firstLadyCount}, Antiban: ${antiBanCount}, 4un: ${fourUnitCount}`, "discord");

    // Função auxiliar para formatar a lista de membros
    const formatMembersList = (role: any) => {
      if (!role) return "• Nenhum membro";
      const members = Array.from(role.members.values())
        .map(m => `• ${m.user.username}`)
        .join("\n");
      return members || "• Nenhum membro";
    };

    // Get members for each role
    const firstLadyMembers = formatMembersList(firstLadyRole);
    const antiBanMembers = formatMembersList(antiBanRole);
    const fourUnitMembers = formatMembersList(fourUnitRole);

    const embed = new EmbedBuilder()
      .setTitle("👥 Membros da Panela")
      .setDescription(
        `<:anel:1337954327226093598> **Primeira Dama** (${firstLadyCount}/5)\n${firstLadyMembers}\n\n` +
        `<:martelo:1337267926452932628> **Antiban** (${antiBanCount}/5)\n${antiBanMembers}\n\n` +
        `<:cor:1337925018872709230> **4un** (${fourUnitCount}/5)\n${fourUnitMembers}`
      )
      .setColor("#2F3136")
      .setTimestamp();

    log(`Preparando para enviar embed com informações dos membros`, "discord");

    try {
      // Tenta primeiro responder normalmente
      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
      log(`Embed enviado com sucesso via reply`, "discord");
    } catch (error: any) {
      // Se a interação já foi respondida, usa followUp
      if (error.code === 40060) {
        await interaction.followUp({
          embeds: [embed],
          ephemeral: true
        });
        log(`Embed enviado com sucesso via followUp`, "discord");
      } else {
        throw error;
      }
    }
  } catch (error) {
    log(`Erro ao mostrar membros: ${error}`, "discord");

    const errorMessage = "Erro ao mostrar membros! Tente novamente.";
    try {
      if (!interaction.replied) {
        await interaction.reply({
          content: errorMessage,
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: errorMessage,
          ephemeral: true
        });
      }
    } catch (e) {
      log(`Erro ao enviar mensagem de erro: ${e}`, "discord");
    }
  }
}