import type { Company } from '@/types';

export interface SapEntry {
  code: string;
  name: string;
  budget: number;
  remaining: number;
  used: number;
  category: string;
  company: 'ICA' | 'ICE';
}

export const ICA_SAP: SapEntry[] = [
  { code: '26DE19GYG', name: 'İŞÇİ PERSONEL YEMEK-GYG',  budget: 5866582,  remaining: 5173524,  used: 693058,  category: 'Yemek',        company: 'ICA' },
  { code: '26DE19HGS', name: 'YEMEK-TANER',               budget: 1050000,  remaining: 932398,   used: 117602,  category: 'Yemek',        company: 'ICA' },
  { code: '26DE19KM',  name: 'YEMEK-KAMU',                budget: 15369694, remaining: 14244229, used: 1125465, category: 'Yemek',        company: 'ICA' },
  { code: '26DE19OPR', name: 'YEMEK-OPERASYON',           budget: 805872,   remaining: 797232,   used: 8640,    category: 'Yemek',        company: 'ICA' },
  { code: '26DE19İÇ',  name: 'YEMEK-İÇTAŞ',              budget: 1189267,  remaining: 1139635,  used: 49632,   category: 'Yemek',        company: 'ICA' },
  { code: '26DE21GYG', name: 'ARAÇ KİRA-GYG',             budget: 4837000,  remaining: 4536900,  used: 300100,  category: 'Araç Kira',    company: 'ICA' },
  { code: '26DE21KM',  name: 'ARAÇ KİRA-KAMU',            budget: 5608000,  remaining: 5171595,  used: 436405,  category: 'Araç Kira',    company: 'ICA' },
  { code: '26DE21OPR', name: 'ARAÇ KİRA-OPR',             budget: 10379000, remaining: 9555500,  used: 823500,  category: 'Araç Kira',    company: 'ICA' },
  { code: '26DE22GYG', name: 'HGS-GYG',                   budget: 990000,   remaining: 961116,   used: 28884,   category: 'HGS',          company: 'ICA' },
  { code: '26DE22KM',  name: 'HGS-KAMU',                  budget: 401250,   remaining: 364099,   used: 37151,   category: 'HGS',          company: 'ICA' },
  { code: '26DE22OPR', name: 'HGS-OPR',                   budget: 204375,   remaining: 170183,   used: 34192,   category: 'HGS',          company: 'ICA' },
  { code: '26DE24GYG', name: 'YAKIT-GYG',                 budget: 2568308,  remaining: 2517501,  used: 50807,   category: 'Araç Yakıt',   company: 'ICA' },
  { code: '26DE24KM',  name: 'YAKIT-KAMU',                budget: 2568308,  remaining: 2431799,  used: 136510,  category: 'Araç Yakıt',   company: 'ICA' },
  { code: '26DE24OPR', name: 'YAKIT-OPR',                 budget: 2505667,  remaining: 2384589,  used: 121078,  category: 'Araç Yakıt',   company: 'ICA' },
  { code: '26DE25OPR', name: 'BAKIM ONARIM-OPR',          budget: 864000,   remaining: 863720,   used: 280,     category: 'Araç Bakım',   company: 'ICA' },
  { code: '26DE29',    name: 'İÇME SUYU-GYG',             budget: 3747682,  remaining: 3577972,  used: 169710,  category: 'Su',           company: 'ICA' },
  { code: '26DE29OHT', name: 'İÇME SUYU-OHT',             budget: 570747,   remaining: 549187,   used: 21560,   category: 'Su',           company: 'ICA' },
  { code: '26DE30OHT', name: 'TEMİZLİK MALZEMESİ',        budget: 180000,   remaining: 155608,   used: 24392,   category: 'Temizlik',     company: 'ICA' },
  { code: '26DE32',    name: 'CEP TELEFONU',               budget: 480000,   remaining: 451292,   used: 28708,   category: 'Diğer Çeşitli',company: 'ICA' },
  { code: '26DE34',    name: 'ÇAY OCAĞI',                  budget: 300000,   remaining: 157080,   used: 142920,  category: 'Diğer Çeşitli',company: 'ICA' },
  { code: '26DE36',    name: 'ŞEHİRİÇİ ULAŞIM',           budget: 150000,   remaining: 118000,   used: 32000,   category: 'Diğer Çeşitli',company: 'ICA' },
];

