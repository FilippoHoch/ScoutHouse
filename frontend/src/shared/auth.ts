import { useSyncExternalStore } from "react";

import { API_URL, ApiError } from "./http";
import type { User } from "./types";

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  status: AuthStatus;
}

interface AuthResponse {
  access_token: string;
  user: User;
}

interface RefreshResponse {
  access_token: string;
}

const listeners = new Set<() => void>();
let state: AuthState = {
  user: null,
  accessToken: null,
  status: "idle"
};
let refreshPromise: Promise<string | null> | null = null;
let restorePromise: Promise<void> | null = null;

function notify() {
  listeners.forEach((listener) => listener());
}

function setState(partial: Partial<AuthState>) {
  state = { ...state, ...partial };
  notify();
}

export function getAccessToken(): string | null {
  return state.accessToken;
}

export function clearSession(): void {
  state = {
    user: null,
    accessToken: null,
    status: "unauthenticated"
  };
  notify();
}

function setAuthenticated(user: User, token: string) {
  state = {
    user,
    accessToken: token,
    status: "authenticated"
  };
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AuthState {
  return state;
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

async function parseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    return await response.text();
  }
}

async function request(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      },
      credentials: "include"
    });
  } catch (error) {
    const message = `Unable to reach the API at ${API_URL}. Please make sure the backend server is running.`;
    throw new ApiError(0, null, message, error);
  }
}

async function fetchProfile(token: string): Promise<User | null> {
  const response = await request("/api/v1/auth/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const body = await parseBody(response);
    throw new ApiError(response.status, body);
  }

  return (await response.json()) as User;
}

export async function login(email: string, password: string): Promise<User> {
  const response = await request("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    const body = await parseBody(response);
    throw new ApiError(response.status, body);
  }

  const data = (await response.json()) as AuthResponse;
  setAuthenticated(data.user, data.access_token);
  return data.user;
}

export async function logout(): Promise<void> {
  try {
    await request("/api/v1/auth/logout", {
      method: "POST",
      headers: state.accessToken ? { Authorization: `Bearer ${state.accessToken}` } : undefined
    });
  } finally {
    clearSession();
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const response = await request("/api/v1/auth/refresh", {
      method: "POST"
    });

    if (!response.ok) {
      clearSession();
      return null;
    }

    const data = (await response.json()) as RefreshResponse;
    setState({ accessToken: data.access_token, status: state.user ? "authenticated" : state.status });
    return data.access_token;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function register(name: string, email: string, password: string): Promise<User> {
  const response = await request("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password })
  });

  if (!response.ok) {
    const body = await parseBody(response);
    throw new ApiError(response.status, body);
  }

  const data = (await response.json()) as AuthResponse;
  setAuthenticated(data.user, data.access_token);
  return data.user;
}

export async function restoreSession(): Promise<void> {
  if (state.status === "authenticated") {
    return;
  }

  if (restorePromise) {
    return restorePromise;
  }

  restorePromise = (async () => {
    setState({ status: "loading" });
    let token: string | null;
    try {
      token = await refreshAccessToken();
    } catch (error) {
      clearSession();
      throw error;
    }

    if (!token) {
      clearSession();
      return;
    }

    const profile = await fetchProfile(token).catch((error) => {
      clearSession();
      throw error;
    });

    if (!profile) {
      clearSession();
      return;
    }

    setAuthenticated(profile, token);
  })();

  try {
    await restorePromise;
  } finally {
    restorePromise = null;
  }
}

export async function ensureSession(): Promise<void> {
  if (state.status === "idle") {
    await restoreSession();
  }
}
