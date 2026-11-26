import type { Aisle, Allergen, Ingredient, Kind, Unit } from "../types";

/**
 * Curated ingredient catalogue.
 *
 * Prices are Day-1 baseline estimates (CAD, GTA mid-tier grocer, 2026) so the
 * grocery list works before anyone scans a receipt. Nutrition values are
 * approximate per 100 g / 100 ml (per piece for "pc") from public food
 * composition tables, rounded — good enough for badges, not for clinical use.
 */

type N = [kcal: number, protein: number, fiber: number, iron: number, folate: number, calcium: number, omega3: number];

interface Opts {
  allergens?: Allergen[];
  kind?: Kind;
  chili?: boolean;
  countable?: boolean;
}

function ing(
  key: string,
  name: string,
  unit: Unit,
  aisle: Aisle,
  pack: number,
  packLabel: string,
  price: number,
  shelf: number,
  n: N,
  o: Opts = {},
): Ingredient {
  return {
    key,
    name,
    unit,
    aisle,
    pack,
    packLabel,
    price,
    shelf,
    countable: o.countable,
    allergens: o.allergens ?? [],
    kind: o.kind,
    chili: o.chili,
    nutrition: { kcal: n[0], protein: n[1], fiber: n[2], iron: n[3], folate: n[4], calcium: n[5], omega3: n[6] },
  };
}

const SPICE_N: N = [300, 10, 25, 20, 30, 300, 0];
const spice = (key: string, name: string, o: Opts = {}) => ing(key, name, "g", "spices", 40, "40 g jar", 3.29, 365, SPICE_N, o);
const OIL_N: N = [884, 0, 0, 0, 0, 0, 0];

