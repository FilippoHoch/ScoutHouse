import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";

import { AppRouter } from "./app/router";
import { ApiError } from "./shared/api";
import i18n from "./i18n";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 300_000,
      retry(failureCount, error) {
        if (error instanceof ApiError) {
          if (error.status === 0) {
            return false;
          }

          if (error.status >= 500) {
            return failureCount < 3;
          }

          return false;
        }

        return failureCount < 3;
      }
    }
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <AppRouter />
      </I18nextProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
