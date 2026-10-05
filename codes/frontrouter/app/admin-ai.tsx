import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

import { api, errorCode } from "./auth";
import type { Lang } from "./legal";

/**
 * The admin's AI page: providers (any OpenAI-compatible API or Amazon
 * Bedrock) with keys the server seals and never shows again, which provider
 * and model each task tries in turn, the monthly budget, and the latest calls
 * (never what was said in them).
 */

interface Provider {
  code: string;
  label: string;
  kind: "openai" | "bedrock";
  base_url: string;
  has_key: boolean;
  key_tail: string;
  student_data: boolean;
  active: boolean;
  last_test: { ok: boolean; latency_ms?: number; model?: string; models?: number; error?: string; at?: string } | null;
  tasks: string[];
}

interface Link {
  provider: string;
  model: string;
  max_tokens: number;
  temperature?: number | null;
  /** Micro-USD for a million tokens. */
  price_in: number;
  price_out: number;
}

interface Overview {
  master_key: boolean;
  providers: Provider[];
  tasks: { code: string; student_data: boolean; chain: Link[] }[];
  budget: { monthly: number; spent: number };
}

interface Call {
  id: number;
  task: string;
  provider: string;
  model: string;
  cost: number | null;
  reserved: number;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  outcome: string;
  detail: string | null;
  at: string;
}

