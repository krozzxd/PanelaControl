import { ButtonInteraction, EmbedBuilder } from "discord.js";
import { storage } from "../storage";

export async function handleButtons(interaction: ButtonInteraction) {
  if (!interaction.guildId || !interaction.guild) return;

  const config = await storage.getGuildConfig(interaction.guildId);
  if (!config) {
    await interaction.reply({
      content: "Configuração não encontrada!",
      ephemeral: true,
    });
    return;
  }

  switch (interaction.customId) {
    case "primeira-dama":
      await toggleRole(interaction, config.firstLadyRoleId!);
      break;
    case "antiban":
      await toggleRole(interaction, config.antiBanRoleId!);
      break;
    case "4un":
      await toggleRole(interaction, config.fourUnitRoleId!);
      break;
    case "ver-membros":
      await showMembers(interaction);
      break;
    case "fechar":
      if (interaction.message.deletable) {
        await interaction.message.delete();
      }
      break;
  }
}

async function toggleRole(interaction: ButtonInteraction, roleId: string) {
  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member) return;

  const role = await interaction.guild.roles.fetch(roleId);
  if (!role) {
    await interaction.reply({
      content: "Cargo não encontrado!",
      ephemeral: true,
    });
    return;
  }

  try {
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
    await interaction.reply({
      content: "Erro ao modificar cargo!",
      ephemeral: true,
    });
  }
}

async function showMembers(interaction: ButtonInteraction) {
  if (!interaction.guild) return;

  const config = await storage.getGuildConfig(interaction.guildId!);
  if (!config) return;

  const roleIds = [
    config.firstLadyRoleId,
    config.antiBanRoleId,
    config.fourUnitRoleId,
  ];

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
}