const list: Ingredient[] = [
  // Produce
  ing("tomato", "Tomatoes", "g", "produce", 125, "tomato", 0.55, 7, [18, 0.9, 1.2, 0.3, 15, 10, 0], { countable: true }),
  ing("redpepper", "Red bell peppers", "g", "produce", 200, "red pepper", 1.49, 9, [31, 1, 2.1, 0.4, 46, 7, 0], { countable: true }),
  ing("scotch", "Scotch bonnet peppers", "g", "produce", 10, "scotch bonnet", 0.35, 10, [40, 2, 1.5, 1, 23, 14, 0], { countable: true, chili: true }),
  ing("jalapeno", "Jalapeños", "g", "produce", 30, "jalapeño", 0.25, 10, [29, 0.9, 2.8, 0.3, 27, 12, 0], { countable: true, chili: true }),
  ing("greenchili", "Green chillies", "g", "produce", 50, "50 g pack", 1.29, 10, [40, 2, 1.5, 1, 23, 18, 0], { chili: true }),
  ing("onion", "Yellow onions", "g", "produce", 150, "onion", 0.45, 30, [40, 1.1, 1.7, 0.2, 19, 23, 0], { countable: true }),
  ing("redonion", "Red onions", "g", "produce", 150, "red onion", 0.6, 30, [40, 1.1, 1.7, 0.2, 19, 23, 0], { countable: true }),
  ing("garlic", "Garlic", "g", "produce", 50, "bulb", 0.79, 30, [149, 6.4, 2.1, 1.7, 3, 181, 0], { countable: true }),
  ing("ginger", "Fresh ginger", "g", "produce", 100, "knob", 0.99, 21, [80, 1.8, 2, 0.6, 11, 16, 0], { countable: true }),
  ing("spinach", "Spinach", "g", "produce", 300, "300 g bag", 3.99, 5, [23, 2.9, 2.2, 2.7, 194, 99, 0.1]),
  ing("kale", "Kale / callaloo greens", "g", "produce", 250, "bunch", 2.99, 6, [49, 4.3, 3.6, 1.5, 141, 150, 0.2]),
  ing("yam", "Puna yam", "g", "produce", 1500, "tuber (~1.5 kg)", 8.99, 21, [118, 1.5, 4.1, 0.5, 23, 17, 0]),
  ing("ugu", "Fluted pumpkin leaves (ugu)", "g", "produce", 250, "bunch", 3.49, 4, [32, 3.5, 2.5, 2.5, 90, 120, 0]),
  ing("plantain", "Ripe plantains", "g", "produce", 250, "plantain", 0.89, 6, [122, 1.3, 2.3, 0.6, 22, 3, 0], { countable: true }),
  ing("greenplantain", "Green plantains", "g", "produce", 250, "green plantain", 0.89, 8, [122, 1.3, 2.3, 0.6, 22, 3, 0], { countable: true }),
  ing("potato", "Potatoes", "g", "produce", 200, "potato", 0.4, 30, [77, 2, 2.2, 0.8, 15, 12, 0], { countable: true }),
  ing("sweetpotato", "Sweet potatoes", "g", "produce", 400, "sweet potato", 1.2, 21, [86, 1.6, 3, 0.6, 11, 30, 0], { countable: true }),
  ing("carrot", "Carrots", "g", "produce", 907, "2 lb bag", 2.49, 21, [41, 0.9, 2.8, 0.3, 19, 33, 0]),
  ing("zucchini", "Zucchini", "g", "produce", 250, "zucchini", 0.99, 7, [17, 1.2, 1, 0.4, 24, 16, 0], { countable: true }),
  ing("eggplant", "Eggplant", "g", "produce", 400, "eggplant", 1.99, 7, [25, 1, 3, 0.2, 22, 9, 0], { countable: true }),
  ing("greenbeans", "Green beans", "g", "produce", 454, "1 lb bag", 3.49, 6, [31, 1.8, 2.7, 1, 33, 37, 0]),
  ing("cabbage", "Green cabbage", "g", "produce", 1000, "head", 2.99, 21, [25, 1.3, 2.5, 0.5, 43, 40, 0]),
  ing("cucumber", "Cucumbers", "g", "produce", 300, "cucumber", 1.29, 7, [15, 0.7, 0.5, 0.3, 7, 16, 0], { countable: true }),
  ing("lettuce", "Lettuce", "g", "produce", 400, "head", 2.49, 6, [15, 1.4, 1.3, 0.9, 38, 36, 0]),
  ing("broccoli", "Broccoli", "g", "produce", 500, "crown", 2.99, 6, [34, 2.8, 2.6, 0.7, 63, 47, 0.1]),
  ing("bokchoy", "Bok choy", "g", "produce", 400, "bunch", 2.49, 5, [13, 1.5, 1, 0.8, 66, 105, 0]),
  ing("beansprouts", "Bean sprouts", "g", "produce", 300, "300 g bag", 1.99, 3, [30, 3, 1.8, 0.9, 61, 13, 0]),
  ing("scallion", "Green onions", "g", "produce", 100, "bunch", 1.29, 7, [32, 1.8, 2.6, 1.5, 64, 72, 0]),
  ing("cilantro", "Cilantro", "g", "produce", 60, "bunch", 1.29, 6, [23, 2.1, 2.8, 1.8, 62, 67, 0]),
  ing("parsley", "Flat-leaf parsley", "g", "produce", 60, "bunch", 1.29, 7, [36, 3, 3.3, 6.2, 152, 138, 0]),
  ing("dill", "Dill", "g", "produce", 30, "bunch", 1.99, 6, [43, 3.5, 2.1, 6.6, 150, 208, 0]),
  ing("mint", "Mint", "g", "produce", 30, "bunch", 2.49, 6, [70, 3.8, 8, 5, 114, 243, 0]),
  ing("basil", "Basil / scent leaf", "g", "produce", 30, "bunch", 2.49, 5, [23, 3.2, 1.6, 3.2, 68, 177, 0]),
  ing("lemongrass", "Lemongrass", "g", "produce", 40, "2 stalks", 1.99, 14, [99, 1.8, 0, 8, 75, 65, 0]),
  ing("lemon", "Lemons", "g", "produce", 100, "lemon", 0.79, 21, [29, 1.1, 2.8, 0.6, 11, 26, 0], { countable: true }),
  ing("lime", "Limes", "g", "produce", 70, "lime", 0.5, 21, [30, 0.7, 2.8, 0.6, 8, 33, 0], { countable: true }),
  ing("orange", "Oranges", "g", "produce", 200, "orange", 0.79, 21, [47, 0.9, 2.4, 0.1, 30, 40, 0], { countable: true }),
  ing("avocado", "Avocados", "g", "produce", 150, "avocado", 1.49, 4, [160, 2, 6.7, 0.6, 81, 12, 0.1], { countable: true }),
  ing("berries", "Mixed berries", "g", "produce", 340, "340 g clamshell", 4.99, 5, [50, 0.8, 3, 0.4, 20, 15, 0.1]),

  // Proteins
  ing("chicken", "Chicken thighs", "g", "protein", 1000, "1 kg pack", 11.99, 3, [177, 19, 0, 0.9, 7, 9, 0.1], { kind: "poultry" }),
  ing("beef", "Stewing beef", "g", "protein", 900, "900 g pack", 15.99, 3, [190, 20, 0, 2.6, 6, 12, 0], { kind: "beef" }),
  ing("beefmince", "Lean ground beef", "g", "protein", 454, "1 lb pack", 6.99, 2, [250, 17, 0, 2, 7, 18, 0], { kind: "beef" }),
  ing("sirloin", "Beef sirloin", "g", "protein", 700, "700 g pack", 17.99, 3, [180, 21, 0, 2, 10, 20, 0], { kind: "beef" }),
  ing("sausage", "Beef sausage (boerewors)", "g", "protein", 500, "500 g pack", 7.49, 3, [300, 14, 0, 1.2, 2, 20, 0], { kind: "beef", allergens: ["gluten"] }),
  ing("pork", "Pork shoulder", "g", "protein", 1000, "1 kg pack", 8.99, 3, [230, 17, 0, 1, 5, 15, 0], { kind: "pork" }),
  ing("salmon", "Salmon fillets", "g", "protein", 300, "300 g pack", 7.99, 2, [208, 20, 0, 0.3, 25, 9, 2.2], { kind: "fish", allergens: ["fish"] }),
  ing("whitefish", "White fish fillets", "g", "protein", 400, "400 g pack", 8.99, 2, [90, 19, 0, 0.4, 15, 15, 0.3], { kind: "fish", allergens: ["fish"] }),
  ing("saltfish", "Salted cod (saltfish)", "g", "protein", 250, "250 g pack", 7.99, 180, [290, 62, 0, 2.5, 25, 160, 0.4], { kind: "fish", allergens: ["fish"] }),
  ing("crayfish", "Ground dried crayfish", "g", "protein", 50, "50 g pack", 4.99, 180, [300, 60, 0, 7, 20, 1000, 0.3], { kind: "shellfish", allergens: ["shellfish"] }),
  ing("eggs", "Eggs", "pc", "dairy", 12, "dozen", 4.99, 28, [72, 6.3, 0, 0.9, 24, 28, 0.04], { kind: "egg", allergens: ["egg"] }),
  ing("tofu", "Firm tofu", "g", "protein", 350, "350 g block", 2.99, 14, [76, 8, 0.3, 5.4, 15, 350, 0.3], { allergens: ["soy"] }),
  ing("paneer", "Paneer", "g", "dairy", 400, "400 g block", 6.99, 14, [300, 18, 0, 0.2, 10, 480, 0], { kind: "dairy", allergens: ["dairy"] }),

  // Dairy & alternatives
  ing("milk", "Milk", "ml", "dairy", 2000, "2 L jug", 5.49, 10, [50, 3.4, 0, 0, 5, 120, 0], { kind: "dairy", allergens: ["dairy"] }),
  ing("plantmilk", "Oat or soy milk", "ml", "dairy", 1890, "1.89 L carton", 4.49, 10, [45, 1, 0.8, 0.3, 5, 120, 0]),
  ing("yogurt", "Plain yogurt", "g", "dairy", 750, "750 g tub", 4.99, 14, [60, 5, 0, 0.1, 7, 120, 0], { kind: "dairy", allergens: ["dairy"] }),
  ing("plantyogurt", "Coconut yogurt", "g", "dairy", 500, "500 g tub", 5.99, 14, [100, 1, 0.5, 0.2, 5, 100, 0]),
  ing("butter", "Butter", "g", "dairy", 454, "1 lb block", 5.99, 60, [717, 0.9, 0, 0, 3, 24, 0.3], { kind: "dairy", allergens: ["dairy"] }),
  ing("cheese", "Queso fresco / feta (pasteurized)", "g", "dairy", 200, "200 g pack", 4.99, 14, [300, 18, 0, 0.4, 20, 500, 0], { kind: "dairy", allergens: ["dairy"] }),

  // Bakery
  ing("bread", "Soft white loaf (agege-style)", "g", "bakery", 600, "loaf", 3.49, 5, [265, 9, 2.7, 3.6, 85, 140, 0], { allergens: ["gluten"] }),
  ing("flatbread", "Flatbread / roti / pita", "g", "bakery", 400, "pack of 6", 3.49, 5, [290, 9, 2.5, 2.5, 60, 60, 0], { allergens: ["gluten"] }),
  ing("tortilla", "Corn tortillas", "g", "bakery", 300, "pack of 10", 2.99, 14, [218, 5.7, 6.3, 1.2, 30, 80, 0]),

  // Grains & dry goods
  ing("rice", "Long-grain rice", "g", "grains", 2000, "2 kg bag", 5.99, 365, [360, 7, 1.3, 0.8, 8, 10, 0]),
  ing("parboiledrice", "Parboiled long-grain rice", "g", "grains", 2000, "2 kg bag", 6.49, 365, [367, 7.5, 1.7, 0.7, 6, 15, 0]),
  ing("honeybeans", "Honey beans (ewa oloyin)", "g", "grains", 900, "900 g bag", 5.99, 365, [336, 23, 11, 8, 600, 110, 0.1]),
  ing("pasta", "Short pasta", "g", "grains", 450, "450 g box", 2.49, 365, [371, 13, 3.2, 3.3, 18, 21, 0], { allergens: ["gluten"] }),
  ing("ricenoodles", "Rice vermicelli", "g", "grains", 400, "400 g pack", 2.99, 365, [360, 6, 1.6, 0.7, 3, 18, 0]),
  ing("couscous", "Couscous", "g", "grains", 500, "500 g box", 3.99, 365, [376, 13, 5, 1.1, 20, 24, 0], { allergens: ["gluten"] }),
  ing("oats", "Rolled oats", "g", "grains", 1000, "1 kg bag", 4.49, 365, [389, 16.9, 10.6, 4.7, 56, 54, 0.1]),
  ing("poha", "Poha (flattened rice)", "g", "grains", 500, "500 g bag", 3.49, 180, [346, 6.6, 1, 8, 10, 10, 0]),
  ing("masarepa", "Masarepa (pre-cooked corn flour)", "g", "grains", 1000, "1 kg bag", 4.99, 365, [360, 7, 7, 3, 25, 7, 0]),
  ing("cornmeal", "Fine cornmeal / maize flour", "g", "grains", 1000, "1 kg bag", 3.99, 365, [370, 8, 7, 3.5, 25, 6, 0]),
  ing("garri", "Garri", "g", "grains", 1000, "1 kg bag", 5.99, 365, [360, 1.5, 4, 1, 20, 30, 0]),
  ing("flour", "All-purpose flour", "g", "grains", 1000, "1 kg bag", 2.99, 365, [364, 10, 2.7, 1.2, 26, 15, 0], { allergens: ["gluten"] }),
  ing("lentils", "Red lentils", "g", "grains", 900, "900 g bag", 3.99, 365, [358, 24, 11, 7.4, 204, 48, 0.1]),
  ing("blackeyed", "Black-eyed peas (dried)", "g", "grains", 900, "900 g bag", 4.49, 365, [336, 24, 11, 8.3, 633, 110, 0.1]),
  ing("egusi", "Ground egusi (melon seed)", "g", "grains", 300, "300 g bag", 5.99, 120, [557, 28, 4, 4, 58, 50, 0.1]),
  ing("peanuts", "Roasted peanuts", "g", "grains", 400, "400 g bag", 3.99, 120, [567, 26, 8.5, 4.6, 240, 92, 0], { allergens: ["peanut"] }),
  ing("walnuts", "Walnuts", "g", "grains", 200, "200 g bag", 5.49, 120, [654, 15, 6.7, 2.9, 98, 98, 9], { allergens: ["treenut"] }),
  ing("chia", "Chia seeds", "g", "grains", 300, "300 g bag", 5.99, 365, [486, 17, 34, 7.7, 49, 631, 17.8]),
  ing("sesameseeds", "Sesame seeds", "g", "grains", 100, "100 g bag", 2.49, 180, [573, 18, 12, 14.6, 97, 975, 0.4], { allergens: ["sesame"] }),
  ing("desiccated", "Desiccated coconut", "g", "grains", 200, "200 g bag", 2.99, 180, [660, 6.9, 16, 3.3, 9, 26, 0]),
  ing("apricot", "Dried apricots", "g", "grains", 200, "200 g bag", 4.99, 180, [241, 3.4, 7.3, 2.7, 10, 55, 0]),
  ing("sugar", "Sugar", "g", "grains", 2000, "2 kg bag", 2.99, 730, [387, 0, 0, 0, 0, 1, 0]),

  // Canned & jarred
  ing("chickpeas", "Chickpeas (canned)", "g", "canned", 400, "398 ml can", 1.49, 365, [139, 7, 6, 1.3, 50, 40, 0]),
  ing("kidneybeans", "Red kidney beans (canned)", "g", "canned", 400, "398 ml can", 1.49, 365, [127, 8.7, 6.4, 2.9, 130, 35, 0.1]),
  ing("blackbeans", "Black beans (canned)", "g", "canned", 400, "398 ml can", 1.49, 365, [132, 8.9, 8.7, 2.1, 149, 27, 0.1]),
  ing("bakedbeans", "Baked beans", "g", "canned", 398, "398 ml can", 1.79, 365, [94, 4.8, 4, 1.3, 25, 40, 0]),
  ing("ackee", "Ackee (canned)", "g", "canned", 540, "540 ml can", 8.99, 365, [151, 2.9, 2.7, 0.7, 30, 35, 0]),
  ing("coconutmilk", "Coconut milk", "ml", "canned", 400, "400 ml can", 2.19, 365, [197, 2, 0, 1.6, 14, 18, 0]),
  ing("tomatopaste", "Tomato paste", "g", "canned", 156, "156 ml can", 1.19, 365, [82, 4.3, 4.1, 3, 12, 36, 0]),
  ing("passata", "Crushed tomatoes / passata", "ml", "canned", 680, "680 ml jar", 2.49, 365, [32, 1.6, 1.5, 1, 10, 20, 0]),
  ing("chipotle", "Chipotles in adobo", "g", "canned", 200, "200 ml can", 2.49, 365, [60, 1.5, 4, 1, 10, 30, 0], { chili: true }),
  ing("stock", "Vegetable stock", "ml", "canned", 900, "900 ml carton", 2.49, 365, [5, 0.3, 0, 0, 0, 2, 0]),

  // Sauces & condiments
  ing("soysauce", "Soy sauce", "ml", "condiments", 500, "500 ml bottle", 3.49, 365, [53, 8, 0.8, 1.5, 18, 33, 0], { allergens: ["soy", "gluten"] }),
  ing("fishsauce", "Fish sauce", "ml", "condiments", 300, "300 ml bottle", 3.49, 365, [35, 5, 0, 0.8, 51, 43, 0], { kind: "fish", allergens: ["fish"] }),
  ing("vinegar", "White vinegar", "ml", "condiments", 1000, "1 L bottle", 2.49, 730, [18, 0, 0, 0, 0, 6, 0]),
  ing("mustard", "Dijon mustard", "g", "condiments", 250, "250 ml jar", 2.49, 365, [66, 4, 3, 1.6, 7, 58, 0], { allergens: ["mustard"] }),
  ing("honey", "Honey", "g", "condiments", 500, "500 g jar", 6.99, 730, [304, 0.3, 0, 0.4, 2, 6, 0], { kind: "honey" }),
  ing("maple", "Maple syrup", "ml", "condiments", 250, "250 ml bottle", 6.99, 365, [260, 0, 0, 0.1, 0, 102, 0]),
  ing("miso", "White miso", "g", "condiments", 400, "400 g tub", 5.99, 180, [199, 12, 5, 2.5, 19, 57, 0], { allergens: ["soy"] }),
  ing("mirin", "Mirin", "ml", "condiments", 300, "300 ml bottle", 4.99, 365, [240, 0.3, 0, 0, 0, 3, 0], { kind: "alcohol" }),
  ing("gochujang", "Gochujang", "g", "condiments", 500, "500 g tub", 5.99, 365, [200, 5, 3, 2, 10, 30, 0], { allergens: ["soy", "gluten"], chili: true }),
  ing("greencurrypaste", "Thai green curry paste", "g", "condiments", 115, "115 g jar", 3.49, 365, [100, 2, 3, 2, 10, 50, 0], { allergens: ["shellfish"], kind: "shellfish", chili: true }),
  ing("kecapmanis", "Kecap manis (sweet soy)", "ml", "condiments", 300, "300 ml bottle", 3.99, 365, [280, 3, 0, 1, 5, 20, 0], { allergens: ["soy", "gluten"] }),
  ing("jerkpaste", "Jerk seasoning paste", "g", "condiments", 280, "280 g jar", 5.99, 365, [120, 2, 3, 2, 10, 40, 0], { chili: true }),

  // Oils
  ing("oil", "Vegetable oil", "ml", "oils", 1000, "1 L bottle", 4.99, 365, OIL_N),
  ing("oliveoil", "Olive oil", "ml", "oils", 500, "500 ml bottle", 7.99, 365, [884, 0, 0, 0.6, 0, 1, 0.8]),
  ing("palmoil", "Red palm oil", "ml", "oils", 500, "500 ml bottle", 6.99, 365, OIL_N),
  ing("sesameoil", "Toasted sesame oil", "ml", "oils", 200, "200 ml bottle", 3.99, 365, [884, 0, 0, 0, 0, 0, 0.3], { allergens: ["sesame"] }),

  // Spices & dried herbs
  spice("curry", "Curry powder (Caribbean/West African style)"),
  spice("thyme", "Dried thyme"),
  spice("bay", "Bay leaves"),
  spice("allspice", "Ground allspice (pimento)"),
  spice("cumin", "Cumin"),
  spice("paprika", "Smoked paprika"),
  spice("oregano", "Dried oregano"),
  spice("turmeric", "Turmeric"),
  spice("garammasala", "Garam masala"),
  spice("berbere", "Berbere", { chili: true }),
  spice("rasel", "Ras el hanout"),
  spice("baharat", "Baharat"),
  spice("peppersoup", "Pepper soup spice", { chili: true }),
  spice("mustardseed", "Black mustard seeds", { allergens: ["mustard"] }),
  spice("cinnamon", "Ground cinnamon"),
  spice("nutmeg", "Ground nutmeg"),
  spice("cardamom", "Ground cardamom"),
  spice("chilipowder", "Chilli powder / cayenne", { chili: true }),
  spice("rosemary", "Dried rosemary"),
  spice("blackpepper", "Whole black peppercorns"),
  ing("zaatar", "Za'atar", "g", "spices", 100, "100 g bag", 3.99, 365, [300, 10, 30, 40, 30, 1000, 0], { allergens: ["sesame"] }),
];

