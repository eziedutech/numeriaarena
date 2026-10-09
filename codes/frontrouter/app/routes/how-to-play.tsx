import type { Route } from "./+types/how-to-play";
import { PaperPage, Shot, useLang } from "../legal";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "How to play - Numeria Arena" },
    { name: "description", content: "How to play the games, learn in Math Edu and build MY FOLD TOWN, in the headset and on a screen." },
  ];
}

function English() {
  return (
    <>
      <p className="lead">
        On the home page, pick where you play: META QUEST (XR) opens the game on your real desk, THIS COMPUTER plays with
        the mouse or touch, and SMARTBOARD is for the big screen at the front of the class.
      </p>

      <h2>1. Playing the games</h2>
      <ol>
        <li>
          Put the headset on and sit at a table. The game finds the table; tap, or wait a few seconds, and the pop-up
          book opens on it.
        </li>
        <li>
          Touch an envelope on the desk to pick a game, then PRACTICE ON MY OWN (no timer) or RACE THE ROBOTS (three timed
          waves).
        </li>
        <li>
          A paper animal walks out of the book with a question. Answer with your hand: a ray and a dot show where you
          point, the dot only lights a card, and the tap of your index finger chooses it. With a controller, aim and
          press the trigger. In some rooms the question is written on the classroom board.
        </li>
      </ol>
      <ul>
        <li>
          <strong>Balloon Burst</strong>: pop the balloon with the right answer.
        </li>
        <li>
          <strong>Orb Forge</strong>: join two crystals that make the number asked.
        </li>
        <li>
          <strong>Factory Sort</strong>: touch the gate the number goes through.
        </li>
        <li>
          <strong>Bridge Builder</strong>: lay planks that make the length asked.
        </li>
        <li>
          <strong>Balance Gate</strong>: touch the weight that balances the scale.
        </li>
        <li>
          <strong>Cari &amp; Ukur (Measure Hunt)</strong>: measure a shape on the desk and pick its perimeter, area, edges,
          volume or surface. It is played in the headset only.
        </li>
      </ul>
      <h2>Cari &amp; Ukur</h2>
      <ol>
        <li>Pick your grade (a guest), then FLAT SHAPES or SOLIDS, then PAPER OBJECT or SOMETHING NEAR YOU.</li>
        <li>With something near you, pick the card of what you have (a book, a plate, a box) or PAPER to use a paper one.</li>
        <li>
          The problem is written on the board. Point at a corner: a circle shows. Tap, and a line starts there and
          follows your hand.
        </li>
        <li>
          Point at the next corner and tap: the line is fixed and the next one starts. A square or rectangle needs two
          sides at a corner, a box needs three edges square to each other, and a triangle is closed by tapping its first
          corner again.
        </li>
        <li>When the lines are enough, five answers appear. Pick one. The game also counts how truly you measured.</li>
        <li>
          Turn a paper solid with the arrow cards at the left, open it flat with NET, and read the board up close with
          READ. Tap a pin and then the bin beside it to take it away; BACK leaves.
        </li>
      </ol>
      <p>
        A right answer sends the animal home happy and earns Folds. In a class, the teacher can open RACE MY CLASSMATES,
        and FIND A RIVAL pairs you with a student of your grade.
      </p>
      <Shot
        src="play-balloons.webp"
        alt="Balloon Burst in the headset: a paper animal with a question and balloons over the book"
        caption="Balloon Burst on a real desk: reach out and pop the right answer."
      />
      <Shot
        src="play-crystals.webp"
        alt="Orb Forge in the headset: two crystals held in the hands, joined to make a number"
        caption="Orb Forge: pick up two crystals and join them."
      />

      <h2>2. Learning in Math Edu</h2>
      <ol>
        <li>Open MATH LESSONS from the home page. Pick a grade, then a topic.</li>
        <li>
          Each lesson is a paper sheet that moves step by step: watch, drag things, and see what happens. There are no
          questions and no scores.
        </li>
        <li>
          In the headset, press ENTER VR. The sheet stands in front of you as a large paper panel, the step before and
          after wait at either side, and paper digits drift around you. Point and pull the trigger, or pinch, to move
          through it.
        </li>
      </ol>
      <Shot
        src="edu-vr.webp"
        alt="A Math Edu lesson in VR: a large paper sheet in front, the next steps folded at the sides"
        caption="A Math Edu lesson around the learner in VR."
      />

      <h2>3. Building the town</h2>
      <ol>
        <li>Every game earns Folds. Open MY FOLD TOWN from the home page or from the sticker beside the book.</li>
        <li>
          In the headset your land lies on the desk and the shop's shelf stands at its right. Grab a piece with the grip
          or the trigger, or simply pinch it, carry it over the land and let go. Press TURN while you carry it.
        </li>
        <li>
          A new building takes time to fold up. Answer a FINISH NOW question to finish it at once. Point at any building
          to open its maths card: windows, area, perimeter, volume, or its share of the land.
        </li>
        <li>
          Each skill you master raises a landmark in your town, and a new land opens once most of yours is built.
        </li>
      </ol>
      <p>On a screen, the same town has a shelf of pieces to place, turn, move or remove; removing a piece gives its Folds back.</p>
      <Shot
        src="town-hand.webp"
        alt="Building the town in the headset: a house held in the hand over the land on the desk"
        caption="Carry a piece from the shelf to your land."
      />
      <Shot
        src="town-card.webp"
        alt="A building's maths card beside the book in the headset"
        caption="Every building has a maths card."
      />

      <h2>Good to know</h2>
      <ul>
        <li>Practice and robot races give up to 100 Folds a day; class races, rooms and FIND A RIVAL have no limit.</li>
        <li>ACCESSIBILITY on the home page has BIG NUMBERS, NO TIMER, HIGH CONTRAST, READ ALOUD and STEADY AIM.</li>
        <li>No network? Practice and robot races still work, and the answers wait on the device.</li>
        <li>On a shared headset, sign out of your class seat when you finish.</li>
      </ul>
    </>
  );
}