const TEXT = {
  en: {
    title: "AI",
    note: "Every AI call goes through the server. Keys are sealed on the server and never shown again. Tasks made from students' answers only go to providers ticked for student data.",
    noMaster: "AI_MASTER_KEY is not set on the server, so no key can be kept and AI stays off.",
    budget: "Budget this month",
    spent: (s: string, b: string, p: number) => `${s} of ${b} USD used (${p}%)`,
    newBudget: "New monthly budget, USD",
    reason: "Reason",
    saveBudget: "SAVE BUDGET",
    providers: "Providers",
    none: "No provider yet. Without one, AI features say they are off.",
    add: "ADD PROVIDER",
    edit: "EDIT",
    del: "DELETE",
    test: "TEST",
    testModel: "Model to try (needed when the provider has no model list)",
    key: (tail: string) => (tail ? `key ...${tail}` : "key kept"),
    noKey: "no key",
    student: "may take student data",
    noStudent: "no student data",
    off: "off",
    usedBy: "used by",
    tested: "last test",
    ok: "worked",
    failed: "failed",
    models: (n: number) => `${n} models`,
    tasks: "Tasks",
    taskNames: { class_insight: "AI insights for a class's teacher" } as Record<string, string>,
    needsStudent: "Made from students' answers: only providers ticked for student data.",
    link: (n: number) => (n === 0 ? "First" : `Backup ${n}`),
    provider: "Provider",
    model: "Model id, exactly as the provider lists it",
    maxTokens: "Max tokens",
    priceIn: "USD a million tokens in",
    priceOut: "USD a million tokens out",
    addLink: "ADD BACKUP",
    remove: "REMOVE",
    saveChain: "SAVE",
    noAi: "No provider: this task stays off.",
    calls: "Latest calls",
    noCalls: "No calls yet.",
    form: { add: "Add a provider", edit: "Change a provider" },
    code: "Code (lowercase, cannot change later)",
    label: "Name",
    kind: "Kind",
    kinds: { openai: "OPENAI-COMPATIBLE", bedrock: "AMAZON BEDROCK" },
    url: "Base URL",
    urlHint: { openai: "for example https://api.fireworks.ai/inference/v1", bedrock: "for example https://bedrock-runtime.us-east-1.amazonaws.com (with a Bedrock API key)" },
    apiKey: "API key",
    keepKey: "Leave empty to keep the key it has",
    studentData: "May it take data made from students' answers?",
    yes: "YES",
    no: "NO",
    active: "On",
    save: "SAVE",
    cancel: "CANCEL",
    confirmDel: (p: string) => `Delete ${p}? Its sealed key is deleted too.`,
    saved: "Saved.",
    errors: {
      ai_code: "The code needs 2 to 32 lowercase letters, digits, - or _.",
      ai_label: "Give it a name.",
      ai_url: "The URL must start with https:// (http only for localhost).",
      ai_key: "That key is too long.",
      ai_master_key: "AI_MASTER_KEY is not set or does not open this key.",
      ai_provider_in_use: "A task still uses this provider. Take it out of the task first.",
      ai_model: "Give the model id.",
      ai_max_tokens: "Max tokens is 16 to 64000.",
      ai_price: "Check the prices.",
      ai_student_data: "This task is made from students' answers: pick a provider ticked for student data.",
      ai_budget_value: "Check the budget.",
      ai_no_key: "This provider has no key yet.",
      reason: "Give a reason of at least 3 characters.",
      not_admin: "This account is not an admin.",
      offline: "No connection. Try again.",
    } as Record<string, string>,
    error: "Something went wrong",
  },
  id: {
    title: "AI",
    note: "Setiap panggilan AI lewat server. Kunci disegel di server dan tidak pernah ditampilkan lagi. Tugas dari jawaban siswa hanya dikirim ke penyedia yang dicentang boleh menerima data siswa.",
    noMaster: "AI_MASTER_KEY belum diatur di server, jadi kunci tidak bisa disimpan dan AI tetap mati.",
    budget: "Anggaran bulan ini",
    spent: (s: string, b: string, p: number) => `${s} dari ${b} USD terpakai (${p}%)`,
    newBudget: "Anggaran bulanan baru, USD",
    reason: "Alasan",
    saveBudget: "SIMPAN ANGGARAN",
    providers: "Penyedia",
    none: "Belum ada penyedia. Tanpa penyedia, fitur AI menyatakan dirinya mati.",
    add: "TAMBAH PENYEDIA",
    edit: "UBAH",
    del: "HAPUS",
    test: "UJI",
    testModel: "Model untuk dicoba (perlu bila penyedia tidak punya daftar model)",
    key: (tail: string) => (tail ? `kunci ...${tail}` : "kunci tersimpan"),
    noKey: "tanpa kunci",
    student: "boleh menerima data siswa",
    noStudent: "tanpa data siswa",
    off: "mati",
    usedBy: "dipakai",
    tested: "uji terakhir",
    ok: "berhasil",
    failed: "gagal",
    models: (n: number) => `${n} model`,
    tasks: "Tugas",
    taskNames: { class_insight: "Wawasan AI untuk guru kelas" } as Record<string, string>,
    needsStudent: "Dibuat dari jawaban siswa: hanya penyedia yang dicentang boleh menerima data siswa.",
    link: (n: number) => (n === 0 ? "Utama" : `Cadangan ${n}`),
    provider: "Penyedia",
    model: "ID model, persis seperti daftar penyedia",
    maxTokens: "Token maksimum",
    priceIn: "USD per sejuta token masuk",
    priceOut: "USD per sejuta token keluar",
    addLink: "TAMBAH CADANGAN",
    remove: "BUANG",
    saveChain: "SIMPAN",
    noAi: "Tanpa penyedia: tugas ini tetap mati.",
    calls: "Panggilan terakhir",
    noCalls: "Belum ada panggilan.",
    form: { add: "Tambah penyedia", edit: "Ubah penyedia" },
    code: "Kode (huruf kecil, tidak bisa diubah nanti)",
    label: "Nama",
    kind: "Jenis",
    kinds: { openai: "OPENAI-COMPATIBLE", bedrock: "AMAZON BEDROCK" },
    url: "Base URL",
    urlHint: { openai: "misalnya https://api.fireworks.ai/inference/v1", bedrock: "misalnya https://bedrock-runtime.us-east-1.amazonaws.com (dengan kunci API Bedrock)" },
    apiKey: "Kunci API",
    keepKey: "Kosongkan untuk tetap memakai kunci yang ada",
    studentData: "Boleh menerima data dari jawaban siswa?",
    yes: "YA",
    no: "TIDAK",
    active: "Aktif",
    save: "SIMPAN",
    cancel: "BATAL",
    confirmDel: (p: string) => `Hapus ${p}? Kunci tersegelnya ikut terhapus.`,
    saved: "Tersimpan.",
    errors: {
      ai_code: "Kode perlu 2 sampai 32 huruf kecil, angka, - atau _.",
      ai_label: "Beri nama.",
      ai_url: "URL harus diawali https:// (http hanya untuk localhost).",
      ai_key: "Kunci terlalu panjang.",
      ai_master_key: "AI_MASTER_KEY belum diatur atau tidak membuka kunci ini.",
      ai_provider_in_use: "Masih ada tugas yang memakai penyedia ini. Keluarkan dulu dari tugasnya.",
      ai_model: "Isi ID model.",
      ai_max_tokens: "Token maksimum 16 sampai 64000.",
      ai_price: "Periksa harganya.",
      ai_student_data: "Tugas ini dibuat dari jawaban siswa: pilih penyedia yang boleh menerima data siswa.",
      ai_budget_value: "Periksa anggarannya.",
      ai_no_key: "Penyedia ini belum punya kunci.",
      reason: "Isi alasan paling sedikit 3 karakter.",
      not_admin: "Akun ini bukan admin.",
      offline: "Tidak ada koneksi. Coba lagi.",
    } as Record<string, string>,
    error: "Terjadi kesalahan",
  },
};