export const INGREDIENTS: Record<string, Ingredient> = Object.fromEntries(list.map((i) => [i.key, i]));

/**
 * Per-member portion swaps for vegetarian/vegan/pescatarian members.
 * [replacement key | null (leave out), quantity ratio].
 * Allergies are never "swapped" — they exclude the recipe outright.
 */
export const DIET_SWAPS: Record<string, [string | null, number]> = {
  chicken: ["chickpeas", 0.6],
  beef: ["kidneybeans", 0.7],
  beefmince: ["lentils", 0.35],
  sirloin: ["tofu", 0.7],
  sausage: ["tofu", 0.7],
  pork: ["tofu", 0.7],
  salmon: ["tofu", 0.8],
  whitefish: ["tofu", 0.8],
  saltfish: ["chickpeas", 1.2],
  crayfish: [null, 0],
  fishsauce: ["soysauce", 1],
  eggs: ["tofu", 60], // per egg
  milk: ["plantmilk", 1],
  yogurt: ["plantyogurt", 1],
  butter: ["oil", 0.8],
  cheese: [null, 0],
  paneer: ["tofu", 1],
  honey: ["maple", 1],
};

/** Aisle order and labels used on the shopping list. */
export const AISLES: { key: Aisle; label: string; cupboard?: boolean }[] = [
  { key: "produce", label: "Fruit & vegetables" },
  { key: "protein", label: "Meat, fish & tofu" },
  { key: "dairy", label: "Dairy & eggs" },
  { key: "bakery", label: "Bakery" },
  { key: "grains", label: "Grains, beans & nuts" },
  { key: "canned", label: "Cans & jars" },
  { key: "condiments", label: "Sauces & condiments" },
  { key: "oils", label: "Oils", cupboard: true },
  { key: "spices", label: "Spices & dried herbs", cupboard: true },
];

export const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: "Gluten / wheat",
  dairy: "Dairy",
  egg: "Egg",
  peanut: "Peanut",
  treenut: "Tree nuts",
  fish: "Fish",
  shellfish: "Shellfish / crustacean",
  soy: "Soy",
  sesame: "Sesame",
  mustard: "Mustard",
};

/**
 * Minimum safe internal temperatures (Health Canada). Applied deterministically
 * to cooking steps — never left to a model.
 */
export const SAFE_TEMPS: Partial<Record<string, string>> = {
  chicken: "Chicken: 74 °C / 165 °F at the thickest part",
  beef: "Beef stew pieces: simmer until fork-tender (well above 71 °C / 160 °F)",
  beefmince: "Ground beef: 71 °C / 160 °F, no pink left",
  sirloin: "Beef steak strips: at least 63 °C / 145 °F (71 °C for pregnant members)",
  sausage: "Sausage: 71 °C / 160 °F",
  pork: "Pork: 71 °C / 160 °F",
  salmon: "Fish: 70 °C / 158 °F, flakes easily",
  whitefish: "Fish: 70 °C / 158 °F, flakes easily",
  eggs: "Egg dishes: cook until whites (and for pregnant members, yolks) are firm",
};
