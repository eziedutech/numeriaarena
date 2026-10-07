import type { Route } from "./+types/credits";
import { PaperPage, useLang } from "../legal";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Credits and licenses - Numeria Arena" },
    { name: "description", content: "The open source software Numeria Arena is built with, and the licenses of its art and sound." },
  ];
}

/** [name, what it does here, license] */
const SOFTWARE: [string, { en: string; id: string }, string][] = [
  ["Immersive Web SDK and its emulator", { en: "the game in the headset", id: "game di headset" }, "MIT"],
  ["three.js (super-three)", { en: "3D drawing", id: "gambar 3D" }, "MIT"],
  ["@pmndrs/uikit, Lucide icons", { en: "panels and icons in the headset", id: "panel dan ikon di headset" }, "MIT, ISC"],
  ["MediaPipe hand landmarker", { en: "the smartboard camera, on the device", id: "kamera smartboard, di perangkat" }, "Apache 2.0"],
  ["Firebase JavaScript SDK", { en: "teacher sign-in", id: "masuk guru" }, "Apache 2.0"],
  ["React, React Router, Tailwind CSS, Vite", { en: "this site", id: "situs ini" }, "MIT"],
  ["TypeScript", { en: "the game's code", id: "kode game" }, "Apache 2.0"],
  [
    "Rust: axum, tokio, sqlx, serde, reqwest, rustls, ring, sha2, jsonwebtoken, tracing, wasm-bindgen",
    { en: "the server and the shared game rules", id: "server dan aturan game bersama" },
    "MIT or Apache 2.0, ISC",
  ],
  ["PostgreSQL", { en: "the database", id: "basis data" }, "PostgreSQL License"],
  ["Atkinson Hyperlegible", { en: "the letters of this site", id: "huruf di situs ini" }, "SIL Open Font License 1.1"],
];

function Table({ lang }: { lang: "en" | "id" }) {
  return (
    <ul>
      {SOFTWARE.map(([name, use, license]) => (
        <li key={name}>
          <strong>{name}</strong>: {use[lang]} ({license}).
        </li>
      ))}
    </ul>
  );
}

function English() {
  return (
    <>
      <h2>Art and sound</h2>
      <ul>
        <li>
          The paper animals, the pop-up book, the robots, the town's 214 pieces and its landmarks are origami models made
          by the project owner for this game, released under CC0 1.0.
        </li>
        <li>Crystals, balloons, stars, badges, buttons and the paper letters are drawn in the game's own code.</li>
        <li>The background music was made by the project owner with an AI music tool.</li>
        <li>No logo, brand, real person or third-party artwork appears in the game.</li>
      </ul>

      <h2>Software</h2>
      <p>Numeria Arena is built with open source software. Thank you to everyone who makes it.</p>
      <Table lang="en" />

      <h2>Numeria Arena's own code</h2>
      <p>
        The game's source code is released under the MIT License. Every third-party part is listed with its license in
        the source repository.
      </p>

      <h2>How it was built</h2>
      <p>
        A code assistant was used to speed up development and debugging. Design decisions, measurements and claims were
        checked by hand against real runs.
      </p>
    </>
  );
}

function Indonesian() {
  return (
    <>
      <h2>Gambar dan suara</h2>
      <ul>
        <li>
          Hewan kertas, buku pop-up, robot, 214 potongan kota, dan landmark-nya adalah model origami buatan pemilik
          proyek untuk game ini, dirilis dengan CC0 1.0.
        </li>
        <li>Kristal, balon, bintang, lencana, tombol, dan huruf kertas digambar oleh kode game sendiri.</li>
        <li>Musik latar dibuat oleh pemilik proyek dengan alat musik AI.</li>
        <li>Tidak ada logo, merek, orang nyata, atau karya seni pihak ketiga di dalam game.</li>
      </ul>

      <h2>Perangkat lunak</h2>
      <p>Numeria Arena dibangun dengan perangkat lunak sumber terbuka. Terima kasih kepada semua pembuatnya.</p>
      <Table lang="id" />

      <h2>Kode Numeria Arena</h2>
      <p>
        Kode sumber game dirilis dengan Lisensi MIT. Setiap bagian pihak ketiga tercatat bersama lisensinya di
        repositori sumber.
      </p>

      <h2>Cara pembuatannya</h2>
      <p>
        Asisten kode dipakai untuk mempercepat pengembangan dan debugging. Keputusan desain, pengukuran, dan klaim
        diperiksa langsung dengan uji coba nyata.
      </p>
    </>
  );
}

export default function Credits() {
  const [lang, setLang] = useLang();
  return (
    <PaperPage lang={lang} setLang={setLang} title={lang === "id" ? "KREDIT DAN LISENSI" : "CREDITS AND LICENSES"}>
      {lang === "id" ? <Indonesian /> : <English />}
    </PaperPage>
  );
}
