import type { MemoryType } from '@hype/db';
import type { AppContext } from '../context.js';

/**
 * Persona memory retrieval (product-plan §7.1). V1 scoring: importance +
 * recency decay + keyword overlap. Embedding search arrives with pgvector.
 */
export class MemoryService {
  constructor(private readonly ctx: AppContext) {}

  async add(
    personaId: string,
    memory: {
      type: MemoryType;
      title: string;
      content: string;
      importance?: number;
      source?: string;
    },
  ) {
    return this.ctx.prisma.personaMemory.create({
      data: { personaId, importance: 0.5, ...memory },
    });
  }

  async search(personaId: string, query?: string, limit = 8) {
    const memories = await this.ctx.prisma.personaMemory.findMany({
      where: { personaId },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    const now = Date.now();
    const queryWords = new Set(
      (query ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 3),
    );

    const scored = memories.map((memory) => {
      const ageDays = (now - memory.updatedAt.getTime()) / 86_400_000;
      const recency = Math.exp(-ageDays / 60);
      let overlap = 0;
      if (queryWords.size > 0) {
        const words = new Set(memory.content.toLowerCase().split(/\W+/));
        for (const w of queryWords) if (words.has(w)) overlap++;
        overlap = overlap / queryWords.size;
      }
      return { memory, score: memory.importance + 0.3 * recency + 0.5 * overlap };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.memory);
  }
}
