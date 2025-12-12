import { getNames, getCode } from "country-list";

/**
 * Get a sorted list of all country names
 * Returns an array of country names sorted alphabetically
 */
export function getAllCountries(): string[] {
  const countryNames = getNames();
  return Object.values(countryNames).sort();
}

/**
 * Get country code for a country name
 * Useful for future enhancements (phone codes, ISO codes, etc.)
 */
export function getCountryCode(countryName: string): string | undefined {
  return getCode(countryName);
}

