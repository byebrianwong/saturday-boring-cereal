import { config, fields, collection } from '@keystatic/core';

const formFactorOptions = [
  { label: 'Flakes', value: 'flakes' },
  { label: 'Clusters', value: 'clusters' },
  { label: 'Granola', value: 'granola' },
  { label: 'Puffs', value: 'puffs' },
  { label: 'Squares', value: 'squares' },
  { label: "O's", value: 'os' },
  { label: 'Shredded', value: 'shredded' },
  { label: 'Biscuits', value: 'biscuits' },
  { label: 'Muesli', value: 'muesli' },
  { label: 'Oats', value: 'oats' },
  { label: 'Crisps', value: 'crisps' },
];

const proteinSourceOptions = [
  { label: 'Pea Protein', value: 'pea-protein' },
  { label: 'Milk Protein', value: 'milk-protein' },
  { label: 'Whey', value: 'whey' },
  { label: 'Soy', value: 'soy' },
  { label: 'Nut / Seed', value: 'nut-seed' },
  { label: 'Grain-Only', value: 'grain-only' },
];

const attributeOptions = [
  { label: 'Gluten-Free', value: 'gluten-free' },
  { label: 'Grain-Free', value: 'grain-free' },
  { label: 'Keto', value: 'keto' },
  { label: 'Low-Sugar', value: 'low-sugar' },
  { label: 'High-Protein', value: 'high-protein' },
  { label: 'High-Fiber', value: 'high-fiber' },
  { label: 'Vegan', value: 'vegan' },
  { label: 'Organic', value: 'organic' },
  { label: 'No Added Sugar', value: 'no-added-sugar' },
  { label: 'Nut-Free', value: 'nut-free' },
];

const optionalGrams = (label: string) =>
  fields.number({ label, description: 'Grams. Leave blank if the label doesn’t list it.' });

export default config({
  storage: { kind: 'local' },
  ui: {
    brand: { name: 'Saturday Boring Cereal' },
  },
  collections: {
    cereals: collection({
      label: 'Cereals',
      slugField: 'name',
      path: 'src/content/cereals/*',
      format: { contentField: 'body' },
      columns: ['brand', 'rating', 'dateReviewed'],
      schema: {
        name: fields.slug({
          name: { label: 'Product name', description: 'Without the brand, e.g. “Almond Butter”.' },
        }),
        brand: fields.text({ label: 'Brand', validation: { isRequired: true } }),
        rating: fields.number({
          label: 'Taste rating (0–10)',
          description: 'Decimals allowed — the historical Notion scale. Leave blank if unrated.',
          validation: { isRequired: false, min: 0, max: 10 },
        }),
        shortNote: fields.text({ label: 'Short tasting note', multiline: true }),
        dateReviewed: fields.date({ label: 'Date reviewed', defaultValue: { kind: 'today' } }),
        emoji: fields.text({
          label: 'Box emoji',
          description: 'Placeholder art until real box photos exist.',
          defaultValue: '🥣',
        }),
        boxColor: fields.text({
          label: 'Box color (hex)',
          description: 'Front color of the 3D box on the shelf.',
          defaultValue: '#c98d4e',
        }),
        barcode: fields.text({ label: 'Barcode (UPC)', description: 'For USDA / Open Food Facts lookups.' }),
        formFactors: fields.multiselect({ label: 'Form factors', options: formFactorOptions }),
        proteinSources: fields.multiselect({ label: 'Protein sources', options: proteinSourceOptions }),
        attributes: fields.multiselect({ label: 'Attributes', options: attributeOptions }),
        nutrition: fields.object(
          {
            servingSize: fields.number({
              label: 'Serving size (g)',
              validation: { isRequired: true, min: 1 },
            }),
            servingDescription: fields.text({
              label: 'Serving description',
              description: 'e.g. “2/3 cup (60g)”',
            }),
            calories: fields.number({ label: 'Calories' }),
            totalFat: optionalGrams('Total fat'),
            saturatedFat: optionalGrams('Saturated fat'),
            transFat: optionalGrams('Trans fat'),
            polyunsaturatedFat: optionalGrams('Polyunsaturated fat'),
            monounsaturatedFat: optionalGrams('Monounsaturated fat'),
            totalCarbs: optionalGrams('Total carbohydrate'),
            dietaryFiber: optionalGrams('Dietary fiber'),
            totalSugars: optionalGrams('Total sugars'),
            addedSugars: optionalGrams('Added sugars'),
            protein: optionalGrams('Protein'),
            proteinDV: fields.number({
              label: 'Protein %DV',
              description: 'Only listed when the box makes a protein claim. Leave blank otherwise.',
            }),
            sodium: fields.number({ label: 'Sodium (mg)' }),
          },
          { label: 'Nutrition (per serving)' }
        ),
        body: fields.markdoc({ label: 'Review', extension: 'md' }),
      },
    }),
  },
});
