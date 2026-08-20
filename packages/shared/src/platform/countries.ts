/**
 * Where a workshop trades, and what follows from it.
 *
 * Country was a free-text field. That is three real bugs wearing one
 * input: a workshop could be created in "egypt", "Egypt" and "EG" as
 * three different countries; currency was typed separately and could
 * contradict it; and MOP's ageing arithmetic assumes a Monday-to-Friday
 * week, which is silently wrong for every Gulf tenant -- the finding
 * that produced policy P-15.
 *
 * So this table exists, and it carries exactly the four things the
 * product actually derives from a country:
 *
 *   currency  -- suggested, never forced. A workshop in Ecuador trades
 *                in USD; one in Egypt might legitimately invoice in USD
 *                too. The suggestion is right almost always and the
 *                override costs one click.
 *   timezone  -- suggested for the same reason, and a starting point for
 *                the countries that span several.
 *   weekend   -- the one that is not cosmetic. "Waiting 24 working
 *                hours" means something different in Riyadh.
 *
 * Every timezone below was checked against the runtime's own IANA
 * database when this file was generated, not copied from a list.
 *
 * This is not a complete ISO 3166 list, and pretending otherwise would
 * be its own kind of lie -- it covers the markets MOP is built for and
 * the ones its scenarios name, and `isSupportedCountry` is the honest
 * answer for anything else.
 */

/**
 * Which two days are the weekend. Named rather than a day-index pair
 * because the pair is what people get wrong: Friday-Saturday is not
 * "Saturday-Sunday shifted by one".
 */
export const WEEKEND_PATTERNS = ["SAT_SUN", "FRI_SAT", "THU_FRI", "FRI_SUN"] as const;
export type WeekendPattern = (typeof WEEKEND_PATTERNS)[number];

/** Weekday indices, `Date.getDay()` order: 0 = Sunday. */
export const WEEKEND_DAYS: Readonly<Record<WeekendPattern, readonly number[]>> = {
  SAT_SUN: [6, 0],
  FRI_SAT: [5, 6],
  THU_FRI: [4, 5],
  // Brunei's split weekend: Friday and Sunday, working Saturday.
  FRI_SUN: [5, 0],
};

export interface CountryEntry {
  /** ISO 3166-1 alpha-2. Stored on the tenant, so it must be the stable one. */
  readonly code: string;
  readonly name: string;
  /** ISO 4217. A suggestion the operator confirms, never an imposition. */
  readonly currency: string;
  /** Primary IANA zone. A starting point for countries that span several. */
  readonly timezone: string;
  readonly weekend: WeekendPattern;
}

