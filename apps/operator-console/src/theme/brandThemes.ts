export const brandThemes = [
  { id: "integration-hub", label: "Integration Hub" },
  { id: "client-blue", label: "Client Blue" },
] as const;

export type BrandThemeId = (typeof brandThemes)[number]["id"];

export const defaultBrandThemeId: BrandThemeId = "integration-hub";

export function resolveBrandThemeId(value: unknown): BrandThemeId {
  return brandThemes.some((theme) => theme.id === value) ? (value as BrandThemeId) : defaultBrandThemeId;
}