type T = (typeof TEXT)["en"];

const usd = (micro: number) => (micro / 1_000_000).toFixed(2);
const perMillion = (micro: number) => String(micro / 1_000_000);
const toMicro = (s: string) => Math.round(Number(s.replace(",", ".")) * 1_000_000);

function Err({ t, code }: { t: T; code: string }) {
  if (!code) return null;
  return (
    <p className="err" role="alert">
      {t.errors[code] ?? `${t.error} (${code})`}
    </p>
  );
}

function YesNo({ t, value, onChange, label }: { t: T; value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="tabs" role="group" aria-label={label}>
      {[true, false].map((v) => (
        <button key={String(v)} type="button" className={v === value ? "tab on" : "tab"} aria-pressed={v === value} onClick={() => onChange(v)}>
          {v ? t.yes : t.no}
        </button>
      ))}
    </div>
  );
}

export function AdminAi({ lang, user }: { lang: Lang; user: User }) {
  const t = TEXT[lang];
  const [data, setData] = useState<Overview | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Provider | "new" | null>(null);
  const [deleting, setDeleting] = useState<Provider | null>(null);

  const load = () => {
    api<Overview>(user, "/admin/ai").then(setData, (e) => setError(errorCode(e)));
    api<Call[]>(user, "/admin/ai/calls").then(setCalls, () => undefined);
  };
  useEffect(load, [user]);

  if (!data) {
    return (
      <section className="paper-sheet" aria-busy={!error}>
        <Err t={t} code={error} />
        {!error && <div className="skel wide" />}
      </section>
    );
  }

  return (
    <>
      <section className="paper-sheet ai-admin">
        <h2>{t.title}</h2>
        <p className="soft">{t.note}</p>
        {!data.master_key && <p className="err">{t.noMaster}</p>}
        <Budget t={t} user={user} budget={data.budget} onSaved={setData} />
      </section>

      <section className="paper-sheet ai-admin">
        <h2>{t.providers}</h2>
        <Err t={t} code={error} />
        {data.providers.length === 0 && <p>{t.none}</p>}
        {data.providers.map((p) => (
          <ProviderRow key={p.code} t={t} user={user} p={p} onEdit={() => setEditing(p)} onDelete={() => setDeleting(p)} onTested={load} />
        ))}
        <div className="actions">
          <button type="button" className="btn small" onClick={() => setEditing("new")} disabled={!data.master_key}>
            {t.add}
          </button>
        </div>
      </section>

      <section className="paper-sheet ai-admin">
        <h2>{t.tasks}</h2>
        {data.tasks.map((task) => (
          <Chain key={task.code} t={t} user={user} task={task} providers={data.providers} onSaved={setData} />
        ))}
      </section>

      <section className="paper-sheet ai-admin">
        <h2>{t.calls}</h2>
        {calls.length === 0 ? (
          <p>{t.noCalls}</p>
        ) : (
          <div className="ai-calls">
            <table className="past-table">
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id}>
                    <td>{c.at}</td>
                    <td>{c.task}</td>
                    <td>
                      {c.provider} · {c.model}
                    </td>
                    <td>{c.outcome}</td>
                    <td>{c.tokens_in != null ? `${c.tokens_in} / ${c.tokens_out}` : ""}</td>
                    <td>{usd(c.cost ?? c.reserved)} USD</td>
                    <td>{c.latency_ms != null ? `${(c.latency_ms / 1000).toFixed(1)} s` : ""}</td>
                    <td className="soft">{c.detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <ProviderForm
          t={t}
          user={user}
          p={editing === "new" ? null : editing}
          onClose={(next) => {
            setEditing(null);
            if (next) setData(next);
          }}
        />
      )}
      {deleting && (
        <div className="veil" role="dialog" aria-modal="true" aria-label={t.del} onClick={(e) => e.target === e.currentTarget && setDeleting(null)}>
          <DeleteCard
            t={t}
            user={user}
            p={deleting}
            onClose={(next) => {
              setDeleting(null);
              if (next) setData(next);
            }}
          />
        </div>
      )}
    </>
  );
}

