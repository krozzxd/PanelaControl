import { ButtonInteraction, EmbedBuilder } from "discord.js";
import { storage } from "../storage";
import { log } from "../vite";

export async function handleButtons(interaction: ButtonInteraction) {
  try {
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

    switch (interaction.customId) {
      case "primeira-dama":
        if (!config.firstLadyRoleId) {
          await interaction.reply({
            content: "Cargo Primeira Dama não configurado!",
            ephemeral: true,
          });
          return;
        }
        await toggleRole(interaction, config.firstLadyRoleId);
        break;
      case "antiban":
        if (!config.antiBanRoleId) {
          await interaction.reply({
            content: "Cargo Antiban não configurado!",
            ephemeral: true,
          });
          return;
        }
        await toggleRole(interaction, config.antiBanRoleId);
        break;
      case "4un":
        if (!config.fourUnitRoleId) {
          await interaction.reply({
            content: "Cargo 4un não configurado!",
            ephemeral: true,
          });
          return;
        }
        await toggleRole(interaction, config.fourUnitRoleId);
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

async function toggleRole(interaction: ButtonInteraction, roleId: string) {
  try {
    if (!interaction.guild) return;

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member) {
      await interaction.reply({
        content: "Membro não encontrado!",
        ephemeral: true,
      });
      return;
    }

    const role = await interaction.guild.roles.fetch(roleId);
    if (!role) {
      await interaction.reply({
        content: "Cargo não encontrado!",
        ephemeral: true,
      });
      return;
    }

    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(role);
      await interaction.reply({
        content: `Cargo ${role.name} removido!`,
        ephemeral: true,
      });
    } else {
      await member.roles.add(role);
      await interaction.reply({
        content: `Cargo ${role.name} adicionado!`,
        ephemeral: true,
      });
    }
  } catch (error) {
    log(`Erro ao modificar cargo: ${error}`, "discord");
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Erro ao modificar cargo! Verifique as permissões do bot.",
        ephemeral: true,
      });
    }
  }
}

async function showMembers(interaction: ButtonInteraction) {
  try {
    if (!interaction.guild) return;

    const config = await storage.getGuildConfig(interaction.guildId!);
    if (!config) return;

    const roleIds = [
      config.firstLadyRoleId,
      config.antiBanRoleId,
      config.fourUnitRoleId,
    ].filter(Boolean); // Remove null values

    const memberCounts = await Promise.all(roleIds.map(async (roleId) => {
      if (!roleId) return "";
      const role = await interaction.guild!.roles.fetch(roleId);
      return role ? `${role.name}: ${role.members.size} membros` : "";
    }));

    const embed = new EmbedBuilder()
      .setTitle("Membros da Panela")
      .setDescription(memberCounts.filter(Boolean).join("\n"))
      .setColor("#2F3136");

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