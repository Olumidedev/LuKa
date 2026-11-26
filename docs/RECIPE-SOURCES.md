# Where LUKA's recipes come from

Every outside recipe enters `recipe_submissions` and waits for an admin in **Admin → Review**. Nothing is scraped.

| Tier | Source | How LUKA uses it | Licence on the published recipe |
|---|---|---|---|
| 1 | **Wikibooks Cookbook** | Admin → Data → Import. Adapted by Claude (quantities for 4, tidy steps). | CC BY-SA 4.0, credited to "Wikibooks Cookbook contributors" with a link to the exact revision. Share-alike: these recipes can't be relicensed. |
| 1 | **TheMealDB** | **Facts only**: dish name, country, ingredient list. LUKA writes its own method. | LUKA's own. TheMealDB methods are often copied from publishers (e.g. BBC Good Food), so they're never stored. Publishing an app on the live API needs a paid supporter key (`THEMEALDB_API_KEY`); the free key `1` is for development. |
| 2 | **Public-domain cookbooks**: Project Gutenberg, Internet Archive, Feeding America (MSU) | Admin pastes one recipe; Claude modernises it (metric, safe temperatures). | "Public domain source; LUKA adaptation". Pre-1930 books are treated as public domain; later ones need the reviewer to confirm. Digitised ≠ public domain: check each Internet Archive item, and don't copy Gutenberg's licence header. |
| — | Families | Opt-in "Share this recipe" when typing in a family recipe. | Shared with consent, credited as the family writes it. |
| — | Weekly gap agent | Claude drafts recipes for cuisines people pick but LUKA serves poorly. | LUKA's own; unverified until reviewed. |
| — | Household imports | "From a link" in Add recipe reads the page's schema.org Recipe data. | **Private to that household**, never shared, linked back to the page. Videos: paste the description instead. |

## Not used, and why

- **Kaggle "Extended Recipes Dataset (64K)"**: the CC BY 4.0 label is the uploader's; recipe sets like this are usually scraped from sites the uploader doesn't own. Use only after confirming where every recipe came from.
- **Edamam, Spoonacular, Suggestic**: paid APIs whose terms limit storing recipe content (Spoonacular allows caching for about an hour). Fine for live search with links back; not for building LUKA's own catalogue unless a licence says otherwise.
- **AtoZ World Food**: proprietary; good for checking dish origins if licensed.
- **FAO/INFOODS food composition tables**: ingredient nutrition, not recipes. Many are CC BY-NC-SA 3.0 IGO (non-commercial), so check each table before using it in a paid product.

## Tier 3: people to partner with, not scrape

Regional sites and channels such as 9jafoodie, All Nigerian Recipes, Immaculate Bites, Kaluhi's Kitchen, Original Flava, CaribbeanPot, Hebbar's Kitchen, Hot Thai Kitchen, The Woks of Life, Just One Cookbook, Maangchi, Panlasang Pinoy, Middle Eats, Refika's Kitchen, Pasta Grannies and Mexico in My Kitchen are **outreach targets** for licensed partner feeds (`source_channel = 'partner_feed'`, licence confirmed in Review) and benchmarks reviewers can consult by hand. LUKA's code doesn't fetch them.
