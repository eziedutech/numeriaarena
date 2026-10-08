import type { Lang } from "../legal";

/**
 * Every topic of Math Edu, grade 4 to 6, in teaching order within each area.
 * A topic with a lesson file in ./lessons (named by its id) opens; the rest
 * are listed as coming. `skills` are the game's skill codes it teaches, so a
 * weak skill in a report can point to its lesson.
 */

export type I18n = Record<Lang, string>;
export type Area = "number" | "geometry" | "measure" | "data";

export interface Topic {
  id: string;
  grade: 4 | 5 | 6;
  area: Area;
  title: I18n;
  skills: string[];
}

export const AREAS: Record<Area, I18n> = {
  number: { en: "Numbers", id: "Bilangan" },
  geometry: { en: "Geometry", id: "Geometri" },
  measure: { en: "Measurement", id: "Pengukuran" },
  data: { en: "Data and chance", id: "Data dan peluang" },
};

const t = (grade: 4 | 5 | 6, area: Area, id: string, en: string, idn: string, skills: string[] = []): Topic => ({
  id,
  grade,
  area,
  title: { en, id: idn },
  skills,
});

export const TOPICS: Topic[] = [
  // Grade 4
  t(4, "number", "place-value", "Whole numbers to 1,000,000: place value", "Bilangan cacah sampai 1.000.000: nilai tempat", ["PV.READ"]),
  t(4, "number", "compare-numbers", "Reading and comparing big numbers", "Membaca dan membandingkan bilangan besar", ["PV.COMPARE"]),
  t(4, "number", "rounding", "Rounding whole numbers", "Membulatkan bilangan cacah", ["PV.ROUND"]),
  t(4, "number", "add-subtract-big", "Adding and subtracting big numbers", "Penjumlahan dan pengurangan bilangan besar", ["PV.ADD", "PV.SUB"]),
  t(4, "number", "multiply-divide-big", "Multiplying and dividing big numbers", "Perkalian dan pembagian bilangan besar", ["MD.FACTS", "MD.MULT", "MD.DIV"]),
  t(4, "number", "order-of-operations", "Mixed operations and their order", "Operasi hitung campuran dan urutannya", ["MD.ORDER"]),
  t(4, "number", "factors-multiples", "Factors and multiples", "Faktor dan kelipatan", ["MD.FACTORS"]),
  t(4, "number", "gcf-lcm", "Greatest common factor and least common multiple", "FPB dan KPK", ["MD.FACTORS"]),
  t(4, "number", "equivalent-fractions", "Equivalent fractions", "Pecahan senilai", ["FR.EQUIV"]),
  t(4, "number", "compare-fractions", "Comparing fractions", "Membandingkan pecahan", ["FR.COMPARE"]),
  t(4, "number", "add-like-fractions", "Adding and subtracting fractions with the same denominator", "Penjumlahan dan pengurangan pecahan berpenyebut sama", ["FR.ADD.LIKE"]),
  t(4, "number", "mixed-numbers", "Mixed numbers", "Pecahan campuran", ["FR.MIXED"]),
  t(4, "number", "decimal-fractions", "Decimals and fractions", "Pecahan desimal dan pecahan biasa", ["DC.READ", "DC.FRAC"]),
  t(4, "number", "money", "Money values", "Nilai uang"),
  t(4, "number", "number-patterns", "Number patterns", "Pola bilangan"),
  t(4, "geometry", "polygons-angles", "Polygons and kinds of angles", "Segi banyak dan jenis sudut"),
  t(4, "geometry", "symmetry", "Symmetry and reflection", "Simetri dan pencerminan"),
  t(4, "geometry", "perimeter-area", "Perimeter and area of squares and rectangles", "Keliling dan luas persegi dan persegi panjang", ["ME.PERIM", "ME.AREA"]),
  t(4, "measure", "units", "Units of length, weight, time and angle", "Satuan panjang, berat, waktu, dan sudut", ["ME.EST", "ME.CONVERT"]),
  t(4, "measure", "area-units", "Units of area", "Satuan luas"),
  t(4, "data", "tables-bar-charts", "Tables, pictographs and bar charts", "Tabel, piktogram, dan diagram batang"),
  // Grade 5
  t(5, "number", "big-numbers-rounding", "Big whole numbers and rounding", "Bilangan cacah besar dan pembulatan", ["PV.READ", "PV.ROUND"]),
  t(5, "number", "primes", "Prime numbers and factor trees", "Bilangan prima dan pohon faktor", ["MD.PRIME"]),
  t(5, "number", "add-unlike-fractions", "Adding and subtracting fractions with different denominators", "Penjumlahan dan pengurangan pecahan berpenyebut beda", ["FR.ADD.UNLIKE"]),
  t(5, "number", "multiply-divide-fractions", "Multiplying and dividing fractions", "Perkalian dan pembagian pecahan", ["FR.MULT", "FR.OF"]),
  t(5, "number", "decimals-percent", "Decimals and percent", "Desimal dan persen", ["DC.COMPARE", "DC.ADD", "DC.MULT10", "DC.PERCENT"]),
  t(5, "number", "ratio-scale", "Ratio and scale", "Perbandingan dan skala"),
  t(5, "number", "arithmetic-patterns", "Arithmetic number patterns", "Pola bilangan aritmetika"),
  t(5, "geometry", "area-shapes", "Area of triangles, parallelograms, trapezoids, kites and rhombuses", "Luas segitiga, jajargenjang, trapesium, layang-layang, belah ketupat", ["ME.AREA"]),
  t(5, "geometry", "triangle-angles", "Angles in a triangle", "Jumlah sudut segitiga"),
  t(5, "geometry", "cubes-cuboids", "Cubes, cuboids and their nets", "Kubus, balok, dan jaring-jaringnya", ["ME.VOL"]),
  t(5, "geometry", "volume-cuboids", "Volume of cubes and cuboids", "Volume kubus dan balok", ["ME.VOL"]),
  t(5, "geometry", "coordinates-q1", "Coordinates in the first quadrant", "Koordinat kartesius kuadran 1"),
  t(5, "measure", "volume-flow-speed", "Units of volume, flow rate and speed", "Satuan volume, debit, dan kecepatan"),
  t(5, "measure", "land-area", "Land area units: are and hectare", "Satuan luas tanah: are dan hektare"),
  t(5, "data", "line-pie-charts", "Line charts and pie charts", "Diagram garis dan diagram lingkaran"),
  t(5, "data", "frequency-tables", "Frequency tables", "Tabel frekuensi"),
  t(5, "data", "mean", "The mean", "Rata-rata"),
  // Grade 6
  t(6, "number", "integers", "Integers and the number line", "Bilangan bulat dan garis bilangan"),
  t(6, "number", "integer-operations", "Operations with integers", "Operasi hitung bilangan bulat"),
  t(6, "number", "mixed-fraction-decimal-percent", "Mixed operations with fractions, decimals and percent", "Operasi campuran pecahan, desimal, dan persen", ["DC.FRAC", "DC.PERCENT"]),
  t(6, "number", "ratio-scale-speed", "Ratio, scale and speed", "Perbandingan, skala, dan kecepatan"),
  t(6, "number", "squares-roots", "Squares and square roots", "Pangkat dua dan akar kuadrat"),
  t(6, "number", "cubes-cube-roots", "Cubes and cube roots", "Pangkat tiga dan akar pangkat tiga"),
  t(6, "geometry", "circles", "Circles: parts, circumference and area", "Lingkaran: unsur, keliling, dan luas", ["ME.PERIM", "ME.AREA"]),
  t(6, "geometry", "composite-area", "Area of combined shapes", "Luas gabungan bangun datar", ["ME.AREA"]),
  t(6, "geometry", "solids", "Prisms, cylinders, pyramids, cones and spheres", "Prisma, tabung, limas, kerucut, dan bola"),
  t(6, "geometry", "volume-surface", "Volume and surface area of solids", "Volume dan luas permukaan bangun ruang", ["ME.VOL"]),
  t(6, "geometry", "coordinates-transformations", "Four quadrants and transformations", "Koordinat empat kuadran dan transformasi"),
  t(6, "data", "mean-median-mode", "Mean, median and mode", "Mean, median, dan modus"),
  t(6, "data", "reading-data", "Showing and reading data", "Penyajian dan penafsiran data"),
  t(6, "data", "chance", "Simple chance", "Peluang sederhana"),
];

export const topic = (id: string) => TOPICS.find((x) => x.id === id);

const LESSONS = import.meta.glob<{ lesson: import("./ink").Lesson }>("./lessons/*.ts");
const file = (id: string) => `./lessons/${id}.ts`;

/** Whether the topic's lesson is made; known without loading it. */
export const ready = (id: string) => file(id) in LESSONS;

/** The first made lesson that teaches a skill, lowest grade first, for a report's weak skill. */
export const lessonFor = (skill: string) => TOPICS.filter((x) => x.skills.includes(skill) && ready(x.id)).sort((a, b) => a.grade - b.grade)[0];

/** The lesson's own code, loaded only when it is opened. */
export const loadLesson = async (id: string) => (await LESSONS[file(id)]()).lesson;
