import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AppRouter } from "./app/router";
import { ApiError } from "./shared/api";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
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
      <AppRouter />
    </QueryClientProvider>
  </React.StrictMode>,
);
