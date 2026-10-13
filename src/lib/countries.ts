export const ISO_COUNTRIES: string[] = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
  'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
  'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE',
  'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
  'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
  'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM',
  'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC',
  'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
  'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
  'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG',
  'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
  'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO',
  'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
  'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW'
];

export function countryName(code: string, locale: string = 'en'): string {
  if (!code) return '';
  const upper = code.toUpperCase();
  try {
    const dn = new Intl.DisplayNames([locale], { type: 'region' });
    return dn.of(upper) || upper;
  } catch {
    return upper;
  }
}

export function guessCountry(): string {
  if (typeof navigator !== 'undefined' && navigator.language) {
    const lang = navigator.language;
    if (lang.includes('-')) {
      const parts = lang.split('-');
      const region = parts[parts.length - 1].toUpperCase();
      if (region.length === 2 && ISO_COUNTRIES.includes(region)) {
        return region;
      }
    }
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzMap: Record<string, string> = {
      'Africa/Kampala': 'UG',
      'Africa/Khartoum': 'SD',
      'Africa/Cairo': 'EG',
      'Africa/Nairobi': 'KE',
      'Africa/Lagos': 'NG',
      'Asia/Riyadh': 'SA',
      'Asia/Dubai': 'AE',
      'Europe/London': 'GB',
      'America/New_York': 'US',
    };
    if (tz && tzMap[tz]) {
      return tzMap[tz];
    }
  } catch {
    // ignore
  }
  return '';
}

export function deriveLocation(city?: string, countryCode?: string): string {
  const cleanCity = city ? city.trim() : '';
  const cName = countryCode ? countryName(countryCode) : '';
  if (cleanCity && cName) {
    return `${cleanCity}, ${cName}`;
  }
  if (cleanCity) return cleanCity;
  if (cName) return cName;
  return '';
}

export interface CountryOption {
  code: string;
  name: string;
}

export function getSortedCountries(locale: string = 'en'): CountryOption[] {
  const list = ISO_COUNTRIES.map((code) => ({
    code,
    name: countryName(code, locale),
  }));
  list.sort((a, b) => a.name.localeCompare(b.name, locale));
  return list;
}
