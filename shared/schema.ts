import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const guildConfigs = pgTable("guild_configs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  firstLadyRoleId: text("first_lady_role_id"),
  antiBanRoleId: text("anti_ban_role_id"),
  fourUnitRoleId: text("four_unit_role_id"),
});

export const insertGuildConfigSchema = createInsertSchema(guildConfigs).pick({
  guildId: true,
  firstLadyRoleId: true,
  antiBanRoleId: true,
  fourUnitRoleId: true,
});

export type InsertGuildConfig = z.infer<typeof insertGuildConfigSchema>;
export type GuildConfig = typeof guildConfigs.$inferSelect;