export const ICE_SAP: SapEntry[] = [
  { code: '26DE02',    name: 'PERSONEL YEMEK',             budget: 17832337, remaining: 17702337, used: 130000,  category: 'Yemek',        company: 'ICE' },
  { code: '26DE03',    name: 'ARAÇ YAKIT',                 budget: 2017062,  remaining: 1940052,  used: 77010,   category: 'Araç Yakıt',   company: 'ICE' },
  { code: '26DE03NOW', name: 'ARAÇ YAKIT_NOW',             budget: 757964,   remaining: 724694,   used: 33271,   category: 'Araç Yakıt',   company: 'ICE' },
  { code: '26DE03İÇ',  name: 'ARAÇ YAKIT_DİĞER',          budget: 1158871,  remaining: 1130534,  used: 28337,   category: 'Araç Yakıt',   company: 'ICE' },
  { code: '26DE04',    name: 'SU GİDERLERİ',               budget: 5059233,  remaining: 4743285,  used: 315948,  category: 'Su',           company: 'ICE' },
  { code: '26DE05',    name: 'ARAÇ BAKIM',                 budget: 750000,   remaining: 720010,   used: 29990,   category: 'Araç Bakım',   company: 'ICE' },
  { code: '26DE06',    name: 'ARAÇ HGS',                   budget: 300000,   remaining: 299188,   used: 812,     category: 'HGS',          company: 'ICE' },
  { code: '26DE07',    name: 'ARAÇ KİRA',                  budget: 11016300, remaining: 10385800, used: 630500,  category: 'Araç Kira',    company: 'ICE' },
  { code: '26DE07NOW', name: 'ARAÇ KİRA_NOW',              budget: 2406000,  remaining: 2205500,  used: 200500,  category: 'Araç Kira',    company: 'ICE' },
  { code: '26DE07İÇ',  name: 'ARAÇ KİRA_DİĞER',           budget: 1564800,  remaining: 1434400,  used: 130400,  category: 'Araç Kira',    company: 'ICE' },
  { code: '26DE08',    name: 'TEMİZLİK TAŞERON',           budget: 8328457,  remaining: 7878522,  used: 449935,  category: 'Temizlik',     company: 'ICE' },
  { code: '26DE09',    name: 'TEMİZLİK MALZEMESİ',         budget: 2968379,  remaining: 2095260,  used: 873119,  category: 'Temizlik',     company: 'ICE' },
  { code: '26DE10',    name: 'ÇAY OCAĞI',                  budget: 2808912,  remaining: 2027042,  used: 781870,  category: 'Diğer Çeşitli',company: 'ICE' },
  { code: '26DE11',    name: 'CEP TELEFONU',               budget: 1080000,  remaining: 1020603,  used: 59397,   category: 'Diğer Çeşitli',company: 'ICE' },
  { code: '26DE12',    name: 'POSTA VE KARGO',             budget: 480000,   remaining: 443470,   used: 36530,   category: 'Diğer Çeşitli',company: 'ICE' },
  { code: '26DE13',    name: 'KIRTASİYE',                  budget: 480000,   remaining: 478500,   used: 1500,    category: 'Diğer Çeşitli',company: 'ICE' },
  { code: '26DE16',    name: 'DİĞER ÇEŞİTLİ',             budget: 1000000,  remaining: 991075,   used: 8925,    category: 'Diğer Çeşitli',company: 'ICE' },
];

export const SAP_CATEGORY_COLORS: Record<string, string> = {
  'Yemek':         '#f59e0b',
  'Araç Kira':     '#8b5cf6',
  'HGS':           '#ec4899',
  'Araç Yakıt':    '#f97316',
  'Araç Bakım':    '#84cc16',
  'Su':            '#06b6d4',
  'Temizlik':      '#14b8a6',
  'Diğer Çeşitli': '#94a3b8',
};

export function getSapData(company: Company): SapEntry[] {
  if (company === 'ICA')  return ICA_SAP;
  if (company === 'ICE')  return ICE_SAP;
  return [...ICA_SAP, ...ICE_SAP];
}
