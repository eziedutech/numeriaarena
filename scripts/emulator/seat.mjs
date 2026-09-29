// Enters XR in the managed emulator window and seats the head in front of the book.
// Usage (dev server must be up): node scripts/emulator/seat.mjs
import { seat } from './drive.mjs';

await seat();
console.log('seated in front of the book');
