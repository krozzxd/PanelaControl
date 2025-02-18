import { pgTable, text, serial, integer, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const guildConfigs = pgTable("guild_configs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  firstLadyRoleId: text("first_lady_role_id"),
  antiBanRoleId: text("anti_ban_role_id"),
  usRoleId: text("us_role_id"),
  roleLimits: text("role_limits").array(), // ["roleId:limit", "roleId:limit"]
  allowedRoles: text("allowed_roles").array(),
  usAllowedRoles: text("us_allowed_roles").array(),
  memberAddedBy: json("member_added_by").$type<Record<string, Record<string, Record<string, string>>>>(), // { "roleId": { "addedById": { "memberId": "timestamp" } } }
});

export const insertGuildConfigSchema = createInsertSchema(guildConfigs).pick({
  guildId: true,
  firstLadyRoleId: true,
  antiBanRoleId: true,
  usRoleId: true,
  roleLimits: true,
  allowedRoles: true,
  usAllowedRoles: true,
  memberAddedBy: true,
});

export type InsertGuildConfig = z.infer<typeof insertGuildConfigSchema>;
export type GuildConfig = typeof guildConfigs.$inferSelect;

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

export function getMemberAddedBy(config: GuildConfig, roleId: string, memberId: string): string | undefined {
  const roleMembers = config.memberAddedBy?.[roleId] || {};
  for (const [addedById, members] of Object.entries(roleMembers)) {
    if (members[memberId]) {
      return addedById;
    }
  }
  return undefined;
}

export function addMember(config: GuildConfig, roleId: string, memberId: string, addedById: string): Record<string, Record<string, Record<string, string>>> {
  const memberAddedBy = config.memberAddedBy || {};
  if (!memberAddedBy[roleId]) {
    memberAddedBy[roleId] = {};
  }
  if (!memberAddedBy[roleId][addedById]) {
    memberAddedBy[roleId][addedById] = {};
  }
  memberAddedBy[roleId][addedById][memberId] = new Date().toISOString();
  return memberAddedBy;
}

export function removeMember(config: GuildConfig, roleId: string, memberId: string): Record<string, Record<string, Record<string, string>>> {
  const memberAddedBy = { ...(config.memberAddedBy || {}) };
  if (memberAddedBy[roleId]) {
    for (const [addedById, members] of Object.entries(memberAddedBy[roleId])) {
      if (members[memberId]) {
        delete memberAddedBy[roleId][addedById][memberId];
        // Clear empty objects
        if (Object.keys(memberAddedBy[roleId][addedById]).length === 0) {
          delete memberAddedBy[roleId][addedById];
        }
        if (Object.keys(memberAddedBy[roleId]).length === 0) {
          delete memberAddedBy[roleId];
        }
      }
    }
  }
  return memberAddedBy;
}

export function getMembersAddedByUser(config: GuildConfig, roleId: string, userId: string): string[] {
  const roleMembers = config.memberAddedBy?.[roleId]?.[userId] || {};
  return Object.keys(roleMembers);
}
