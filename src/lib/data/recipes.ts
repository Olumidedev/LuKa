import type { MealType, Recipe } from "../types";
import { HERITAGE, LIBRARY_ARCHETYPES } from "./heritage";

/**
 * Curated, human-written library. Every recipe is written for 4 adult portions;
 * the engine scales it to the household. Step syntax:
 *   {key}        full scaled quantity of an ingredient, bolded in Cook Mode
 *   {key*0.5}    a fraction of it
 *   [t12]        a 12-minute timer button
 */
function r(
  id: string,
  name: string,
  countries: string | string[],
  meals: string,
  activeMin: number,
  totalMin: number,
  spice: 0 | 1 | 2 | 3,
  batch: boolean,
  ing: string,
  steps: string[],
): Recipe {
  return {
    id,
    name,
    countries: Array.isArray(countries) ? countries : [countries],
    meals: meals.split("") as MealType[],
    activeMin,
    totalMin,
    spice,
    batch,
    ingredients: ing
      .trim()
      .split(/\s+/)
      .map((p) => {
        const [key, qty] = p.split(":");
        return { key, qty: Number(qty) };
      }),
    steps,
    source: { type: "library" },
  };
}

const BASE_LIBRARY: Recipe[] = [
  // ───────────── West Africa
  r("ng_jollof", "Party Jollof Rice with Roast Chicken", "Nigeria", "ld", 30, 75, 2, true,
    "chicken:1000 rice:500 tomato:500 redpepper:200 scotch:10 onion:300 tomatopaste:70 oil:80 stock:700 curry:5 thyme:3 bay:2", [
      "Season {chicken} with {curry*0.5}, {thyme*0.5} and salt. Roast at 220 °C until golden and cooked through [t35].",
      "Blend {tomato}, {redpepper}, {scotch} and {onion*0.5} until smooth.",
      "Slice the remaining {onion*0.5}. Heat {oil} in a heavy pot, fry the onion 3 minutes, then add {tomatopaste} and fry until it darkens to brick red [t5].",
      "Pour in the blend with the rest of the curry and thyme and {bay}. Cook uncovered, stirring often, until reduced by half and the oil rises to the top [t20].",
      "Rinse {rice} until the water runs clear. Stir it into the base with {stock}. Cover with foil and a lid and cook on the lowest heat [t30]. Shake the pot instead of stirring.",
      "Done when the grains are tender but separate. Let a light crust form at the bottom for smoky party flavour, then serve with the chicken.",
    ]),
  r("ng_efo", "Efo Riro with Boiled Yam", "Nigeria", "d", 30, 50, 2, true,
    "spinach:600 beef:600 redpepper:200 scotch:10 onion:200 palmoil:60 crayfish:15 stock:300 yam:1000", [
      "Cut {beef} into chunks, season with salt and half the onion, and simmer in {stock} until tender [t30]. Keep the broth.",
      "Peel {yam}, cut into thick rounds and boil in salted water until a knife slides in easily [t20].",
      "Blend {redpepper} and {scotch} coarsely. Wash and roughly chop {spinach}, then squeeze out the water.",
      "Warm {palmoil} gently (don't let it smoke). Fry the remaining {onion*0.5}, add the pepper blend and fry until thick [t10].",
      "Add the beef, a splash of broth and {crayfish}. Fold in the spinach and cook just until wilted and bright green [t3]. Serve with the yam.",
    ]),
  r("ng_moimoi", "Moi Moi (Steamed Bean Pudding)", "Nigeria", "bl", 25, 80, 1, false,
    "blackeyed:400 redpepper:150 onion:100 oil:60 eggs:3 crayfish:10 stock:250", [
      "Soak {blackeyed} for 15 minutes, then rub between your palms to slip off the skins; rinse until mostly skinless [t15].",
      "Hard-boil {eggs} [t10], cool and halve.",
      "Blend the beans with {redpepper}, {onion} and {stock} into a smooth, thick batter.",
      "Stir in {oil}, {crayfish} and salt. Divide into greased ramekins or foil packets and tuck half an egg into each.",
      "Steam over simmering water, topping up as needed [t45]. Set when a knife comes out clean.",
    ]),
  r("ng_akara", "Akara with Agege Bread", "Nigeria", "b", 25, 40, 1, false,
    "blackeyed:300 onion:80 scotch:5 oil:400 bread:400", [
      "Soak {blackeyed} 15 minutes and rub off the skins [t15].",
      "Blend with {onion} and {scotch} using as little water as possible. Whisk the batter for 3 minutes until fluffy — this is what makes akara light.",
      "Heat {oil} to 175 °C. Drop in spoonfuls of batter and fry, turning, until deep golden [t6].",
      "Drain on paper and serve hot, tucked into {bread}.",
    ]),
  r("ng_yamegg", "Yam & Egg Sauce", "Nigeria", "b", 20, 30, 2, false,
    "yam:800 eggs:6 tomato:300 onion:100 scotch:5 oil:40", [
      "Peel and cube {yam}; boil in salted water until fork-tender [t15].",
      "Meanwhile dice {tomato}, {onion} and {scotch}. Fry the onion in {oil} for 2 minutes, add tomato and scotch and cook down [t6].",
      "Pour in beaten {eggs} and stir gently until fully set, with no runny parts. Serve over the yam.",
    ]),
  r("ng_peppersoup", "Chicken Pepper Soup", "Nigeria", "ld", 15, 50, 3, true,
    "chicken:1000 peppersoup:15 scotch:10 onion:150 basil:20 stock:1500 potato:600", [
      "Cut {chicken} into pieces. Put in a pot with chopped {onion}, {peppersoup}, salt and {stock}.",
      "Bring to a boil, then simmer [t25].",
      "Add cubed {potato} and pounded {scotch}; simmer until the potatoes are tender and the chicken is cooked through [t15].",
      "Tear in {basil} (stands in for scent leaf) and serve steaming.",
    ]),
  r("ng_egusi", "Egusi Soup with Eba", "Nigeria", "d", 35, 60, 2, true,
    "egusi:250 spinach:400 beef:600 palmoil:80 onion:150 scotch:10 crayfish:20 stock:800 garri:400", [
      "Simmer {beef} in {stock} with half the onion and salt until tender [t30].",
      "Blend the remaining {onion*0.5} and mix with {egusi} and a little water into a thick paste.",
      "Warm {palmoil}, add the egusi paste in spoonfuls and fry undisturbed for 5 minutes, then stir and fry until curdled and nutty [t10].",
      "Add the beef and broth, {scotch} and {crayfish}. Simmer [t10]. Fold in chopped {spinach} and cook 3 minutes.",
      "Eba: pour {garri} into about 2½ times its volume of just-boiled water, rest 2 minutes, then stir hard into a smooth, firm dough.",
    ]),
  r("gh_redred", "Red Red with Fried Plantain", "Ghana", "ld", 25, 60, 1, true,
    "blackeyed:500 plantain:1000 tomato:400 onion:200 palmoil:60 ginger:20 scotch:5 oil:100", [
      "Simmer {blackeyed} in plenty of water until soft but holding shape [t40]. Drain.",
      "Fry chopped {onion} in {palmoil}, add grated {ginger}, chopped {tomato} and {scotch}; cook to a thick sauce [t10].",
      "Stir in the beans and simmer 5 minutes until everything turns red red.",
      "Slice ripe {plantain} on the diagonal and fry in {oil} until caramelised on both sides [t6].",
    ]),
  r("sn_yassa", "Poulet Yassa", "Senegal", "d", 25, 90, 1, true,
    "chicken:1000 onion:900 lemon:400 mustard:30 garlic:20 oil:60 rice:400 scotch:5", [
      "Marinate {chicken} with the juice of {lemon}, {mustard}, minced {garlic}, half the oil and sliced {onion} for at least 30 minutes [t30].",
      "Lift out the chicken and sear in the remaining {oil*0.5} until browned. Set aside.",
      "Cook the onions from the marinade slowly until soft and golden [t20], then return the chicken with the marinade and a whole {scotch}.",
      "Cover and simmer until the chicken is cooked through [t25]. Meanwhile cook {rice}.",
    ]),

  // ───────────── Central / East / Southern Africa
  r("cm_pouletdg", "Poulet DG", "Cameroon", "d", 30, 60, 1, false,
    "chicken:1000 plantain:1000 carrot:200 greenbeans:200 redpepper:200 onion:200 garlic:10 ginger:15 tomato:200 oil:120", [
      "Season {chicken} with {garlic}, {ginger} and salt; brown in half the {oil} [t10].",
      "Fry sliced ripe {plantain} in the rest of the oil until golden; set aside.",
      "Add {onion}, {tomato}, sliced {carrot}, {greenbeans} and {redpepper} to the chicken with 200 ml water; simmer until the chicken is cooked through [t20].",
      "Fold in the plantains and warm through.",
    ]),
  r("et_misir", "Misir Wot with Injera", "Ethiopia", "ld", 20, 50, 2, true,
    "lentils:400 onion:400 berbere:25 garlic:15 ginger:15 tomatopaste:30 oil:60 flatbread:400", [
      "Cook finely chopped {onion} in a dry pot, stirring, until soft and jammy [t10], then add {oil}.",
      "Add {berbere}, {garlic}, {ginger} and {tomatopaste}; cook 3 minutes.",
      "Add {lentils} and 1 L water; simmer, stirring, until thick and soft [t25].",
      "Serve with injera, or {flatbread} if injera isn't available.",
    ]),
  r("ke_sukuma", "Sukuma Wiki & Ugali with Beef", "Kenya", "d", 25, 35, 1, false,
    "kale:600 onion:150 tomato:300 beefmince:400 cornmeal:500 oil:30", [
      "Brown {beefmince} in {oil} until no pink remains [t6].",
      "Add {onion} and {tomato}; cook down [t5]. Add finely sliced {kale} and cook just until tender [t5].",
      "Ugali: bring 1.2 L water to a boil, gradually add {cornmeal} and stir hard with a wooden spoon until thick and pulling from the sides [t10].",
    ]),
  r("za_chakalaka", "Chakalaka & Pap with Boerewors", "South Africa", "d", 25, 40, 2, false,
    "sausage:600 onion:150 redpepper:200 carrot:300 bakedbeans:400 curry:10 garlic:10 cornmeal:400 oil:30 scotch:5", [
      "Grill or pan-fry {sausage} until browned and cooked through [t15].",
      "Chakalaka: fry {onion}, {redpepper}, {garlic}, {scotch} and {curry} in {oil}; add grated {carrot} [t8], then {bakedbeans}; simmer 5 minutes.",
      "Pap: whisk {cornmeal} into 1.2 L boiling water, cover and cook on low, stirring now and then [t20].",
    ]),

  // ───────────── Caribbean
  r("jm_ackee", "Ackee & Saltfish with Fried Plantain", "Jamaica", "bl", 25, 40, 1, false,
    "ackee:540 saltfish:250 onion:150 redpepper:150 tomato:200 scotch:5 thyme:2 oil:40 plantain:500", [
      "Soak {saltfish} overnight, or boil it in fresh water twice for 10 minutes each to remove the salt [t20]. Flake, discarding bones.",
      "Fry sliced {onion}, {redpepper} and {scotch} in half the {oil} with {thyme} until soft [t5].",
      "Add the saltfish and chopped {tomato}; cook 3 minutes.",
      "Drain {ackee} and fold in very gently so it stays in pieces. Heat through [t3].",
      "Fry sliced {plantain} in the remaining oil until golden.",
    ]),
  r("jm_curry", "Curry Chicken with Rice", "Jamaica", "d", 25, 70, 2, true,
    "chicken:1200 curry:30 potato:500 onion:200 garlic:15 thyme:3 scotch:5 allspice:3 oil:40 rice:400", [
      "Rub {chicken} with half the {curry}, minced {garlic}, {thyme}, {allspice} and salt. Rest 20 minutes, or overnight [t20].",
      "Toast the remaining curry in hot {oil} for 1 minute until fragrant, then brown the chicken.",
      "Add sliced {onion}, a whole {scotch} and 500 ml water. Cover and simmer [t30].",
      "Add cubed {potato} and simmer uncovered until the sauce thickens and the chicken is cooked through [t15]. Serve with {rice}.",
    ]),
  r("jm_jerk", "Jerk Chicken with Rice & Peas", "Jamaica", "d", 25, 75, 3, true,
    "chicken:1000 jerkpaste:80 rice:500 kidneybeans:400 coconutmilk:400 scallion:60 thyme:3 allspice:3 scotch:5", [
      "Rub {chicken} with {jerkpaste}; marinate at least 30 minutes (overnight is best) [t30].",
      "Roast at 220 °C until charred at the edges and cooked through [t35].",
      "Rice and peas: bring {coconutmilk}, the liquid from {kidneybeans} topped up with water to 1 L, {thyme}, {allspice}, crushed {scallion} and a whole {scotch} to a simmer.",
      "Add rinsed {rice} and the beans, cover and cook on low until fluffy [t25]. Remove the scotch bonnet before serving.",
    ]),
  r("jm_porridge", "Cornmeal Porridge", "Jamaica", "b", 10, 20, 0, false,
    "cornmeal:200 coconutmilk:400 milk:600 nutmeg:2 cinnamon:2 sugar:60", [
      "Whisk {cornmeal} into 500 ml cold water until no lumps remain.",
      "Bring {milk} and {coconutmilk} to a simmer, then whisk in the cornmeal mixture.",
      "Cook on low, stirring often, until thick and smooth [t12].",
      "Sweeten with {sugar} and finish with {nutmeg} and {cinnamon}.",
    ]),
  r("jm_callaloo", "Steamed Callaloo with Fried Dumplings", "Jamaica", "b", 25, 35, 1, false,
    "kale:400 onion:100 tomato:150 scotch:5 butter:30 flour:300 oil:150 garlic:10", [
      "Mix {flour} with a pinch of salt and about 150 ml water into a firm dough. Shape into small flat rounds.",
      "Fry the dumplings in {oil} over medium heat until golden and hollow-sounding [t10].",
      "Strip and slice {kale} (stands in for callaloo). Melt {butter}, soften {onion}, {garlic} and {scotch}, then add {tomato}.",
      "Add the greens with a splash of water, cover and steam until tender [t8].",
    ]),
  r("tt_chana", "Curry Chana & Aloo with Roti", "Trinidad and Tobago", "ld", 20, 40, 2, true,
    "chickpeas:800 potato:500 onion:150 garlic:15 curry:20 cumin:5 oil:40 flatbread:400 cilantro:20 scotch:5", [
      "Mix {curry} and {cumin} with a little water into a paste. Fry in {oil} until it darkens [t2].",
      "Add chopped {onion} and {garlic}, then cubed {potato}, drained {chickpeas}, {scotch} and 500 ml water.",
      "Simmer until the potatoes break down and thicken the sauce [t20]. Mash a few chickpeas against the pot.",
      "Stir in {cilantro} (stands in for shado beni) and serve with warm {flatbread}.",
    ]),
  r("ht_griot", "Griot with Pikliz", "Haiti", "d", 25, 100, 2, true,
    "pork:1000 orange:300 lime:140 onion:150 garlic:20 scotch:10 thyme:3 cabbage:300 carrot:150 vinegar:250 oil:60 rice:400", [
      "Pikliz: shred {cabbage} and {carrot}, slice {scotch*0.5}, pack into a jar and cover with {vinegar} and a pinch of salt. Chill.",
      "Cube {pork} and marinate with the juice of {orange} and {lime}, {garlic}, {onion}, {thyme} and the remaining scotch [t30].",
      "Simmer the pork in its marinade plus water to cover until tender [t50]. Drain.",
      "Fry the pork in {oil} until crisp at the edges [t10]. Serve with {rice} and pikliz.",
    ]),
  r("do_mangu", "Mangú with Eggs & Pickled Onions", "Dominican Republic", "b", 20, 35, 0, false,
    "greenplantain:1000 redonion:200 vinegar:40 eggs:4 butter:40 oil:20", [
      "Slice {redonion} thinly and soak in {vinegar} with a pinch of salt.",
      "Peel {greenplantain}, cut into chunks and boil until very soft [t20].",
      "Mash with {butter} and a splash of the cooking water until smooth.",
      "Fry {eggs} in {oil} until the whites are fully set. Top the mangú with eggs and pickled onions.",
    ]),
  r("cu_moros", "Moros y Cristianos", "Cuba", "ld", 20, 45, 0, true,
    "blackbeans:800 rice:400 onion:150 redpepper:150 garlic:15 cumin:4 oregano:2 bay:2 oliveoil:40 stock:600", [
      "Sofrito: cook chopped {onion}, {redpepper} and {garlic} in {oliveoil} until soft [t8].",
      "Add {cumin}, {oregano} and {bay}, then {rice}; stir 1 minute to toast.",
      "Add {blackbeans} with their liquid and {stock}. Cover and simmer on low [t20].",
      "Rest 5 minutes off the heat, then fluff.",
    ]),

  // ───────────── Latin America
  r("mx_rancheros", "Huevos Rancheros", "Mexico", "b", 20, 25, 2, false,
    "eggs:8 tortilla:300 tomato:400 onion:100 jalapeno:30 blackbeans:400 avocado:300 cilantro:20 cheese:100 oil:30", [
      "Char {tomato}, {onion} and {jalapeno} in a dry pan [t6], then blend into a salsa and simmer 5 minutes.",
      "Warm {blackbeans} and mash lightly.",
      "Warm {tortilla} in a dry pan. Fry {eggs} in {oil} until the whites are set.",
      "Layer tortillas, beans, egg and salsa. Top with sliced {avocado}, crumbled {cheese} and {cilantro}.",
    ]),
  r("mx_tinga", "Chicken Tinga Tacos", "Mexico", "ld", 25, 45, 2, true,
    "chicken:800 chipotle:40 tomato:400 onion:200 garlic:10 tortilla:400 cabbage:200 lime:140 avocado:150 oil:20", [
      "Poach {chicken} in salted water until cooked through [t20]. Shred.",
      "Blend {tomato}, {chipotle} and {garlic}. Soften sliced {onion} in {oil}, add the sauce and simmer [t8].",
      "Fold in the chicken and simmer until saucy.",
      "Serve in warm {tortilla} with shredded {cabbage}, {avocado} and wedges of {lime}.",
    ]),
  r("pe_lomo", "Lomo Saltado", "Peru", "d", 30, 40, 1, false,
    "sirloin:700 redonion:300 tomato:300 soysauce:45 vinegar:15 jalapeno:20 potato:700 rice:400 cilantro:20 oil:100", [
      "Cook {rice}. Cut {potato} into fries and oven-bake at 220 °C until crisp [t30].",
      "Slice {sirloin} into strips. Sear in very hot {oil*0.3} in batches until browned [t3]. Remove.",
      "Stir-fry wedges of {redonion} and {jalapeno} for 1 minute, add {tomato} wedges, {soysauce} and {vinegar}.",
      "Return the beef, toss with the fries and {cilantro}. Serve with rice.",
    ]),
  r("br_moqueca", "Moqueca Baiana", "Brazil", "d", 25, 40, 1, false,
    "whitefish:800 coconutmilk:400 tomato:300 onion:200 redpepper:200 lime:140 garlic:10 palmoil:30 cilantro:20 rice:400", [
      "Marinate {whitefish} with the juice of {lime}, {garlic} and salt [t15].",
      "Layer sliced {onion}, {redpepper} and {tomato} in a wide pot and lay the fish on top.",
      "Pour over {coconutmilk} and {palmoil}. Cover and simmer gently until the fish flakes [t15].",
      "Scatter with {cilantro}. Serve with {rice}.",
    ]),
  r("co_arepas", "Arepas with Huevos Pericos", "Colombia", "b", 25, 35, 0, false,
    "masarepa:300 eggs:8 tomato:200 scallion:60 butter:30 cheese:100", [
      "Mix {masarepa} with 400 ml warm water and salt into a soft dough. Rest [t5].",
      "Shape 8 patties and cook in a dry pan until crusty on both sides [t12].",
      "Melt {butter}, cook chopped {scallion} and {tomato} for 3 minutes.",
      "Add beaten {eggs} and scramble until fully set. Split the arepas and fill with eggs and {cheese}.",
    ]),

  // ───────────── North Africa & Middle East
  r("ma_tagine", "Chickpea & Vegetable Tagine with Couscous", "Morocco", "ld", 25, 55, 1, true,
    "chickpeas:800 carrot:300 zucchini:300 sweetpotato:500 onion:200 garlic:15 passata:400 rasel:15 apricot:100 couscous:400 cilantro:20 oliveoil:40", [
      "Soften chopped {onion} and {garlic} in {oliveoil} [t5]. Add {rasel} and cook 1 minute.",
      "Add chunks of {carrot} and {sweetpotato}, {passata} and 400 ml water. Simmer [t15].",
      "Add {zucchini}, drained {chickpeas} and {apricot}. Simmer until all the vegetables are tender [t15].",
      "Pour 1¼ times its volume of boiling water over {couscous}, cover 5 minutes, then fluff. Serve with {cilantro}.",
    ]),
  r("tn_shakshuka", "Shakshuka", "Tunisia", "bl", 15, 30, 2, false,
    "eggs:8 passata:700 redpepper:300 onion:150 garlic:10 cumin:4 paprika:4 bread:400 parsley:20 oliveoil:30", [
      "Soften sliced {onion} and {redpepper} in {oliveoil} [t8]. Add {garlic}, {cumin} and {paprika}.",
      "Pour in {passata} and simmer until thick [t10].",
      "Make 8 wells and crack in {eggs}. Cover and cook until the whites are fully set [t7].",
      "Scatter with {parsley} and serve with {bread}.",
    ]),
  r("eg_koshari", "Koshari", "Egypt", "ld", 30, 50, 1, true,
    "lentils:250 rice:300 pasta:250 chickpeas:400 onion:400 passata:500 garlic:15 vinegar:30 cumin:4 chilipowder:2 oil:80", [
      "Slice {onion} thinly and fry in {oil} until deep brown and crisp [t15]. Keep the oil.",
      "Boil {lentils} until just tender [t15]; cook {pasta} separately.",
      "Cook {rice} with the lentils and a spoon of the onion oil, covered on low [t18].",
      "Simmer {passata} with {garlic}, {cumin}, {chilipowder} and {vinegar} [t10].",
      "Layer rice and lentils, pasta and {chickpeas}; spoon over the sauce and top with the crispy onions.",
    ]),
  r("lb_mujaddara", "Mujaddara with Cucumber Yogurt", "Lebanon", "ld", 20, 45, 0, true,
    "lentils:300 rice:250 onion:600 oliveoil:80 cumin:4 cucumber:300 tomato:300 yogurt:300 mint:10", [
      "Slice {onion} and cook slowly in {oliveoil} until dark golden [t20]. Remove half for the topping.",
      "Add {lentils}, {cumin} and 1 L water to the pot; simmer [t10].",
      "Stir in {rice}, cover and cook on low until tender [t20].",
      "Mix grated {cucumber*0.5} with {yogurt} and {mint}. Dice the rest with {tomato} for a salad.",
    ]),
  r("lb_manakish", "Za'atar Manakish Breakfast Plate", "Lebanon", "b", 10, 15, 0, false,
    "flatbread:400 zaatar:40 oliveoil:60 cucumber:300 tomato:250 yogurt:250 mint:10", [
      "Mix {zaatar} with {oliveoil} into a loose paste.",
      "Spread over {flatbread} and bake at 220 °C until the edges crisp [t6].",
      "Serve with sliced {cucumber}, {tomato}, {yogurt} (or labneh) and {mint}.",
    ]),
  r("tr_mercimek", "Red Lentil Soup (Mercimek Çorbası)", "Turkey", "l", 15, 35, 0, true,
    "lentils:300 onion:150 carrot:150 potato:150 tomatopaste:30 cumin:4 paprika:3 lemon:100 butter:30 stock:1500", [
      "Soften chopped {onion} and {carrot} in {butter} [t5]. Stir in {tomatopaste} and {cumin}.",
      "Add rinsed {lentils}, diced {potato} and {stock}. Simmer until everything is soft [t25].",
      "Blend smooth. Finish with {paprika} sizzled in a little butter and a squeeze of {lemon}.",
    ]),
  r("ir_kuku", "Kuku Sabzi (Herb Frittata)", "Iran", "bl", 20, 40, 0, false,
    "eggs:8 parsley:120 cilantro:120 dill:30 scallion:100 walnuts:50 turmeric:2 oil:40 flatbread:400", [
      "Very finely chop {parsley}, {cilantro}, {dill} and {scallion} — this is a herb cake bound by egg, not the other way round.",
      "Beat {eggs} with {turmeric} and salt; fold in the herbs and chopped {walnuts}.",
      "Pour into a hot pan with {oil}, cover and cook on low [t15]. Flip (or finish under the grill) until set in the centre [t5].",
      "Cut into wedges and serve with {flatbread}.",
    ]),
  r("sa_machboos", "Chicken Machboos", "Saudi Arabia", "d", 25, 70, 1, true,
    "chicken:1000 rice:500 onion:200 tomato:200 lime:70 baharat:12 garlic:15 cinnamon:2 cardamom:2 oil:40 stock:1000", [
      "Brown {chicken} in {oil}; remove. Soften {onion} and {garlic}, then add {baharat}, {cinnamon} and {cardamom}.",
      "Add chopped {tomato}, a pierced whole {lime} and {stock}. Return the chicken and simmer [t30].",
      "Lift out the chicken and roast at 220 °C to crisp the skin [t15].",
      "Add rinsed {rice} to the broth; cover and cook on low [t20]. Serve the chicken over the rice.",
    ]),

  // ───────────── South Asia
  r("in_dal", "Dal Tadka with Rice", "India", "ld", 20, 40, 1, true,
    "lentils:350 onion:150 tomato:200 garlic:15 ginger:15 cumin:4 turmeric:2 chilipowder:2 oil:40 rice:400 cilantro:20", [
      "Rinse {lentils}; simmer with {turmeric} and 1 L water until soft [t25]. Cook {rice}.",
      "Fry {cumin} in {oil} until it crackles. Add {onion}, {garlic} and {ginger}; cook until golden [t6].",
      "Add {tomato} and {chilipowder}; cook until jammy, then pour over the dal.",
      "Finish with {cilantro}.",
    ]),
  r("in_poha", "Kanda Poha", "India", "b", 15, 20, 1, false,
    "poha:300 onion:150 potato:200 peanuts:60 mustardseed:4 turmeric:2 lemon:50 cilantro:20 oil:30 greenchili:10", [
      "Rinse {poha} in a sieve under running water for 20 seconds; drain and rest.",
      "Fry {peanuts} in {oil} until golden; remove. Add {mustardseed} until they pop.",
      "Cook diced {potato} with {turmeric}, covered, until tender [t8]. Add {onion} and {greenchili} for 2 minutes.",
      "Fold in the poha, peanuts and salt; steam covered 2 minutes. Finish with {lemon} and {cilantro}.",
    ]),
  r("in_palak", "Palak Paneer with Roti", "India", "d", 25, 40, 1, false,
    "spinach:600 paneer:400 onion:150 tomato:150 garlic:15 ginger:15 garammasala:5 cumin:3 oil:40 flatbread:400", [
      "Blanch {spinach} for 1 minute [t1], plunge into iced water and blend smooth.",
      "Fry {cumin} in {oil}, add {onion}, {garlic} and {ginger}; cook until golden [t8]. Add {tomato} and cook down.",
      "Stir in the spinach purée and {garammasala}; simmer 5 minutes.",
      "Add cubed {paneer} and warm through. Serve with {flatbread}.",
    ]),
  r("in_omelette", "Masala Omelette with Paratha", "India", "b", 15, 15, 1, false,
    "eggs:8 onion:100 tomato:100 greenchili:10 cilantro:20 oil:20 flatbread:400", [
      "Finely chop {onion}, {tomato}, {greenchili} and {cilantro}; beat into {eggs} with salt.",
      "Cook in batches in {oil} until just set [t3]; fold.",
      "Serve with warm {flatbread}.",
    ]),
  r("pk_karahi", "Chicken Karahi", "Pakistan", "d", 30, 45, 3, false,
    "chicken:1000 tomato:600 ginger:40 garlic:20 greenchili:20 yogurt:150 garammasala:5 oil:60 flatbread:400 cilantro:20", [
      "Sear {chicken} in {oil} over high heat [t6].",
      "Add {garlic} and half the {ginger}; stir 1 minute. Add halved {tomato}, cover and cook until soft [t10]. Pull out the skins.",
      "Cook uncovered, stirring, until the oil separates and the chicken is cooked through [t10].",
      "Stir in {yogurt}, {garammasala}, sliced {greenchili} and the rest of the ginger in thin strips. Garnish with {cilantro}; serve with {flatbread}.",
    ]),
  r("lk_dhal", "Coconut Dhal with Pol Sambol", "Sri Lanka", "l", 15, 30, 2, false,
    "lentils:300 coconutmilk:400 onion:150 garlic:10 turmeric:2 desiccated:100 lime:70 chilipowder:3 rice:300 oil:20", [
      "Simmer {lentils} with {turmeric}, half the onion and 600 ml water until soft [t15].",
      "Stir in {coconutmilk}; simmer 5 minutes.",
      "Fry {garlic} and the remaining {onion*0.5} in {oil}; pour over the dhal. Cook {rice}.",
      "Pol sambol: rub {desiccated} with {chilipowder}, salt and the juice of {lime}.",
    ]),

  // ───────────── East Asia
  r("cn_congee", "Ginger Chicken Congee", "China", "bl", 10, 80, 0, true,
    "rice:250 chicken:400 ginger:40 scallion:60 soysauce:30 sesameoil:10 stock:2000", [
      "Simmer {rice} with {stock}, sliced {ginger} and whole {chicken}, partly covered [t20].",
      "Lift out the chicken once cooked through; shred it.",
      "Keep simmering, stirring now and then, until silky [t50].",
      "Top with the chicken, {scallion}, {soysauce} and {sesameoil}.",
    ]),
  r("cn_tomatoegg", "Tomato & Egg Stir-fry with Rice", "China", "ld", 15, 25, 0, false,
    "eggs:8 tomato:800 scallion:60 sugar:10 soysauce:15 oil:40 rice:400", [
      "Cook {rice}. Beat {eggs} with salt.",
      "Scramble the eggs in half the {oil} until just set; remove.",
      "Fry {tomato} wedges in the remaining oil with {sugar} and {soysauce} until saucy [t5].",
      "Return the eggs, fold together and top with {scallion}.",
    ]),
  r("jp_salmon", "Miso-Glazed Salmon with Rice & Bok Choy", "Japan", "d", 15, 30, 0, false,
    "salmon:600 miso:60 mirin:30 rice:400 bokchoy:400 sesameseeds:10 soysauce:15", [
      "Cook {rice}. Mix {miso} and {mirin}; brush over {salmon}.",
      "Grill or bake at 220 °C until glazed and the fish flakes [t10].",
      "Steam halved {bokchoy} [t3]; dress with {soysauce}.",
      "Sprinkle {sesameseeds} over everything.",
    ]),
  r("jp_breakfast", "Tamagoyaki & Miso Soup with Rice", "Japan", "b", 20, 25, 0, false,
    "eggs:8 miso:50 tofu:300 scallion:40 rice:300 sugar:10 soysauce:10 oil:10", [
      "Cook {rice}.",
      "Beat {eggs} with {sugar} and {soysauce}. Cook in thin layers in a pan wiped with {oil}, rolling each layer [t8].",
      "Bring 1 L water to a bare simmer, whisk in {miso} (don't boil), add cubed {tofu} and {scallion}.",
    ]),
  r("kr_bibimbap", "Bibimbap", "South Korea", "ld", 35, 45, 2, false,
    "rice:400 beefmince:400 spinach:300 carrot:200 beansprouts:200 eggs:4 gochujang:60 sesameoil:20 garlic:10 soysauce:30", [
      "Cook {rice}.",
      "Brown {beefmince} with {garlic} and {soysauce} until no pink remains [t6].",
      "Blanch {spinach} and {beansprouts} separately [t1]; season each with a little {sesameoil}. Stir-fry thin strips of {carrot} [t2].",
      "Fry {eggs} until the whites are set.",
      "Arrange everything over the rice and serve with {gochujang}.",
    ]),

  // ───────────── Southeast Asia
  r("th_green", "Green Curry with Chicken", "Thailand", "d", 20, 35, 2, false,
    "chicken:700 greencurrypaste:60 coconutmilk:800 eggplant:300 greenbeans:200 fishsauce:30 sugar:10 basil:20 rice:400 oil:15", [
      "Cook {rice}. Fry {greencurrypaste} in {oil} with a few spoons of the thick top of the {coconutmilk} until fragrant [t3].",
      "Add sliced {chicken}; cook 3 minutes, then the rest of the coconut milk.",
      "Add {eggplant} and {greenbeans}; simmer until the chicken is cooked through [t12].",
      "Season with {fishsauce} and {sugar}; tear in {basil}.",
    ]),
  r("vn_bun", "Lemongrass Pork Noodle Bowls", "Vietnam", "l", 25, 40, 1, false,
    "pork:600 lemongrass:40 garlic:10 fishsauce:40 sugar:30 ricenoodles:400 lettuce:200 cucumber:200 carrot:150 mint:20 lime:70 peanuts:60", [
      "Slice {pork} thin; marinate with minced {lemongrass}, {garlic}, half the {fishsauce} and half the {sugar} [t15].",
      "Grill or pan-sear until caramelised and cooked through [t8].",
      "Cook {ricenoodles} as the pack says, then rinse cold.",
      "Mix the remaining fish sauce and sugar with the juice of {lime} and 120 ml water. Build bowls with noodles, {lettuce}, {cucumber}, {carrot}, {mint}, the pork and crushed {peanuts}.",
    ]),
  r("ph_adobo", "Chicken Adobo", "Philippines", "d", 15, 55, 0, true,
    "chicken:1200 soysauce:120 vinegar:120 garlic:40 bay:3 blackpepper:4 rice:500 oil:20", [
      "Combine {chicken}, {soysauce}, smashed {garlic}, {bay} and {blackpepper}; rest 20 minutes [t20].",
      "Brown the chicken in {oil}, add the marinade and {vinegar}. Don't stir until it boils — that mellows the vinegar.",
      "Simmer covered until cooked through [t25], then uncovered to reduce to a glossy sauce [t10].",
      "Serve with {rice}.",
    ]),
  r("id_nasigoreng", "Nasi Goreng", "Indonesia", "bl", 20, 25, 2, false,
    "rice:350 eggs:4 onion:150 garlic:10 kecapmanis:45 chilipowder:3 chicken:300 cucumber:200 oil:40", [
      "Use cold cooked rice: cook {rice} the day before, or cook it and spread it on a tray to cool [t20].",
      "Stir-fry thin strips of {chicken} in {oil} until cooked through [t5]. Add {onion}, {garlic} and {chilipowder}.",
      "Add the rice and {kecapmanis}; toss over high heat until hot [t4].",
      "Fry {eggs} until set and serve on top with sliced {cucumber}.",
    ]),

  // ───────────── Europe & North America
  r("it_ceci", "Pasta e Ceci", "Italy", "ld", 15, 35, 0, true,
    "pasta:350 chickpeas:800 passata:300 onion:100 garlic:10 rosemary:2 oliveoil:40 stock:1000", [
      "Soften {onion}, {garlic} and {rosemary} in {oliveoil} [t5].",
      "Add {chickpeas}, {passata} and {stock}; simmer, then blend a third of it [t10].",
      "Add {pasta} and cook in the soup until al dente, adding water if needed [t11].",
    ]),
  r("gr_souvlaki", "Chicken Souvlaki Bowls with Tzatziki", "Greece", "ld", 25, 40, 0, false,
    "chicken:800 lemon:100 oregano:3 garlic:15 yogurt:300 cucumber:300 tomato:300 redonion:100 flatbread:400 oliveoil:40", [
      "Marinate cubed {chicken} with the juice of {lemon}, {oregano}, half the {garlic} and {oliveoil} [t15].",
      "Thread onto skewers and grill or pan-sear until cooked through [t12].",
      "Tzatziki: grate half the {cucumber}, squeeze it dry and mix with {yogurt} and the remaining garlic.",
      "Serve with {flatbread}, chopped {tomato}, the rest of the cucumber and {redonion}.",
    ]),
  r("gr_yogurt", "Greek Yogurt with Honey, Walnuts & Berries", "Greece", "b", 5, 5, 0, false,
    "yogurt:800 honey:60 walnuts:80 berries:340", [
      "Spoon {yogurt} into bowls.",
      "Top with {berries}, chopped {walnuts} and a drizzle of {honey}.",
    ]),
  r("es_tortilla", "Tortilla Española", "Spain", "bl", 20, 45, 0, false,
    "eggs:8 potato:800 onion:200 oliveoil:200", [
      "Thinly slice {potato} and {onion}; poach gently in {oliveoil} until soft, not browned [t20]. Drain, keeping the oil.",
      "Beat {eggs} with salt and fold in the potatoes; rest [t10].",
      "Cook in a little of the oil over medium-low [t8], flip using a plate, and cook until set in the centre [t5].",
    ]),
  r("ca_oats", "Overnight Oats with Berries & Maple", "Canada", "b", 5, 5, 0, false,
    "oats:320 milk:800 berries:340 chia:40 maple:40", [
      "The night before, stir {oats}, {chia}, {milk} and {maple} together in jars. Chill overnight.",
      "In the morning, top with {berries}.",
    ]),
  r("us_sheetpan", "Sheet-Pan Chicken, Sweet Potato & Broccoli", "United States", "d", 15, 45, 0, false,
    "chicken:800 sweetpotato:800 broccoli:500 oliveoil:40 paprika:4 garlic:10", [
      "Heat the oven to 220 °C. Toss cubed {sweetpotato} with half the {oliveoil}; roast [t15].",
      "Add {chicken} rubbed with {paprika}, {garlic} and the rest of the oil; roast [t15].",
      "Add {broccoli} florets and roast until charred at the edges and the chicken is cooked through [t12].",
    ]),

  // ───────────── Fusion
  r("fx_jerkjollof", "Jerk Chicken Jollof", ["Nigeria", "Jamaica"], "d", 30, 75, 3, true,
    "chicken:1000 jerkpaste:60 rice:500 tomato:400 redpepper:200 scotch:5 onion:200 tomatopaste:50 oil:60 stock:700 thyme:3 allspice:2", [
      "Rub {chicken} with {jerkpaste}; marinate [t20]. Roast at 220 °C until cooked through [t35].",
      "Blend {tomato}, {redpepper}, {scotch} and half the {onion}.",
      "Fry the rest of the onion and {tomatopaste} in {oil} until brick red, add the blend, {thyme} and {allspice}; reduce by half [t20].",
      "Add rinsed {rice} and {stock}; cover tightly and steam on low [t30]. Serve under the jerk chicken.",
    ]),
  r("fx_plantainshak", "Plantain & Pepper Shakshuka", ["Nigeria", "Tunisia"], "bl", 15, 30, 2, false,
    "eggs:8 plantain:500 passata:500 redpepper:200 onion:100 scotch:5 cumin:3 oil:40", [
      "Fry diced ripe {plantain} in half the {oil} until caramelised; set aside.",
      "Soften {onion}, {redpepper} and {scotch} in the remaining oil with {cumin} [t6]. Add {passata}; simmer [t8].",
      "Stir in the plantain, make wells and crack in {eggs}; cover until the whites are set [t7].",
    ]),
  r("fx_suya", "Suya Beef Bowls with Pikliz", ["Nigeria", "Haiti"], "ld", 25, 40, 3, false,
    "sirloin:700 peanuts:60 chilipowder:5 ginger:10 onion:100 cabbage:300 carrot:150 vinegar:200 scotch:5 rice:400 tomato:200", [
      "Quick pikliz: shred {cabbage} and {carrot}, add sliced {scotch}, cover with {vinegar} and salt [t15].",
      "Suya spice: grind {peanuts} with {chilipowder}, grated {ginger} and salt. Coat thin strips of {sirloin}.",
      "Sear in a very hot pan until charred [t5]. Cook {rice}.",
      "Serve the beef over rice with sliced {onion}, {tomato} and the pikliz.",
    ]),
  r("fx_currychana_plantain", "Curry Chickpeas with Plantain & Greens", ["Trinidad and Tobago", "Ghana"], "ld", 20, 35, 2, true,
    "chickpeas:800 plantain:500 kale:250 onion:150 garlic:10 curry:15 coconutmilk:400 scotch:5 oil:40 rice:400", [
      "Toast {curry} in {oil} for 1 minute, then soften {onion}, {garlic} and {scotch} [t5].",
      "Add drained {chickpeas} and {coconutmilk}; simmer [t12]. Cook {rice}.",
      "Fold in sliced {kale} and cook until tender [t4].",
      "Fry sliced ripe {plantain} until golden and serve alongside.",
    ]),
];

/** The built-in library: everyday dishes plus the heritage plate components. */
export const LIBRARY: Recipe[] = [
  ...BASE_LIBRARY.map((r) => (LIBRARY_ARCHETYPES[r.id] ? { ...r, archetype: LIBRARY_ARCHETYPES[r.id] } : r)),
  ...HERITAGE,
];
