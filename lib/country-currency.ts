/**
 * ISO 3166-1 alpha-2 country code -> [English country name, ISO 4217
 * currency code], for the "suggested base currency" hint on the
 * Multi-Currency admin page. Deliberately a single currency per country
 * (the one each country's central bank/treasury designates as official) —
 * several countries also accept a second currency in practice (e.g. USD
 * alongside a local currency), but a POS's base currency is a single
 * settings field, so this only ever suggests one.
 *
 * Kept self-contained (no dependency on the `date-holidays` package used by
 * lib/holidays-country.ts) since this table is read on every tenant
 * settings GET (see app/api/tenants/[slug]/settings/route.ts) — that's a
 * hot, unauthenticated, high-traffic path, so it must stay a cheap plain
 * object lookup rather than constructing a `Holidays` instance per request.
 */
const COUNTRY_TABLE: Record<string, [name: string, currency: string]> = {
  AD: ['Andorra', 'EUR'], AE: ['United Arab Emirates', 'AED'], AF: ['Afghanistan', 'AFN'],
  AG: ['Antigua and Barbuda', 'XCD'], AI: ['Anguilla', 'XCD'], AL: ['Albania', 'ALL'],
  AM: ['Armenia', 'AMD'], AO: ['Angola', 'AOA'], AR: ['Argentina', 'ARS'],
  AS: ['American Samoa', 'USD'], AT: ['Austria', 'EUR'], AU: ['Australia', 'AUD'],
  AW: ['Aruba', 'AWG'], AZ: ['Azerbaijan', 'AZN'],
  BA: ['Bosnia and Herzegovina', 'BAM'], BB: ['Barbados', 'BBD'], BD: ['Bangladesh', 'BDT'],
  BE: ['Belgium', 'EUR'], BF: ['Burkina Faso', 'XOF'], BG: ['Bulgaria', 'BGN'],
  BH: ['Bahrain', 'BHD'], BI: ['Burundi', 'BIF'], BJ: ['Benin', 'XOF'],
  BM: ['Bermuda', 'BMD'], BN: ['Brunei', 'BND'], BO: ['Bolivia', 'BOB'],
  BR: ['Brazil', 'BRL'], BS: ['Bahamas', 'BSD'], BT: ['Bhutan', 'BTN'],
  BW: ['Botswana', 'BWP'], BY: ['Belarus', 'BYN'], BZ: ['Belize', 'BZD'],
  CA: ['Canada', 'CAD'], CD: ['Democratic Republic of the Congo', 'CDF'],
  CF: ['Central African Republic', 'XAF'], CG: ['Republic of the Congo', 'XAF'],
  CH: ['Switzerland', 'CHF'], CI: ["Cote d'Ivoire", 'XOF'], CL: ['Chile', 'CLP'],
  CM: ['Cameroon', 'XAF'], CN: ['China', 'CNY'], CO: ['Colombia', 'COP'],
  CR: ['Costa Rica', 'CRC'], CU: ['Cuba', 'CUP'], CV: ['Cabo Verde', 'CVE'],
  CY: ['Cyprus', 'EUR'], CZ: ['Czech Republic', 'CZK'],
  DE: ['Germany', 'EUR'], DJ: ['Djibouti', 'DJF'], DK: ['Denmark', 'DKK'],
  DM: ['Dominica', 'XCD'], DO: ['Dominican Republic', 'DOP'], DZ: ['Algeria', 'DZD'],
  EC: ['Ecuador', 'USD'], EE: ['Estonia', 'EUR'], EG: ['Egypt', 'EGP'],
  ER: ['Eritrea', 'ERN'], ES: ['Spain', 'EUR'], ET: ['Ethiopia', 'ETB'],
  FI: ['Finland', 'EUR'], FJ: ['Fiji', 'FJD'], FK: ['Falkland Islands', 'FKP'],
  FM: ['Micronesia', 'USD'], FR: ['France', 'EUR'],
  GA: ['Gabon', 'XAF'], GB: ['United Kingdom', 'GBP'], GD: ['Grenada', 'XCD'],
  GE: ['Georgia', 'GEL'], GH: ['Ghana', 'GHS'], GI: ['Gibraltar', 'GIP'],
  GM: ['Gambia', 'GMD'], GN: ['Guinea', 'GNF'], GQ: ['Equatorial Guinea', 'XAF'],
  GR: ['Greece', 'EUR'], GT: ['Guatemala', 'GTQ'], GU: ['Guam', 'USD'],
  GW: ['Guinea-Bissau', 'XOF'], GY: ['Guyana', 'GYD'],
  HK: ['Hong Kong', 'HKD'], HN: ['Honduras', 'HNL'], HR: ['Croatia', 'EUR'],
  HT: ['Haiti', 'HTG'], HU: ['Hungary', 'HUF'],
  ID: ['Indonesia', 'IDR'], IE: ['Ireland', 'EUR'], IL: ['Israel', 'ILS'],
  IN: ['India', 'INR'], IQ: ['Iraq', 'IQD'], IR: ['Iran', 'IRR'], IS: ['Iceland', 'ISK'],
  IT: ['Italy', 'EUR'],
  JM: ['Jamaica', 'JMD'], JO: ['Jordan', 'JOD'], JP: ['Japan', 'JPY'],
  KE: ['Kenya', 'KES'], KG: ['Kyrgyzstan', 'KGS'], KH: ['Cambodia', 'KHR'],
  KI: ['Kiribati', 'AUD'], KM: ['Comoros', 'KMF'], KN: ['Saint Kitts and Nevis', 'XCD'],
  KP: ['North Korea', 'KPW'], KR: ['South Korea', 'KRW'], KW: ['Kuwait', 'KWD'],
  KY: ['Cayman Islands', 'KYD'], KZ: ['Kazakhstan', 'KZT'],
  LA: ['Laos', 'LAK'], LB: ['Lebanon', 'LBP'], LC: ['Saint Lucia', 'XCD'],
  LI: ['Liechtenstein', 'CHF'], LK: ['Sri Lanka', 'LKR'], LR: ['Liberia', 'LRD'],
  LS: ['Lesotho', 'LSL'], LT: ['Lithuania', 'EUR'], LU: ['Luxembourg', 'EUR'],
  LV: ['Latvia', 'EUR'], LY: ['Libya', 'LYD'],
  MA: ['Morocco', 'MAD'], MC: ['Monaco', 'EUR'], MD: ['Moldova', 'MDL'],
  ME: ['Montenegro', 'EUR'], MG: ['Madagascar', 'MGA'], MH: ['Marshall Islands', 'USD'],
  MK: ['North Macedonia', 'MKD'], ML: ['Mali', 'XOF'], MM: ['Myanmar', 'MMK'],
  MN: ['Mongolia', 'MNT'], MO: ['Macao', 'MOP'], MR: ['Mauritania', 'MRU'],
  MT: ['Malta', 'EUR'], MU: ['Mauritius', 'MUR'], MV: ['Maldives', 'MVR'],
  MW: ['Malawi', 'MWK'], MX: ['Mexico', 'MXN'], MY: ['Malaysia', 'MYR'],
  MZ: ['Mozambique', 'MZN'],
  NA: ['Namibia', 'NAD'], NE: ['Niger', 'XOF'], NG: ['Nigeria', 'NGN'],
  NI: ['Nicaragua', 'NIO'], NL: ['Netherlands', 'EUR'], NO: ['Norway', 'NOK'],
  NP: ['Nepal', 'NPR'], NR: ['Nauru', 'AUD'], NZ: ['New Zealand', 'NZD'],
  OM: ['Oman', 'OMR'],
  PA: ['Panama', 'PAB'], PE: ['Peru', 'PEN'], PG: ['Papua New Guinea', 'PGK'],
  PH: ['Philippines', 'PHP'], PK: ['Pakistan', 'PKR'], PL: ['Poland', 'PLN'],
  PR: ['Puerto Rico', 'USD'], PS: ['Palestine', 'ILS'], PT: ['Portugal', 'EUR'],
  PW: ['Palau', 'USD'], PY: ['Paraguay', 'PYG'],
  QA: ['Qatar', 'QAR'],
  RO: ['Romania', 'RON'], RS: ['Serbia', 'RSD'], RU: ['Russia', 'RUB'], RW: ['Rwanda', 'RWF'],
  SA: ['Saudi Arabia', 'SAR'], SB: ['Solomon Islands', 'SBD'], SC: ['Seychelles', 'SCR'],
  SD: ['Sudan', 'SDG'], SE: ['Sweden', 'SEK'], SG: ['Singapore', 'SGD'],
  SH: ['Saint Helena', 'SHP'], SI: ['Slovenia', 'EUR'], SK: ['Slovakia', 'EUR'],
  SL: ['Sierra Leone', 'SLE'], SM: ['San Marino', 'EUR'], SN: ['Senegal', 'XOF'],
  SO: ['Somalia', 'SOS'], SR: ['Suriname', 'SRD'], SS: ['South Sudan', 'SSP'],
  ST: ['Sao Tome and Principe', 'STN'], SV: ['El Salvador', 'USD'], SY: ['Syria', 'SYP'],
  SZ: ['Eswatini', 'SZL'],
  TD: ['Chad', 'XAF'], TG: ['Togo', 'XOF'], TH: ['Thailand', 'THB'],
  TJ: ['Tajikistan', 'TJS'], TL: ['Timor-Leste', 'USD'], TM: ['Turkmenistan', 'TMT'],
  TN: ['Tunisia', 'TND'], TO: ['Tonga', 'TOP'], TR: ['Turkey', 'TRY'],
  TT: ['Trinidad and Tobago', 'TTD'], TV: ['Tuvalu', 'AUD'], TW: ['Taiwan', 'TWD'],
  TZ: ['Tanzania', 'TZS'],
  UA: ['Ukraine', 'UAH'], UG: ['Uganda', 'UGX'], US: ['United States of America', 'USD'],
  UY: ['Uruguay', 'UYU'], UZ: ['Uzbekistan', 'UZS'],
  VA: ['Vatican City', 'EUR'], VC: ['Saint Vincent and the Grenadines', 'XCD'],
  VE: ['Venezuela', 'VES'], VN: ['Vietnam', 'VND'], VU: ['Vanuatu', 'VUV'],
  WS: ['Samoa', 'WST'],
  YE: ['Yemen', 'YER'],
  ZA: ['South Africa', 'ZAR'], ZM: ['Zambia', 'ZMW'], ZW: ['Zimbabwe', 'USD'],
};

