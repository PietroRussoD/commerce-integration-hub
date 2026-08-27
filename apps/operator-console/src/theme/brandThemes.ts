export const brandThemes = [
  { id: "integration-hub", label: "Integration Hub", hostnames: [] },
  { id: "client-blue", label: "Client Blue", hostnames: ["client-blue.localhost"] },
] as const;

export type BrandThemeId = (typeof brandThemes)[number]["id"];

export const defaultBrandThemeId: BrandThemeId = "integration-hub";

export function resolveBrandThemeId(value: unknown): BrandThemeId {
  return brandThemes.some((theme) => theme.id === value) ? (value as BrandThemeId) : defaultBrandThemeId;
}

export function resolveBrandThemeForHostname(hostname: string): BrandThemeId {
  const normalizedHostname = hostname.trim().toLowerCase().replace(/\.$/, "");

  return (
    brandThemes.find((theme) => theme.hostnames.some((registeredHostname) => registeredHostname === normalizedHostname))?.id ??
    defaultBrandThemeId
  );
}
