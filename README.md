copilot --resume=0c1c2424-d835-4fef-8bd4-d02bbddae568

# Sviluppo locale

```bash
cd wordle
python3 -m http.server 8000
```

Poi apri http://localhost:8000

> Ricorda di aggiungere `localhost` tra gli **Authorized domains** in Firebase Console → Authentication → Settings → Authorized domains, altrimenti il login Google darà errore in locale.


# Setup ultime parole del mese precedente

## 1. Scarica le ultime 30 parole (o passa un numero diverso)
./scripts/fetch-words.sh 30

## 2. Carica su Firestore (riusa firebase-admin già installato nelle functions)
SERVICE_ACCOUNT=../sa-key.json node scripts/upload-words.js

