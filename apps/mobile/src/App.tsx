import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
  useFonts,
} from "@expo-google-fonts/dm-sans";
import { NavigationContainer, type NavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import { use, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { StatusBar, useColorScheme, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useResolveClassNames } from "uniwind";

import { RegistryContext } from "@effect/atom-react";
import { LoadingScreen } from "./components/LoadingScreen";
import { ArchivedThreadsRouteScreen } from "./features/archive/ArchivedThreadsRouteScreen";
import { useAgentNotificationNavigation } from "./features/agent-awareness/notificationNavigation";
import { CloudAuthProvider } from "./features/cloud/CloudAuthProvider";
import {
  ClerkSettingsSheetDetentProvider,
  useClerkSettingsSheetDetent,
} from "./features/cloud/ClerkSettingsSheetDetent";
import {
  AdaptiveWorkspaceLayout,
  useAdaptiveWorkspaceLayout,
} from "./features/layout/AdaptiveWorkspaceLayout";
import { deriveStableFormSheetDetent } from "./lib/layout";
import { useThemeColor } from "./lib/useThemeColor";
import { appAtomRegistry } from "./state/atom-registry";
import { ThreadSelectionProvider } from "./state/use-thread-selection";
import { useThreadOutboxDrain } from "./state/use-thread-outbox-drain";
import HomeRouteScreen from "./screens/index";
import SettingsRouteScreen from "./screens/settings/index";
import SettingsEnvironmentsRouteScreen from "./screens/settings/environments";
import SettingsAuthRouteScreen from "./screens/settings/auth";
import SettingsWaitlistRouteScreen from "./screens/settings/waitlist";
import ConnectionsRouteScreen from "./screens/connections/index";
import ConnectionsNewRouteScreen from "./screens/connections/new";
import NewTaskRoute from "./screens/new/index";
import AddProjectRoute from "./screens/new/add-project/index";
import AddProjectRepositoryRoute from "./screens/new/add-project/repository";
import AddProjectDestinationRoute from "./screens/new/add-project/destination";
import AddProjectLocalRoute from "./screens/new/add-project/local";
import NewTaskDraftRoute from "./screens/new/draft";
import { NewTaskFlowProvider } from "./features/threads/new-task-flow-provider";
import RnsGlassDebugRoute from "./screens/debug/rns-glass";
import NotFoundRoute from "./screens/+not-found";
import { ThreadFilesTreeScreen, ThreadFileScreen } from "./features/files/ThreadFilesRouteScreen";
import { ReviewHighlighterProvider } from "./features/review/ReviewHighlighterProvider";
import { ReviewCommentComposerSheet } from "./features/review/ReviewCommentComposerSheet";
import { ReviewSheet } from "./features/review/ReviewSheet";
import { ThreadTerminalRouteScreen } from "./features/terminal/ThreadTerminalRouteScreen";
import { ThreadRouteScreen } from "./features/threads/ThreadRouteScreen";
import { GitBranchesSheet } from "./features/threads/git/GitBranchesSheet";
import { GitCommitSheet } from "./features/threads/git/GitCommitSheet";
import { GitConfirmSheet } from "./features/threads/git/GitConfirmSheet";
import { GitOverviewSheet } from "./features/threads/git/GitOverviewSheet";
import { HardwareKeyboardCommandProvider } from "./features/keyboard/HardwareKeyboardCommandProvider";
import {
  AppNavigationContext,
  createRouter,
  pathAndParamsFromCurrentRoute,
} from "./navigation/router";
import {
  getFocusedRoute,
  type AppStackParamList,
  type RouteParams,
} from "./navigation/route-model";

import "../global.css";

const RootStack = createNativeStackNavigator<AppStackParamList>();

const linking = {
  prefixes: [Linking.createURL("/"), "t3code://", "t3code-dev://", "t3code-preview://"],
  config: {
    screens: {
      Home: "",
      DebugRnsGlass: "debug/rns-glass",
      Settings: "settings",
      SettingsEnvironments: "settings/environments",
      SettingsEnvironmentNew: "settings/environment-new",
      SettingsArchive: "settings/archive",
      SettingsAuth: "settings/auth",
      SettingsWaitlist: "settings/waitlist",
      Connections: "connections",
      ConnectionsNew: "connections/new",
      NewTask: "new",
      AddProject: "new/add-project",
      AddProjectRepository: "new/add-project/repository",
      AddProjectDestination: "new/add-project/destination",
      AddProjectLocal: "new/add-project/local",
      NewTaskDraft: "new/draft",
      Thread: "threads/:environmentId/:threadId",
      ThreadTerminal: "threads/:environmentId/:threadId/terminal",
      ThreadReview: "threads/:environmentId/:threadId/review",
      ThreadReviewComment: "threads/:environmentId/:threadId/review-comment",
      ThreadFiles: "threads/:environmentId/:threadId/files",
      ThreadFile: "threads/:environmentId/:threadId/files/:path*",
      GitOverview: "threads/:environmentId/:threadId/git",
      GitCommit: "threads/:environmentId/:threadId/git/commit",
      GitBranches: "threads/:environmentId/:threadId/git/branches",
      GitConfirm: "threads/:environmentId/:threadId/git-confirm",
      NotFound: "*",
    },
  },
};

function ThreadSelectionRoute(props: { readonly children: ReactNode }) {
  return <ThreadSelectionProvider>{props.children}</ThreadSelectionProvider>;
}

function ThreadRoute() {
  return (
    <ThreadSelectionRoute>
      <ThreadRouteScreen />
    </ThreadSelectionRoute>
  );
}

function ThreadTerminalRoute() {
  return (
    <ThreadSelectionRoute>
      <ThreadTerminalRouteScreen />
    </ThreadSelectionRoute>
  );
}

function ThreadFilesRoute() {
  return (
    <ThreadSelectionRoute>
      <ThreadFilesTreeScreen />
    </ThreadSelectionRoute>
  );
}

function ThreadFileRoute() {
  return (
    <ThreadSelectionRoute>
      <ThreadFileScreen />
    </ThreadSelectionRoute>
  );
}

function ThreadReviewRoute() {
  return (
    <ThreadSelectionRoute>
      <ReviewHighlighterProvider>
        <ReviewSheet />
      </ReviewHighlighterProvider>
    </ThreadSelectionRoute>
  );
}

function ThreadReviewCommentRoute() {
  return (
    <ThreadSelectionRoute>
      <ReviewCommentComposerSheet />
    </ThreadSelectionRoute>
  );
}

function GitOverviewRoute() {
  return (
    <ThreadSelectionRoute>
      <GitOverviewSheet />
    </ThreadSelectionRoute>
  );
}

function GitCommitRoute() {
  return (
    <ThreadSelectionRoute>
      <GitCommitSheet />
    </ThreadSelectionRoute>
  );
}

function GitBranchesRoute() {
  return (
    <ThreadSelectionRoute>
      <GitBranchesSheet />
    </ThreadSelectionRoute>
  );
}

function GitConfirmRoute() {
  return (
    <ThreadSelectionRoute>
      <GitConfirmSheet />
    </ThreadSelectionRoute>
  );
}

function NewTaskDraftWithProvider() {
  return (
    <NewTaskFlowProvider>
      <NewTaskDraftRoute />
    </NewTaskFlowProvider>
  );
}

function AppNavigationProvider(props: { readonly children: ReactNode }) {
  const navigationRef = useRef<NavigationContainerRef<AppStackParamList>>(null);
  const [pathname, setPathname] = useState("/");
  const [params, setParams] = useState<RouteParams>({});
  const router = useMemo(() => createRouter(navigationRef), []);
  const contextValue = useMemo(
    () => ({
      navigationRef,
      pathname,
      params,
      router,
    }),
    [params, pathname, router],
  );
  const syncState = useCallback(() => {
    const route = getFocusedRoute(navigationRef.current?.getRootState());
    if (!route) {
      setPathname("/");
      setParams({});
      return;
    }

    const current = pathAndParamsFromCurrentRoute(route);
    setPathname(current.pathname);
    setParams(current.params);
  }, []);

  return (
    <AppNavigationContext.Provider value={contextValue}>
      <NavigationContainer
        linking={linking}
        onReady={syncState}
        onStateChange={syncState}
        ref={navigationRef}
      >
        {props.children}
      </NavigationContainer>
    </AppNavigationContext.Provider>
  );
}

function AppNavigator() {
  const pathname = usePathnameFromContext();
  const expandedSettingsRouteIsActive =
    pathname === "/settings/archive" || pathname === "/settings/auth";

  return (
    <ClerkSettingsSheetDetentProvider initiallyExpanded={expandedSettingsRouteIsActive}>
      <AppNavigatorContent />
    </ClerkSettingsSheetDetentProvider>
  );
}

function usePathnameFromContext() {
  const context = use(AppNavigationContext);
  if (context === null) {
    return "/";
  }
  return context.pathname;
}

function AppNavigatorContent() {
  const pathname = usePathnameFromContext();
  const isDebugRoute = pathname.startsWith("/debug/");

  if (isDebugRoute) {
    return <DebugNavigatorHost />;
  }

  return <WorkspaceNavigatorHost />;
}

function DebugNavigatorHost() {
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="DebugRnsGlass" component={RnsGlassDebugRoute} />
        <RootStack.Screen name="Home" component={HomeRouteScreen} />
        <RootStack.Screen name="NotFound" component={NotFoundRoute} />
      </RootStack.Navigator>
    </>
  );
}

function WorkspaceNavigatorHost() {
  const colorScheme = useColorScheme();
  const statusBarBg = useThemeColor("--color-status-bar");
  useAgentNotificationNavigation();
  useThreadOutboxDrain();

  return (
    <>
      <StatusBar
        barStyle={colorScheme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={String(statusBarBg)}
        translucent
      />
      <AdaptiveWorkspaceLayout>
        <WorkspaceNavigator />
      </AdaptiveWorkspaceLayout>
    </>
  );
}

function WorkspaceNavigator() {
  const { collapse, isExpanded } = useClerkSettingsSheetDetent();
  const { layout } = useAdaptiveWorkspaceLayout();
  const { height } = useWindowDimensions();
  const sheetStyle = useResolveClassNames("bg-sheet");

  const handleSettingsTransitionEnd = useCallback(
    (event: { data: { closing: boolean } }) => {
      if (event.data.closing) {
        collapse();
      }
    },
    [collapse],
  );

  const connectionSheetScreenOptions = {
    contentStyle: sheetStyle,
    gestureEnabled: true,
    headerShown: false,
    presentation: "formSheet" as const,
    sheetAllowedDetents: [0.55, 0.7],
    sheetGrabberVisible: true,
  };
  const settingsScreenOptions = layout.usesSplitView
    ? {
        animation: "none" as const,
        contentStyle: sheetStyle,
        gestureEnabled: false,
        headerShown: false,
        presentation: "card" as const,
      }
    : {
        ...connectionSheetScreenOptions,
        sheetAllowedDetents: isExpanded ? [0.92] : [0.7],
      };
  const newTaskScreenOptions = {
    contentStyle: sheetStyle,
    gestureEnabled: true,
    headerShown: false,
    presentation: "formSheet" as const,
    sheetAllowedDetents: [layout.usesSplitView ? deriveStableFormSheetDetent(height) : 0.92],
    sheetGrabberVisible: !layout.usesSplitView,
  };

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen
        name="Home"
        component={HomeRouteScreen}
        options={{
          contentStyle: { backgroundColor: "transparent" },
          headerShown: true,
          headerTransparent: true,
          headerShadowVisible: false,
        }}
      />
      <RootStack.Screen
        name="Settings"
        component={SettingsRouteScreen}
        listeners={{ transitionEnd: handleSettingsTransitionEnd }}
        options={settingsScreenOptions}
      />
      <RootStack.Screen
        name="SettingsEnvironments"
        component={SettingsEnvironmentsRouteScreen}
        options={settingsScreenOptions}
      />
      <RootStack.Screen
        name="SettingsEnvironmentNew"
        component={ConnectionsNewRouteScreen}
        options={settingsScreenOptions}
      />
      <RootStack.Screen
        name="SettingsArchive"
        component={ArchivedThreadsRouteScreen}
        listeners={{ transitionEnd: handleSettingsTransitionEnd }}
        options={settingsScreenOptions}
      />
      <RootStack.Screen
        name="SettingsAuth"
        component={SettingsAuthRouteScreen}
        listeners={{ transitionEnd: handleSettingsTransitionEnd }}
        options={settingsScreenOptions}
      />
      <RootStack.Screen
        name="SettingsWaitlist"
        component={SettingsWaitlistRouteScreen}
        options={settingsScreenOptions}
      />
      <RootStack.Screen
        name="Connections"
        component={ConnectionsRouteScreen}
        options={connectionSheetScreenOptions}
      />
      <RootStack.Screen
        name="ConnectionsNew"
        component={ConnectionsNewRouteScreen}
        options={connectionSheetScreenOptions}
      />
      <RootStack.Screen name="NewTask" component={NewTaskRoute} options={newTaskScreenOptions} />
      <RootStack.Screen
        name="AddProject"
        component={AddProjectRoute}
        options={newTaskScreenOptions}
      />
      <RootStack.Screen
        name="AddProjectRepository"
        component={AddProjectRepositoryRoute}
        options={newTaskScreenOptions}
      />
      <RootStack.Screen
        name="AddProjectDestination"
        component={AddProjectDestinationRoute}
        options={newTaskScreenOptions}
      />
      <RootStack.Screen
        name="AddProjectLocal"
        component={AddProjectLocalRoute}
        options={newTaskScreenOptions}
      />
      <RootStack.Screen
        name="NewTaskDraft"
        component={NewTaskDraftWithProvider}
        options={newTaskScreenOptions}
      />
      <RootStack.Screen
        name="Thread"
        component={ThreadRoute}
        options={{
          animation: layout.usesSplitView ? "none" : "slide_from_right",
          contentStyle: { backgroundColor: "transparent" },
          gestureEnabled: !layout.usesSplitView,
          headerShown: false,
        }}
      />
      <RootStack.Screen
        name="ThreadTerminal"
        component={ThreadTerminalRoute}
        options={{ contentStyle: sheetStyle, headerShown: false }}
      />
      <RootStack.Screen
        name="ThreadReview"
        component={ThreadReviewRoute}
        options={{ contentStyle: sheetStyle, headerShown: false }}
      />
      <RootStack.Screen
        name="ThreadReviewComment"
        component={ThreadReviewCommentRoute}
        options={{
          contentStyle: sheetStyle,
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.72, 0.92],
          sheetGrabberVisible: true,
        }}
      />
      <RootStack.Screen
        name="ThreadFiles"
        component={ThreadFilesRoute}
        options={{ contentStyle: sheetStyle, headerShown: false }}
      />
      <RootStack.Screen
        name="ThreadFile"
        component={ThreadFileRoute}
        options={{ contentStyle: sheetStyle, headerShown: false }}
      />
      <RootStack.Screen
        name="GitOverview"
        component={GitOverviewRoute}
        options={{
          contentStyle: sheetStyle,
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.85],
          sheetGrabberVisible: true,
        }}
      />
      <RootStack.Screen
        name="GitCommit"
        component={GitCommitRoute}
        options={{ contentStyle: sheetStyle, headerShown: false }}
      />
      <RootStack.Screen
        name="GitBranches"
        component={GitBranchesRoute}
        options={{ contentStyle: sheetStyle, headerShown: false }}
      />
      <RootStack.Screen
        name="GitConfirm"
        component={GitConfirmRoute}
        options={{
          contentStyle: sheetStyle,
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.4],
          sheetGrabberVisible: true,
        }}
      />
      <RootStack.Screen
        name="DebugRnsGlass"
        component={RnsGlassDebugRoute}
        options={{
          animation: "none",
          contentStyle: { backgroundColor: "transparent" },
          headerShown: false,
        }}
      />
      <RootStack.Screen name="NotFound" component={NotFoundRoute} />
    </RootStack.Navigator>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  return (
    <RegistryContext.Provider value={appAtomRegistry}>
      <CloudAuthProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider statusBarTranslucent>
            <SafeAreaProvider>
              <AppNavigationProvider>
                <HardwareKeyboardCommandProvider>
                  {fontsLoaded ? (
                    <AppNavigator />
                  ) : (
                    <LoadingScreen message="Loading remote workspace…" />
                  )}
                </HardwareKeyboardCommandProvider>
              </AppNavigationProvider>
            </SafeAreaProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </CloudAuthProvider>
    </RegistryContext.Provider>
  );
}
