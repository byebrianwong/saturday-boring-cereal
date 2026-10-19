import { config, fields, collection } from '@keystatic/core';

const categoryOptions = [
  { label: 'Cereal', value: 'cereal' },
  { label: 'Bar', value: 'bar' },
  { label: 'Snack', value: 'snack' },
];

// Every form factor in one list, cereal first. The site only uses the ones
// that belong to the product's category (see CEREAL_FORMS, BAR_FORMS and
// SNACK_FORMS in src/content.config.ts).
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
  { label: 'Protein Bar (bars)', value: 'protein-bar' },
  { label: 'Granola Bar (bars)', value: 'granola-bar' },
  { label: 'Nut Bar (bars)', value: 'nut-bar' },
  { label: 'Fruit Bar (bars)', value: 'fruit-bar' },
  { label: 'Chips (snacks)', value: 'chips' },
  { label: 'Bites (snacks)', value: 'bites' },
  { label: 'Cookies (snacks)', value: 'cookies' },
  { label: 'Jerky (snacks)', value: 'jerky' },
  { label: 'Crackers (snacks)', value: 'crackers' },
];

const proteinSourceOptions = [
  { label: 'Pea Protein', value: 'pea-protein' },
  { label: 'Milk Protein', value: 'milk-protein' },
  { label: 'Whey', value: 'whey' },
  { label: 'Soy', value: 'soy' },
  { label: 'Nut / Seed', value: 'nut-seed' },
  { label: 'Grain-Only', value: 'grain-only' },
];

const sweetenerOptions = [
  { label: 'Sucralose', value: 'sucralose' },
  { label: 'Aspartame', value: 'aspartame' },
  { label: 'Acesulfame K', value: 'acesulfame-k' },
  { label: 'Saccharin', value: 'saccharin' },
  { label: 'Allulose', value: 'allulose' },
  { label: 'Monk fruit', value: 'monk-fruit' },
  { label: 'Stevia', value: 'stevia' },
  { label: 'Erythritol', value: 'erythritol' },
  { label: 'Maltitol', value: 'maltitol' },
  { label: 'Sorbitol', value: 'sorbitol' },
  { label: 'Xylitol', value: 'xylitol' },
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
      label: 'Products',
      slugField: 'name',
      path: 'src/content/cereals/*',
      format: { contentField: 'body' },
      columns: ['brand', 'category', 'rating', 'dateReviewed'],
      schema: {
        name: fields.slug({
          name: {
            label: 'Product name',
            description:
              'Without the brand, but with the cereal line when there is one, e.g. “Honey Bunches of Oats, Honey Roasted”.',
          },
        }),
        brand: fields.text({
          label: 'Brand',
          description: 'The company on the box, e.g. “Post” or “General Mills”, not the cereal line.',
          validation: { isRequired: true },
        }),
        category: fields.select({
          label: 'Category',
          description: 'Cereal, bar or snack. Each is ranked only against its own category.',
          options: categoryOptions,
          defaultValue: 'cereal',
        }),
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
        noAutoImage: fields.checkbox({
          label: 'No auto box image',
          description:
            'Tick when no flat, straight-on package front exists for this product. Keeps the emoji placeholder and stops `npm run enrich` adding an angled one.',
          defaultValue: false,
        }),
        formFactors: fields.multiselect({ label: 'Form factors', options: formFactorOptions }),
        proteinSources: fields.multiselect({ label: 'Protein sources', options: proteinSourceOptions }),
        attributes: fields.multiselect({ label: 'Attributes', options: attributeOptions }),
        sweeteners: fields.multiselect({
          label: 'Sugar substitutes',
          description: 'Any named in the ingredient list. A box with one is left out of the "least sugar" record.',
          options: sweetenerOptions,
        }),
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
