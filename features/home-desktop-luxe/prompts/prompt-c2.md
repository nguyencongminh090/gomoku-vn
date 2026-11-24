Generate raster art with your built-in image generation tool. Write ONLY inside features/home-desktop-luxe/assets/c2/ (create it). Do not touch any other file in this repository and do not run git.

Art direction for all images: photorealistic luxury product photography, aged kaya and dark walnut wood, polished biconvex Gomoku stones. One single key light: warm 2700K, soft and wide, coming from the UPPER RIGHT. No text, no logos, no people, no watermark.

Deliver:

1. board.webp, 2560x1440, quality about 80, target at most 300 KB.
Exactly top-down (orthographic feel, no perspective) view of a solid wood board surface with fine straight grain running horizontally. IMPORTANT: NO grid lines, NO stones, NO objects, wood only. Grid lines will be drawn later in code.
Light and dark zones are mandatory: a wide soft pool of warm light centred at about 72% across and 38% down. The left 45% of the image falls off into near-black shadow (average luminance under 8%), and all corners are deeply vignetted.

2. stone-black.webp, 512x512, real transparent alpha channel.
A glossy black biconvex stone seen exactly from above, perfectly circular, centred, filling 92% of the canvas, broad soft highlight toward the upper right. Stone only, no baked shadow, no halo.

3. stone-ivory.webp, 512x512, same requirements, warm ivory shell stone with very subtle natural banding.

4. stone-glow.webp, 512x512, same as the ivory stone but lit more brightly with warm gold rim light, as the hero stone. Alpha as well.

If the generator cannot output alpha, generate on a flat contrasting background and cut out with a script (a circular mask is acceptable), then confirm by reading the alpha channel that the corners are 0 and the centre is 255.

Finish by printing each file's dimensions, byte size and whether it has alpha.
