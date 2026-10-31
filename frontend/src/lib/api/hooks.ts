import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

// The analysis service runs on the user's own computer, so all API calls run in
// the browser (never in server loaders, which cannot reach 127.0.0.1).
export function useBackendHealth() {
  return useQuery({ queryKey: ["health"], queryFn: api.health, retry: false, staleTime: 15000 });
}
