export const FORM_FACTOR_LABELS: Record<string, string> = {
  flakes: 'Flakes',
  clusters: 'Clusters',
  granola: 'Granola',
  puffs: 'Puffs',
  squares: 'Squares',
  os: "O's",
  shredded: 'Shredded',
  biscuits: 'Biscuits',
  muesli: 'Muesli',
  oats: 'Oats',
  crisps: 'Crisps',
};

export const ATTRIBUTE_LABELS: Record<string, string> = {
  'gluten-free': 'Gluten-Free',
  'grain-free': 'Grain-Free',
  keto: 'Keto',
  'low-sugar': 'Low-Sugar',
  'high-protein': 'High-Protein',
  'high-fiber': 'High-Fiber',
  vegan: 'Vegan',
  organic: 'Organic',
  'no-added-sugar': 'No Added Sugar',
  'nut-free': 'Nut-Free',
};

export const PROTEIN_SOURCE_LABELS: Record<string, string> = {
  'pea-protein': 'Pea Protein',
  'milk-protein': 'Milk Protein',
  whey: 'Whey',
  soy: 'Soy',
  'nut-seed': 'Nut / Seed',
  'grain-only': 'Grain-Only',
};

// The aisle signs shown as filters on the home page and explorer.
export const AISLE_FILTERS = [
  { key: 'all', label: 'Everything', aisle: 'AISLE 1' },
  { key: 'flakes', label: 'Flakes', aisle: 'AISLE 2' },
  { key: 'clusters', label: 'Clusters', aisle: 'AISLE 3' },
  { key: 'granola', label: 'Granola', aisle: 'AISLE 4' },
  { key: 'puffs', label: 'Puffs', aisle: 'AISLE 5' },
  { key: 'high-protein', label: 'High-Protein', aisle: 'AISLE 6' },
  { key: 'low-sugar', label: 'Low-Sugar', aisle: 'AISLE 7' },
] as const;

export function label(key: string): string {
  return (
    FORM_FACTOR_LABELS[key] ?? ATTRIBUTE_LABELS[key] ?? PROTEIN_SOURCE_LABELS[key] ?? key
  );
}
