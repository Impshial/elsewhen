import { z } from 'zod';
import { canonicalActionSchema, scalar } from './index';
export const phraseSchema = z
  .object({ text: z.string(), quoted: z.boolean().default(false) })
  .strict();
export const parsedCommandSchema = z
  .object({
    actionId: z.string(),
    formId: z.string(),
    input: z.string(),
    phrases: z.record(z.string(), phraseSchema),
    bindings: z.record(z.string(), z.union([scalar, z.array(z.string()).max(100)])),
    selector: z.string().optional(),
    multiple: z.boolean().default(false),
  })
  .strict();
export type ParsedCommand = z.infer<typeof parsedCommandSchema>;
const candidateSchema = z
  .object({ id: z.string(), kind: z.enum(['entity', 'connection', 'topic']), label: z.string() })
  .strict();
const base = {
  command: parsedCommandSchema,
  role: z.string(),
  originalInput: z.string(),
  candidates: z.array(candidateSchema).max(10000),
  message: z.string(),
};
export const clarificationSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('missing') }).strict(),
  z.object({ ...base, kind: z.literal('entity') }).strict(),
  z
    .object({ ...base, kind: z.literal('quantity'), count: z.number().int().positive().max(100) })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('interpretation'),
      alternatives: z.array(parsedCommandSchema).max(128),
    })
    .strict(),
]);
export type Clarification = z.infer<typeof clarificationSchema>;
export const discourseSchema = z
  .object({
    object: z.string().nullable(),
    character: z.string().nullable(),
    plural: z.array(z.string()).max(100),
    recipient: z.string().nullable(),
    topic: z.string().nullable(),
    repeat: z
      .object({ action: canonicalActionSchema, selector: z.string().optional() })
      .strict()
      .nullable(),
  })
  .strict();
export type Discourse = z.infer<typeof discourseSchema>;
export const emptyDiscourse = (): Discourse => ({
  object: null,
  character: null,
  plural: [],
  recipient: null,
  topic: null,
  repeat: null,
});
