import {
  type CopilotSettings,
  type ModelCapabilities,
  ProviderDriverKind,
  type ServerProvider,
  type ServerProviderAuth,
  type ServerProviderModel,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { HttpClient } from "effect/unstable/http";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import type * as EffectAcpSchema from "effect-acp/schema";
import { createModelCapabilities } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";

import {
  buildSelectOptionDescriptor,
  buildServerProvider,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";
import {
  enrichProviderSnapshotWithVersionAdvisory,
  type ProviderMaintenanceCapabilities,
} from "../providerMaintenance.ts";
import { makeCopilotAcpRuntime } from "../acp/CopilotAcpSupport.ts";

const PROVIDER = ProviderDriverKind.make("copilot");
const COPILOT_PRESENTATION = {
  displayName: "GitHub Copilot",
  badgeLabel: "Preview",
  showInteractionModeToggle: true,
} as const;
const EMPTY_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [],
});
const VERSION_PROBE_TIMEOUT_MS = 4_000;
const ACP_DISCOVERY_TIMEOUT_MS = 15_000;

const COPILOT_BUILT_IN_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "auto",
    name: "Auto",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
];

interface CopilotAcpDiscoveryResult {
  readonly auth: ServerProviderAuth;
  readonly models: ReadonlyArray<ServerProviderModel>;
}

export function buildInitialCopilotProviderSnapshot(
  copilotSettings: CopilotSettings,
): Effect.Effect<ServerProviderDraft> {
  return Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
    const models = copilotModelsFromSettings(copilotSettings.customModels);

    if (!copilotSettings.enabled) {
      return buildServerProvider({
        presentation: COPILOT_PRESENTATION,
        enabled: false,
        checkedAt,
        models,
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "GitHub Copilot CLI is disabled in T3 Code settings.",
        },
      });
    }

    return buildServerProvider({
      presentation: COPILOT_PRESENTATION,
      enabled: true,
      checkedAt,
      models,
      probe: {
        installed: true,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Checking GitHub Copilot CLI availability...",
      },
    });
  });
}

function copilotModelsFromSettings(
  customModels: ReadonlyArray<string> | undefined,
  discoveredModels: ReadonlyArray<ServerProviderModel> = COPILOT_BUILT_IN_MODELS,
): ReadonlyArray<ServerProviderModel> {
  return providerModelsFromSettings(
    discoveredModels,
    PROVIDER,
    customModels ?? [],
    EMPTY_CAPABILITIES,
  );
}

const runCopilotVersionCommand = (
  copilotSettings: CopilotSettings,
  environment: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const command = copilotSettings.binaryPath || "copilot";
    const spawnCommand = yield* resolveSpawnCommand(command, ["--version"], {
      env: environment,
    });
    return yield* spawnAndCollect(
      command,
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        env: environment,
        shell: spawnCommand.shell,
      }),
    );
  });

