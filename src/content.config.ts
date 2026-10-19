import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// What kind of product a file is. The site is cereal-first, and every product
// is ranked only against others in its own category, so a protein bar never
// takes a cereal's place. A file with no `category` line is a cereal.
export const CATEGORIES = ['cereal', 'bar', 'snack'] as const;

// Form factors, one list per category. Puffs and crisps appear in both the
// cereal and the snack lists, so FORM_FACTORS (every allowed value) repeats
// them. The repeat is harmless: it only feeds validation.
// The scripts and the Stock Room read these lists out of this file's text, so
// keep each one a plain list of quoted strings.
export const CEREAL_FORMS = [
  'flakes', 'clusters', 'granola', 'puffs', 'squares', 'os',
  'shredded', 'biscuits', 'muesli', 'oats', 'crisps',
] as const;

export const BAR_FORMS = ['protein-bar', 'granola-bar', 'nut-bar', 'fruit-bar'] as const;

export const SNACK_FORMS = [
  'chips', 'puffs', 'crisps', 'bites', 'cookies', 'jerky', 'crackers',
] as const;

export const FORM_FACTORS = [...CEREAL_FORMS, ...BAR_FORMS, ...SNACK_FORMS] as const;

export const PROTEIN_SOURCES = [
  'pea-protein', 'milk-protein', 'whey', 'soy', 'nut-seed', 'grain-only',
] as const;

export const ATTRIBUTES = [
  'gluten-free', 'grain-free', 'keto', 'low-sugar', 'high-protein',
  'high-fiber', 'vegan', 'organic', 'no-added-sugar', 'nut-free',
] as const;

// Sugar substitutes named in the ingredient list. Used to keep a box that hits
// near-zero sugar by swapping in a sweetener out of the "least sugar" record.
// Natural ones (allulose, monk fruit, stevia) count too: the record is for
// boxes that are low in sugar without tasting sweeter than the label says.
// Maltitol, sorbitol and xylitol are sugar alcohols that protein bars use a lot.
export const SWEETENERS = [
  'sucralose', 'aspartame', 'acesulfame-k', 'saccharin',
  'allulose', 'monk-fruit', 'stevia', 'erythritol',
  'maltitol', 'sorbitol', 'xylitol',
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
    category: z.enum(CATEGORIES).default('cereal'),
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
    // Box art must be a flat, straight-on package front (the 3D box already
    // applies its own rotateY perspective). Set this on products where no such
    // front exists anywhere — the emoji placeholder beats an angled or
    // crowdsourced snapshot, and this stops enrichment re-adding one.
    noAutoImage: z.boolean().optional(),
    // A photo of the box's printed Nutrition Facts label. The detail page
    // shows it, collapsed, next to the stored per-serving numbers so they can
    // be checked by eye. Set with `npm run label`.
    labelImage: z.string().optional(),
    labelCredit: z.string().optional(),
    barcode: z.string().optional(),
    // The ingredient list as the box prints it, and where it was copied from.
    // Unset means nobody has found it yet: the page says "not listed" rather
    // than guessing. Set with `npm run ingredients`.
    ingredients: z.string().optional(),
    ingredientsSource: z.string().optional(),
    purchaseLocation: z.string().optional(),
    price: z.number().optional(),
    formFactors: z.array(z.enum(FORM_FACTORS)).default([]),
    proteinSources: z.array(z.enum(PROTEIN_SOURCES)).default([]),
    attributes: z.array(z.enum(ATTRIBUTES)).default([]),
    sweeteners: z.array(z.enum(SWEETENERS)).default([]),
    nutrition,
  }),
});

export const collections = { cereals };
