import type { JsonSchema, JsonSchemaProperty, Parameter } from "../model/types";

export function buildInputSchema(parameters: Parameter[]): JsonSchema {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];
  for (const parameter of parameters) {
    const property: JsonSchemaProperty = {
      type: parameter.jsonType,
      description: parameter.description,
    };
    if (parameter.enumValues && parameter.enumValues.length > 0) {
      property.enum = parameter.enumValues;
    }
    properties[parameter.key] = property;
    if (parameter.required) required.push(parameter.key);
  }
  const schema: JsonSchema = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  return schema;
}
