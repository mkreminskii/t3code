import {
  CommonActions,
  StackActions,
  useFocusEffect,
  useNavigation,
  useRoute,
  type NavigationContainerRef,
  type ParamListBase,
} from "@react-navigation/native";
import type { ColorValue } from "react-native";
import type {
  NativeStackHeaderItem,
  NativeStackHeaderItemMenu,
  NativeStackNavigationOptions,
  NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import {
  Children,
  cloneElement,
  createContext,
  createElement,
  Fragment,
  isValidElement,
  use,
  useEffect,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";

import {
  buildPathFromRoute,
  resolveNavigationTarget,
  type AppHref,
  type AppStackParamList,
  type AppFocusedRoute,
  type RouteParams,
} from "./route-model";

export { useFocusEffect };
export type Href = AppHref;
type CompatNativeStackNavigationOptions = Omit<
  NativeStackNavigationOptions,
  "headerTintColor" | "unstable_headerLeftItems" | "unstable_headerRightItems"
> & {
  readonly headerTintColor?: string | ColorValue;
  readonly unstable_headerCenterItems?: unknown;
  readonly unstable_headerLeftItems?: unknown;
  readonly unstable_headerRightItems?: unknown;
  readonly unstable_headerSubtitle?: unknown;
  readonly unstable_headerToolbarItems?: unknown;
  readonly unstable_navigationItemStyle?: unknown;
};

export type { CompatNativeStackNavigationOptions as NativeStackNavigationOptions };

type RouterLike = {
  readonly push: (href: AppHref) => void;
  readonly replace: (href: AppHref) => void;
  readonly back: () => void;
  readonly dismiss: () => void;
  readonly dismissAll: () => void;
  readonly canGoBack: () => boolean;
  readonly setParams: (params: RouteParams) => void;
};

type NavigationContextValue = {
  readonly navigationRef: React.RefObject<NavigationContainerRef<AppStackParamList> | null>;
  readonly pathname: string;
  readonly params: RouteParams;
  readonly router: RouterLike;
};

export const AppNavigationContext = createContext<NavigationContextValue | null>(null);

export function useRouter(): RouterLike {
  const context = use(AppNavigationContext);
  if (context === null) {
    throw new Error("useRouter must be used within AppNavigationProvider");
  }
  return context.router;
}

export function usePathname(): string {
  const context = use(AppNavigationContext);
  if (context === null) {
    throw new Error("usePathname must be used within AppNavigationProvider");
  }
  return context.pathname;
}

export function useLocalSearchParams<T extends RouteParams = RouteParams>(): T {
  const route = useRoute();
  return (route.params ?? {}) as RouteParams as T;
}

export function useGlobalSearchParams<T extends RouteParams = RouteParams>(): T {
  const context = use(AppNavigationContext);
  if (context === null) {
    throw new Error("useGlobalSearchParams must be used within AppNavigationProvider");
  }
  return context.params as T;
}

export function createRouter(
  navigationRef: React.RefObject<NavigationContainerRef<AppStackParamList> | null>,
): RouterLike {
  const navigateWithAction = (href: AppHref, action: "push" | "replace" | "navigate"): void => {
    const target = resolveNavigationTarget(href);
    const navigation = navigationRef.current;
    if (!navigation) {
      return;
    }

    if (action === "push") {
      navigation.dispatch(StackActions.push(target.name, target.params));
      return;
    }
    if (action === "replace") {
      navigation.dispatch(StackActions.replace(target.name, target.params));
      return;
    }
    navigation.dispatch(
      CommonActions.navigate({
        name: target.name,
        params: target.params,
      }),
    );
  };

  return {
    push: (href) => navigateWithAction(href, "push"),
    replace: (href) => navigateWithAction(href, "replace"),
    back: () => {
      const navigation = navigationRef.current;
      if (!navigation) return;
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
      navigation.dispatch(StackActions.replace("Home"));
    },
    dismiss: () => {
      const navigation = navigationRef.current;
      if (!navigation) return;
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
      navigation.dispatch(StackActions.replace("Home"));
    },
    dismissAll: () => {
      const navigation = navigationRef.current;
      if (!navigation) return;
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "Home" }],
        }),
      );
    },
    canGoBack: () => navigationRef.current?.canGoBack() ?? false,
    setParams: (params) => {
      navigationRef.current?.dispatch(CommonActions.setParams(params));
    },
  };
}

export function deriveNavigationContextValue(input: {
  readonly navigationRef: React.RefObject<NavigationContainerRef<AppStackParamList> | null>;
  readonly pathname: string;
  readonly params: RouteParams;
}): NavigationContextValue {
  return {
    navigationRef: input.navigationRef,
    pathname: input.pathname,
    params: input.params,
    router: createRouter(input.navigationRef),
  };
}

