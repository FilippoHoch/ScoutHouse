import { useSyncExternalStore } from "react";

import type { EventBranch } from "./types";

export interface PricePreferences {
  cheap: boolean;
  medium: boolean;
  expensive: boolean;
}

export interface UserPreferences {
  homeLocation: string;
  defaultBranch: "" | EventBranch;
  pricePreferences: PricePreferences;
}

const STORAGE_KEY = "scouthouse:user-preferences";

function createDefaultPreferences(): UserPreferences {
  return {
    homeLocation: "",
    defaultBranch: "",
    pricePreferences: {
      cheap: true,
      medium: true,
      expensive: true
    }
  };
}

const eventBranches: EventBranch[] = ["LC", "EG", "RS", "ALL"];

function isEventBranch(value: unknown): value is EventBranch {
  return typeof value === "string" && eventBranches.includes(value as EventBranch);
}

function normalisePricePreferences(value: unknown): PricePreferences {
  const defaults = createDefaultPreferences().pricePreferences;

  if (!value || typeof value !== "object") {
    return { ...defaults };
  }

  const record = value as Record<string, unknown>;
  return {
    cheap: typeof record.cheap === "boolean" ? record.cheap : defaults.cheap,
    medium: typeof record.medium === "boolean" ? record.medium : defaults.medium,
    expensive: typeof record.expensive === "boolean" ? record.expensive : defaults.expensive
  };
}

function normalisePreferences(value: unknown): UserPreferences {
  const defaults = createDefaultPreferences();

  if (!value || typeof value !== "object") {
    return { ...defaults, pricePreferences: { ...defaults.pricePreferences } };
  }

  const record = value as Record<string, unknown>;

  return {
    homeLocation: typeof record.homeLocation === "string" ? record.homeLocation : defaults.homeLocation,
    defaultBranch:
      typeof record.defaultBranch === "string" && (record.defaultBranch === "" || isEventBranch(record.defaultBranch))
        ? (record.defaultBranch as "" | EventBranch)
        : defaults.defaultBranch,
    pricePreferences: normalisePricePreferences(record.pricePreferences)
  };
}

function clonePreferences(preferences: UserPreferences): UserPreferences {
  return {
    homeLocation: preferences.homeLocation,
    defaultBranch: preferences.defaultBranch,
    pricePreferences: {
      cheap: preferences.pricePreferences.cheap,
      medium: preferences.pricePreferences.medium,
      expensive: preferences.pricePreferences.expensive
    }
  };
}

function loadFromStorage(): UserPreferences {
  if (typeof window === "undefined") {
    return createDefaultPreferences();
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createDefaultPreferences();
    }
    const parsed = JSON.parse(stored) as unknown;
    return normalisePreferences(parsed);
  } catch (error) {
    console.error("Unable to load user preferences", error);
    return createDefaultPreferences();
  }
}

let state = loadFromStorage();
const listeners = new Set<() => void>();
let hasStorageListener = false;

function persist(next: UserPreferences): void {
  state = clonePreferences(next);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Unable to save user preferences", error);
    }
  }

  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (typeof window !== "undefined" && !hasStorageListener) {
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY) {
        return;
      }

      try {
        const next = event.newValue ? normalisePreferences(JSON.parse(event.newValue)) : createDefaultPreferences();
        state = clonePreferences(next);
        listeners.forEach((fn) => fn());
      } catch (error) {
        console.error("Unable to synchronise user preferences", error);
      }
    });
    hasStorageListener = true;
  }

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): UserPreferences {
  return state;
}

export function useUserPreferences(): UserPreferences {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function saveUserPreferences(next: UserPreferences): void {
  persist(normalisePreferences(next));
}

export function updateUserPreferences(update: Partial<UserPreferences>): void {
  const next: UserPreferences = {
    homeLocation: update.homeLocation ?? state.homeLocation,
    defaultBranch:
      update.defaultBranch !== undefined ? update.defaultBranch : state.defaultBranch,
    pricePreferences: {
      cheap: update.pricePreferences?.cheap ?? state.pricePreferences.cheap,
      medium: update.pricePreferences?.medium ?? state.pricePreferences.medium,
      expensive: update.pricePreferences?.expensive ?? state.pricePreferences.expensive
    }
  };

  persist(next);
}

export function resetUserPreferences(): void {
  persist(createDefaultPreferences());
}

export function getDefaultUserPreferences(): UserPreferences {
  return createDefaultPreferences();
}
