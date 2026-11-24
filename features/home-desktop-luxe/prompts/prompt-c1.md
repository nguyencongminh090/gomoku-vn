Generate raster art with your built-in image generation tool. Write ONLY inside features/home-desktop-luxe/assets/c1/ (create it). Do not touch any other file in this repository and do not run git.

Art direction for all images: photorealistic luxury product photography of a Gomoku game, dark walnut and aged kaya wood, polished biconvex stones (glossy black slate, warm ivory shell). One single key light: warm 2700K, soft and wide, coming from the UPPER RIGHT. Wide soft light field, no thin light ribbons, no god rays, no smoke. No text, no logos, no people, no hands, no watermark.

Deliver:

1. table.webp, 2560x1440, quality about 80, target at most 300 KB.
Low camera almost level with the table surface, looking across a dark walnut Gomoku table that recedes to the horizon at about 58% of the image height.
Light and dark zones are mandatory: the top 55% is near-black warm shadow (average luminance under 8%) with a faint soft glow in the upper right only. The table surface from 60% downward catches the light, brightest in the lower right, falling off to deep shadow in the lower left corner. Fine engraved grid lines on the table run toward the vanishing point. A few small out-of-focus stones sit far away near the horizon on the right. Keep the centre of the image free of stones.

2. stone-black.webp, 1400x1100, with a real transparent alpha channel.
A single large glossy black biconvex Gomoku stone seen from the same low angle, softly lit from the upper right with a broad highlight, bottom edge very slightly out of focus. Stone only; background fully transparent; clean anti-aliased edge; no contact shadow baked in, no halo.
If the generator cannot output alpha, generate it on a flat contrasting background and cut it out with a script, then confirm by reading the alpha channel that the corners are 0 and the stone centre is 255.

3. stone-ivory.webp, 900x700, same requirements, a warm ivory stone, same angle and light.

Finish by printing each file's dimensions, byte size and whether it has alpha. Also save table-preview.jpg is NOT needed.
