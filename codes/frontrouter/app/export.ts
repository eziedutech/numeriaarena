/**
 * Saving what a teacher sees without a library: a page laid out for paper,
 * printed from a hidden frame so the browser's print can keep it as a PDF,
 * and a small .xlsx built here (a zip of a few XML files, stored as is).
 */

export const esc = (s: string) =>
  s.replace(/[&<>"']/gu, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const PAPER = `
body { font: 11pt/1.45 system-ui, "Segoe UI", sans-serif; color: #2b2418; margin: 18mm 16mm; }
h1 { font-size: 16pt; margin: 0 0 2mm; }
h2 { font-size: 12pt; margin: 6mm 0 2mm; }
p.soft { color: #6b5d45; font-size: 9.5pt; margin: 0 0 4mm; }
ul { margin: 0 0 2mm; padding-left: 6mm; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
th, td { border: 0.3mm solid #c9b98f; padding: 1.5mm 2mm; text-align: left; vertical-align: top; }
th { background: #f1e3c4; }
td.num, th.num { text-align: right; }
@page { size: A4; margin: 0; }
`;

/** Opens the browser's print for `body`, whose "Save as PDF" makes the file. */
export function printPage(title: string, body: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) return frame.remove();
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PAPER}</style></head><body>${body}</body></html>`);
  doc.close();
  win.onafterprint = () => setTimeout(() => frame.remove(), 100);
  // A frame that never prints is cleared anyway.
  setTimeout(() => frame.isConnected && frame.remove(), 120_000);
  setTimeout(() => {
    win.focus();
    win.print();
  }, 50);
}

export function saveBlob(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

let crcTable: Uint32Array | undefined;
function crc32(data: Uint8Array) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of data) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip with every file stored, not compressed: enough for a small sheet. */
function zip(files: [string, string][]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const path = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // names in UTF-8
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, path.length, true);
    parts.push(new Uint8Array(local.buffer), path, data);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, data.length, true);
    dir.setUint16(28, path.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), path);
    offset += 30 + path.length + data.length;
  }
  const size = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const column = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** One sheet, the first row bold as its heading; numbers stay numbers. */
export function saveXlsx(name: string, sheet: string, rows: (string | number)[][]) {
  const x = (s: string) => esc(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, "");
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          const at = `${column(c)}${r + 1}`;
          const style = r === 0 ? ' s="1"' : "";
          return typeof v === "number"
            ? `<c r="${at}"${style}><v>${v}</v></c>`
            : `<c r="${at}" t="inlineStr"${style}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  const widths = (rows[0] ?? [])
    .map((_, c) => {
      const w = Math.min(60, Math.max(6, ...rows.map((row) => String(row[c] ?? "").length + 2)));
      return `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`;
    })
    .join("");
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  saveBlob(
    name,
    zip([
      [
        "[Content_Types].xml",
        `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
      ],
      [
        "_rels/.rels",
        `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ],
      [
        "xl/workbook.xml",
        `${head}<workbook ${ns} xmlns:r="${rel}"><sheets><sheet name="${x(sheet.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ],
      [
        "xl/_rels/workbook.xml.rels",
        `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
      ],
      [
        "xl/styles.xml",
        `${head}<styleSheet ${ns}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
      ],
      ["xl/worksheets/sheet1.xml", `${head}<worksheet ${ns}><cols>${widths}</cols><sheetData>${body}</sheetData></worksheet>`],
    ]),
  );
}
