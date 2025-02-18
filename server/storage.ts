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
    try {
      const [config] = await db
        .select()
        .from(guildConfigs)
        .where(eq(guildConfigs.guildId, guildId));
      return config;
    } catch (error) {
      console.error(`Erro ao buscar configuração do servidor ${guildId}:`, error);
      throw error;
    }
  }

  async saveGuildConfig(insertConfig: InsertGuildConfig): Promise<GuildConfig> {
    try {
      // Verificar se já existe uma configuração para este servidor
      const existing = await this.getGuildConfig(insertConfig.guildId);
      if (existing) {
        return this.updateGuildConfig(insertConfig.guildId, insertConfig);
      }

      const [config] = await db
        .insert(guildConfigs)
        .values(insertConfig)
        .returning();
      return config;
    } catch (error) {
      console.error(`Erro ao salvar configuração do servidor ${insertConfig.guildId}:`, error);
      throw error;
    }
  }

  async updateGuildConfig(
    guildId: string,
    updates: Partial<InsertGuildConfig>,
  ): Promise<GuildConfig> {
    try {
      const [updated] = await db
        .update(guildConfigs)
        .set(updates)
        .where(eq(guildConfigs.guildId, guildId))
        .returning();

      if (!updated) {
        throw new Error(`Configuração não encontrada para o servidor ${guildId}`);
      }

      return updated;
    } catch (error) {
      console.error(`Erro ao atualizar configuração do servidor ${guildId}:`, error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();