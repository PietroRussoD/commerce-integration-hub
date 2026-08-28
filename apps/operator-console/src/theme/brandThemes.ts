export const brandThemes = [
  {
    id: "integration-hub",
    label: "Integration Hub",
    hostnames: [],
    productName: "Commerce Integration Hub",
    consoleName: "Operator console",
    documentTitle: "Commerce Integration Hub",
    logoPath: "/favicon.svg",
    browserThemeColor: "#18181b",
  },
  {
    id: "client-blue",
    label: "Client Blue",
    hostnames: ["client-blue.localhost"],
    productName: "Client Blue",
    consoleName: "Commerce operations",
    documentTitle: "Client Blue Commerce Operations",
    logoPath: "/client-blue.svg",
    browserThemeColor: "#1e3a8a",
  },
] as const;

export type BrandTheme = (typeof brandThemes)[number];
export type BrandThemeId = (typeof brandThemes)[number]["id"];

export const defaultBrandTheme: BrandTheme = brandThemes[0];
export const defaultBrandThemeId: BrandThemeId = defaultBrandTheme.id;

export function resolveBrandThemeId(value: unknown): BrandThemeId {
  return brandThemes.some((theme) => theme.id === value) ? (value as BrandThemeId) : defaultBrandThemeId;
}

export function resolveBrandThemeForHostname(hostname: string): BrandTheme {
  const normalizedHostname = hostname.trim().toLowerCase().replace(/\.$/, "");

  return (
    brandThemes.find((theme) => theme.hostnames.some((registeredHostname) => registeredHostname === normalizedHostname)) ??
    defaultBrandTheme
  );
}

export function applyBrandThemeToDocument(theme: BrandTheme, targetDocument: Document): void {
  targetDocument.documentElement.dataset.brand = theme.id;
  targetDocument.title = theme.documentTitle;
  targetDocument.querySelector('link[rel="icon"]')?.setAttribute("href", theme.logoPath);
  targetDocument.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.browserThemeColor);
}
