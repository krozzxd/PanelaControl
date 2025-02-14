import { ButtonInteraction, EmbedBuilder, PermissionsBitField } from "discord.js";
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
        ephemeral: true,
      });
      return;
    }

    log(`Processando botão: ${interaction.customId}`, "discord");

    switch (interaction.customId) {
      case "primeira-dama":
        if (!config.firstLadyRoleId) {
          await interaction.reply({
            content: "Cargo Primeira Dama não configurado!",
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content: "Mencione o usuário que receberá o cargo de Primeira Dama",
          ephemeral: true
        });

        // Criar coletor de mensagens
        const filter = (m: any) => m.author.id === interaction.user.id && m.mentions.users.size > 0;
        const collector = interaction.channel?.createMessageCollector({ filter, time: 30000, max: 1 });

        collector?.on('collect', async (m) => {
          const targetUser = m.mentions.users.first();
          if (targetUser) {
            await toggleRole(interaction, config.firstLadyRoleId!, "Primeira Dama", targetUser.id);
            // Deletar mensagem de menção para manter o chat limpo
            await m.delete().catch(() => {});
          }
        });

        collector?.on('end', (collected) => {
          if (collected.size === 0) {
            interaction.followUp({
              content: "Tempo esgotado. Por favor, tente novamente.",
              ephemeral: true
            });
          }
        });
        break;

      case "antiban":
        if (!config.antiBanRoleId) {
          await interaction.reply({
            content: "Cargo Antiban não configurado!",
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content: "Mencione o usuário que receberá o cargo de Antiban",
          ephemeral: true
        });

        // Criar coletor de mensagens
        const filterAntiBan = (m: any) => m.author.id === interaction.user.id && m.mentions.users.size > 0;
        const collectorAntiBan = interaction.channel?.createMessageCollector({ filter: filterAntiBan, time: 30000, max: 1 });

        collectorAntiBan?.on('collect', async (m) => {
          const targetUser = m.mentions.users.first();
          if (targetUser) {
            await toggleRole(interaction, config.antiBanRoleId!, "Antiban", targetUser.id);
            await m.delete().catch(() => {});
          }
        });

        collectorAntiBan?.on('end', (collected) => {
          if (collected.size === 0) {
            interaction.followUp({
              content: "Tempo esgotado. Por favor, tente novamente.",
              ephemeral: true
            });
          }
        });
        break;

      case "4un":
        if (!config.fourUnitRoleId) {
          await interaction.reply({
            content: "Cargo 4un não configurado!",
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content: "Mencione o usuário que receberá o cargo de 4un",
          ephemeral: true
        });

        // Criar coletor de mensagens
        const filter4un = (m: any) => m.author.id === interaction.user.id && m.mentions.users.size > 0;
        const collector4un = interaction.channel?.createMessageCollector({ filter: filter4un, time: 30000, max: 1 });

        collector4un?.on('collect', async (m) => {
          const targetUser = m.mentions.users.first();
          if (targetUser) {
            await toggleRole(interaction, config.fourUnitRoleId!, "4un", targetUser.id);
            await m.delete().catch(() => {});
          }
        });

        collector4un?.on('end', (collected) => {
          if (collected.size === 0) {
            interaction.followUp({
              content: "Tempo esgotado. Por favor, tente novamente.",
              ephemeral: true
            });
          }
        });
        break;

      case "ver-membros":
        await showMembers(interaction);
        break;

      case "fechar":
        if (interaction.message.deletable) {
          await interaction.message.delete();
          await interaction.reply({
            content: "Menu fechado!",
            ephemeral: true,
          });
        }
        break;
    }
  } catch (error) {
    log(`Erro ao processar botão: ${error}`, "discord");
    // Só tenta responder se a interação ainda não foi respondida
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Ocorreu um erro ao processar o botão. Por favor, tente novamente.",
        ephemeral: true,
      });
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
    if (!interaction.guild) return;

    const config = await storage.getGuildConfig(interaction.guildId!);
    if (!config) return;

    const roles = [
      { id: config.firstLadyRoleId, name: "👑 Primeira Dama" },
      { id: config.antiBanRoleId, name: "🛡️ Antiban" },
      { id: config.fourUnitRoleId, name: "🎮 4un" },
    ].filter(role => role.id); // Remove roles that are not configured

    // Get members for each role
    const membersInfo = await Promise.all(roles.map(async (role) => {
      const discordRole = await interaction.guild!.roles.fetch(role.id!);
      if (!discordRole) return `${role.name}: Cargo não encontrado`;

      const members = Array.from(discordRole.members.values())
        .map(member => member.user.username)
        .join(", ");

      return `${role.name}: ${members || "Nenhum membro"}`;
    }));

    const embed = new EmbedBuilder()
      .setTitle("👥 Membros da Panela")
      .setDescription(membersInfo.join("\n\n"))
      .setColor("#2F3136")
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  } catch (error) {
    log(`Erro ao mostrar membros: ${error}`, "discord");
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Erro ao mostrar membros! Tente novamente.",
        ephemeral: true,
      });
    }
  }
}