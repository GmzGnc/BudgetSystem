import fullData from './drill-down-full.json';

export const MONTH_LABELS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'] as const;

export interface DrillDownItem {
  name: string;
  monthly: number[];
}

export interface DrillDownGroup {
  department: string;
  total: number[];
  items: DrillDownItem[];
}

/** cat.id → JSON key */
const CAT_ID_MAP: Record<string, string> = {
  guvenlik:      'Güvenlik',
  temizlik:      'Temizlik',
  yemek:         'Yemek',
  servis:        'Servis/Ulaşım',
  arac_kira:     'Araç Kira',
  hgs:           'HGS',
  arac_yakit:    'Araç Yakıt',
  arac_bakim:    'Araç Bakım',
  su:            'Su',
  diger_hizmet:  'Diğer Hizmet',
  diger_cesitli: 'Diğer Çeşitli',
};

type JsonData = typeof fullData;
type CompanyKey = 'ica' | 'ice';

function getGroups(companyKey: CompanyKey, catName: string): DrillDownGroup[] {
  const companyData = fullData[companyKey] as Record<string, { groups: DrillDownGroup[] }>;
  return companyData[catName]?.groups ?? [];
}

export function getDrillDownData(
  categoryId: string,
  company: 'ICA' | 'ICE' | 'GRUP',
): DrillDownGroup[] {
  const catName = CAT_ID_MAP[categoryId];
  if (!catName) return [];

  if (company === 'ICA') return getGroups('ica', catName);
  if (company === 'ICE') return getGroups('ice', catName);

  // GRUP — ICA groups then ICE groups (prefixed)
  const icaGroups = getGroups('ica', catName);
  const iceGroups = getGroups('ice', catName).map((g) => ({
    ...g,
    department: `ICE · ${g.department}`,
  }));
  return [...icaGroups, ...iceGroups];
}
