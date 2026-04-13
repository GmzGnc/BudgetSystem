import type { Category } from '@/types';

export const CATEGORIES: Category[] = [
  { id: 'guvenlik',     name: 'Güvenlik',        indexType: 'Asgari Ücret',   rate: 20.0  },
  { id: 'temizlik',     name: 'Temizlik',         indexType: 'Asgari Ücret',   rate: 20.0  },
  { id: 'yemek',        name: 'Yemek',            indexType: 'TÜFE+Gıda',      rate: 25.5  },
  { id: 'servis',       name: 'Servis/Ulaşım',    indexType: 'Motorin+Asgari', rate: 18.3  },
  { id: 'arac_kira',    name: 'Araç Kira',        indexType: 'TÜFE',           rate: 23.1  },
  { id: 'hgs',          name: 'HGS',              indexType: 'TÜFE',           rate: 23.1  },
  { id: 'arac_yakit',   name: 'Araç Yakıt',       indexType: 'Motorin',        rate: 15.8  },
  { id: 'arac_bakim',   name: 'Araç Bakım',       indexType: 'ÜFE',            rate: 23.1  },
  { id: 'su',           name: 'Su',               indexType: 'TÜFE',           rate: 23.1  },
  { id: 'diger_hizmet', name: 'Diğer Hizmet',     indexType: 'ÜFE',            rate: 23.1  },
  { id: 'diger_cesitli',name: 'Diğer Çeşitli',    indexType: 'ÜFE',            rate: 23.1  },
];

export const CATEGORY_COLORS: Record<string, string> = {
  guvenlik:      '#6366f1',
  temizlik:      '#14b8a6',
  yemek:         '#f59e0b',
  servis:        '#3b82f6',
  arac_kira:     '#8b5cf6',
  hgs:           '#ec4899',
  arac_yakit:    '#f97316',
  arac_bakim:    '#84cc16',
  su:            '#06b6d4',
  diger_hizmet:  '#a78bfa',
  diger_cesitli: '#94a3b8',
};

export const INDEX_BADGE_COLORS: Record<string, string> = {
  'Asgari Ücret':   'bg-green-100 text-green-800',
  'TÜFE+Gıda':      'bg-blue-100 text-blue-800',
  'Motorin+Asgari': 'bg-orange-100 text-orange-800',
  'TÜFE':           'bg-sky-100 text-sky-800',
  'Motorin':        'bg-amber-100 text-amber-800',
  'ÜFE':            'bg-red-100 text-red-800',
};
