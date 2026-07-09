import 'server-only';
import { City, Country } from 'country-state-city';

export type CountryOption = {
  id: string;
  label: string;
};

export type CityOption = {
  id: string;
  label: string;
};

export function getCountryOptions(): CountryOption[] {
  return Country.getAllCountries()
    .map((country) => ({ id: country.isoCode, label: country.name }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function getCityOptions(countryCode: string): CityOption[] {
  const country = Country.getCountryByCode(countryCode);
  if (!country) return [];
  const seen = new Set<string>();
  return (City.getCitiesOfCountry(countryCode) ?? [])
    .filter((city) => {
      const key = city.name.trim().toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((city) => ({
      id: `${countryCode}:${city.name}`,
      label: `${city.name}, ${country.name}`
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
