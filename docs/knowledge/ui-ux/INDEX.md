# UI/UX + front-end design knowledge — sub-index

Copied 2026-10-09 from SKILLS_TREE `knowledge/{web-development,visual-design}` (each file keeps `source:`). Read this index, then ONLY the matched note.
Generic notes: `CLAUDE.md`, `.claude/rules/*` and the `design-workflow` skill win on conflict. The board/stones design and backend are locked on `ui/*` branches regardless of any style note.

## UX / IA / forms / prototyping
| Note | What it decides |
|---|---|
| [iconography](iconography.md) | **Project decision (#214):** Phosphor Regular only, sizes 16/20/24 (nothing < 16), visible labels, ≥ 24px targets, one icon per concept + registry |
| [ux-design-systems](ux-design-systems.md) | What a web design system contains (tokens, components, patterns, guidance), how tokens are layered… |
| [ux-forms-errors](ux-forms-errors.md) | Designing web forms and validation - server-side validation first, error summary plus inline… |
| [ux-information-architecture](ux-information-architecture.md) | Structuring site content (information architecture), navigation as its interface, and designing URLs… |
| [ux-responsive-mobile-first](ux-responsive-mobile-first.md) | Responsive web design essentials - viewport tag, fluid layout with flexbox and grid, media queries in… |
| [ux-research-usability](ux-research-usability.md) | Learning user needs and testing a web design with real users - methods, how many participants,… |
| [ux-prototyping](ux-prototyping.md) | Using low- to high-fidelity prototypes and technical spikes to test the riskiest assumptions of a… |

## Accessibility
| Note | What it decides |
|---|---|
| [a11y-aria-keyboard-focus](a11y-aria-keyboard-focus.md) | Making interactive web UI operable and understandable to assistive technology - native elements… |
| [a11y-wcag-essentials](a11y-wcag-essentials.md) | WCAG 2.2 in practice - the four POUR principles, conformance levels and what AA means, contrast and… |
| [a11y-testing](a11y-testing.md) | Testing web accessibility in layers - quick manual checks, automated tools in CI, screen-reader and… |

## Front-end build / CSS / state / media
| Note | What it decides |
|---|---|
| [fe-css-architecture](fe-css-architecture.md) | Keeping CSS maintainable at scale - understanding the cascade, cascade layers to control precedence,… |
| [fe-html-progressive-enhancement](fe-html-progressive-enhancement.md) | Building the web frontend from semantic HTML upward - native elements first, CSS and JavaScript as… |
| [fe-state-data-fetching](fe-state-data-fetching.md) | Frontend state - separating client state from server state, keeping state minimal and close to use,… |
| [fe-media-assets](fe-media-assets.md) | Delivering images and fonts efficiently - formats, responsive images, explicit dimensions, lazy… |

## Performance + i18n
| Note | What it decides |
|---|---|
| [perf-core-web-vitals](perf-core-web-vitals.md) | The three Core Web Vitals (LCP, INP, CLS) - what each measures, thresholds at the 75th percentile,… |
| [perf-loading-critical-path](perf-loading-critical-path.md) | How the browser turns HTML, CSS and JavaScript into pixels, what blocks rendering and parsing, and… |
| [webx-i18n-l10n](webx-i18n-l10n.md) | Internationalising and localising a website - UTF-8, the lang and dir attributes, locale-aware… |

## Visual foundations (apply to any style)
| Note | What it decides |
|---|---|
| [vbase-color](vbase-color.md) | Building a website color palette - harmony schemes, palette size, semantic roles, contrast targets… |
| [vbase-depth-motion](vbase-depth-motion.md) | How depth (shadow, elevation, borders, layers) and small motion (transitions, micro-interactions)… |
| [vbase-layout-spacing](vbase-layout-spacing.md) | Layout and spacing rules behind any style - grids and gutters, a spacing scale, proximity grouping,… |
| [vbase-typography](vbase-typography.md) | Web typography rules behind any style - body size, line length, line height, type scale, font pairing… |
| [vbase-visual-principles](vbase-visual-principles.md) | The visual principles under every style - scale, visual hierarchy, balance, contrast, gestalt… |

## Choosing a style
| Note | What it decides |
|---|---|
| [vpick-brand-attributes](vpick-brand-attributes.md) | Turning brand words (trustworthy, playful, premium) into visual levers, and checking that a chosen… |
| [vpick-choosing-style](vpick-choosing-style.md) | How to turn a website request into two or three fitting visual style directions with reasons and… |
| [vpick-style-by-site-type](vpick-style-by-site-type.md) | Matrix from website type (SaaS, shop, bank, portfolio, government, blog, game, kids and more) to safe… |
| [vpick-trends-longevity](vpick-trends-longevity.md) | How visual trends rise and fall (flat, neumorphism, glassmorphism, neobrutalism), how the… |

## Styles (candidates for ui/<style> branches)
| Note | What it decides |
|---|---|
| [vstyle-bento-modular](vstyle-bento-modular.md) | Bento grids and card-based modular layouts - differently sized tiles that show many features at once;… |
| [vstyle-brutalism-neobrutalism](vstyle-brutalism-neobrutalism.md) | Web brutalism, antidesign and neobrutalism - raw or loud looks with thick borders, hard shadows and… |
| [vstyle-dark-mode](vstyle-dark-mode.md) | Dark themes as a style (dark-first sites, OLED black, neon cyber and HUD looks) and as a user option;… |
| [vstyle-flat-material](vstyle-flat-material.md) | Flat design, flat 2.0 (semi-flat) and Material Design as web styles - solid color, simple shapes,… |
| [vstyle-glassmorphism](vstyle-glassmorphism.md) | Glassmorphism, Apple's Liquid Glass and related frosted-translucent looks on the web - when… |
| [vstyle-handmade-organic](vstyle-handmade-organic.md) | Handmade and organic styles - hand-drawn illustration, visible texture, imperfect lines, earthy… |
| [vstyle-maximalism-expressive](vstyle-maximalism-expressive.md) | Maximalism and expressive design - bold color, big expressive type, layered patterns and shapes,… |
| [vstyle-minimalism-swiss](vstyle-minimalism-swiss.md) | Minimalism and the Swiss (International Typographic) style on the web - grid, type-led hierarchy,… |
| [vstyle-motion-immersive](vstyle-motion-immersive.md) | Motion-led and immersive styles - kinetic typography, scroll-driven storytelling, parallax,… |
| [vstyle-retro-nostalgia](vstyle-retro-nostalgia.md) | Retro web styles - Memphis and Corporate Memphis, Y2K, Frutiger Aero, vaporwave, pixel art and 90s… |
| [vstyle-skeuomorphism-neumorphism](vstyle-skeuomorphism-neumorphism.md) | Skeuomorphism, neumorphism (soft UI) and claymorphism - real-world and soft 3D looks; when realism… |
