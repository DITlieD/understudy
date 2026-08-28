export type TraceStatus = "raw" | "generalized" | "converted";

export type ValueOrigin = "typed" | "picked" | "derived" | "constant";

export type Provenance = {
  sourceControl: string;
  sourceField: string | null;
  valueOrigin: ValueOrigin;
};

export type TraceStep = {
  index: number;
  commandId: string;
  payload: Record<string, unknown>;
  provenance: Provenance;
  resultSummary: string;
};

export type FocusContext = {
  recordId: string | null;
};

export type Trace = {
  id: string;
  label: string;
  createdAt: string;
  authorLabel: string;
  focusContext: FocusContext;
  steps: TraceStep[];
  status: TraceStatus;
};

export type JsonType = "string" | "number" | "integer" | "boolean" | "array" | "object";

export type Parameter = {
  key: string;
  jsonType: JsonType;
  description: string;
  required: boolean;
  enumValues?: string[];
  sampleValue: unknown;
  sourceStepIndex: number;
};

export type BindingSource = "parameter" | "stepOutput" | "constant";

export type Binding = {
  targetStepIndex: number;
  targetPayloadPath: string;
  source: BindingSource;
  parameterKey?: string;
  sourceStepIndex?: number;
  resultPath?: string;
  frozenValue?: unknown;
};

export type ComputedAnnotations = {
  readOnlyHint: boolean;
  untrustedContentHint: boolean;
};

export type ProcedureDraft = {
  id: string;
  sourceTraceId: string;
  name: string;
  description: string;
  parameters: Parameter[];
  steps: TraceStep[];
  bindings: Binding[];
  computedAnnotations: ComputedAnnotations;
  validationErrors: string[];
};

export type PublishedProcedure = ProcedureDraft & {
  publishedAt: string;
  approvedBy: string;
  registrationId: string;
  invocationCount: number;
  successCount: number;
  lastError: string | null;
};

export type AuditEntry = {
  timestamp: string;
  actor: "human" | "agent";
  action: string;
  toolName: string;
  argsDigest: string;
  outcome: string;
};

export type ToolPack = {
  packVersion: number;
  exportedAt: string;
  sourceAppVersion: string;
  requiredCommandIds: string[];
  procedures: PublishedProcedure[];
};

export type JsonSchemaProperty = {
  type: JsonType;
  description?: string;
  enum?: string[];
};

export type JsonSchema = {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
};

export type CommandResult = {
  ok: boolean;
  summary: string;
  data: Record<string, unknown>;
};

export type CommandDefinition = {
  id: string;
  title: string;
  description: string;
  payloadSchema: JsonSchema;
  mutates: boolean;
  sensitive: boolean;
};

export type CommandHandler = (payload: Record<string, unknown>) => CommandResult;

export type RegisteredCommand = CommandDefinition & {
  handle: CommandHandler;
};

export type BusEvent = {
  commandId: string;
  payload: Record<string, unknown>;
  result: CommandResult;
  mutates: boolean;
};

export type BusListener = (event: BusEvent) => void;
