# Setup Guide — UnWordle su Azure Static Web App

Questa guida copre **tutto il setup manuale** necessario per pubblicare UnWordle su Azure Static Web App con dominio personalizzato `unwordle.tinyapps.it`.

---

## Indice

1. [Prerequisiti](#1-prerequisiti)
2. [Setup Azure — da fare PRIMA della prima run del workflow](#2-setup-azure--da-fare-prima-della-prima-run-del-workflow)
   - 2.1 Crea il Resource Group
   - 2.2 Crea l'App Registration (identità per GitHub Actions)
   - 2.3 Aggiungi le Federated Credentials (OIDC)
   - 2.4 Assegna il ruolo Contributor
   - 2.5 Recupera i 3 valori per i secrets GitHub
3. [Setup GitHub — Aggiunta dei Secrets](#3-setup-github--aggiunta-dei-secrets)
4. [Prima run: deploy dell'infrastruttura Bicep](#4-prima-run-deploy-dellinfrastruttura-bicep)
5. [Recupera il deployment token SWA (4° secret)](#5-recupera-il-deployment-token-swa-4-secret)
6. [DNS Aruba — Configurazione dominio](#6-dns-aruba--configurazione-dominio)
7. [Firebase — Aggiunta del dominio per Google SSO](#7-firebase--aggiunta-del-dominio-per-google-sso)
8. [Verifica finale](#8-verifica-finale)
9. [Switch finale: redirect su GitHub Pages](#9-switch-finale-redirect-su-github-pages)

---

## 1. Prerequisiti

- Account Microsoft/Azure attivo (retail, non enterprise)
- Accesso al pannello DNS di Aruba per il dominio `tinyapps.it`
- Account GitHub con accesso al repository `andrea-migliaccio/un-wordle`
- Accesso alla Firebase Console del progetto UnWordle
- (Opzionale ma consigliato) **Azure CLI** installata in locale per i comandi shell

### Installare Azure CLI (opzionale)

```bash
# macOS
brew install azure-cli

# Ubuntu/Debian
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Windows — scarica l'installer da:
# https://aka.ms/installazurecliwindows
```

Dopo l'installazione:
```bash
az login
# Si apre il browser, accedi con il tuo account Microsoft retail
```

---

## 2. Setup Azure — da fare PRIMA della prima run del workflow

Il workflow `deploy-infra.yml` usa **OIDC (OpenID Connect)** per autenticarsi su Azure: non c'è nessuna chiave segreta da gestire, GitHub ottiene un token temporaneo ad ogni esecuzione. Per farlo funzionare devi creare un'identità Azure (App Registration) e autorizzarla a parlare con il tuo repository GitHub.

### 2.1 Crea il Resource Group

**Via Azure Portal:**

1. Vai su [portal.azure.com](https://portal.azure.com) e accedi
2. Cerca "Resource groups" nella barra di ricerca in alto
3. Clicca **+ Create**
4. Compila:
   - **Subscription:** la tua sottoscrizione (es. "Azure subscription 1")
   - **Resource group:** `rg-unwordle`
   - **Region:** `West Europe` (Italy North non è supportata da Azure Static Web Apps)
5. Clicca **Review + create** → **Create**

**Via CLI (alternativa):**
```bash
az group create --name rg-unwordle --location westeurope
```

---

### 2.2 Crea l'App Registration (identità per GitHub Actions)

L'App Registration è l'identità che GitHub Actions userà per parlare con Azure.

**Via Azure Portal:**

1. Cerca "Microsoft Entra ID" (o "Azure Active Directory") nella barra di ricerca
2. Nel menu laterale, clicca **App registrations**
3. Clicca **+ New registration**
4. Compila:
   - **Name:** `github-unwordle-actions`
   - **Supported account types:** seleziona "Accounts in this organizational directory only"
   - **Redirect URI:** lascia vuoto
5. Clicca **Register**
6. Sei ora nella pagina dell'App Registration. **Prendi nota di questi due valori** (li userai dopo):
   - **Application (client) ID** → questo è `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → questo è `AZURE_TENANT_ID`

**Via CLI (alternativa):**
```bash
az ad app create --display-name "github-unwordle-actions"
# Prendi nota di "appId" dall'output → AZURE_CLIENT_ID
az account show --query tenantId -o tsv  # → AZURE_TENANT_ID
```

---

### 2.3 Aggiungi le Federated Credentials (OIDC)

Le Federated Credentials dicono ad Azure: "fida di GitHub quando dice di essere il workflow del branch `main` del repository `andrea-migliaccio/un-wordle`".

**Via Azure Portal:**

1. Sei ancora nella pagina dell'App Registration `github-unwordle-actions`
2. Nel menu laterale, clicca **Certificates & secrets**
3. Clicca il tab **Federated credentials**
4. Clicca **+ Add credential**
5. In **Federated credential scenario** seleziona: **GitHub Actions deploying Azure resources**
6. Compila il form:
   - **Organization:** `andrea-migliaccio`
   - **Repository:** `un-wordle`
   - **Entity type:** `Branch`
   - **GitHub branch name:** `main`
   - **Name:** `github-main-branch`
   - **Description:** (opzionale) `GitHub Actions workflow on main branch`
7. Clicca **Add**

> **Nota:** non devi creare nessuna chiave/password. L'OIDC funziona senza segreti condivisi.

**Via CLI (alternativa):**
```bash
APP_ID=$(az ad app list --display-name "github-unwordle-actions" --query "[0].appId" -o tsv)

az ad app federated-credential create --id $APP_ID --parameters '{
  "name": "github-main-branch",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:andrea-migliaccio/un-wordle:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

---

### 2.4 Assegna il ruolo Contributor

L'App Registration deve avere il permesso di creare risorse nel resource group.

**Via Azure Portal:**

1. Cerca "Resource groups" → seleziona `rg-unwordle`
2. Nel menu laterale, clicca **Access control (IAM)**
3. Clicca **+ Add** → **Add role assignment**
4. Tab **Role**: cerca e seleziona `Contributor` → **Next**
5. Tab **Members**:
   - **Assign access to:** `User, group, or service principal`
   - Clicca **+ Select members**
   - Cerca `github-unwordle-actions` → selezionalo → **Select**
6. Clicca **Review + assign** → **Review + assign**

**Via CLI (alternativa):**
```bash
APP_ID=$(az ad app list --display-name "github-unwordle-actions" --query "[0].appId" -o tsv)
SUB_ID=$(az account show --query id -o tsv)

az ad sp create --id $APP_ID

az role assignment create \
  --assignee $APP_ID \
  --role Contributor \
  --scope /subscriptions/$SUB_ID/resourceGroups/rg-unwordle
```

---

### 2.5 Recupera i 3 valori per i secrets GitHub

Hai già i primi due dalla sezione 2.2. Il terzo è l'ID della tua sottoscrizione.

**Via Azure Portal:**

1. Cerca "Subscriptions" nella barra di ricerca
2. Clicca sulla tua sottoscrizione
3. In alto a sinistra vedi **Subscription ID** → questo è `AZURE_SUBSCRIPTION_ID`

**Via CLI (alternativa):**
```bash
az account show --query id -o tsv  # → AZURE_SUBSCRIPTION_ID
```

**Riepilogo dei 3 valori che ti servono:**

| Secret GitHub         | Dove trovarlo                                      |
|-----------------------|----------------------------------------------------|
| `AZURE_CLIENT_ID`     | App Registration → Overview → Application (client) ID |
| `AZURE_TENANT_ID`     | App Registration → Overview → Directory (tenant) ID   |
| `AZURE_SUBSCRIPTION_ID` | Subscriptions → la tua sub → Subscription ID     |

---

## 3. Setup GitHub — Aggiunta dei Secrets

1. Vai su `https://github.com/andrea-migliaccio/un-wordle`
2. Clicca su **Settings** (tab in alto)
3. Menu laterale → **Secrets and variables** → **Actions**
4. Clicca **New repository secret** per ognuno dei seguenti:

| Nome secret             | Valore                          |
|-------------------------|---------------------------------|
| `AZURE_CLIENT_ID`       | (da 2.5)                        |
| `AZURE_TENANT_ID`       | (da 2.5)                        |
| `AZURE_SUBSCRIPTION_ID` | (da 2.5)                        |

> Il quarto secret (`AZURE_STATIC_WEB_APPS_API_TOKEN`) lo aggiungerai dopo il primo deploy Bicep — vedi sezione 5.

---

## 4. Prima run: deploy dell'infrastruttura Bicep

Una volta aggiunti i 3 secrets, il workflow `deploy-infra.yml` si attiverà automaticamente ad ogni push su `main` che modifica `infra/**`.

Per il primo deploy:

1. Assicurati di aver committato tutti i file della cartella `infra/`
2. Fai push su `main`
3. Vai su **GitHub → Actions** → cerca il workflow **"Deploy Azure Infrastructure (Bicep)"**
4. Verifica che il job sia verde ✅

Se il job fallisce, controlla i log per errori comuni:
- `AuthorizationFailed`: il ruolo Contributor non è stato assegnato correttamente (ripeti 2.4)
- `InvalidResourceLocation`: Azure Static Web Apps non supporta tutte le region — le disponibili sono `westus2`, `centralus`, `eastus2`, `westeurope`, `eastasia`. I file Bicep usano già `westeurope`.

> **Nota sul custom domain:** il resource Bicep `customDomains` potrebbe fallire al primo deploy se il record DNS non è ancora configurato. È normale — vedi sezione 6. Puoi commentare temporaneamente il blocco `resource domain` in `main.bicep`, fare il primo deploy, configurare il DNS, poi ripristinarlo.

---

## 5. Recupera il deployment token SWA (4° secret)

Il deployment token è il "pass" che il workflow `deploy-swa.yml` usa per caricare i file nella Static Web App. Si ottiene dopo che la SWA è stata creata da Bicep.

**Via Azure Portal:**

1. Cerca "Static Web Apps" → seleziona `swa-unwordle`
2. Nel menu laterale, clicca **Manage deployment token**
3. Copia il token (lunga stringa alfanumerica)

**Via CLI (alternativa):**
```bash
az staticwebapp secrets list \
  --name swa-unwordle \
  --resource-group rg-unwordle \
  --query "properties.apiKey" -o tsv
```

**Aggiungilo come secret GitHub:**

1. Vai su GitHub → Settings → Secrets and variables → Actions
2. **New repository secret**:
   - Nome: `AZURE_STATIC_WEB_APPS_API_TOKEN`
   - Valore: il token copiato

Ora puoi fare il primo deploy dell'app:
- Fai un push su `main` che tocca un file in `js/**`, `css/**`, `index.html` o `favicon.svg`
- Oppure vai su **GitHub → Actions → "Deploy to Azure Static Web App"** → **Run workflow**

---

## 6. DNS Aruba — Configurazione dominio

### Fase 1 — Verifica ownership del dominio

Azure richiede di dimostrare che possiedi il dominio prima di attivarlo sulla SWA.
Il metodo più semplice è un record **TXT** di validazione.

**Ottieni il token di validazione:**

1. Vai su Azure Portal → Static Web Apps → `swa-unwordle`
2. Nel menu laterale, clicca **Custom domains**
3. Clicca **+ Add** → inserisci `unwordle.tinyapps.it` → **Next**
4. Azure mostra un record TXT di validazione, tipo:
   ```
   Type:  TXT
   Name:  unwordle
   Value: <token-di-validazione-azure>
   ```
   Copia il valore del token.

**Configura il record su Aruba:**

1. Accedi al pannello di controllo Aruba
2. Vai su **Domini** → `tinyapps.it` → **Gestione DNS**
3. Aggiungi un nuovo record:
   - **Tipo:** `TXT`
   - **Nome/Host:** `unwordle`
   - **Valore:** incolla il token di validazione di Azure
   - **TTL:** `300`
4. Salva

Attendi 5–15 minuti per la propagazione DNS, poi torna su Azure e clicca **Validate** (o Azure lo farà automaticamente).

### Fase 2 — Record CNAME definitivo

Una volta che Azure ha verificato il dominio, aggiungi il CNAME che fa puntare il tuo sottodominio alla SWA.

L'hostname di default della tua SWA è visibile su Azure Portal → Static Web Apps → `swa-unwordle` → Overview → **URL**.
Sarà nella forma `swa-unwordle.azurestaticapps.net` (il prefisso potrebbe avere un numero aggiunto, tipo `swa-unwordle.4.azurestaticapps.net` — controlla il valore esatto).

**Su Aruba:**

1. Pannello DNS → Aggiungi nuovo record:
   - **Tipo:** `CNAME`
   - **Nome/Host:** `unwordle`
   - **Valore/Target:** `<hostname-esatto-da-azure>.azurestaticapps.net`
   - **TTL:** `300`
2. Salva

> **Nota:** se hai già messo il record TXT per la validazione, puoi tenerlo — non interferisce.

Attendi 5–30 minuti. Poi visita `https://unwordle.tinyapps.it` — dovresti vedere l'app con HTTPS attivo (certificato TLS gestito automaticamente da Azure).

---

## 7. Firebase — Aggiunta del dominio per Google SSO

Senza questo step, il login con Google mostrerà un errore `auth/unauthorized-domain`.

1. Vai su [Firebase Console](https://console.firebase.google.com) → seleziona il progetto UnWordle
2. Nel menu laterale, clicca **Authentication**
3. Clicca il tab **Settings**
4. Sezione **Authorized domains** → clicca **Add domain**
5. Inserisci: `unwordle.tinyapps.it`
6. Clicca **Add**

Niente altro da fare — Firebase aggiorna le regole OAuth immediatamente.

---

## 8. Verifica finale

Dopo aver completato tutti i passi, verifica che tutto funzioni:

1. Apri `https://unwordle.tinyapps.it` nel browser
2. Verifica che HTTPS sia attivo (lucchetto verde)
3. Clicca "Sign in with Google" → deve aprire il popup OAuth e completare il login
4. Gioca una partita → le statistiche devono salvarsi su Firestore
5. Verifica che la navigazione tra date funzioni correttamente

---

## 9. Switch finale: redirect su GitHub Pages

Quando sei pronto a sostituire GitHub Pages con la pagina di redirect (file `redirect/index.html`):

1. Apri `.github/workflows/deploy.yml`
2. Trova la sezione **Upload artifact**:
   ```yaml
   - name: Upload artifact
     uses: actions/upload-pages-artifact@v3
     with:
       path: .
   ```
3. Cambia `path: .` in `path: redirect`:
   ```yaml
   - name: Upload artifact
     uses: actions/upload-pages-artifact@v3
     with:
       path: redirect
   ```
4. Rimuovi o commenta lo step **Minify JavaScript** (non serve più per la pagina di redirect)
5. Committa e pusha → GitHub Pages mostrerà la pagina di redirect

Per disattivare completamente GitHub Pages in futuro: GitHub repo → Settings → Pages → Source → seleziona "None".
