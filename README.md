# Caffeina

PWA personale per registrare il consumo giornaliero di caffeina: target con anello di progresso, aggiunta rapida, diario, statistiche. Nessuna dipendenza esterna, nessun server: i dati restano nel browser del dispositivo.

## Struttura

| File | Cosa fa |
| --- | --- |
| `index.html` | Markup delle tre sezioni (Oggi, Statistiche, Impostazioni), fogli di aggiunta/modifica, conferme, esportazione |
| `app.css` | Stile, tema chiaro/scuro automatico, layout da telefono |
| `app.js` | Logica: persistenza, calcoli, grafici SVG, navigazione, installazione |
| `sw.js` | Service worker: cache dell'app per l'uso offline e banner di aggiornamento |
| `manifest.webmanifest` | Manifest PWA (nome, icone, colore, avvio a schermo intero) |
| `icons/` | Icona SVG + PNG 192/512, maskable, apple-touch-icon |

## Pubblicazione su GitHub Pages

1. Crea un repository (per esempio `caffeina`) e carica **tutti** i file di questa cartella nella radice, inclusa la cartella `icons/`.
2. Settings → Pages → *Build and deployment*: Source **Deploy from a branch**, Branch **main**, cartella **/ (root)**, Save.
3. Dopo un minuto l'app è su `https://<tuo-utente>.github.io/caffeina/`. Tutti i percorsi sono relativi (`./`), quindi funziona anche in una sottocartella.

### Installazione sul telefono

- **iPhone**: apri l'indirizzo in Safari → Condividi → *Aggiungi alla schermata Home*. Dall'icona si apre a schermo intero, funziona offline e i dati non sono soggetti alla cancellazione automatica di Safari dopo 7 giorni di inattività (che vale solo per i siti usati nel browser).
- **Android / desktop Chrome**: in Impostazioni compare il pulsante *Installa l'app* (oppure menu del browser → *Installa app*).

### Aggiornare l'app

Quando modifichi un file, cambia `VERSION` in `sw.js` (per esempio `caffeina-v1.0.1`) e fai il commit. Alla successiva apertura l'app scarica la nuova versione in background e mostra il banner *Nuova versione disponibile → Aggiorna*. Se non cambi `VERSION`, i dispositivi che hanno già l'app continuano a usare i file in cache.

## Dati

- Tutto in `localStorage`, due chiavi: `caffeina:settings` e `caffeina:entries`. Ogni assunzione pesa circa 150 byte: dieci anni a 5 assunzioni al giorno restano sotto i 3 MB (limite tipico: 5 MB).
- Ogni assunzione salva una copia di nome e mg della voce al momento della registrazione: modificare o eliminare una voce nelle impostazioni non riscrive il diario.
- **Backup JSON** (Impostazioni → Dati): è il formato per spostare i dati su un altro telefono o dopo una reinstallazione. L'import offre *Unisci* (aggiunge solo le voci con id non ancora presenti, lascia le impostazioni) o *Sostituisci tutto* (rimpiazza diario e impostazioni).
- **CSV** (separatore `;`, codifica UTF-8 con BOM, si apre direttamente in Excel/Numbers): `id;data;ora;voce;quantita;mg;nota`. Serve per l'analisi, non per il ripristino.
- La giornata va da mezzanotte a mezzanotte in ora locale.

## Valori predefiniti di caffeina (modificabili in Impostazioni)

| Voce | mg | Base |
| --- | ---: | --- |
| Compressa di caffeina | 200 | dosaggio tipico degli integratori |
| Espresso al bar | 80 | valore medio EFSA per una tazzina; intervallo reale circa 50–100 mg secondo miscela ed estrazione |
| Caffè in capsula | 60 | media per capsula espresso 40 ml (Nespresso Original dichiara 50–130 mg; le miscele comuni stanno intorno a 60–75 mg) |
| Tazzina di moka | 100 | valore medio citato dall'EFSA; le stime pubblicate vanno da 60 a 150 mg |
| Caffè americano | 95 | tazza da 240 ml di caffè filtro secondo USDA FoodData Central (EFSA: circa 90 mg per 200 ml) |

Target predefinito 400 mg/giorno (EFSA 2015: fino a 400 mg/giorno e 200 mg per singola dose non destano preoccupazioni negli adulti sani; 200 mg/giorno in gravidanza e allattamento). Le stime "in circolo" usano un decadimento esponenziale con emivita 5 ore (modificabile): sono indicative, l'emivita individuale varia molto.

## Statistiche disponibili

Periodo selezionabile (7/14/30/90 giorni, tutto): media al giorno (su tutti i giorni e sui soli giorni con consumo), giorni sopra il target, giorno più alto, giorni consecutivi entro il target, numero di assunzioni, dose media; totale per giorno (grafico con linea del target); media giornaliera per fascia oraria (mattina 6–12, pomeriggio 12–18, sera 18–24, notte 0–6); profilo per ora del giorno; ripartizione per tipo; media per giorno della settimana; orario medio della prima e dell'ultima assunzione, intervallo medio, ora di picco; tabella delle giornate con dettaglio e modifica delle singole voci.

## Sviluppo

Non serve alcuna build: apri `index.html` da un server statico (`python3 -m http.server` nella cartella) per provare il service worker in locale. `window.CaffeinaCore` espone le funzioni di calcolo pure (`computeStats`, `activeAt`, ...) per test in Node.
