#!/usr/bin/env node
// scripts/upload-words.js
// Reads words.json and uploads each entry to Firestore words/{date} collection.
//
// Prerequisites:
//   cd scripts && npm install firebase-admin   (or reuse functions/node_modules)
//
// Usage:
//   SERVICE_ACCOUNT=/path/to/sa-key.json node scripts/upload-words.js
//   SERVICE_ACCOUNT=/path/to/sa-key.json node scripts/upload-words.js scripts/words.json

const admin  = require(process.env.ADMIN_MODULE || '../functions/node_modules/firebase-admin');
const fs     = require('fs');
const path   = require('path');

const saKeyPath = (process.env.SERVICE_ACCOUNT || '').replace(/^~/, process.env.HOME || '');
if (!saKeyPath) {
  console.error('ERROR: set SERVICE_ACCOUNT=/path/to/sa-key.json');
  process.exit(1);
}

const wordsFile = process.argv[2] || path.join(__dirname, 'words.json');
if (!fs.existsSync(wordsFile)) {
  console.error('ERROR: words.json not found at', wordsFile);
  console.error('Run ./scripts/fetch-words.sh first.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(fs.readFileSync(saKeyPath, 'utf8')))
});

const db    = admin.firestore();
const words = JSON.parse(fs.readFileSync(wordsFile, 'utf8'));
const dates = Object.keys(words);

console.log(`Uploading ${dates.length} words to Firestore words/ collection...`);

async function upload() {
  const batch_size = 20; // Firestore max batch size is 500, keep it small for safety
  let uploaded = 0;
  let failed   = 0;

  for (let i = 0; i < dates.length; i += batch_size) {
    const batch = db.batch();
    const chunk = dates.slice(i, i + batch_size);

    for (const date of chunk) {
      const { word, puzzleId } = words[date];
      const ref = db.collection('words').doc(date);
      batch.set(ref, {
        word,
        puzzleId,
        fetchedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    try {
      await batch.commit();
      chunk.forEach(d => console.log(`  ✓  ${d} → ${words[d].word}`));
      uploaded += chunk.length;
    } catch (err) {
      console.error(`  ✗  Batch ${i}-${i + batch_size} failed:`, err.message);
      failed += chunk.length;
    }
  }

  console.log(`\nDone: ${uploaded} uploaded, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

upload().catch(err => { console.error(err); process.exit(1); });
