// Télécharge les 3 fichiers sources depuis doozan/spanish_data (CC-BY-4.0
// avec attribution par fichier, voir README.md de ce dossier) dans
// ./data/ — pas commités dans le dépôt (voir .gitignore), à retélécharger
// si besoin plutôt que de garder ~60 Mo de données tierces sous git.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

const FILES = ['frequency.csv', 'es-en.data', 'sentences.tsv'];
const BASE_URL = 'https://raw.githubusercontent.com/doozan/spanish_data/master/';

async function downloadFile(name) {
  const dest = path.join(DATA_DIR, name);
  if (fs.existsSync(dest)) {
    console.log(`✓ ${name} déjà présent, pas retéléchargé (supprime le fichier pour forcer).`);
    return;
  }
  console.log(`↓ Téléchargement de ${name}...`);
  const res = await fetch(BASE_URL + name);
  if (!res.ok) throw new Error(`Échec du téléchargement de ${name} : HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
  console.log(`✓ ${name} (${(buffer.length / 1_000_000).toFixed(1)} Mo)`);
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const file of FILES) {
    await downloadFile(file);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
