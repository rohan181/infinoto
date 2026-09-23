import { anthropicApiKey } from "./provider";
import type { DiscoveryAvailability } from "@/lib/discovery-config";

export function discoveryAvailability(): DiscoveryAvailability {
  const configured = (key: string | undefined) => !!key?.trim() && !/^(?:replace_with|your[_-]|<)/i.test(key.trim());
  return { youtube: configured(process.env.YOUTUBE_API_KEY), exa: configured(process.env.EXA_API_KEY), claude: configured(anthropicApiKey()) };
}