function useNativeStackNavigation(): NativeStackNavigationProp<ParamListBase> | null {
  try {
    return useNavigation<NativeStackNavigationProp<ParamListBase>>();
  } catch {
    return null;
  }
}

function normalizeScreenOptions(
  options: CompatNativeStackNavigationOptions | undefined,
): NativeStackNavigationOptions | undefined {
  if (!options) {
    return options;
  }

  const normalized = { ...options };

  if (normalized.headerTintColor !== undefined) {
    (normalized as Record<string, unknown>).headerTintColor = String(normalized.headerTintColor);
  }

  return normalized as unknown as NativeStackNavigationOptions;
}

function StackScreen(props: {
  readonly options?: CompatNativeStackNavigationOptions;
  readonly listeners?: Record<string, (event: never) => void>;
  readonly name?: string;
}) {
  const navigation = useNativeStackNavigation();
  const normalizedOptions = useMemo(() => normalizeScreenOptions(props.options), [props.options]);

  useEffect(() => {
    if (!navigation || !normalizedOptions) {
      return;
    }
    navigation.setOptions(normalizedOptions);
  }, [navigation, normalizedOptions]);

  useEffect(() => {
    if (!navigation || !props.listeners) {
      return;
    }
    const subscriptions = Object.entries(props.listeners).map(([eventName, listener]) =>
      navigation.addListener(eventName as never, listener as never),
    );
    return () => {
      for (const unsubscribe of subscriptions) {
        unsubscribe();
      }
    };
  }, [navigation, props.listeners]);

  return null;
}

function labelFromChildren(children: ReactNode): string {
  const parts: string[] = [];
  Children.forEach(children, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      parts.push(String(child));
    } else if (isValidElement<{ children?: ReactNode }>(child)) {
      parts.push(labelFromChildren(child.props.children));
    }
  });
  return parts.join("");
}

type NativeStackHeaderIcon = NonNullable<
  Extract<NativeStackHeaderItem, { type: "button" }>["icon"]
>;

function iconFromProp(icon: unknown): NativeStackHeaderIcon | undefined {
  if (typeof icon !== "string") {
    return undefined;
  }
  return { type: "sfSymbol", name: icon as never };
}

type ToolbarElementProps = Record<string, unknown> & { readonly children?: ReactNode };

function elementTypeName(element: ReactElement): string | undefined {
  const type = element.type;
  if (typeof type === "function") {
    return (type as { displayName?: string; name?: string }).displayName ?? type.name;
  }
  return undefined;
}

function convertMenuAction(
  element: ReactElement<ToolbarElementProps>,
): NativeStackHeaderItemMenu["menu"]["items"][number] | null {
  const typeName = elementTypeName(element);
  if (typeName === "ToolbarMenuAction") {
    const label = labelFromChildren(element.props.children);
    return {
      type: "action",
      label,
      description: typeof element.props.subtitle === "string" ? element.props.subtitle : undefined,
      disabled: Boolean(element.props.disabled),
      icon: iconFromProp(element.props.icon),
      onPress:
        typeof element.props.onPress === "function"
          ? (element.props.onPress as () => void)
          : () => undefined,
      state: element.props.isOn === true ? "on" : undefined,
      destructive: Boolean(element.props.destructive),
      discoverabilityLabel:
        typeof element.props.discoverabilityLabel === "string"
          ? element.props.discoverabilityLabel
          : undefined,
    };
  }

  if (typeName === "ToolbarMenu") {
    return {
      type: "submenu",
      label:
        typeof element.props.title === "string"
          ? element.props.title
          : labelFromChildren(element.props.children),
      icon: iconFromProp(element.props.icon),
      inline: Boolean(element.props.inline),
      items: collectMenuItems(element.props.children),
    };
  }

  return null;
}

function collectMenuItems(children: ReactNode): NativeStackHeaderItemMenu["menu"]["items"] {
  const items: NativeStackHeaderItemMenu["menu"]["items"] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<ToolbarElementProps>(child)) {
      return;
    }
    const item = convertMenuAction(child);
    if (item) {
      items.push(item);
      return;
    }
    items.push(...collectMenuItems(child.props.children));
  });
  return items;
}

