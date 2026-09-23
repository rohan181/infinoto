export const socialPlatforms = ["Reddit", "X", "LinkedIn", "Instagram", "TikTok"] as const;
export type SocialPlatform = typeof socialPlatforms[number];
export type SocialFilter = SocialPlatform | "All";
const domains: Record<SocialPlatform, string[]> = {
  Reddit: ["reddit.com"], X: ["x.com", "twitter.com"], LinkedIn: ["linkedin.com"], Instagram: ["instagram.com"], TikTok: ["tiktok.com"],
};
export function socialDomains(platform: SocialFilter = "All"): string[] {
  return platform === "All" ? socialPlatforms.flatMap(item => domains[item]) : domains[platform];
}

/** Accept public content and creator/community pages, never login, search or redirect URLs. */
export function socialSource(raw: string): { platform: SocialPlatform; kind: "Post" | "Creator" | "Community" } | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    const host = url.hostname.replace(/^www\./, ""), path = url.pathname.replace(/\/$/, "");
    if (["reddit.com", "old.reddit.com", "m.reddit.com"].includes(host)) {
      if (/^\/r\/[\w]+\/comments\/[a-z0-9]+(?:\/[^/]+)?(?:\/[a-z0-9]+)?$/i.test(path) || /^\/comments\/[a-z0-9]+(?:\/[^/]+)?$/i.test(path)) return { platform: "Reddit", kind: "Post" };
      if (/^\/r\/\w+$/i.test(path)) return { platform: "Reddit", kind: "Community" };
      if (/^\/(?:user|u)\/[\w-]+$/i.test(path)) return { platform: "Reddit", kind: "Creator" };
    }
    if (["x.com", "twitter.com", "mobile.twitter.com"].includes(host)) {
      if (/^\/[\w]+\/status\/\d+(?:\/(?:photo|video)\/\d+)?$/.test(path)) return { platform: "X", kind: "Post" };
      if (/^\/[A-Za-z0-9_]{1,15}$/.test(path) && !/^\/(?:home|explore|search|login|logout|signup|settings|messages|notifications|intent|share|i|tos|privacy)$/i.test(path)) return { platform: "X", kind: "Creator" };
    }
    if (host === "linkedin.com" || /^[a-z]{2}\.linkedin\.com$/.test(host)) {
      if (/^\/(?:posts\/[^/]+|feed\/update\/urn:li:(?:activity|share|ugcPost):\d+|pulse\/[^/]+)$/.test(path)) return { platform: "LinkedIn", kind: "Post" };
      if (/^\/(?:in|company)\/[\w-]+$/.test(path)) return { platform: "LinkedIn", kind: "Creator" };
    }
    if (host === "instagram.com") {
      if (/^\/(?:p|reel|reels|tv)\/[\w-]+$/.test(path)) return { platform: "Instagram", kind: "Post" };
      if (/^\/[\w.]{1,30}$/.test(path) && !/^\/(?:accounts|explore|direct|stories|reels|about|legal|developer|developers|web|p|reel|tv)$/i.test(path)) return { platform: "Instagram", kind: "Creator" };
    }
    if (["tiktok.com", "m.tiktok.com"].includes(host)) {
      if (/^\/@[\w.]+\/(?:video|photo)\/\d+$/.test(path)) return { platform: "TikTok", kind: "Post" };
      if (/^\/@[\w.]+$/.test(path)) return { platform: "TikTok", kind: "Creator" };
    }
    return null;
  } catch { return null; }
}
export function matchesSocialPlatform(url: string, platform: SocialFilter = "All"): boolean {
  const source = socialSource(url);
  return !!source && (platform === "All" || source.platform === platform);
}
export function socialSearchUrl(topic: string, platform: SocialFilter = "All"): string {
  const sites = socialDomains(platform).map(domain => `site:${domain}`).join(" OR ");
  return `https://www.google.com/search?q=${encodeURIComponent(`${topic} (${sites})`)}`;
}
