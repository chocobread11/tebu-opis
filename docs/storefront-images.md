# Storefront image placeholders

Generated with the built-in image generation tool. These are temporary product mockups, not photographs of the actual products.

Replace the WebP files in `public/images/storefront/` with your own photography or model renders, or change the URLs in `lib/storefront-images.ts`. Keep portrait bottle images around 4:5, add-on pouch images square, and the hero landscape. `ProductImage` falls back to the original `BottleArt` component if a bottle image fails to load.

## Saved assets and generation prompts

- `public/images/storefront/flask.webp` — 640 × 800.
- `public/images/storefront/jug.webp` — 640 × 800.
- `public/images/storefront/hero.webp` — 1680 × 946.
- `public/images/storefront/asam-boi.webp` — 480 × 480, generated with the built-in image tool.
- `public/images/storefront/limau-kasturi.webp` — 480 × 480, generated with the built-in image tool.

### Flask prompt

Use case: product-mockup. Generate one premium ecommerce catalog photograph for a minimalist sugarcane juice store. A single upright clear 500 ml reusable cylindrical juice flask filled with natural pale yellow-green sugarcane juice, white ribbed screw cap, small simple cream paper label reading 'tebu drop.' in black. Plain very light neutral gray studio background, subtle real shadow, soft diffused daylight, realistic packaging materials. Portrait 4:5 composition, entire bottle visible with generous breathing room, centered, straight-on camera. No fruit, props, extra text or decorations. This is a temporary product image to replace with real product photography later.

### Jug prompt

Use case: product-mockup. Generate one premium ecommerce catalog photograph for a minimalist sugarcane juice store, matching a catalog with neutral light gray backgrounds and soft daylight. A single upright clear 1 litre sharing jug of pale yellow-green sugarcane juice. Broad rectangular body with softly rounded corners, integrated handle near neck, white screw cap, small cream paper label reading 'tebu drop.' in black serif lettering stacked on two lines. Clean neutral very light gray seamless studio background, subtle real shadow, realistic clear plastic and juice. Portrait 4:5 composition, entire jug visible, centered with generous breathing room. No fruit, props, extra text or decorations. Temporary product photography for later replacement.

### Hero prompt

Use case: product-mockup. Wide landscape 16:9 editorial ecommerce hero photograph for a minimalist sugarcane juice store. On the RIGHT HALF of a warm very light gray studio surface: one clear cylindrical 500 ml flask of pale yellow-green sugarcane juice with white ribbed cap and a cream label reading 'tebu drop.' in black serif letters, and beside it a wider 1 litre clear plastic jug of the same juice with integrated handle and white screw cap, same cream label. One short cut piece of sugarcane rests nearby. Soft diffused daylight from upper left, gentle organic shadows, premium understated realistic product photography. LEFT HALF is clean empty neutral light gray negative space for webpage text. Entire products visible. No extra text, no people, no decorative graphics. Match clean neutral catalog product photography.


### Asam Boi pouch prompt

Use case: product-mockup. Asset type: small ecommerce add-on product card image for a minimalist Malaysian sugarcane juice store. Generate a photorealistic studio product photograph of ONE small, flat, palm-sized clear food-safe ziplock bag, neatly packed and closed with a visible resealable zipper strip near the top. The bag is slightly upright, front-facing with a subtle three-quarter angle, entire bag visible centered with generous breathing room. Plain very light neutral gray seamless background (#f2f2f2), soft diffused daylight, gentle realistic contact shadow. Crisp transparent crinkled plastic, realistic small handmade food add-on portion, simple unbranded packaging. Square composition. No text, labels, logo, hands, props, loose fruit outside the bag, or watermark. Subject: a small clear ziplock pouch containing about five dried preserved sour plums (Malaysian asam boi), with wrinkled brown and tan skin and a light powdery coating. These are whole dried preserved plums, not candy, not fresh fruit.

### Limau Kasturi pouch prompt

Use case: product-mockup. Asset type: small ecommerce add-on product card image for a minimalist Malaysian sugarcane juice store. Generate a photorealistic studio product photograph of ONE small, flat, palm-sized clear food-safe ziplock bag, neatly packed and closed with a visible resealable zipper strip near the top. The bag is slightly upright, front-facing with a subtle three-quarter angle, entire bag visible centered with generous breathing room. Plain very light neutral gray seamless background (#f2f2f2), soft diffused daylight, gentle realistic contact shadow. Crisp transparent crinkled plastic, realistic small handmade food add-on portion, simple unbranded packaging. Square composition. No text, labels, logo, hands, props, loose fruit outside the bag, or watermark. Subject: a small clear ziplock pouch containing three small fresh green calamansi limes (Malaysian limau kasturi), one of them cut in half with the cut face visible through the plastic showing pale yellow-orange citrus flesh and small seeds. Green natural textured rind, tiny citrus fruits, fresh and realistic.
