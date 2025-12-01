import { useSyncExternalStore } from "react";

import type { EventBranch, UserType } from "./types";

export interface PricePreferences {
  cheap: boolean;
  medium: boolean;
  expensive: boolean;
  cheapMax: number;
  mediumMax: number;
}

export interface UserPreferences {
  homeLocation: string;
  defaultBranch: "" | EventBranch;
  profileBranch: "" | UserType;
  pricePreferences: PricePreferences;
}

const STORAGE_KEY = "scouthouse:user-preferences";

function createDefaultPreferences(): UserPreferences {
  return {
    homeLocation: "",
    defaultBranch: "",
    profileBranch: "",
    pricePreferences: {
      cheap: true,
      medium: true,
      expensive: true,
      cheapMax: 8,
      mediumMax: 15
    }
  };
}

const eventBranches: EventBranch[] = ["LC", "EG", "RS", "CC", "ALL"];
const userTypes: UserType[] = ["LC", "EG", "RS", "CC", "LEADERS", "OTHER"];

function isEventBranch(value: unknown): value is EventBranch {
  return typeof value === "string" && eventBranches.includes(value as EventBranch);
}

function isUserType(value: unknown): value is UserType {
  return typeof value === "string" && userTypes.includes(value as UserType);
}

function parseThreshold(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function normalisePricePreferences(value: unknown): PricePreferences {
  const defaults = createDefaultPreferences().pricePreferences;

  if (!value || typeof value !== "object") {
    return { ...defaults };
  }

  const record = value as Record<string, unknown>;
  const cheapMax = parseThreshold(record.cheapMax, defaults.cheapMax);
  const mediumMax = parseThreshold(record.mediumMax, defaults.mediumMax);
  const normalisedCheapMax = Math.max(0, cheapMax);
  const normalisedMediumMax = Math.max(normalisedCheapMax, mediumMax);

  return {
    cheap: typeof record.cheap === "boolean" ? record.cheap : defaults.cheap,
    medium: typeof record.medium === "boolean" ? record.medium : defaults.medium,
    expensive: typeof record.expensive === "boolean" ? record.expensive : defaults.expensive,
    cheapMax: normalisedCheapMax,
    mediumMax: normalisedMediumMax
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
    profileBranch:
      typeof record.profileBranch === "string" && (record.profileBranch === "" || isUserType(record.profileBranch))
        ? (record.profileBranch as "" | UserType)
        : defaults.profileBranch,
    pricePreferences: normalisePricePreferences(record.pricePreferences)
  };
}

function clonePreferences(preferences: UserPreferences): UserPreferences {
  return {
    homeLocation: preferences.homeLocation,
    defaultBranch: preferences.defaultBranch,
    profileBranch: preferences.profileBranch,
    pricePreferences: {
      cheap: preferences.pricePreferences.cheap,
      medium: preferences.pricePreferences.medium,
      expensive: preferences.pricePreferences.expensive,
      cheapMax: preferences.pricePreferences.cheapMax,
      mediumMax: preferences.pricePreferences.mediumMax
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
    profileBranch:
      update.profileBranch !== undefined ? update.profileBranch : state.profileBranch,
    pricePreferences: {
      cheap: update.pricePreferences?.cheap ?? state.pricePreferences.cheap,
      medium: update.pricePreferences?.medium ?? state.pricePreferences.medium,
      expensive: update.pricePreferences?.expensive ?? state.pricePreferences.expensive,
      cheapMax: update.pricePreferences?.cheapMax ?? state.pricePreferences.cheapMax,
      mediumMax: update.pricePreferences?.mediumMax ?? state.pricePreferences.mediumMax
    }
  };

  persist(normalisePreferences(next));
}

export function resetUserPreferences(): void {
  persist(createDefaultPreferences());
}

export function getDefaultUserPreferences(): UserPreferences {
  return createDefaultPreferences();
}