// Short forms that don't literally match the table's English names.
const ALIASES: Record<string, string> = {
  usa: 'US',
  us: 'US',
  'united states': 'US',
  uk: 'GB',
  england: 'GB',
  'great britain': 'GB',
  'south korea': 'KR',
  uae: 'AE',
  vietnam: 'VN',
  taiwan: 'TW',
  'hong kong': 'HK',
  russia: 'RU',
  'czech republic': 'CZ',
};

/**
 * Best-effort currency suggestion from a tenant's free-text address country
 * (TenantSettings.addressCountry — admins type this manually, see
 * app/[tenant]/[lang]/admin/settings/page.tsx). Returns null if nothing
 * reasonably matches, rather than guessing.
 */
export function suggestCurrencyForCountry(input: string | null | undefined): { currency: string; countryName: string } | null {
  if (!input) return null;
  const needle = input.trim().toLowerCase();
  if (!needle) return null;

  const entries = Object.entries(COUNTRY_TABLE);

  const byCode = COUNTRY_TABLE[needle.toUpperCase()];
  if (byCode) return { countryName: byCode[0], currency: byCode[1] };

  const byName = entries.find(([, [name]]) => name.toLowerCase() === needle);
  if (byName) return { countryName: byName[1][0], currency: byName[1][1] };

  const aliasCode = ALIASES[needle];
  if (aliasCode && COUNTRY_TABLE[aliasCode]) {
    return { countryName: COUNTRY_TABLE[aliasCode][0], currency: COUNTRY_TABLE[aliasCode][1] };
  }

  const bySubstring = entries.find(
    ([, [name]]) => name.toLowerCase().includes(needle) || needle.includes(name.toLowerCase())
  );
  if (bySubstring) return { countryName: bySubstring[1][0], currency: bySubstring[1][1] };

  return null;
}
