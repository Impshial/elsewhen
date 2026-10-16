import { z } from 'zod';
import { scalar } from './index';
export const assertionSchema = z
  .object({
    step: z.number().int().nonnegative(),
    kind: z.enum([
      'action',
      'entity',
      'question',
      'refusal',
      'location',
      'inventory',
      'property',
      'variable',
      'turn',
      'ending',
      'textIncludes',
      'textExact',
    ]),
    ref: z.string().default(''),
    role: z.string().default(''),
    key: z.string().default(''),
    value: scalar.default(''),
  })
  .strict();
export const scenarioSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    commands: z.array(z.string().min(1).max(8000)).max(1000),
    ending: z.string().default(''),
    assertions: z.array(assertionSchema).max(10000).default([]),
  })
  .strict();
export const scenariosSchema = z
  .object({
    format: z.literal('elsewhen-scenarios'),
    schemaVersion: z.union([z.literal(1), z.literal(2)]).transform(() => 2 as const),
    scenarios: z.array(scenarioSchema).max(100),
  })
  .strict();
export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioResult = {
  passed: boolean;
  steps: {
    command: string;
    passed: boolean;
    output: string[];
    error?: string;
    outcome?: string;
    assertions?: { description: string; passed: boolean }[];
    action?: unknown;
    trace?: unknown;
    changes?: unknown;
  }[];
  ending: string | null;
  turn: number;
};
