/**
 * The icons the panels in public/ui/ use, standing in for the whole icon
 * package: the panel reader registers every export of it as a component, so
 * importing the package pulled all of its icons, about half of the game's
 * code, into the first download. vite.config.ts points the package here and
 * stops a build whose panels name an icon missing from this list.
 */
export * from '@pmndrs/uikit-lucide/dist/LogIn.js';
export * from '@pmndrs/uikit-lucide/dist/RectangleGoggles.js';
// Used inside the panel kit's own checkbox and dropdown.
export * from '@pmndrs/uikit-lucide/dist/Check.js';
export * from '@pmndrs/uikit-lucide/dist/ChevronDown.js';