function convertToolbarChild(child: ReactNode): NativeStackHeaderItem | null {
  if (!isValidElement<ToolbarElementProps>(child)) {
    return null;
  }

  const typeName = elementTypeName(child);
  if (typeName === "ToolbarButton") {
    return {
      type: "button",
      label: "",
      accessibilityLabel:
        typeof child.props.accessibilityLabel === "string"
          ? child.props.accessibilityLabel
          : undefined,
      disabled: Boolean(child.props.disabled),
      icon: iconFromProp(child.props.icon),
      onPress:
        typeof child.props.onPress === "function"
          ? (child.props.onPress as () => void)
          : () => undefined,
      sharesBackground: !child.props.separateBackground,
      variant: "prominent",
    };
  }

  if (typeName === "ToolbarMenu") {
    return {
      type: "menu",
      label: typeof child.props.title === "string" ? child.props.title : "",
      accessibilityLabel:
        typeof child.props.accessibilityLabel === "string"
          ? child.props.accessibilityLabel
          : undefined,
      disabled: Boolean(child.props.disabled),
      icon: iconFromProp(child.props.icon),
      menu: {
        title: typeof child.props.title === "string" ? child.props.title : undefined,
        items: collectMenuItems(child.props.children),
      },
      sharesBackground: !child.props.separateBackground,
      variant: "prominent",
    };
  }

  if (typeName === "ToolbarSpacer") {
    return {
      type: "spacing",
      spacing: typeof child.props.width === "number" ? child.props.width : 8,
    };
  }

  return null;
}

function collectToolbarItems(children: ReactNode): NativeStackHeaderItem[] {
  const items: NativeStackHeaderItem[] = [];
  Children.forEach(children, (child) => {
    const item = convertToolbarChild(child);
    if (item) {
      items.push(item);
    }
  });
  return items;
}

function Toolbar(props: {
  readonly placement?: "left" | "right" | "bottom";
  readonly children?: ReactNode;
}) {
  const navigation = useNativeStackNavigation();
  const items = useMemo(() => collectToolbarItems(props.children), [props.children]);

  useEffect(() => {
    if (!navigation || props.placement === "bottom" || items.length === 0) {
      return;
    }
    if (props.placement === "left") {
      navigation.setOptions({ unstable_headerLeftItems: () => items });
      return;
    }
    navigation.setOptions({ unstable_headerRightItems: () => items });
  }, [items, navigation, props.placement]);

  return null;
}

function ToolbarButton(_props: {
  readonly accessibilityLabel?: string;
  readonly disabled?: boolean;
  readonly icon?: string;
  readonly onPress?: () => void;
  readonly separateBackground?: boolean;
}) {
  return null;
}
ToolbarButton.displayName = "ToolbarButton";

function ToolbarMenu(_props: {
  readonly accessibilityLabel?: string;
  readonly children?: ReactNode;
  readonly disabled?: boolean;
  readonly icon?: string;
  readonly inline?: boolean;
  readonly separateBackground?: boolean;
  readonly title?: string;
}) {
  return null;
}
ToolbarMenu.displayName = "ToolbarMenu";

function ToolbarMenuAction(_props: {
  readonly children?: ReactNode;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly discoverabilityLabel?: string;
  readonly icon?: string;
  readonly isOn?: boolean;
  readonly onPress?: () => void;
  readonly subtitle?: string;
}) {
  return null;
}
ToolbarMenuAction.displayName = "ToolbarMenuAction";

function ToolbarLabel(_props: { readonly children?: ReactNode }) {
  return null;
}
ToolbarLabel.displayName = "ToolbarLabel";

function ToolbarSpacer(_props: { readonly sharesBackground?: boolean; readonly width?: number }) {
  return null;
}
ToolbarSpacer.displayName = "ToolbarSpacer";

function ToolbarSearchBarSlot() {
  return null;
}
ToolbarSearchBarSlot.displayName = "ToolbarSearchBarSlot";

function StackScreenTitle(_props: { readonly asChild?: boolean; readonly children?: ReactNode }) {
  return null;
}

StackScreen.Title = StackScreenTitle;

export const Stack = Object.assign(
  function StackCompat(props: { readonly children?: ReactNode }) {
    return createElement(Fragment, null, props.children);
  },
  {
    Screen: StackScreen,
    Toolbar: Object.assign(Toolbar, {
      Button: ToolbarButton,
      Label: ToolbarLabel,
      Menu: Object.assign(ToolbarMenu, {
        Action: ToolbarMenuAction,
      }),
      MenuAction: ToolbarMenuAction,
      SearchBarSlot: ToolbarSearchBarSlot,
      Spacer: ToolbarSpacer,
    }),
  },
);

export default Stack;

export function Redirect(props: { readonly href: AppHref }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(props.href);
  }, [props.href, router]);
  return null;
}

export function Link(props: {
  readonly href: AppHref;
  readonly asChild?: boolean;
  readonly children?: ReactNode;
}) {
  const router = useRouter();
  if (props.asChild && isValidElement<{ onPress?: () => void }>(props.children)) {
    return cloneElement(props.children, {
      onPress: () => router.push(props.href),
    });
  }
  return null;
}

export function pathAndParamsFromCurrentRoute(route: {
  readonly name: string;
  readonly params?: object;
}): { readonly pathname: string; readonly params: RouteParams } {
  return {
    pathname: buildPathFromRoute(route as AppFocusedRoute),
    params: (route.params ?? {}) as RouteParams,
  };
}

export type Router = RouterLike;
