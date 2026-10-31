// Central business-category configuration. The backend's /api/categories is the
// source of truth when reachable; this list is the offline fallback for the picker.
export type CategoryGroup = {
  id: string;
  label: string;
  categories: { id: string; label: string }[];
};

const c = (group: string, labels: string[]) =>
  labels.map((label) => ({
    id: `${group}.${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
    label,
  }));

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    id: "food",
    label: "Food and beverage",
    categories: c("food", [
      "Café", "Bakery", "Restaurant", "Quick-service restaurant", "Takeaway", "Cloud kitchen",
      "Juice bar", "Tea and coffee shop", "Sweet shop", "Ice-cream shop",
    ]),
  },
  {
    id: "retail",
    label: "Retail",
    categories: c("retail", [
      "Clothing", "Footwear", "Grocery", "Supermarket", "Convenience store", "Pharmacy",
      "Electronics", "Mobile shop", "Cosmetics", "Furnishing", "Specialist retail",
    ]),
  },
  {
    id: "health",
    label: "Health and personal care",
    categories: c("health", [
      "Gym", "Yoga studio", "Salon", "Spa", "Wellness centre", "Physiotherapy centre", "Diagnostics",
    ]),
  },
  {
    id: "education",
    label: "Education",
    categories: c("education", [
      "Coaching", "Tuition", "Preschool", "Daycare", "Training institute", "Skill centre",
      "Music or dance academy",
    ]),
  },
  {
    id: "professional",
    label: "Professional services",
    categories: c("professional", [
      "Coworking space", "Consulting office", "Marketing agency", "Accounting", "Real estate",
      "Travel office",
    ]),
  },
  {
    id: "neighbourhood",
    label: "Neighbourhood services",
    categories: c("neighbourhood", [
      "Pet care", "Laundry", "Repair shop", "Automobile service", "Event services",
    ]),
  },
  { id: "custom", label: "Custom", categories: [{ id: "custom", label: "Custom business type" }] },
];

export const ALL_CATEGORIES = CATEGORY_GROUPS.flatMap((g) => g.categories);

export function categoryLabel(id: string) {
  return ALL_CATEGORIES.find((x) => x.id === id)?.label ?? id;
}

export const DEFAULT_WEIGHTS = [
  { key: "competition", label: "Competition preference score", weight: 30 },
  { key: "amenities", label: "Useful places nearby", weight: 25 },
  { key: "accessibility", label: "Public transport nearby", weight: 25 },
  { key: "demographics", label: "Local population profile", weight: 20 },
] as const;

export const RADIUS_OPTIONS = [250, 500, 1000, 1500, 2000] as const;
export const DEFAULT_RADIUS = 500;

export const SCORE_LIMITATION =
  "This score is a screening aid based on available data. It does not guarantee commercial success and may not reflect actual footfall, rent, purchasing power or customer demand.";
