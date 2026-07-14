import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

export const FORM_FACTORS = [
  'flakes', 'clusters', 'granola', 'puffs', 'squares', 'os',
  'shredded', 'biscuits', 'muesli', 'oats', 'crisps',
] as const;

export const PROTEIN_SOURCES = [
  'pea-protein', 'milk-protein', 'whey', 'soy', 'nut-seed', 'grain-only',
] as const;

export const ATTRIBUTES = [
  'gluten-free', 'grain-free', 'keto', 'low-sugar', 'high-protein',
  'high-fiber', 'vegan', 'organic', 'no-added-sugar', 'nut-free',
] as const;

// Per-serving nutrition. Nullable fields mirror what labels actually omit:
// the UI must say "not listed" for nulls, never invent a value (esp. proteinDV).
const nutrition = z.object({
  servingSize: z.number(),
  servingDescription: z.string().nullish(),
  calories: z.number().nullish(),
  totalFat: z.number().nullish(),
  saturatedFat: z.number().nullish(),
  transFat: z.number().nullish(),
  polyunsaturatedFat: z.number().nullish(),
  monounsaturatedFat: z.number().nullish(),
  totalCarbs: z.number().nullish(),
  dietaryFiber: z.number().nullish(),
  totalSugars: z.number().nullish(),
  addedSugars: z.number().nullish(),
  protein: z.number().nullish(),
  proteinDV: z.number().nullish(),
  sodium: z.number().nullish(),
});

const cereals = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/cereals' }),
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    // Nullable: some Notion entries have no Taste score. UI shows "unrated"
    // rather than inventing a number.
    rating: z.number().min(0).max(10).nullable().default(null),
    shortNote: z.string().optional(),
    dateReviewed: z.coerce.date(),
    dateUpdated: z.coerce.date().optional(),
    // Box art placeholders until real photos exist (emoji + a box color).
    emoji: z.string().default('🥣'),
    boxColor: z.string().default('#c98d4e'),
    boxImage: z.string().optional(),
    imageSource: z.enum(['own_photo', 'open_food_facts', 'manufacturer', 'other']).optional(),
    imageCredit: z.string().optional(),
    barcode: z.string().optional(),
    purchaseLocation: z.string().optional(),
    price: z.number().optional(),
    formFactors: z.array(z.enum(FORM_FACTORS)).default([]),
    proteinSources: z.array(z.enum(PROTEIN_SOURCES)).default([]),
    attributes: z.array(z.enum(ATTRIBUTES)).default([]),
    nutrition,
  }),
});

export const collections = { cereals };