function Indonesian() {
  return (
    <>
      <p className="lead">
        Di beranda, pilih tempat bermain: META QUEST (XR) membuka game di meja nyatamu, KOMPUTER INI dimainkan dengan
        mouse atau sentuhan, dan SMARTBOARD untuk layar besar di depan kelas.
      </p>

      <h2>1. Bermain game</h2>
      <ol>
        <li>
          Pakai headset dan duduk menghadap meja. Game mencari mejanya; tap, atau tunggu beberapa detik, dan buku pop-up
          terbuka di atasnya.
        </li>
        <li>
          Sentuh amplop di meja untuk memilih game, lalu BERLATIH SENDIRI (tanpa waktu) atau LOMBA LAWAN ROBOT (tiga
          gelombang berwaktu).
        </li>
        <li>
          Hewan kertas keluar dari buku membawa soal. Jawab dengan tanganmu: sinar dan titik menunjukkan arah tunjukmu,
          titik hanya menyalakan kartu, dan tap telunjukmu memilihnya. Dengan controller, arahkan lalu tekan trigger. Di
          beberapa ruang soalnya ditulis di papan tulis kelas.
        </li>
      </ol>
      <ul>
        <li>
          <strong>Balloon Burst</strong>: pecahkan balon berisi jawaban yang benar.
        </li>
        <li>
          <strong>Orb Forge</strong>: gabungkan dua kristal yang hasilnya sama dengan angka yang diminta.
        </li>
        <li>
          <strong>Factory Sort</strong>: sentuh gerbang yang dilewati angka itu.
        </li>
        <li>
          <strong>Bridge Builder</strong>: pasang papan yang panjangnya sesuai permintaan.
        </li>
        <li>
          <strong>Balance Gate</strong>: sentuh beban yang membuat timbangan seimbang.
        </li>
        <li>
          <strong>Cari &amp; Ukur</strong>: ukur bangun di meja lalu pilih keliling, luas, rusuk, volume, atau luas
          permukaannya. Hanya dimainkan di headset.
        </li>
      </ul>
      <h2>Cari &amp; Ukur</h2>
      <ol>
        <li>Pilih kelas (untuk tamu), lalu BANGUN DATAR atau BANGUN RUANG, lalu BENDA KERTAS atau BENDA DI SEKITARMU.</li>
        <li>Untuk benda di sekitarmu, pilih kartu benda yang kamu punya (buku, piring, kardus) atau KERTAS untuk memakai benda kertas.</li>
        <li>
          Soal tertulis di papan tulis. Tunjuk sebuah sudut: bulatan muncul. Tap, dan garis mulai dari sana mengikuti
          tanganmu.
        </li>
        <li>
          Tunjuk sudut berikutnya lalu tap: garis dipatenkan dan garis berikutnya dimulai. Persegi dan persegi panjang
          butuh dua sisi di satu sudut, balok butuh tiga rusuk yang saling tegak lurus, dan segitiga ditutup dengan tap
          di sudut pertamanya lagi.
        </li>
        <li>Kalau garisnya cukup, lima jawaban muncul. Pilih satu. Game juga menghitung seberapa tepat kamu mengukur.</li>
        <li>
          Putar bangun kertas dengan kartu panah di kiri, buka datar dengan JARING, dan baca papan dari dekat dengan
          BACA. Tap pin lalu tempat sampah di sampingnya untuk membuangnya; KEMBALI untuk keluar.
        </li>
      </ol>
      <p>
        Jawaban benar membuat hewan pulang dengan gembira dan memberi Folds. Di kelas, guru bisa membuka LOMBA DENGAN
        TEMAN, dan CARI LAWAN memasangkanmu dengan siswa satu tingkat.
      </p>
      <Shot
        src="play-balloons.webp"
        alt="Balloon Burst di headset: hewan kertas dengan soal dan balon di atas buku"
        caption="Balloon Burst di meja nyata: ulurkan tangan dan pecahkan jawaban yang benar."
      />
      <Shot
        src="play-crystals.webp"
        alt="Orb Forge di headset: dua kristal di tangan, digabung menjadi satu angka"
        caption="Orb Forge: ambil dua kristal lalu gabungkan."
      />

      <h2>2. Belajar di Math Edu</h2>
      <ol>
        <li>Buka EDUKASI MATEMATIKA dari beranda. Pilih kelas, lalu topiknya.</li>
        <li>
          Setiap pelajaran adalah lembar kertas yang bergerak langkah demi langkah: lihat, geser, dan amati yang terjadi.
          Tanpa soal dan tanpa skor.
        </li>
        <li>
          Di headset, tekan MASUK VR. Lembarnya berdiri di depanmu seperti panel kertas besar, langkah sebelum dan
          sesudahnya menunggu di kedua sisi, dan angka-angka kertas melayang di sekelilingmu. Tunjuk lalu tarik trigger,
          atau cubit, untuk berpindah langkah.
        </li>
      </ol>
      <Shot
        src="edu-vr.webp"
        alt="Pelajaran Math Edu di VR: lembar kertas besar di depan, langkah berikutnya terlipat di samping"
        caption="Pelajaran Math Edu di sekeliling siswa dalam VR."
      />

      <h2>3. Membangun kota</h2>
      <ol>
        <li>Setiap game memberi Folds. Buka KOTA LIPATKU dari beranda atau dari stiker di samping buku.</li>
        <li>
          Di headset, lahanmu terbentang di meja dan rak toko berdiri di kanannya. Ambil potongan dengan grip atau
          trigger, atau cukup cubit, bawa ke atas lahan lalu lepaskan. Tekan PUTAR sambil membawanya.
        </li>
        <li>
          Bangunan baru butuh waktu untuk terlipat. Jawab soal SELESAIKAN SEKARANG untuk menyelesaikannya seketika. Tunjuk
          bangunan mana pun untuk membuka kartu matematikanya: jendela, luas, keliling, volume, atau bagian lahannya.
        </li>
        <li>
          Setiap keterampilan yang kamu kuasai mendirikan satu landmark di kotamu, dan lahan baru terbuka setelah
          sebagian besar lahanmu terbangun.
        </li>
      </ol>
      <p>
        Di layar, kota yang sama punya rak potongan untuk ditaruh, diputar, dipindah, atau dihapus; potongan yang
        dihapus mengembalikan Folds-nya.
      </p>
      <Shot
        src="town-hand.webp"
        alt="Membangun kota di headset: sebuah rumah di tangan di atas lahan di meja"
        caption="Bawa potongan dari rak ke lahanmu."
      />
      <Shot
        src="town-card.webp"
        alt="Kartu matematika sebuah bangunan di samping buku di headset"
        caption="Setiap bangunan punya kartu matematika."
      />

      <h2>Perlu diketahui</h2>
      <ul>
        <li>Latihan dan lomba robot memberi paling banyak 100 Folds sehari; lomba kelas, ruang, dan CARI LAWAN tanpa batas.</li>
        <li>AKSESIBILITAS di beranda berisi ANGKA BESAR, TANPA WAKTU, KONTRAS TINGGI, BACAKAN SOAL, dan BIDIKAN STABIL.</li>
        <li>Tidak ada jaringan? Latihan dan lomba robot tetap berjalan, dan jawabannya menunggu di perangkat.</li>
        <li>Di headset yang dipakai bergantian, keluar dari kursi kelasmu setelah selesai.</li>
      </ul>
    </>
  );
}

export default function HowToPlay() {
  const [lang, setLang] = useLang();
  return (
    <PaperPage lang={lang} setLang={setLang} title={lang === "id" ? "CARA BERMAIN" : "HOW TO PLAY"}>
      {lang === "id" ? <Indonesian /> : <English />}
    </PaperPage>
  );
}
