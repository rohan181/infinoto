import type { DiscoveryProvider } from "@/app/data";

export type DiscoveryAvailability = Record<DiscoveryProvider, boolean>;
export function preferredProvider(available: DiscoveryAvailability, video: boolean, saved?: string | null): DiscoveryProvider {
  const providers: DiscoveryProvider[] = video ? ["youtube", "exa", "claude"] : ["exa", "claude"];
  if (providers.includes(saved as DiscoveryProvider) && available[saved as DiscoveryProvider]) return saved as DiscoveryProvider;
  return providers.find(provider => available[provider]) || "claude";
}
