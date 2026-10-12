// Login page is always light, whatever colour mode the user picked elsewhere.
// Runs after skin-preload.js and overrides data-mode for this page only —
// nothing is persisted, so the stored preference still applies to other pages.
document.documentElement.setAttribute('data-mode', 'light');
