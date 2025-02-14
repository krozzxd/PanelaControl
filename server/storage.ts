import { guildConfigs, type GuildConfig, type InsertGuildConfig } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getGuildConfig(guildId: string): Promise<GuildConfig | undefined>;
  saveGuildConfig(config: InsertGuildConfig): Promise<GuildConfig>;
  updateGuildConfig(guildId: string, config: Partial<InsertGuildConfig>): Promise<GuildConfig>;
}

export class DatabaseStorage implements IStorage {
  async getGuildConfig(guildId: string): Promise<GuildConfig | undefined> {
    const [config] = await db
      .select()
      .from(guildConfigs)
      .where(eq(guildConfigs.guildId, guildId));
    return config;
  }

  async saveGuildConfig(insertConfig: InsertGuildConfig): Promise<GuildConfig> {
    const [config] = await db
      .insert(guildConfigs)
      .values(insertConfig)
      .returning();
    return config;
  }

  async updateGuildConfig(
    guildId: string,
    updates: Partial<InsertGuildConfig>,
  ): Promise<GuildConfig> {
    const [updated] = await db
      .update(guildConfigs)
      .set(updates)
      .where(eq(guildConfigs.guildId, guildId))
      .returning();

    if (!updated) {
      throw new Error("Guild config not found");
    }

    return updated;
  }
}

export const storage = new DatabaseStorage();