function Budget({ t, user, budget, onSaved }: { t: T; user: User; budget: Overview["budget"]; onSaved: (o: Overview) => void }) {
  const [amount, setAmount] = useState(usd(budget.monthly));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const share = budget.monthly > 0 ? Math.min(100, Math.round((budget.spent / budget.monthly) * 100)) : 100;
  return (
    <div className="ai-budget">
      <h3>{t.budget}</h3>
      <div className={`ai-bar${share >= 80 ? " warn" : ""}`} role="img" aria-label={t.spent(usd(budget.spent), usd(budget.monthly), share)}>
        <span style={{ width: `${share}%` }} />
      </div>
      <p>{t.spent(usd(budget.spent), usd(budget.monthly), share)}</p>
      <label className="field-label" htmlFor="ai-budget">
        {t.newBudget}
      </label>
      <input id="ai-budget" className="field short" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <label className="field-label" htmlFor="ai-budget-reason">
        {t.reason}
      </label>
      <input id="ai-budget-reason" className="field" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      <Err t={t} code={error} />
      <div className="actions">
        <button
          type="button"
          className="btn small"
          disabled={busy}
          onClick={() => {
            const monthly = toMicro(amount);
            if (!Number.isFinite(monthly) || monthly < 0) return setError("ai_budget_value");
            setBusy(true);
            setError("");
            api<Overview>(user, "/admin/ai/budget", { method: "PUT", body: JSON.stringify({ monthly, reason }) })
              .then((o) => {
                setReason("");
                onSaved(o);
              })
              .catch((e) => setError(errorCode(e)))
              .finally(() => setBusy(false));
          }}
        >
          {t.saveBudget}
        </button>
      </div>
    </div>
  );
}

function ProviderRow({ t, user, p, onEdit, onDelete, onTested }: { t: T; user: User; p: Provider; onEdit: () => void; onDelete: () => void; onTested: () => void }) {
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const test = p.last_test;
  return (
    <article className="org">
      <div className="org-main">
        <strong>
          {p.label} <span className="soft">({p.code})</span>
        </strong>
        <span>
          {t.kinds[p.kind]} · {p.base_url}
        </span>
        <span>
          {p.has_key ? t.key(p.key_tail) : t.noKey} · {p.student_data ? t.student : t.noStudent}
          {p.active ? "" : ` · ${t.off}`}
          {p.tasks.length > 0 ? ` · ${t.usedBy} ${p.tasks.join(", ")}` : ""}
        </span>
        {test && (
          <span className="soft">
            {t.tested} {test.at ?? ""} UTC: {test.ok ? t.ok : t.failed}
            {test.latency_ms != null ? `, ${test.latency_ms} ms` : ""}
            {test.models != null ? `, ${t.models(test.models)}` : ""}
            {test.model ? `, ${test.model}` : ""}
            {test.error ? `. ${test.error}` : ""}
          </span>
        )}
        <label className="field-label" htmlFor={`ai-test-${p.code}`}>
          {t.testModel}
        </label>
        <input id={`ai-test-${p.code}`} className="field" value={model} list={`ai-models-${p.code}`} onChange={(e) => setModel(e.target.value)} />
        <datalist id={`ai-models-${p.code}`}>
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {models.length > 0 && <span className="soft ai-models">{models.join(", ")}</span>}
        <Err t={t} code={error} />
      </div>
      <div className="org-actions">
        <button
          type="button"
          className="btn small"
          disabled={busy || !p.has_key}
          onClick={() => {
            setBusy(true);
            setError("");
            api<{ models?: string[] }>(user, `/admin/ai/providers/${p.code}/test`, { method: "POST", body: JSON.stringify({ model: model || null }) })
              .then((r) => {
                setModels(r.models ?? []);
                onTested();
              })
              .catch((e) => setError(errorCode(e)))
              .finally(() => setBusy(false));
          }}
        >
          {t.test}
        </button>
        <button type="button" className="btn small" onClick={onEdit}>
          {t.edit}
        </button>
        <button type="button" className="btn small suspended" onClick={onDelete}>
          {t.del}
        </button>
      </div>
    </article>
  );
}

