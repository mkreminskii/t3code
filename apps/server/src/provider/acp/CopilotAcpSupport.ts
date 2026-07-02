import { type CopilotSettings, type ProviderOptionSelection } from "@t3tools/contracts";
import { getProviderOptionStringSelectionValue } from "@t3tools/shared/model";
import { parseCliArgs } from "@t3tools/shared/cliArgs";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import type * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";

import * as AcpSessionRuntime from "./AcpSessionRuntime.ts";

type CopilotAcpRuntimeCopilotSettings = Pick<CopilotSettings, "binaryPath" | "launchArgs">;

export interface CopilotAcpRuntimeInput extends Omit<
  AcpSessionRuntime.AcpSessionRuntimeOptions,
  "authMethodId" | "spawn"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly copilotSettings: CopilotAcpRuntimeCopilotSettings | null | undefined;
  readonly environment?: NodeJS.ProcessEnv;
}

export function buildCopilotAcpSpawnInput(
  copilotSettings: CopilotAcpRuntimeCopilotSettings | null | undefined,
  cwd: string,
  environment?: NodeJS.ProcessEnv,
): AcpSessionRuntime.AcpSpawnInput {
  const parsedLaunchArgs = parseCliArgs(copilotSettings?.launchArgs ?? "");
  return {
    command: copilotSettings?.binaryPath || "copilot",
    args: [
      ...parsedLaunchArgs.positionals,
      ...flagsToArgs(parsedLaunchArgs.flags),
      "--acp",
      "--stdio",
    ],
    cwd,
    ...(environment ? { env: environment } : {}),
  };
}

function flagsToArgs(flags: Record<string, string | null>): ReadonlyArray<string> {
  return Object.entries(flags).flatMap(([key, value]) =>
    value === null ? [`--${key}`] : [`--${key}`, value],
  );
}

export const makeCopilotAcpRuntime = (
  input: CopilotAcpRuntimeInput,
): Effect.Effect<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  EffectAcpErrors.AcpError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildCopilotAcpSpawnInput(input.copilotSettings, input.cwd, input.environment),
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    return yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(
      Effect.provide(acpContext),
    );
  });

export function resolveCopilotAcpBaseModelId(model: string | null | undefined): string {
  return model?.trim() || "auto";
}

interface CopilotAcpModelSelectionRuntime {
  readonly getConfigOptions: AcpSessionRuntime.AcpSessionRuntime["Service"]["getConfigOptions"];
  readonly setConfigOption: (
    configId: string,
    value: string | boolean,
  ) => Effect.Effect<unknown, EffectAcpErrors.AcpError>;
  readonly setModel: (model: string) => Effect.Effect<unknown, EffectAcpErrors.AcpError>;
}

function normalizeCopilotReasoningValue(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "low":
    case "medium":
    case "high":
    case "xhigh":
    case "max":
      return normalized;
    case "extra-high":
    case "extra high":
      return "xhigh";
    default:
      return undefined;
  }
}

function flattenSelectOptions(
  option: EffectAcpSchema.SessionConfigOption | undefined,
): ReadonlyArray<{ readonly value: string; readonly name: string }> {
  if (!option || option.type !== "select") {
    return [];
  }
  return option.options.flatMap((entry) =>
    "value" in entry
      ? [{ value: entry.value.trim(), name: entry.name.trim() }]
      : entry.options.map((nested) => ({
          value: nested.value.trim(),
          name: nested.name.trim(),
        })),
  );
}

function findCopilotReasoningConfigOption(
  configOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption>,
): EffectAcpSchema.SessionConfigOption | undefined {
  return configOptions.find((option) => {
    if (option.type !== "select") return false;
    const id = option.id.trim().toLowerCase();
    const name = option.name.trim().toLowerCase();
    return (
      option.category === "thought_level" ||
      id === "reasoning_effort" ||
      id === "effort" ||
      name.includes("reasoning") ||
      name.includes("effort")
    );
  });
}

export interface CopilotAcpModelSelectionErrorContext {
  readonly cause: EffectAcpErrors.AcpError;
  readonly step: "set-config-option" | "set-model";
  readonly configId?: string;
}

export function applyCopilotAcpModelSelection<E>(input: {
  readonly runtime: CopilotAcpModelSelectionRuntime;
  readonly model: string | null | undefined;
  readonly selections: ReadonlyArray<ProviderOptionSelection> | null | undefined;
  readonly mapError: (context: CopilotAcpModelSelectionErrorContext) => E;
}): Effect.Effect<void, E> {
  return Effect.gen(function* () {
    yield* input.runtime.setModel(resolveCopilotAcpBaseModelId(input.model)).pipe(
      Effect.mapError((cause) =>
        input.mapError({
          cause,
          step: "set-model",
        }),
      ),
    );

    const requestedReasoning = normalizeCopilotReasoningValue(
      getProviderOptionStringSelectionValue(input.selections, "reasoning"),
    );
    if (!requestedReasoning) {
      return;
    }

    const reasoningOption = findCopilotReasoningConfigOption(yield* input.runtime.getConfigOptions);
    const value = flattenSelectOptions(reasoningOption).find((option) => {
      const normalizedValue = normalizeCopilotReasoningValue(option.value);
      const normalizedName = normalizeCopilotReasoningValue(option.name);
      return normalizedValue === requestedReasoning || normalizedName === requestedReasoning;
    })?.value;

    if (!reasoningOption || !value) {
      return;
    }

    yield* input.runtime.setConfigOption(reasoningOption.id, value).pipe(
      Effect.mapError((cause) =>
        input.mapError({
          cause,
          step: "set-config-option",
          configId: reasoningOption.id,
        }),
      ),
    );
  });
}
