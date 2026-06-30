import { useGlobalSearchParams } from "expo-router";
import { createContext, createElement, use, useMemo, useRef, type ReactNode } from "react";
import {
  EnvironmentId,
  type OrchestrationThread,
  ThreadId,
  type ScopedProjectRef,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import * as Option from "effect/Option";

import { useProject, useThreadShell } from "../state/entities";
import { useEnvironmentThread } from "../state/threads";
import {
  useRemoteEnvironmentRuntime,
  useSavedRemoteConnection,
} from "./use-remote-environment-registry";

function firstRouteParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function latestUserMessageAt(thread: OrchestrationThread): OrchestrationThread["updatedAt"] | null {
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index];
    if (message?.role === "user") {
      return message.createdAt;
    }
  }

  return null;
}

function threadDetailToShell(
  environmentId: EnvironmentId,
  thread: OrchestrationThread,
): EnvironmentThreadShell {
  return {
    environmentId,
    id: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    modelSelection: thread.modelSelection,
    runtimeMode: thread.runtimeMode,
    interactionMode: thread.interactionMode,
    branch: thread.branch,
    worktreePath: thread.worktreePath,
    latestTurn: thread.latestTurn,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    archivedAt: thread.archivedAt,
    session: thread.session,
    latestUserMessageAt: latestUserMessageAt(thread),
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

function useResolvedThreadSelection() {
  const params = useGlobalSearchParams<{
    environmentId?: string | string[];
    threadId?: string | string[];
  }>();
  const routeThreadRef = useMemo<ScopedThreadRef | null>(() => {
    const environmentId = firstRouteParam(params.environmentId);
    const threadId = firstRouteParam(params.threadId);
    if (!environmentId || !threadId) {
      return null;
    }

    return {
      environmentId: EnvironmentId.make(environmentId),
      threadId: ThreadId.make(threadId),
    };
  }, [params.environmentId, params.threadId]);
  const lastRouteThreadRef = useRef<ScopedThreadRef | null>(null);
  if (routeThreadRef !== null) {
    lastRouteThreadRef.current = routeThreadRef;
  }
  const selectedThreadRef = routeThreadRef ?? lastRouteThreadRef.current;
  const selectedThreadShell = useThreadShell(selectedThreadRef);
  const selectedThreadDetailState = useEnvironmentThread(
    selectedThreadRef?.environmentId ?? null,
    selectedThreadRef?.threadId ?? null,
  );
  const selectedThreadDetail = Option.getOrNull(selectedThreadDetailState.data);
  const selectedThread = useMemo(
    () =>
      selectedThreadShell ??
      (selectedThreadRef !== null && selectedThreadDetail !== null
        ? threadDetailToShell(selectedThreadRef.environmentId, selectedThreadDetail)
        : null),
    [selectedThreadDetail, selectedThreadRef, selectedThreadShell],
  );
  const selectedThreadDetailLoading =
    selectedThreadRef !== null &&
    selectedThread === null &&
    selectedThreadDetailState.status !== "deleted" &&
    Option.isNone(selectedThreadDetailState.error);
  const selectedProjectRef = useMemo<ScopedProjectRef | null>(
    () =>
      selectedThread === null
        ? null
        : {
            environmentId: selectedThread.environmentId,
            projectId: selectedThread.projectId,
          },
    [selectedThread],
  );
  const selectedThreadProject = useProject(selectedProjectRef);
  const selectedEnvironmentId = selectedThread?.environmentId ?? null;
  const selectedEnvironmentConnection = useSavedRemoteConnection(selectedEnvironmentId);
  const selectedEnvironmentRuntime = useRemoteEnvironmentRuntime(selectedEnvironmentId);

  return useMemo(
    () => ({
      selectedThreadRef,
      selectedThread,
      selectedThreadDetailLoading,
      selectedThreadProject,
      selectedEnvironmentConnection,
      selectedEnvironmentRuntime,
    }),
    [
      selectedEnvironmentConnection,
      selectedEnvironmentRuntime,
      selectedThread,
      selectedThreadDetailLoading,
      selectedThreadProject,
      selectedThreadRef,
    ],
  );
}

type ThreadSelectionState = ReturnType<typeof useResolvedThreadSelection>;

const ThreadSelectionContext = createContext<ThreadSelectionState | null>(null);

export function ThreadSelectionProvider(props: { readonly children: ReactNode }) {
  const selection = useResolvedThreadSelection();
  return createElement(ThreadSelectionContext.Provider, { value: selection }, props.children);
}

export function useThreadSelection(): ThreadSelectionState {
  const selection = use(ThreadSelectionContext);
  if (selection === null) {
    throw new Error("useThreadSelection must be used within ThreadSelectionProvider");
  }
  return selection;
}
