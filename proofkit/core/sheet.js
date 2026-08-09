/**
 * Read a people roster out of a spreadsheet, in the browser, with no dependencies.
 *
 * WHY THIS EXISTS RATHER THAN A LIBRARY
 * The dashboards are plain ES modules served as files — no bundler, no npm at runtime — and the
 * extension's CSP forbids loading anything from a CDN. A parser is the only way an .xlsx can be
 * read here at all. It is also far less parser than it sounds: we need four columns of text out of
 * one sheet, not the format.
 *
 * .xlsx is a ZIP of XML. The zip is read by hand — local file headers only, no central directory —
 * because that is enough to find two entries, and DecompressionStream does the actual inflating.
 * CSV is handled too, because "Save as CSV" is the escape hatch when a file will not open.
 */

/** Read a zip entry by name. Returns '' when it is not there. */
async function unzipEntry(buf, wanted) {
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const dec = new TextDecoder();
  let i = 0;
  while (i + 30 <= bytes.length) {
    if (dv.getUint32(i, true) !== 0x04034b50) break;          // local file header signature
    const method = dv.getUint16(i + 8, true);
    const compSize = dv.getUint32(i + 18, true);
    const nameLen = dv.getUint16(i + 26, true);
    const extraLen = dv.getUint16(i + 28, true);
    const name = dec.decode(bytes.subarray(i + 30, i + 30 + nameLen));
    const dataAt = i + 30 + nameLen + extraLen;
    if (name === wanted) {
      const raw = bytes.subarray(dataAt, dataAt + compSize);
      if (method === 0) return dec.decode(raw);               // stored
      const ds = new DecompressionStream('deflate-raw');
      const out = new Response(new Blob([raw]).stream().pipeThrough(ds));
      return dec.decode(await out.arrayBuffer());
    }
    i = dataAt + compSize;
  }
  return '';
}

const unesc = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Every <t> inside an <si> joined — a shared string can be split across runs. */
function sharedStrings(xml) {
  const out = [];
  for (const si of xml.split('<si>').slice(1)) {
    const chunk = si.split('</si>')[0];
    let text = '';
    for (const m of chunk.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += m[1];
    out.push(unesc(text));
  }
  return out;
}

const colOf = (ref) => {
  const letters = String(ref).replace(/[0-9]/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;                                               // A -> 0
};

/** Sheet XML -> array of row arrays of strings. */
function sheetRows(xml, strings) {
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cm of rm[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[1], inner = cm[2];
      const ref = (attrs.match(/r="([A-Z]+[0-9]+)"/) || [])[1] || '';
      const type = (attrs.match(/t="([^"]+)"/) || [])[1] || '';
      let v = '';
      if (type === 'inlineStr') {
        for (const t of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) v += t[1];
        v = unesc(v);
      } else {
        const raw = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
        v = type === 's' ? (strings[+raw] || '') : unesc(raw);
      }
      const at = ref ? colOf(ref) : cells.length;
      while (cells.length < at) cells.push('');
      cells[at] = v;
    }
    rows.push(cells);
  }
  return rows;
}

/** CSV, quotes and embedded commas/newlines included. */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const src = String(text).replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** File -> rows. Picks the parser from the extension, falling back to CSV. */
export async function readSheet(file) {
  const name = String(file.name || '').toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCsv(await file.text());
  const buf = await file.arrayBuffer();
  const strings = sharedStrings(await unzipEntry(buf, 'xl/sharedStrings.xml'));
  const sheet = await unzipEntry(buf, 'xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('That file has no readable sheet. Save it as .xlsx or .csv and try again.');
  return sheetRows(sheet, strings);
}

/**
 * Rows -> { people, teams, problems }.
 *
 * Headers are matched by MEANING, not by position, so a column order that drifts from the template
 * still imports — and a sheet missing a required column says which one rather than importing
 * everybody with a blank name.
 */
export function rosterFromRows(rows) {
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  const WANT = {
    name: ['employeename', 'name', 'fullname'],
    email: ['mailid', 'email', 'emailid', 'mail'],
    team: ['team', 'department', 'dept'],
    called: ['onename', 'preferredname', 'preferredtobecalled', 'callas', 'nickname'],
  };
  const headAt = rows.findIndex((r) => r.some((c) => WANT.email.includes(norm(c))));
  if (headAt < 0) throw new Error('No header row found. It needs a column named Mail id or Email.');

  const head = rows[headAt].map(norm);
  const idx = {};
  for (const key of Object.keys(WANT)) idx[key] = head.findIndex((h) => WANT[key].includes(h));
  for (const key of ['name', 'email', 'team']) {
    if (idx[key] < 0) throw new Error(`The sheet has no ${key === 'email' ? 'Mail id' : key === 'name' ? 'Employee Name' : 'Team'} column.`);
  }

  const people = [], problems = [], seen = new Set();
  const teams = [];
  rows.slice(headAt + 1).forEach((r, i) => {
    const at = headAt + i + 2;                                 // the row number a person sees
    const get = (k) => (idx[k] >= 0 ? String(r[idx[k]] || '').trim() : '');
    const name = get('name'), email = get('email').toLowerCase(), team = get('team');
    if (!name && !email && !team) return;                      // blank spacer row — the template invites these
    if (/^example/i.test(name)) return;                        // the template's own sample row
    if (!email) { problems.push(`Row ${at}: no email.`); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { problems.push(`Row ${at}: "${email}" is not an email address.`); return; }
    if (seen.has(email)) { problems.push(`Row ${at}: ${email} appears more than once.`); return; }
    if (!name) { problems.push(`Row ${at}: ${email} has no name.`); return; }
    if (!team) { problems.push(`Row ${at}: ${email} has no team.`); return; }
    seen.add(email);
    if (!teams.includes(team)) teams.push(team);
    people.push({ email, name, calledName: get('called'), team, role: 'member', extraTeams: [] });
  });

  return { people, teams, problems };
}
