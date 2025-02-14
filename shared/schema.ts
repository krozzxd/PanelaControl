import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const guildConfigs = pgTable("guild_configs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  firstLadyRoleId: text("first_lady_role_id"),
  antiBanRoleId: text("anti_ban_role_id"),
  fourUnitRoleId: text("four_unit_role_id"),
  // Armazenar limites como um array de objetos
  roleLimits: text("role_limits").array(), // ["roleId:limit", "roleId:limit"]
  // Roles que podem usar o comando
  allowedRoles: text("allowed_roles").array(),
  // Roles que podem receber 4un
  fourUnitAllowedRoles: text("four_unit_allowed_roles").array(),
});

export const insertGuildConfigSchema = createInsertSchema(guildConfigs).pick({
  guildId: true,
  firstLadyRoleId: true,
  antiBanRoleId: true,
  fourUnitRoleId: true,
  roleLimits: true,
  allowedRoles: true,
  fourUnitAllowedRoles: true,
});

export type InsertGuildConfig = z.infer<typeof insertGuildConfigSchema>;
export type GuildConfig = typeof guildConfigs.$inferSelect;

// Helper functions para gerenciar limites de cargos
export function getRoleLimit(config: GuildConfig, roleId: string): number {
  if (!config.roleLimits) return 5; // Default limit

  const limitStr = config.roleLimits.find(limit => limit.startsWith(`${roleId}:`));
  if (!limitStr) return 5;

  const [, limit] = limitStr.split(':');
  return parseInt(limit) || 5;
}

export function setRoleLimit(config: GuildConfig, roleId: string, limit: number): string[] {
  const newLimits = (config.roleLimits || []).filter(l => !l.startsWith(`${roleId}:`));
  newLimits.push(`${roleId}:${limit}`);
  return newLimits;
}