import { guildConfigs, type GuildConfig, type InsertGuildConfig } from "@shared/schema";

export interface IStorage {
  getGuildConfig(guildId: string): Promise<GuildConfig | undefined>;
  saveGuildConfig(config: InsertGuildConfig): Promise<GuildConfig>;
  updateGuildConfig(guildId: string, config: Partial<InsertGuildConfig>): Promise<GuildConfig>;
}

export class MemStorage implements IStorage {
  private configs: Map<string, GuildConfig>;
  private currentId: number;

  constructor() {
    this.configs = new Map();
    this.currentId = 1;
  }

  async getGuildConfig(guildId: string): Promise<GuildConfig | undefined> {
    return Array.from(this.configs.values()).find(
      (config) => config.guildId === guildId,
    );
  }

  async saveGuildConfig(insertConfig: InsertGuildConfig): Promise<GuildConfig> {
    const id = this.currentId++;
    const config: GuildConfig = {
      id,
      guildId: insertConfig.guildId,
      firstLadyRoleId: insertConfig.firstLadyRoleId ?? null,
      antiBanRoleId: insertConfig.antiBanRoleId ?? null,
      fourUnitRoleId: insertConfig.fourUnitRoleId ?? null,
      roleLimits: insertConfig.roleLimits ?? [],
      allowedRoles: insertConfig.allowedRoles ?? [],
      fourUnitAllowedRoles: insertConfig.fourUnitAllowedRoles ?? [],
    };
    this.configs.set(config.guildId, config);
    return config;
  }

  async updateGuildConfig(
    guildId: string,
    updates: Partial<InsertGuildConfig>,
  ): Promise<GuildConfig> {
    const existing = await this.getGuildConfig(guildId);
    if (!existing) {
      throw new Error("Guild config not found");
    }

    const updated: GuildConfig = {
      ...existing,
      ...updates,
      guildId: existing.guildId, // Ensure guildId is not overwritten
    };

    this.configs.set(guildId, updated);
    return updated;
  }
}

export const storage = new MemStorage();