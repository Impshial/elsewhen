import { z } from 'zod';
export const scenarioSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    commands: z.array(z.string().min(1).max(8000)).max(1000),
    ending: z.string().default(''),
  })
  .strict();
export const scenariosSchema = z
  .object({
    format: z.literal('elsewhen-scenarios'),
    schemaVersion: z.literal(1),
    scenarios: z.array(scenarioSchema).max(100),
  })
  .strict();
export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioResult = {
  passed: boolean;
  steps: { command: string; passed: boolean; output: string[]; error?: string }[];
  ending: string | null;
  turn: number;
};
