/**
 * Numeria Arena in schools: one entry for each session, newest first, shown on /in-schools.
 * Words for the page go in both languages. No child's name, face or photo goes here.
 *
 * An entry, for example:
 *   {
 *     date: "2026-11-03",
 *     school: { en: "A primary school in (city)", id: "Sebuah SD di (kota)" },
 *     level: { en: "Primary, grades 4 to 6", id: "SD, kelas 4 sampai 6" },
 *     ages: "10-12",
 *     students: 24,
 *     headsets: 1,
 *     activity: { en: "Each child played Balloon Burst and Measure Hunt for about ten minutes.", id: "Setiap anak memainkan Balloon Burst dan Cari & Ukur sekitar sepuluh menit." },
 *   },
 */
export interface SchoolSession {
  /** The day, as YYYY-MM-DD. */
  date: string;
  /** The school as it may be named in public (or only its kind and city). */
  school: { en: string; id: string };
  level: { en: string; id: string };
  /** The students' ages, as "10-12" or "13-15". */
  ages: string;
  students?: number;
  headsets?: number;
  activity: { en: string; id: string };
  /** What was learned or changed after it, if anything. */
  note?: { en: string; id: string };
}

export const SESSIONS: SchoolSession[] = [];