function flattenSessionConfigSelectOptions(
  configOption: EffectAcpSchema.SessionConfigOption | undefined,
): ReadonlyArray<{ readonly value: string; readonly name: string }> {
  if (!configOption || configOption.type !== "select") {
    return [];
  }
  return configOption.options.flatMap((entry) =>
    "value" in entry
      ? [
          {
            value: entry.value.trim(),
            name: entry.name.trim(),
          },
        ]
      : entry.options.map((option) => ({
          value: option.value.trim(),
          name: option.name.trim(),
        })),
  );
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

function buildCopilotCapabilitiesFromConfigOptions(
  configOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption> | null | undefined,
): ModelCapabilities {
  if (!configOptions || configOptions.length === 0) {
    return EMPTY_CAPABILITIES;
  }

  const reasoningOption = findCopilotReasoningConfigOption(configOptions);
  const currentReasoningValue =
    typeof reasoningOption?.currentValue === "string" ? reasoningOption.currentValue : undefined;
  const reasoningLevels = flattenSessionConfigSelectOptions(reasoningOption).flatMap((entry) => {
    const value = normalizeCopilotReasoningValue(entry.value);
    if (!value) {
      return [];
    }
    return [
      {
        value,
        label: entry.name || entry.value,
        ...(normalizeCopilotReasoningValue(currentReasoningValue) === value
          ? { isDefault: true }
          : {}),
      },
    ];
  });

  return createModelCapabilities({
    optionDescriptors:
      reasoningLevels.length > 0
        ? [
            buildSelectOptionDescriptor({
              id: "reasoning",
              label: reasoningOption?.name.trim() || "Reasoning",
              options: reasoningLevels,
            }),
          ]
        : [],
  });
}

function modelsFromSessionModelState(
  modelState: EffectAcpSchema.SessionModelState | null | undefined,
  capabilities: ModelCapabilities,
): ReadonlyArray<ServerProviderModel> {
  const seen = new Set<string>();
  const models: Array<ServerProviderModel> = [];
  for (const model of modelState?.availableModels ?? []) {
    const slug = model.modelId.trim();
    const name = model.name.trim();
    if (!slug || !name || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    models.push({
      slug,
      name,
      isCustom: false,
      capabilities,
    });
  }
  return models;
}

const discoverCopilotModelsViaAcp = (
  copilotSettings: CopilotSettings,
  environment: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const runtime = yield* makeCopilotAcpRuntime({
      copilotSettings,
      environment,
      childProcessSpawner: spawner,
      cwd: process.cwd(),
      clientInfo: { name: "t3-code-provider-probe", version: "0.0.0" },
    });
    const started = yield* runtime.start();
    const capabilities = buildCopilotCapabilitiesFromConfigOptions(
      started.sessionSetupResult.configOptions,
    );
    return {
      auth: {
        status: "authenticated",
        type: "copilot-cli",
        label: "Copilot CLI",
      },
      models: modelsFromSessionModelState(started.sessionSetupResult.models, capabilities),
    } satisfies CopilotAcpDiscoveryResult;
  }).pipe(Effect.scoped);

export const checkCopilotProviderStatus = Effect.fn("checkCopilotProviderStatus")(function* (
  copilotSettings: CopilotSettings,
  environment: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<ServerProviderDraft, never, ChildProcessSpawner.ChildProcessSpawner> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  const models = copilotModelsFromSettings(copilotSettings.customModels);

  if (!copilotSettings.enabled) {
    return buildServerProvider({
      presentation: COPILOT_PRESENTATION,
      enabled: false,
      checkedAt,
      models,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "GitHub Copilot CLI is disabled in T3 Code settings.",
      },
    });
  }

  const versionResult = yield* runCopilotVersionCommand(copilotSettings, environment).pipe(
    Effect.timeoutOption(VERSION_PROBE_TIMEOUT_MS),
    Effect.result,
  );

  if (Result.isFailure(versionResult)) {
    const error = versionResult.failure;
    yield* Effect.logWarning("GitHub Copilot CLI health check failed.", {
      errorTag: error._tag,
    });
    return buildServerProvider({
      presentation: COPILOT_PRESENTATION,
      enabled: copilotSettings.enabled,
      checkedAt,
      models,
      probe: {
        installed: !isCommandMissingCause(error),
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: isCommandMissingCause(error)
          ? "GitHub Copilot CLI (`copilot`) is not installed or not on PATH."
          : "Failed to execute GitHub Copilot CLI health check.",
      },
    });
  }

  if (Option.isNone(versionResult.success)) {
    return buildServerProvider({
      presentation: COPILOT_PRESENTATION,
      enabled: copilotSettings.enabled,
      checkedAt,
      models,
      probe: {
        installed: true,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: "GitHub Copilot CLI is installed but timed out while running `copilot --version`.",
      },
    });
  }

  const versionOutput = versionResult.success.value;
  const version = parseGenericCliVersion(`${versionOutput.stdout}\n${versionOutput.stderr}`);
  if (versionOutput.code !== 0) {
    yield* Effect.logWarning("GitHub Copilot CLI version probe exited with a non-zero status.", {
      exitCode: versionOutput.code,
      stdoutLength: versionOutput.stdout.length,
      stderrLength: versionOutput.stderr.length,
    });
    return buildServerProvider({
      presentation: COPILOT_PRESENTATION,
      enabled: copilotSettings.enabled,
      checkedAt,
      models,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message: "GitHub Copilot CLI is installed but failed to run.",
      },
    });
  }

  const discoveryResult = yield* discoverCopilotModelsViaAcp(copilotSettings, environment).pipe(
    Effect.timeoutOption(ACP_DISCOVERY_TIMEOUT_MS),
    Effect.result,
  );

  if (Result.isFailure(discoveryResult)) {
    yield* Effect.logWarning("GitHub Copilot ACP discovery failed.", {
      errorTag: discoveryResult.failure._tag,
    });
    return buildServerProvider({
      presentation: COPILOT_PRESENTATION,
      enabled: copilotSettings.enabled,
      checkedAt,
      models,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unauthenticated" },
        message:
          "GitHub Copilot CLI is installed, but ACP session discovery failed. Run `copilot login` and try again.",
      },
    });
  }

  if (Option.isNone(discoveryResult.success)) {
    return buildServerProvider({
      presentation: COPILOT_PRESENTATION,
      enabled: copilotSettings.enabled,
      checkedAt,
      models,
      probe: {
        installed: true,
        version,
        status: "warning",
        auth: { status: "unknown" },
        message: "GitHub Copilot ACP model discovery timed out.",
      },
    });
  }

  const discovered = discoveryResult.success.value;
  const discoveredModels =
    discovered.models.length > 0
      ? copilotModelsFromSettings(copilotSettings.customModels, discovered.models)
      : models;

  return buildServerProvider({
    presentation: COPILOT_PRESENTATION,
    enabled: copilotSettings.enabled,
    checkedAt,
    models: discoveredModels,
    probe: {
      installed: true,
      version,
      status: discovered.models.length > 0 ? "ready" : "warning",
      auth: discovered.auth,
      ...(discovered.models.length === 0
        ? { message: "GitHub Copilot ACP discovery returned no models." }
        : {}),
    },
  });
});

export const enrichCopilotSnapshot = (input: {
  readonly snapshot: ServerProvider;
  readonly maintenanceCapabilities: ProviderMaintenanceCapabilities;
  readonly enableProviderUpdateChecks?: boolean;
  readonly publishSnapshot: (snapshot: ServerProvider) => Effect.Effect<void>;
  readonly httpClient: HttpClient.HttpClient;
}): Effect.Effect<void> =>
  enrichProviderSnapshotWithVersionAdvisory(input.snapshot, input.maintenanceCapabilities, {
    enableProviderUpdateChecks: input.enableProviderUpdateChecks,
  }).pipe(
    Effect.provideService(HttpClient.HttpClient, input.httpClient),
    Effect.flatMap((enrichedSnapshot) => input.publishSnapshot(enrichedSnapshot)),
    Effect.catchCause((cause) =>
      Effect.logWarning("GitHub Copilot provider snapshot enrichment failed.", { cause }),
    ),
  );
