export interface SkillContext {
  readonly runId: string;
  readonly signal?: AbortSignal;
}

export type SkillResult<T> =
  | { kind: "completed"; runId: string; output: T }
  | { kind: "awaiting_approval"; runId: string; approvalKind: string; output: T };

export interface AgentSkill<TInput, TOutput> {
  readonly id: string;
  run(input: TInput, context: SkillContext): Promise<SkillResult<TOutput>>;
}

export interface AgentHarness {
  register<TInput, TOutput>(skill: AgentSkill<TInput, TOutput>): void;
  run<TInput, TOutput>(skillId: string, input: TInput, runId: string): Promise<SkillResult<TOutput>>;
}

export class InMemoryAgentHarness implements AgentHarness {
  private readonly skills = new Map<string, AgentSkill<unknown, unknown>>();

  register<TInput, TOutput>(skill: AgentSkill<TInput, TOutput>): void {
    if (this.skills.has(skill.id)) throw new Error(`SKILL_ALREADY_REGISTERED:${skill.id}`);
    this.skills.set(skill.id, skill as AgentSkill<unknown, unknown>);
  }

  async run<TInput, TOutput>(skillId: string, input: TInput, runId: string): Promise<SkillResult<TOutput>> {
    const skill = this.skills.get(skillId);
    if (!skill) throw new Error(`SKILL_NOT_FOUND:${skillId}`);
    if (!runId.trim()) throw new Error("RUN_ID_REQUIRED");
    return skill.run(input, { runId }) as Promise<SkillResult<TOutput>>;
  }
}