function ProviderForm({ t, user, p, onClose }: { t: T; user: User; p: Provider | null; onClose: (next: Overview | null) => void }) {
  const [code, setCode] = useState(p?.code ?? "");
  const [label, setLabel] = useState(p?.label ?? "");
  const [kind, setKind] = useState<Provider["kind"]>(p?.kind ?? "openai");
  const [url, setUrl] = useState(p?.base_url ?? "");
  const [key, setKey] = useState("");
  const [studentData, setStudentData] = useState(p?.student_data ?? false);
  const [active, setActive] = useState(p?.active ?? true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="veil" role="dialog" aria-modal="true" aria-label={p ? t.form.edit : t.form.add} onClick={(e) => e.target === e.currentTarget && onClose(null)}>
      <div className="paper-sheet narrow">
        <h2 className="dialog-title">{p ? t.form.edit : t.form.add}</h2>
        <label className="field-label" htmlFor="ai-code">
          {t.code}
        </label>
        <input id="ai-code" className="field" value={code} disabled={Boolean(p)} maxLength={32} onChange={(e) => setCode(e.target.value.toLowerCase())} autoFocus={!p} />
        <label className="field-label" htmlFor="ai-label">
          {t.label}
        </label>
        <input id="ai-label" className="field" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        <span className="field-label">{t.kind}</span>
        <div className="tabs" role="group" aria-label={t.kind}>
          {(["openai", "bedrock"] as const).map((k) => (
            <button key={k} type="button" className={k === kind ? "tab on" : "tab"} aria-pressed={k === kind} onClick={() => setKind(k)}>
              {t.kinds[k]}
            </button>
          ))}
        </div>
        <label className="field-label" htmlFor="ai-url">
          {t.url}
        </label>
        <input id="ai-url" className="field" value={url} maxLength={300} placeholder={t.urlHint[kind]} onChange={(e) => setUrl(e.target.value)} />
        <label className="field-label" htmlFor="ai-key">
          {t.apiKey}
        </label>
        <input id="ai-key" className="field" type="password" autoComplete="off" value={key} placeholder={p?.has_key ? t.keepKey : ""} onChange={(e) => setKey(e.target.value)} />
        <span className="field-label">{t.studentData}</span>
        <YesNo t={t} value={studentData} onChange={setStudentData} label={t.studentData} />
        <span className="field-label">{t.active}</span>
        <YesNo t={t} value={active} onChange={setActive} label={t.active} />
        <Err t={t} code={error} />
        <div className="actions">
          <button type="button" className="btn" onClick={() => onClose(null)}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn blue"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              api<Overview>(user, "/admin/ai/providers", {
                method: "POST",
                body: JSON.stringify({ code, label, kind, base_url: url, key, student_data: studentData, active }),
              })
                .then(onClose)
                .catch((e) => {
                  setBusy(false);
                  setError(errorCode(e));
                });
            }}
          >
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteCard({ t, user, p, onClose }: { t: T; user: User; p: Provider; onClose: (next: Overview | null) => void }) {
  const [error, setError] = useState("");
  return (
    <div className="paper-sheet narrow">
      <h2 className="dialog-title">{t.confirmDel(p.label)}</h2>
      <Err t={t} code={error} />
      <div className="actions">
        <button type="button" className="btn" onClick={() => onClose(null)}>
          {t.cancel}
        </button>
        <button
          type="button"
          className="btn suspended"
          onClick={() =>
            api<Overview>(user, `/admin/ai/providers/${p.code}`, { method: "DELETE" })
              .then(onClose)
              .catch((e) => setError(errorCode(e)))
          }
        >
          {t.del}
        </button>
      </div>
    </div>
  );
}