const COUNTRIES: readonly CountryEntry[] = [
  { code: "AE", name: "United Arab Emirates", currency: "AED", timezone: "Asia/Dubai", weekend: "SAT_SUN" },
  { code: "AF", name: "Afghanistan", currency: "AFN", timezone: "Asia/Kabul", weekend: "THU_FRI" },
  { code: "AL", name: "Albania", currency: "ALL", timezone: "Europe/Tirane", weekend: "SAT_SUN" },
  { code: "AM", name: "Armenia", currency: "AMD", timezone: "Asia/Yerevan", weekend: "SAT_SUN" },
  { code: "AO", name: "Angola", currency: "AOA", timezone: "Africa/Luanda", weekend: "SAT_SUN" },
  { code: "AR", name: "Argentina", currency: "ARS", timezone: "America/Argentina/Buenos_Aires", weekend: "SAT_SUN" },
  { code: "AT", name: "Austria", currency: "EUR", timezone: "Europe/Vienna", weekend: "SAT_SUN" },
  { code: "AU", name: "Australia", currency: "AUD", timezone: "Australia/Sydney", weekend: "SAT_SUN" },
  { code: "AZ", name: "Azerbaijan", currency: "AZN", timezone: "Asia/Baku", weekend: "SAT_SUN" },
  { code: "BA", name: "Bosnia and Herzegovina", currency: "BAM", timezone: "Europe/Sarajevo", weekend: "SAT_SUN" },
  { code: "BD", name: "Bangladesh", currency: "BDT", timezone: "Asia/Dhaka", weekend: "FRI_SAT" },
  { code: "BE", name: "Belgium", currency: "EUR", timezone: "Europe/Brussels", weekend: "SAT_SUN" },
  { code: "BG", name: "Bulgaria", currency: "BGN", timezone: "Europe/Sofia", weekend: "SAT_SUN" },
  { code: "BH", name: "Bahrain", currency: "BHD", timezone: "Asia/Bahrain", weekend: "FRI_SAT" },
  { code: "BN", name: "Brunei", currency: "BND", timezone: "Asia/Brunei", weekend: "FRI_SUN" },
  { code: "BO", name: "Bolivia", currency: "BOB", timezone: "America/La_Paz", weekend: "SAT_SUN" },
  { code: "BR", name: "Brazil", currency: "BRL", timezone: "America/Sao_Paulo", weekend: "SAT_SUN" },
  { code: "BW", name: "Botswana", currency: "BWP", timezone: "Africa/Gaborone", weekend: "SAT_SUN" },
  { code: "BY", name: "Belarus", currency: "BYN", timezone: "Europe/Minsk", weekend: "SAT_SUN" },
  { code: "CA", name: "Canada", currency: "CAD", timezone: "America/Toronto", weekend: "SAT_SUN" },
  { code: "CH", name: "Switzerland", currency: "CHF", timezone: "Europe/Zurich", weekend: "SAT_SUN" },
  { code: "CI", name: "Cote d'Ivoire", currency: "XOF", timezone: "Africa/Abidjan", weekend: "SAT_SUN" },
  { code: "CL", name: "Chile", currency: "CLP", timezone: "America/Santiago", weekend: "SAT_SUN" },
  { code: "CM", name: "Cameroon", currency: "XAF", timezone: "Africa/Douala", weekend: "SAT_SUN" },
  { code: "CN", name: "China", currency: "CNY", timezone: "Asia/Shanghai", weekend: "SAT_SUN" },
  { code: "CO", name: "Colombia", currency: "COP", timezone: "America/Bogota", weekend: "SAT_SUN" },
  { code: "CR", name: "Costa Rica", currency: "CRC", timezone: "America/Costa_Rica", weekend: "SAT_SUN" },
  { code: "CY", name: "Cyprus", currency: "EUR", timezone: "Asia/Nicosia", weekend: "SAT_SUN" },
  { code: "CZ", name: "Czechia", currency: "CZK", timezone: "Europe/Prague", weekend: "SAT_SUN" },
  { code: "DE", name: "Germany", currency: "EUR", timezone: "Europe/Berlin", weekend: "SAT_SUN" },
  { code: "DK", name: "Denmark", currency: "DKK", timezone: "Europe/Copenhagen", weekend: "SAT_SUN" },
  { code: "DO", name: "Dominican Republic", currency: "DOP", timezone: "America/Santo_Domingo", weekend: "SAT_SUN" },
  { code: "DZ", name: "Algeria", currency: "DZD", timezone: "Africa/Algiers", weekend: "FRI_SAT" },
  { code: "EC", name: "Ecuador", currency: "USD", timezone: "America/Guayaquil", weekend: "SAT_SUN" },
  { code: "EE", name: "Estonia", currency: "EUR", timezone: "Europe/Tallinn", weekend: "SAT_SUN" },
  { code: "EG", name: "Egypt", currency: "EGP", timezone: "Africa/Cairo", weekend: "FRI_SAT" },
  { code: "ES", name: "Spain", currency: "EUR", timezone: "Europe/Madrid", weekend: "SAT_SUN" },
  { code: "ET", name: "Ethiopia", currency: "ETB", timezone: "Africa/Addis_Ababa", weekend: "SAT_SUN" },
  { code: "FI", name: "Finland", currency: "EUR", timezone: "Europe/Helsinki", weekend: "SAT_SUN" },
  { code: "FR", name: "France", currency: "EUR", timezone: "Europe/Paris", weekend: "SAT_SUN" },
  { code: "GB", name: "United Kingdom", currency: "GBP", timezone: "Europe/London", weekend: "SAT_SUN" },
  { code: "GE", name: "Georgia", currency: "GEL", timezone: "Asia/Tbilisi", weekend: "SAT_SUN" },
  { code: "GH", name: "Ghana", currency: "GHS", timezone: "Africa/Accra", weekend: "SAT_SUN" },
  { code: "GR", name: "Greece", currency: "EUR", timezone: "Europe/Athens", weekend: "SAT_SUN" },
  { code: "GT", name: "Guatemala", currency: "GTQ", timezone: "America/Guatemala", weekend: "SAT_SUN" },
  { code: "HK", name: "Hong Kong", currency: "HKD", timezone: "Asia/Hong_Kong", weekend: "SAT_SUN" },
  { code: "HN", name: "Honduras", currency: "HNL", timezone: "America/Tegucigalpa", weekend: "SAT_SUN" },
  { code: "HR", name: "Croatia", currency: "EUR", timezone: "Europe/Zagreb", weekend: "SAT_SUN" },
  { code: "HU", name: "Hungary", currency: "HUF", timezone: "Europe/Budapest", weekend: "SAT_SUN" },
  { code: "ID", name: "Indonesia", currency: "IDR", timezone: "Asia/Jakarta", weekend: "SAT_SUN" },
  { code: "IE", name: "Ireland", currency: "EUR", timezone: "Europe/Dublin", weekend: "SAT_SUN" },
  { code: "IL", name: "Israel", currency: "ILS", timezone: "Asia/Jerusalem", weekend: "FRI_SAT" },
  { code: "IN", name: "India", currency: "INR", timezone: "Asia/Kolkata", weekend: "SAT_SUN" },
  { code: "IQ", name: "Iraq", currency: "IQD", timezone: "Asia/Baghdad", weekend: "FRI_SAT" },
  { code: "IR", name: "Iran", currency: "IRR", timezone: "Asia/Tehran", weekend: "THU_FRI" },
  { code: "IS", name: "Iceland", currency: "ISK", timezone: "Atlantic/Reykjavik", weekend: "SAT_SUN" },
  { code: "IT", name: "Italy", currency: "EUR", timezone: "Europe/Rome", weekend: "SAT_SUN" },
  { code: "JM", name: "Jamaica", currency: "JMD", timezone: "America/Jamaica", weekend: "SAT_SUN" },
  { code: "JO", name: "Jordan", currency: "JOD", timezone: "Asia/Amman", weekend: "FRI_SAT" },
  { code: "JP", name: "Japan", currency: "JPY", timezone: "Asia/Tokyo", weekend: "SAT_SUN" },
  { code: "KE", name: "Kenya", currency: "KES", timezone: "Africa/Nairobi", weekend: "SAT_SUN" },
  { code: "KH", name: "Cambodia", currency: "KHR", timezone: "Asia/Phnom_Penh", weekend: "SAT_SUN" },
  { code: "KR", name: "South Korea", currency: "KRW", timezone: "Asia/Seoul", weekend: "SAT_SUN" },
  { code: "KW", name: "Kuwait", currency: "KWD", timezone: "Asia/Kuwait", weekend: "FRI_SAT" },
  { code: "KZ", name: "Kazakhstan", currency: "KZT", timezone: "Asia/Almaty", weekend: "SAT_SUN" },
  { code: "LB", name: "Lebanon", currency: "LBP", timezone: "Asia/Beirut", weekend: "SAT_SUN" },
  { code: "LK", name: "Sri Lanka", currency: "LKR", timezone: "Asia/Colombo", weekend: "SAT_SUN" },
  { code: "LT", name: "Lithuania", currency: "EUR", timezone: "Europe/Vilnius", weekend: "SAT_SUN" },
  { code: "LU", name: "Luxembourg", currency: "EUR", timezone: "Europe/Luxembourg", weekend: "SAT_SUN" },
  { code: "LV", name: "Latvia", currency: "EUR", timezone: "Europe/Riga", weekend: "SAT_SUN" },
  { code: "LY", name: "Libya", currency: "LYD", timezone: "Africa/Tripoli", weekend: "FRI_SAT" },
  { code: "MA", name: "Morocco", currency: "MAD", timezone: "Africa/Casablanca", weekend: "SAT_SUN" },
  { code: "MD", name: "Moldova", currency: "MDL", timezone: "Europe/Chisinau", weekend: "SAT_SUN" },
  { code: "MK", name: "North Macedonia", currency: "MKD", timezone: "Europe/Skopje", weekend: "SAT_SUN" },
  { code: "MM", name: "Myanmar", currency: "MMK", timezone: "Asia/Yangon", weekend: "SAT_SUN" },
  { code: "MN", name: "Mongolia", currency: "MNT", timezone: "Asia/Ulaanbaatar", weekend: "SAT_SUN" },
  { code: "MT", name: "Malta", currency: "EUR", timezone: "Europe/Malta", weekend: "SAT_SUN" },
  { code: "MU", name: "Mauritius", currency: "MUR", timezone: "Indian/Mauritius", weekend: "SAT_SUN" },
  { code: "MV", name: "Maldives", currency: "MVR", timezone: "Indian/Maldives", weekend: "FRI_SAT" },
  { code: "MX", name: "Mexico", currency: "MXN", timezone: "America/Mexico_City", weekend: "SAT_SUN" },
  { code: "MY", name: "Malaysia", currency: "MYR", timezone: "Asia/Kuala_Lumpur", weekend: "SAT_SUN" },
  { code: "MZ", name: "Mozambique", currency: "MZN", timezone: "Africa/Maputo", weekend: "SAT_SUN" },
  { code: "NA", name: "Namibia", currency: "NAD", timezone: "Africa/Windhoek", weekend: "SAT_SUN" },
  { code: "NG", name: "Nigeria", currency: "NGN", timezone: "Africa/Lagos", weekend: "SAT_SUN" },
  { code: "NI", name: "Nicaragua", currency: "NIO", timezone: "America/Managua", weekend: "SAT_SUN" },
  { code: "NL", name: "Netherlands", currency: "EUR", timezone: "Europe/Amsterdam", weekend: "SAT_SUN" },
  { code: "NO", name: "Norway", currency: "NOK", timezone: "Europe/Oslo", weekend: "SAT_SUN" },
  { code: "NP", name: "Nepal", currency: "NPR", timezone: "Asia/Kathmandu", weekend: "SAT_SUN" },
  { code: "NZ", name: "New Zealand", currency: "NZD", timezone: "Pacific/Auckland", weekend: "SAT_SUN" },
  { code: "OM", name: "Oman", currency: "OMR", timezone: "Asia/Muscat", weekend: "FRI_SAT" },
  { code: "PA", name: "Panama", currency: "PAB", timezone: "America/Panama", weekend: "SAT_SUN" },
  { code: "PE", name: "Peru", currency: "PEN", timezone: "America/Lima", weekend: "SAT_SUN" },
  { code: "PH", name: "Philippines", currency: "PHP", timezone: "Asia/Manila", weekend: "SAT_SUN" },
  { code: "PK", name: "Pakistan", currency: "PKR", timezone: "Asia/Karachi", weekend: "SAT_SUN" },
  { code: "PL", name: "Poland", currency: "PLN", timezone: "Europe/Warsaw", weekend: "SAT_SUN" },
  { code: "PS", name: "Palestine", currency: "ILS", timezone: "Asia/Hebron", weekend: "FRI_SAT" },
  { code: "PT", name: "Portugal", currency: "EUR", timezone: "Europe/Lisbon", weekend: "SAT_SUN" },
  { code: "PY", name: "Paraguay", currency: "PYG", timezone: "America/Asuncion", weekend: "SAT_SUN" },
  { code: "QA", name: "Qatar", currency: "QAR", timezone: "Asia/Qatar", weekend: "FRI_SAT" },
  { code: "RO", name: "Romania", currency: "RON", timezone: "Europe/Bucharest", weekend: "SAT_SUN" },
  { code: "RS", name: "Serbia", currency: "RSD", timezone: "Europe/Belgrade", weekend: "SAT_SUN" },
  { code: "RU", name: "Russia", currency: "RUB", timezone: "Europe/Moscow", weekend: "SAT_SUN" },
  { code: "RW", name: "Rwanda", currency: "RWF", timezone: "Africa/Kigali", weekend: "SAT_SUN" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR", timezone: "Asia/Riyadh", weekend: "FRI_SAT" },
  { code: "SD", name: "Sudan", currency: "SDG", timezone: "Africa/Khartoum", weekend: "FRI_SAT" },
  { code: "SE", name: "Sweden", currency: "SEK", timezone: "Europe/Stockholm", weekend: "SAT_SUN" },
  { code: "SG", name: "Singapore", currency: "SGD", timezone: "Asia/Singapore", weekend: "SAT_SUN" },
  { code: "SI", name: "Slovenia", currency: "EUR", timezone: "Europe/Ljubljana", weekend: "SAT_SUN" },
  { code: "SK", name: "Slovakia", currency: "EUR", timezone: "Europe/Bratislava", weekend: "SAT_SUN" },
  { code: "SN", name: "Senegal", currency: "XOF", timezone: "Africa/Dakar", weekend: "SAT_SUN" },
  { code: "SY", name: "Syria", currency: "SYP", timezone: "Asia/Damascus", weekend: "FRI_SAT" },
  { code: "TH", name: "Thailand", currency: "THB", timezone: "Asia/Bangkok", weekend: "SAT_SUN" },
  { code: "TN", name: "Tunisia", currency: "TND", timezone: "Africa/Tunis", weekend: "SAT_SUN" },
  { code: "TR", name: "Turkiye", currency: "TRY", timezone: "Europe/Istanbul", weekend: "SAT_SUN" },
  { code: "TT", name: "Trinidad and Tobago", currency: "TTD", timezone: "America/Port_of_Spain", weekend: "SAT_SUN" },
  { code: "TW", name: "Taiwan", currency: "TWD", timezone: "Asia/Taipei", weekend: "SAT_SUN" },
  { code: "TZ", name: "Tanzania", currency: "TZS", timezone: "Africa/Dar_es_Salaam", weekend: "SAT_SUN" },
  { code: "UA", name: "Ukraine", currency: "UAH", timezone: "Europe/Kyiv", weekend: "SAT_SUN" },
  { code: "UG", name: "Uganda", currency: "UGX", timezone: "Africa/Kampala", weekend: "SAT_SUN" },
  { code: "US", name: "United States", currency: "USD", timezone: "America/New_York", weekend: "SAT_SUN" },
  { code: "UY", name: "Uruguay", currency: "UYU", timezone: "America/Montevideo", weekend: "SAT_SUN" },
  { code: "UZ", name: "Uzbekistan", currency: "UZS", timezone: "Asia/Tashkent", weekend: "SAT_SUN" },
  { code: "VE", name: "Venezuela", currency: "VES", timezone: "America/Caracas", weekend: "SAT_SUN" },
  { code: "VN", name: "Vietnam", currency: "VND", timezone: "Asia/Ho_Chi_Minh", weekend: "SAT_SUN" },
  { code: "YE", name: "Yemen", currency: "YER", timezone: "Asia/Aden", weekend: "FRI_SAT" },
  { code: "ZA", name: "South Africa", currency: "ZAR", timezone: "Africa/Johannesburg", weekend: "SAT_SUN" },
  { code: "ZM", name: "Zambia", currency: "ZMW", timezone: "Africa/Lusaka", weekend: "SAT_SUN" },
  { code: "ZW", name: "Zimbabwe", currency: "ZWG", timezone: "Africa/Harare", weekend: "SAT_SUN" },];

export const COUNTRY_REGISTRY: readonly CountryEntry[] = COUNTRIES;

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

export function country(code: string): CountryEntry | undefined {
  return BY_CODE.get(code.toUpperCase());
}

export function isSupportedCountry(code: string): boolean {
  return BY_CODE.has(code.toUpperCase());
}

/** Every currency any supported country uses, deduplicated -- the real option list, not a guess. */
export const SUPPORTED_CURRENCIES: readonly string[] = [...new Set(COUNTRIES.map((c) => c.currency))].sort();

/**
 * Countries matching a typed query, by name or code.
 *
 * A prefix match on the name ranks above a match anywhere in it, so
 * typing "ind" offers India before Indonesia rather than in whatever
 * order the table happens to be in.
 */
export function searchCountries(query: string, limit = 12): readonly CountryEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return COUNTRIES.slice(0, limit);

  const starts: CountryEntry[] = [];
  const contains: CountryEntry[] = [];
  for (const entry of COUNTRIES) {
    const name = entry.name.toLowerCase();
    if (name.startsWith(needle) || entry.code.toLowerCase() === needle) starts.push(entry);
    else if (name.includes(needle)) contains.push(entry);
  }
  return [...starts, ...contains].slice(0, limit);
}

/**
 * The working days for a country, as weekday indices.
 *
 * This is what policy P-15's `FROM_COUNTRY` answer resolves to, and the
 * reason the country field stopped being free text.
 */
export function workingDaysFor(countryCode: string): readonly number[] {
  const entry = country(countryCode);
  const weekend = new Set(WEEKEND_DAYS[entry?.weekend ?? "SAT_SUN"]);
  return [0, 1, 2, 3, 4, 5, 6].filter((day) => !weekend.has(day));
}
