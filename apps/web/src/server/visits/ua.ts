import "server-only";

/** Browser, OS and device in a few words, from the user agent; enough to tell visitors apart, not a full parser. */
export function describeAgent(ua: string): { browser: string; os: string; device: string; isBot: boolean } {
  const isBot = /bot|crawl|spider|slurp|preview|fetch|monitor|headless|lighthouse|curl|wget|python-requests|httpclient|go-http|axios|node-fetch/i.test(ua);
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : isBot
                ? "Bot"
                : "Other";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "Other";
  const device = isBot ? "Bot" : /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "Tablet" : /Mobi|iPhone|Android/.test(ua) ? "Phone" : "Computer";
  return { browser, os, device, isBot };
}