/** A link as the form holds it: prices typed in USD. */
interface Draft {
  provider: string;
  model: string;
  max_tokens: string;
  price_in: string;
  price_out: string;
}

function Chain({ t, user, task, providers, onSaved }: { t: T; user: User; task: Overview["tasks"][number]; providers: Provider[]; onSaved: (o: Overview) => void }) {
  const allowed = providers.filter((p) => !task.student_data || p.student_data);
  const fromLinks = () =>
    task.chain.map((l) => ({ provider: l.provider, model: l.model, max_tokens: String(l.max_tokens), price_in: perMillion(l.price_in), price_out: perMillion(l.price_out) }));
  const [drafts, setDrafts] = useState<Draft[]>(fromLinks);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => setDrafts(fromLinks()), [task]);
  const change = (i: number, d: Partial<Draft>) => {
    setSaved(false);
    setDrafts(drafts.map((x, j) => (j === i ? { ...x, ...d } : x)));
  };
  return (
    <div className="ai-task">
      <h3>{t.taskNames[task.code] ?? task.code}</h3>
      {task.student_data && <p className="soft">{t.needsStudent}</p>}
      {drafts.length === 0 && <p>{t.noAi}</p>}
      {drafts.map((d, i) => (
        <div key={i} className="ai-link">
          <span className="field-label">{t.link(i)}</span>
          <div className="tabs" role="group" aria-label={t.provider}>
            {allowed.map((p) => (
              <button key={p.code} type="button" className={p.code === d.provider ? "tab on" : "tab"} aria-pressed={p.code === d.provider} onClick={() => change(i, { provider: p.code })}>
                {p.label}
              </button>
            ))}
          </div>
          <label className="field-label" htmlFor={`ai-model-${task.code}-${i}`}>
            {t.model}
          </label>
          <input id={`ai-model-${task.code}-${i}`} className="field" value={d.model} list={`ai-models-${d.provider}`} onChange={(e) => change(i, { model: e.target.value })} />
          <div className="ai-numbers">
            <label>
              <span className="field-label">{t.maxTokens}</span>
              <input className="field short" inputMode="numeric" value={d.max_tokens} onChange={(e) => change(i, { max_tokens: e.target.value })} />
            </label>
            <label>
              <span className="field-label">{t.priceIn}</span>
              <input className="field short" inputMode="decimal" value={d.price_in} onChange={(e) => change(i, { price_in: e.target.value })} />
            </label>
            <label>
              <span className="field-label">{t.priceOut}</span>
              <input className="field short" inputMode="decimal" value={d.price_out} onChange={(e) => change(i, { price_out: e.target.value })} />
            </label>
          </div>
          <button type="button" className="btn small" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>
            {t.remove}
          </button>
        </div>
      ))}
      <Err t={t} code={error} />
      {saved && <p className="soft">{t.saved}</p>}
      <div className="actions">
        {drafts.length < 3 && allowed.length > 0 && (
          <button
            type="button"
            className="btn small"
            onClick={() => setDrafts([...drafts, { provider: allowed[0].code, model: "", max_tokens: "8000", price_in: "0", price_out: "0" }])}
          >
            {t.addLink}
          </button>
        )}
        <button
          type="button"
          className="btn small blue"
          onClick={() => {
            setError("");
            const chain = drafts.map((d) => ({
              provider: d.provider,
              model: d.model.trim(),
              max_tokens: Number(d.max_tokens),
              price_in: toMicro(d.price_in || "0"),
              price_out: toMicro(d.price_out || "0"),
            }));
            if (chain.some((l) => !Number.isFinite(l.price_in) || !Number.isFinite(l.price_out))) return setError("ai_price");
            api<Overview>(user, `/admin/ai/tasks/${task.code}`, { method: "PUT", body: JSON.stringify({ chain }) })
              .then((o) => {
                setSaved(true);
                onSaved(o);
              })
              .catch((e) => setError(errorCode(e)));
          }}
        >
          {t.saveChain}
        </button>
      </div>
    </div>
  );
}
