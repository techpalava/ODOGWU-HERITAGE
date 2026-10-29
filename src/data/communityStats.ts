/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CommunityContinent =
  | "Europe"
  | "Asia"
  | "Africa"
  | "North America"
  | "South America";

export interface CommunityGroup {
  readonly number: number;
  readonly name: string;
  readonly people: number;
  readonly outfits: number;
  readonly nationalities: number;
}

export interface CommunityNationality {
  readonly country: string;
  readonly continent: CommunityContinent;
  readonly people: number;
  readonly outfits: number;
}

export interface CommunityContinentStat {
  readonly continent: CommunityContinent;
  readonly countries: number;
  readonly people: number;
  readonly outfits: number;
}

export interface CommunityHeadlineStats {
  readonly participants: number;
  readonly outfits: number;
  readonly nationalities: number;
  readonly continents: number;
  readonly groups: number;
}

const sumPeople = (items: readonly { readonly people: number }[]): number =>
  items.reduce((total, item) => total + item.people, 0);

const sumOutfits = (items: readonly { readonly outfits: number }[]): number =>
  items.reduce((total, item) => total + item.outfits, 0);

export const COMMUNITY_GROUPS = [
  { number: 1, name: "Pioneers", people: 11, outfits: 13, nationalities: 6 },
  { number: 2, name: "Avengers", people: 13, outfits: 17, nationalities: 12 },
  { number: 3, name: "Transformers", people: 17, outfits: 25, nationalities: 8 },
  { number: 4, name: "Executives", people: 14, outfits: 16, nationalities: 4 },
  { number: 5, name: "Gladiators", people: 21, outfits: 30, nationalities: 9 },
] as const satisfies ReadonlyArray<CommunityGroup>;

export const COMMUNITY_NATIONALITIES = [
  { country: "Netherlands", continent: "Europe", people: 32, outfits: 40 },
  { country: "Greece", continent: "Europe", people: 5, outfits: 7 },
  { country: "Turkey", continent: "Europe", people: 1, outfits: 1 },
  { country: "Serbia", continent: "Europe", people: 1, outfits: 3 },
  { country: "Italy", continent: "Europe", people: 1, outfits: 2 },
  { country: "Hungary", continent: "Europe", people: 1, outfits: 2 },
  { country: "India", continent: "Asia", people: 7, outfits: 11 },
  { country: "France", continent: "Europe", people: 2, outfits: 2 },
  { country: "Portugal", continent: "Europe", people: 2, outfits: 3 },
  { country: "Belgium", continent: "Europe", people: 2, outfits: 2 },
  { country: "Brazil", continent: "South America", people: 2, outfits: 2 },
  { country: "China", continent: "Asia", people: 2, outfits: 3 },
  { country: "South Africa", continent: "Africa", people: 1, outfits: 2 },
  { country: "United States", continent: "North America", people: 2, outfits: 2 },
  { country: "Canada", continent: "North America", people: 2, outfits: 2 },
  { country: "Costa Rica", continent: "North America", people: 1, outfits: 1 },
  { country: "Spain", continent: "Europe", people: 1, outfits: 1 },
  { country: "Ireland", continent: "Europe", people: 1, outfits: 1 },
  { country: "Kenya", continent: "Africa", people: 4, outfits: 5 },
  { country: "Curaçao", continent: "South America", people: 1, outfits: 1 },
  { country: "Bulgaria", continent: "Europe", people: 2, outfits: 3 },
  { country: "Indonesia", continent: "Asia", people: 1, outfits: 2 },
  { country: "Somalia", continent: "Africa", people: 1, outfits: 2 },
  {
    country: "Bosnia and Herzegovina",
    continent: "Europe",
    people: 1,
    outfits: 1,
  },
] as const satisfies ReadonlyArray<CommunityNationality>;

export const COMMUNITY_CONTINENT_ORDER = [
  "Europe",
  "Asia",
  "Africa",
  "North America",
  "South America",
] as const satisfies ReadonlyArray<CommunityContinent>;

export const COMMUNITY_CONTINENTS = COMMUNITY_CONTINENT_ORDER.map(
  (continent): CommunityContinentStat => {
    const members = COMMUNITY_NATIONALITIES.filter(
      (nationality) => nationality.continent === continent,
    );
    return {
      continent,
      countries: members.length,
      people: sumPeople(members),
      outfits: sumOutfits(members),
    };
  },
);

export const COMMUNITY_NATIONALITIES_BY_PEOPLE = [
  ...COMMUNITY_NATIONALITIES,
].sort((left, right) => {
  if (right.people !== left.people) return right.people - left.people;
  return left.country.localeCompare(right.country);
});

export const COMMUNITY_HEADLINE_STATS = {
  participants: sumPeople(COMMUNITY_GROUPS),
  outfits: sumOutfits(COMMUNITY_GROUPS),
  nationalities: COMMUNITY_NATIONALITIES.length,
  continents: COMMUNITY_CONTINENTS.length,
  groups: COMMUNITY_GROUPS.length,
} as const satisfies CommunityHeadlineStats;

export const COMMUNITY_GROWING_CAPTION = `${COMMUNITY_HEADLINE_STATS.groups} groups so far, and growing every batch`;

export const COMMUNITY_CONTINENT_PEOPLE_LINE = COMMUNITY_CONTINENTS.map(
  (continent) => `${continent.continent} ${continent.people}`,
).join(" · ");
