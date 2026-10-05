import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";

import { AREAS, loadLesson, ready, topic } from "../edu/catalog";
import type { Lesson } from "../edu/ink";
import { EduNav } from "../edu/nav";
import { Sheet } from "../edu/sheet";
import { useLang } from "../legal";
import "../edu/edu.css";
import { GAME } from "../game-link";

export function meta() {
  return [{ title: "Math Edu - Numeria Arena" }];
}

const TEXT = {
  en: {
    all: "ALL LESSONS",
    grade: (g: number) => `Grade ${g}`,
    back: "BACK",
    next: "NEXT",
    of: (i: number, n: number) => `${i} of ${n}`,
    step: (i: number) => `Step ${i}`,
    full: "FULL SCREEN",
    leave: "LEAVE FULL SCREEN",
    vr: "ENTER VR",
    vrBusy: "Opening VR...",
    vrFailed: "VR could not start on this device.",
    exit: "EXIT VR",
    game: "PRACTISE IN THE GAME",
    missing: "This lesson is not made yet.",
    loading: "Unfolding the lesson...",
  },
  id: {
    all: "SEMUA PELAJARAN",
    grade: (g: number) => `Kelas ${g}`,
    back: "KEMBALI",
    next: "LANJUT",
    of: (i: number, n: number) => `${i} dari ${n}`,
    step: (i: number) => `Langkah ${i}`,
    full: "LAYAR PENUH",
    leave: "KELUAR LAYAR PENUH",
    vr: "MASUK VR",
    vrBusy: "Membuka VR...",
    vrFailed: "VR belum bisa dibuka di perangkat ini.",
    exit: "KELUAR VR",
    game: "LATIHAN DI GAME",
    missing: "Pelajaran ini belum dibuat.",
    loading: "Membuka lipatan pelajaran...",
  },
};

/** Whether this browser can step into VR; in development, `?xr=emulate` brings a pretend headset. */
async function canVr() {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("xr") === "emulate") {
    const [{ XRDevice, metaQuest3 }, { DevUI }] = await Promise.all([import("iwer"), import("@iwer/devui")]);
    const device = new XRDevice(metaQuest3);
    device.installRuntime({ forceInstall: true });
    device.installDevUI(DevUI);
    (window as unknown as { xrDevice: unknown }).xrDevice = device;
  }
  try {
    return Boolean(await navigator.xr?.isSessionSupported("immersive-vr"));
  } catch {
    return false;
  }
}

export default function EduLesson() {
  const { id = "" } = useParams();
  const [lang, setLang] = useLang();
  const t = TEXT[lang];
  const info = topic(id);
  const [lesson, setLesson] = useState<Lesson>();
  const [step, setStep] = useState(0);
  const [vr, setVr] = useState<"no" | "yes" | "busy" | "in" | "failed">("no");
  const [full, setFull] = useState(false);
  const book = useRef<HTMLElement>(null);
  const endVr = useRef<() => void>(null);

  useEffect(() => {
    setLesson(undefined);
    setStep(0);
    if (ready(id)) loadLesson(id).then(setLesson);
  }, [id]);
  useEffect(() => {
    canVr().then((ok) => {
      if (!ok) return;
      setVr("yes");
      // Ready before the press, so the headset opens within the press's own moment.
      import("../edu/vr");
    });
    const changed = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);

  const steps = lesson?.steps ?? [];
  const last = steps.length - 1;
  const scene = useMemo(() => steps[step]?.scene(lang), [lesson, step, lang]);
  const go = (to: number) => setStep(Math.max(0, Math.min(last, to)));

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (vr === "in" || (e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(step + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(step - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const enterVr = async () => {
    if (!lesson || !info) return;
    setVr("busy");
    try {
      const { openVr } = await import("../edu/vr");
      endVr.current = await openVr({
        lesson,
        lang,
        title: info.title[lang],
        step,
        words: { back: t.back, next: t.next, exit: t.exit, of: t.of },
        onStep: setStep,
        onEnd: () => {
          endVr.current = null;
          setVr("yes");
        },
      });
      setVr("in");
    } catch {
      setVr("failed");
    }
  };

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else book.current?.requestFullscreen?.();
  };

  if (!info) {
    return (
      <main className="paper-page edu">
        <EduNav lang={lang} setLang={setLang} back={{ href: "/edu/", label: t.all }} />
        <article className="paper-sheet">
          <p>{t.missing}</p>
        </article>
      </main>
    );
  }

  const say = steps[step]?.say[lang] ?? "";
  return (
    <main className="paper-page edu">
      <EduNav lang={lang} setLang={setLang} back={{ href: `/edu/?grade=${info.grade}`, label: t.all }}>
        {vr !== "no" && vr !== "failed" && (
          <button type="button" className="paper-chip edu-vr" disabled={vr === "busy" || !lesson} onClick={vr === "in" ? () => endVr.current?.() : enterVr}>
            {vr === "busy" ? t.vrBusy : vr === "in" ? t.exit : t.vr}
          </button>
        )}
      </EduNav>
      <article className={full ? "edu-book full" : "edu-book"} ref={book}>
        <header className="edu-head">
          <p className="soft">
            {t.grade(info.grade)} · {AREAS[info.area][lang]}
          </p>
          <h1>{info.title[lang]}</h1>
          {vr === "failed" && (
            <p className="err" role="alert">
              {t.vrFailed}
            </p>
          )}
        </header>
        {!ready(id) ? (
          <p className="edu-say">{t.missing}</p>
        ) : !lesson || !scene ? (
          <p className="edu-say soft">{t.loading}</p>
        ) : (
          <>
            <ol className="edu-steps">
              {steps.map((_, i) => (
                <li key={i}>
                  <button type="button" className={i === step ? "on" : i < step ? "seen" : undefined} aria-current={i === step ? "step" : undefined} aria-label={t.step(i + 1)} onClick={() => go(i)}>
                    {i + 1}
                  </button>
                </li>
              ))}
            </ol>
            <div className="edu-fold" key={`${step}-${lang}`}>
              <Sheet scene={scene} label={say} />
            </div>
            <p className="edu-say" aria-live="polite">
              {say}
            </p>
            <div className="edu-controls">
              <button type="button" className="btn" disabled={step === 0} onClick={() => go(step - 1)}>
                {t.back}
              </button>
              <span className="soft">{t.of(step + 1, steps.length)}</span>
              {step < last ? (
                <button type="button" className="btn blue" onClick={() => go(step + 1)}>
                  {t.next}
                </button>
              ) : (
                <a className="btn blue" href={GAME}>
                  {t.game}
                </a>
              )}
              <button type="button" className="btn small edu-full" onClick={toggleFull}>
                {full ? t.leave : t.full}
              </button>
            </div>
          </>
        )}
      </article>
    </main>
  );
}
