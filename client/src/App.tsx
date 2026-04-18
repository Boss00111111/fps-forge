import { useCallback, useEffect, useMemo, useState } from "react";

type Tab = "dashboard" | "boost" | "steam" | "cleanup" | "security" | "about";
type Plan = "balanced" | "high" | "ultimate";
type Language = "en" | "de" | "bs" | "fr" | "it";

type Translation = {
  navDashboard: string;
  navBoost: string;
  navSteam: string;
  navCleanup: string;
  navAbout: string;
  languageLabel: string;
  heroTitle: string;
  heroText: string;
  running: string;
  oneClickBoost: string;
  desktopOnly: string;
  desktopHint: string;
  ramStatus: string;
  usedLabel: string;
  loading: string;
  cores: string;
  uptime: string;
  tempQuickLook: string;
  tempEntries: string;
  openTempFolder: string;
  quickTempClean: string;
  topProcesses: string;
  noData: string;
  boostControls: string;
  boostHint: string;
  boostHintNoUltimate: string;
  setHigh: string;
  setUltimate: string;
  ultimateUnsupported: string;
  fallbackHighWarning: string;
  restoreBalanced: string;
  closeBackground: string;
  flushDns: string;
  steamMode: string;
  steamHint: string;
  runSteamMode: string;
  openSteamOnly: string;
  cleanupTools: string;
  cleanupHint: string;
  cleanTemp: string;
  flushDnsCache: string;
  closeTrackedApps: string;
  aboutTitle: string;
  aboutText1: string;
  aboutText2: string;
  confirmTempClean: string;
  actionStarted: (name: string) => string;
  actionError: (name: string, err: string) => string;
  actionPowerPlan: string;
  actionTempCleanup: string;
  actionDnsFlush: string;
  actionBackgroundCleanup: string;
  actionOneClickBoost: string;
  actionSteamMode: string;
  powerPlanSet: (plan: Plan) => string;
  genericError: string;
  tempCleanupDone: (deleted: number, failed: number) => string;
  dnsDone: string;
  backgroundDone: (closed: number, attempted: number, names: string) => string;
  backgroundFailed: string;
  gameBoostFailed: string;
  gameBoostDone: (deleted: number, dnsOk: boolean, closed: number) => string;
  steamModeFailed: string;
  steamLaunched: string;
  steamLaunchFail: string;
  steamModeDone: (launch: string, deleted: number, closed: number) => string;
  licenseTitle: string;
  licenseSubtitle: string;
  licenseKeyLabel: string;
  licensePlaceholder: string;
  licenseActivate: string;
  licenseActivating: string;
  licenseMachineHint: string;
  licenseCopyId: string;
  licenseError: string;
  licenseApiMissing: string;
  licenseServerHint: string;
  licenseServerLabel: string;
  licenseServerPlaceholder: string;
  licenseServerSave: string;
  licenseServerSaved: string;
  licenseServerBadUrl: string;
  licenseOffline: string;
  licenseKeyOnlyHint: string;
};

const LANG_STORAGE_KEY = "fpsforge.language";

const languages: Array<{ value: Language; label: string }> = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "bs", label: "Bosanski" },
  { value: "fr", label: "Francais" },
  { value: "it", label: "Italiano" },
];

const translations: Record<Language, Translation> = {
  en: {
    navDashboard: "Dashboard",
    navBoost: "Game Boost",
    navSteam: "Stream Mode",
    navCleanup: "Cleanup",
    navAbout: "About",
    languageLabel: "Language",
    heroTitle: "Modern Gaming Boost Center",
    heroText:
      "Inspired by popular boosters: one-click optimize, high-performance power mode, cleanup, and Stream workflow.",
    running: "Running...",
    oneClickBoost: "One-click Boost",
    desktopOnly: "Desktop mode only",
    desktopHint: "Run the project via Electron with `npm run dev` from the root folder.",
    ramStatus: "RAM Status",
    usedLabel: "Used",
    loading: "Loading...",
    cores: "Cores",
    uptime: "Uptime",
    tempQuickLook: "Temp quick look",
    tempEntries: "Temp entries",
    openTempFolder: "Open TEMP folder",
    quickTempClean: "Quick temp clean",
    topProcesses: "Top memory processes",
    noData: "No data.",
    boostControls: "Game Boost Controls",
    boostHint: "Recommended order: High/Ultimate plan, cleanup, DNS flush, then launch your game.",
    boostHintNoUltimate: "Recommended order: High plan, cleanup, DNS flush, then launch your game.",
    setHigh: "Set High Performance",
    setUltimate: "Set Ultimate Performance",
    ultimateUnsupported: "Ultimate plan is not supported on this system.",
    fallbackHighWarning: "Ultimate unsupported on this PC. High Performance applied.",
    restoreBalanced: "Restore Balanced",
    closeBackground: "Close Background Apps",
    flushDns: "Flush DNS",
    steamMode: "Stream Mode",
    steamHint:
      "Balances OBS and game priorities for smoother streaming and less in-game stutter.",
    runSteamMode: "Run Stream Mode",
    openSteamOnly: "Open Stream Tools",
    cleanupTools: "Cleanup Tools",
    cleanupHint: "Use this after long sessions or before ranked matches.",
    cleanTemp: "Clean temp files",
    flushDnsCache: "Flush DNS cache",
    closeTrackedApps: "Close tracked background apps",
    aboutTitle: "About FPS Forge",
    aboutText1:
      "The app optimizes Windows resources without overclocking: power plan, cleanup, and launcher workflow.",
    aboutText2:
      "Tip: keep GPU drivers updated and use an in-game FPS cap your monitor can handle.",
    confirmTempClean:
      "Delete files in the TEMP root folder? Tip: close launchers before cleaning.",
    actionStarted: (name) => `${name} started...`,
    actionError: (name, err) => `${name} error: ${err}`,
    actionPowerPlan: "Power plan",
    actionTempCleanup: "Temp cleanup",
    actionDnsFlush: "DNS flush",
    actionBackgroundCleanup: "Background cleanup",
    actionOneClickBoost: "One-click game boost",
    actionSteamMode: "Stream mode",
    powerPlanSet: (plan) => `Power plan set: ${plan}.`,
    genericError: "Error.",
    tempCleanupDone: (deleted, failed) =>
      `Temp cleanup complete. Deleted ${deleted}, skipped ${failed}.`,
    dnsDone: "DNS cache flushed.",
    backgroundDone: (closed, attempted, names) =>
      `Closed ${closed}/${attempted} processes: ${names}.`,
    backgroundFailed: "Background cleanup failed.",
    gameBoostFailed: "Game boost failed.",
    gameBoostDone: (deleted, dnsOk, closed) =>
      `Boost complete: temp ${deleted} deleted, DNS ${dnsOk ? "OK" : "FAIL"}, background ${closed} closed.`,
    steamModeFailed: "Stream mode failed.",
    steamLaunched: "OBS/Game balance applied",
    steamLaunchFail: "Stream balance failed",
    steamModeDone: (launch, deleted, closed) =>
      `${launch}. Temp ${deleted}, background closed ${closed}.`,
    licenseTitle: "Activate FPS Forge",
    licenseSubtitle: "One license key works on one PC only. Enter your purchase key.",
    licenseKeyLabel: "License key",
    licensePlaceholder: "FFG-XXXX-XXXX-XXXX-XXXX",
    licenseActivate: "Activate",
    licenseActivating: "Activating...",
    licenseMachineHint: "Machine ID (support / debugging)",
    licenseCopyId: "Copy machine ID",
    licenseError: "Activation failed. Check key, internet, or license server.",
    licenseApiMissing:
      "License API URL is not configured. Set env FPSFORGE_LICENSE_API or create %AppData%/FPS Forge/license-api.json with {\"apiBase\":\"https://your-server\"}.",
    licenseServerHint:
      "If it says the server is offline: paste the HTTPS address your seller gave you (Render / Discord / email), click Save, then Activate again.",
    licenseServerLabel: "License server URL",
    licenseServerPlaceholder: "https://your-service.onrender.com",
    licenseServerSave: "Save server URL",
    licenseServerSaved: "Saved. Click Activate again.",
    licenseServerBadUrl: "URL must start with https:// (or http://localhost for testing).",
    licenseOffline:
      "Cannot reach the license server. Check your internet, paste the correct URL below, or wait ~60s if the host was sleeping (free hosting).",
    licenseKeyOnlyHint: "Enter your purchase key below — the server is already configured in this build.",
  },
  de: {
    navDashboard: "Dashboard",
    navBoost: "Spiel Boost",
    navSteam: "Stream Modus",
    navCleanup: "Bereinigung",
    navAbout: "Info",
    languageLabel: "Sprache",
    heroTitle: "Modernes Gaming-Boost-Center",
    heroText:
      "Inspiriert von beliebten Boostern: One-Click-Optimierung, High-Performance-Modus, Cleanup und Stream-Workflow.",
    running: "Laeuft...",
    oneClickBoost: "One-Click Boost",
    desktopOnly: "Nur Desktop-Modus",
    desktopHint: "Starte das Projekt mit Electron ueber `npm run dev` im Root-Ordner.",
    ramStatus: "RAM Status",
    usedLabel: "Belegt",
    loading: "Laedt...",
    cores: "Kerne",
    uptime: "Laufzeit",
    tempQuickLook: "TEMP Schnellansicht",
    tempEntries: "TEMP Eintraege",
    openTempFolder: "TEMP-Ordner oeffnen",
    quickTempClean: "Schnelles TEMP-Cleanup",
    topProcesses: "Top Speicherprozesse",
    noData: "Keine Daten.",
    boostControls: "Game Boost Steuerung",
    boostHint:
      "Empfohlene Reihenfolge: High/Ultimate Plan, Cleanup, DNS Flush, dann Spiel starten.",
    boostHintNoUltimate:
      "Empfohlene Reihenfolge: High Plan, Cleanup, DNS Flush, dann Spiel starten.",
    setHigh: "High Performance setzen",
    setUltimate: "Ultimate Performance setzen",
    ultimateUnsupported: "Ultimate-Plan wird auf diesem System nicht unterstuetzt.",
    fallbackHighWarning: "Ultimate nicht verfuegbar. High Performance wurde gesetzt.",
    restoreBalanced: "Balanced wiederherstellen",
    closeBackground: "Hintergrund-Apps schliessen",
    flushDns: "DNS leeren",
    steamMode: "Stream Modus",
    steamHint:
      "Balanciert OBS- und Spiel-Prioritaeten fuer fluesigeres Streaming und weniger Ruckler im Spiel.",
    runSteamMode: "Stream Modus starten",
    openSteamOnly: "Stream-Tools oeffnen",
    cleanupTools: "Cleanup Tools",
    cleanupHint: "Nach langen Sessions oder vor Ranked-Matches nutzen.",
    cleanTemp: "TEMP-Dateien bereinigen",
    flushDnsCache: "DNS-Cache leeren",
    closeTrackedApps: "Verfolgte Hintergrund-Apps schliessen",
    aboutTitle: "Ueber FPS Forge",
    aboutText1:
      "Die App optimiert Windows-Ressourcen ohne Overclocking: Energieplan, Cleanup und Launcher-Workflow.",
    aboutText2:
      "Tipp: GPU-Treiber aktuell halten und ein FPS-Limit setzen, das dein Monitor sauber darstellen kann.",
    confirmTempClean:
      "Dateien im TEMP-Root-Ordner loeschen? Tipp: Vorher Launcher schliessen.",
    actionStarted: (name) => `${name} gestartet...`,
    actionError: (name, err) => `${name} Fehler: ${err}`,
    actionPowerPlan: "Energieplan",
    actionTempCleanup: "TEMP Cleanup",
    actionDnsFlush: "DNS Flush",
    actionBackgroundCleanup: "Hintergrund Cleanup",
    actionOneClickBoost: "One-Click Game Boost",
    actionSteamMode: "Stream Modus",
    powerPlanSet: (plan) => `Energieplan gesetzt: ${plan}.`,
    genericError: "Fehler.",
    tempCleanupDone: (deleted, failed) =>
      `TEMP Cleanup fertig. Geloescht ${deleted}, uebersprungen ${failed}.`,
    dnsDone: "DNS-Cache geleert.",
    backgroundDone: (closed, attempted, names) =>
      `${closed}/${attempted} Prozesse geschlossen: ${names}.`,
    backgroundFailed: "Hintergrund-Cleanup fehlgeschlagen.",
    gameBoostFailed: "Game Boost fehlgeschlagen.",
    gameBoostDone: (deleted, dnsOk, closed) =>
      `Boost fertig: temp ${deleted} geloescht, DNS ${dnsOk ? "OK" : "FAIL"}, Hintergrund ${closed} geschlossen.`,
    steamModeFailed: "Stream Modus fehlgeschlagen.",
    steamLaunched: "OBS/Game Balance angewendet",
    steamLaunchFail: "Stream Balance fehlgeschlagen",
    steamModeDone: (launch, deleted, closed) =>
      `${launch}. Temp ${deleted}, Hintergrund geschlossen ${closed}.`,
    licenseTitle: "FPS Forge aktivieren",
    licenseSubtitle: "Ein Lizenzschluessel = ein PC. Gib deinen Kauf-Key ein.",
    licenseKeyLabel: "Lizenzschluessel",
    licensePlaceholder: "FFG-XXXX-XXXX-XXXX-XXXX",
    licenseActivate: "Aktivieren",
    licenseActivating: "Aktiviere...",
    licenseMachineHint: "Maschinen-ID (Support)",
    licenseCopyId: "Maschinen-ID kopieren",
    licenseError: "Aktivierung fehlgeschlagen. Key, Internet oder Server pruefen.",
    licenseApiMissing:
      "License-API fehlt. Setze FPSFORGE_LICENSE_API oder license-api.json in %AppData%/FPS Forge mit {\"apiBase\":\"https://...\"}.",
    licenseServerHint:
      "Bei 'offline': HTTPS-URL vom Verkaeufer einfuegen, speichern, dann erneut aktivieren.",
    licenseServerLabel: "License-Server-URL",
    licenseServerPlaceholder: "https://dein-service.onrender.com",
    licenseServerSave: "URL speichern",
    licenseServerSaved: "Gespeichert. Activate erneut klicken.",
    licenseServerBadUrl: "Nur https:// oder http://localhost zum Testen.",
    licenseOffline:
      "License-Server nicht erreichbar. Internet pruefen, URL unten einfuegen, oder ~60s warten (Free-Hosting).",
    licenseKeyOnlyHint: "Nur Kaufschluessel eingeben — Server ist in diesem Build fest eingetragen.",
  },
  bs: {
    navDashboard: "Dashboard",
    navBoost: "Game Boost",
    navSteam: "Stream Mod",
    navCleanup: "Ciscenje",
    navAbout: "O app",
    languageLabel: "Jezik",
    heroTitle: "Moderni Gaming Boost Centar",
    heroText:
      "Inspirisano popularnim boosterima: one-click optimizacija, high-performance mod, cleanup i Stream workflow.",
    running: "Pokrecem...",
    oneClickBoost: "One-click Boost",
    desktopOnly: "Samo desktop mod",
    desktopHint: "Pokreni projekat kroz Electron komandu `npm run dev` iz root foldera.",
    ramStatus: "RAM Status",
    usedLabel: "Zauzeto",
    loading: "Ucitavanje...",
    cores: "Jezgre",
    uptime: "Uptime",
    tempQuickLook: "Brzi TEMP pregled",
    tempEntries: "TEMP stavke",
    openTempFolder: "Otvori TEMP folder",
    quickTempClean: "Brzo TEMP ciscenje",
    topProcesses: "Top procesi po memoriji",
    noData: "Nema podataka.",
    boostControls: "Game Boost kontrole",
    boostHint: "Predlozeni redoslijed: High/Ultimate plan, cleanup, DNS flush pa pokreni igru.",
    boostHintNoUltimate: "Predlozeni redoslijed: High plan, cleanup, DNS flush pa pokreni igru.",
    setHigh: "Postavi High Performance",
    setUltimate: "Postavi Ultimate Performance",
    ultimateUnsupported: "Ultimate plan nije podrzan na ovom sistemu.",
    fallbackHighWarning: "Ultimate nije dostupan. Aktiviran je High Performance.",
    restoreBalanced: "Vrati Balanced",
    closeBackground: "Zatvori background appove",
    flushDns: "Flush DNS",
    steamMode: "Stream Mod",
    steamHint: "Balansira OBS i game prioritete za glađi stream i manje stuttera u igri.",
    runSteamMode: "Pokreni Stream Mod",
    openSteamOnly: "Otvori stream alate",
    cleanupTools: "Cleanup alati",
    cleanupHint: "Koristi nakon duzeg gaming sessiona ili prije ranked meca.",
    cleanTemp: "Ocisti temp fajlove",
    flushDnsCache: "Ocisti DNS cache",
    closeTrackedApps: "Zatvori pracene background appove",
    aboutTitle: "O FPS Forge",
    aboutText1:
      "App optimizira Windows resurse bez overclocka: power plan, cleanup i launcher workflow.",
    aboutText2:
      "Savjet: drzi GPU drivere azurnim i koristi in-game FPS cap koji monitor moze stabilno pratiti.",
    confirmTempClean:
      "Obrisati fajlove u TEMP root folderu? Savjet: zatvori launchere prije ciscenja.",
    actionStarted: (name) => `${name} pokrenut...`,
    actionError: (name, err) => `${name} greska: ${err}`,
    actionPowerPlan: "Power plan",
    actionTempCleanup: "Temp cleanup",
    actionDnsFlush: "DNS flush",
    actionBackgroundCleanup: "Background cleanup",
    actionOneClickBoost: "One-click game boost",
    actionSteamMode: "Stream mode",
    powerPlanSet: (plan) => `Aktiviran power plan: ${plan}.`,
    genericError: "Greska.",
    tempCleanupDone: (deleted, failed) =>
      `Temp cleanup zavrsen. Obrisano ${deleted}, preskoceno ${failed}.`,
    dnsDone: "DNS cache ispražnjen.",
    backgroundDone: (closed, attempted, names) =>
      `Zatvoreno ${closed}/${attempted} procesa: ${names}.`,
    backgroundFailed: "Background cleanup nije uspio.",
    gameBoostFailed: "Game boost nije uspio.",
    gameBoostDone: (deleted, dnsOk, closed) =>
      `Boost gotov: temp ${deleted} obrisano, DNS ${dnsOk ? "OK" : "FAIL"}, background ${closed} zatvoreno.`,
    steamModeFailed: "Stream mode nije uspio.",
    steamLaunched: "OBS/Game balans primijenjen",
    steamLaunchFail: "Stream balans nije uspio",
    steamModeDone: (launch, deleted, closed) =>
      `${launch}. Temp ${deleted}, background zatvoreno ${closed}.`,
    licenseTitle: "Aktiviraj FPS Forge",
    licenseSubtitle: "Jedan kljuc = jedan PC. Unesi kljuc koji si kupio.",
    licenseKeyLabel: "Licencni kljuc",
    licensePlaceholder: "FFG-XXXX-XXXX-XXXX-XXXX",
    licenseActivate: "Aktiviraj",
    licenseActivating: "Aktivacija...",
    licenseMachineHint: "Machine ID (support)",
    licenseCopyId: "Kopiraj machine ID",
    licenseError: "Aktivacija nije uspjela. Provjeri kljuc, internet ili server.",
    licenseApiMissing:
      "Nije podesen license API. Postavi FPSFORGE_LICENSE_API ili fajl license-api.json u %AppData%/FPS Forge sa {\"apiBase\":\"https://...\"}.",
    licenseServerHint:
      "Ako pise da je server offline: zalijepi HTTPS adresu koju ti je prodavac poslao (Render / Discord / mejl), Sacuvaj, pa opet Aktiviraj.",
    licenseServerLabel: "Adresa license servera",
    licenseServerPlaceholder: "https://fpsforge-xxxx.onrender.com",
    licenseServerSave: "Sacuvaj adresu",
    licenseServerSaved: "Sacuvano. Klikni opet Aktiviraj.",
    licenseServerBadUrl: "Mora poceti sa https:// (ili http://localhost za test).",
    licenseOffline:
      "Ne moze se povezati na license server. Provjeri internet, zalijepi tacan URL ispod, ili pricekaj ~60s ako je host 'spavao' (besplatan hosting).",
    licenseKeyOnlyHint: "Unesi samo kljuc koji si kupio — server je vec ugradjen u ovu verziju aplikacije.",
  },
  fr: {
    navDashboard: "Tableau de bord",
    navBoost: "Game Boost",
    navSteam: "Mode Stream",
    navCleanup: "Nettoyage",
    navAbout: "A propos",
    languageLabel: "Langue",
    heroTitle: "Centre Moderne de Boost Gaming",
    heroText:
      "Inspire des boosters populaires: optimisation en un clic, mode haute performance, nettoyage et workflow stream.",
    running: "Execution...",
    oneClickBoost: "Boost en un clic",
    desktopOnly: "Mode desktop uniquement",
    desktopHint: "Lance le projet via Electron avec `npm run dev` depuis le dossier racine.",
    ramStatus: "Etat RAM",
    usedLabel: "Utilise",
    loading: "Chargement...",
    cores: "Coeurs",
    uptime: "Uptime",
    tempQuickLook: "Apercu TEMP",
    tempEntries: "Elements TEMP",
    openTempFolder: "Ouvrir dossier TEMP",
    quickTempClean: "Nettoyage TEMP rapide",
    topProcesses: "Processus memoire principaux",
    noData: "Pas de donnees.",
    boostControls: "Controles Game Boost",
    boostHint:
      "Ordre recommande: plan High/Ultimate, nettoyage, DNS flush, puis lancement du jeu.",
    boostHintNoUltimate:
      "Ordre recommande: plan High, nettoyage, DNS flush, puis lancement du jeu.",
    setHigh: "Activer High Performance",
    setUltimate: "Activer Ultimate Performance",
    ultimateUnsupported: "Le plan Ultimate n'est pas pris en charge sur ce systeme.",
    fallbackHighWarning: "Ultimate indisponible. High Performance a ete applique.",
    restoreBalanced: "Restaurer Balanced",
    closeBackground: "Fermer apps en arriere-plan",
    flushDns: "Vider DNS",
    steamMode: "Mode Stream",
    steamHint:
      "Equilibre les priorites OBS et jeu pour un stream plus fluide et moins de saccades en jeu.",
    runSteamMode: "Lancer Mode Stream",
    openSteamOnly: "Ouvrir outils stream",
    cleanupTools: "Outils de nettoyage",
    cleanupHint: "A utiliser apres une longue session ou avant une partie classee.",
    cleanTemp: "Nettoyer fichiers temp",
    flushDnsCache: "Vider cache DNS",
    closeTrackedApps: "Fermer apps suivies en arriere-plan",
    aboutTitle: "A propos de FPS Forge",
    aboutText1:
      "L'application optimise les ressources Windows sans overclocking: plan d'alimentation, nettoyage et workflow launcher.",
    aboutText2:
      "Conseil: garde les pilotes GPU a jour et utilise une limite FPS adaptee a ton ecran.",
    confirmTempClean:
      "Supprimer les fichiers dans le dossier TEMP racine? Conseil: ferme les launchers avant.",
    actionStarted: (name) => `${name} demarre...`,
    actionError: (name, err) => `${name} erreur: ${err}`,
    actionPowerPlan: "Plan d'alimentation",
    actionTempCleanup: "Nettoyage temp",
    actionDnsFlush: "DNS flush",
    actionBackgroundCleanup: "Nettoyage arriere-plan",
    actionOneClickBoost: "Boost jeu en un clic",
    actionSteamMode: "Mode Stream",
    powerPlanSet: (plan) => `Plan d'alimentation active: ${plan}.`,
    genericError: "Erreur.",
    tempCleanupDone: (deleted, failed) =>
      `Nettoyage temp termine. Supprime ${deleted}, ignore ${failed}.`,
    dnsDone: "Cache DNS vide.",
    backgroundDone: (closed, attempted, names) =>
      `${closed}/${attempted} processus fermes: ${names}.`,
    backgroundFailed: "Le nettoyage arriere-plan a echoue.",
    gameBoostFailed: "Le game boost a echoue.",
    gameBoostDone: (deleted, dnsOk, closed) =>
      `Boost termine: temp ${deleted} supprimes, DNS ${dnsOk ? "OK" : "FAIL"}, arriere-plan ${closed} fermes.`,
    steamModeFailed: "Le mode Stream a echoue.",
    steamLaunched: "Equilibrage OBS/Jeu applique",
    steamLaunchFail: "Echec de l'equilibrage stream",
    steamModeDone: (launch, deleted, closed) =>
      `${launch}. Temp ${deleted}, arriere-plan ferme ${closed}.`,
    licenseTitle: "Activer FPS Forge",
    licenseSubtitle: "Une cle = un seul PC. Entre ta cle d'achat.",
    licenseKeyLabel: "Cle de licence",
    licensePlaceholder: "FFG-XXXX-XXXX-XXXX-XXXX",
    licenseActivate: "Activer",
    licenseActivating: "Activation...",
    licenseMachineHint: "ID machine (support)",
    licenseCopyId: "Copier l'ID machine",
    licenseError: "Activation impossible. Verifie cle, internet ou serveur.",
    licenseApiMissing:
      "API licence manquante. Definis FPSFORGE_LICENSE_API ou license-api.json dans %AppData%/FPS Forge avec {\"apiBase\":\"https://...\"}.",
    licenseServerHint:
      "Si 'offline': colle l'URL HTTPS du vendeur, Enregistre, puis reactive.",
    licenseServerLabel: "URL du serveur de licence",
    licenseServerPlaceholder: "https://ton-service.onrender.com",
    licenseServerSave: "Enregistrer l'URL",
    licenseServerSaved: "Enregistre. Clique Activer encore.",
    licenseServerBadUrl: "Utilise https:// (ou http://localhost pour test).",
    licenseOffline:
      "Serveur inaccessible. Verifie internet, URL ci-dessous, ou attends ~60s (hebergement gratuit).",
    licenseKeyOnlyHint: "Entre uniquement ta cle — le serveur est deja configure dans cette version.",
  },
  it: {
    navDashboard: "Dashboard",
    navBoost: "Game Boost",
    navSteam: "Modalita Stream",
    navCleanup: "Pulizia",
    navAbout: "Info",
    languageLabel: "Lingua",
    heroTitle: "Centro Moderno Boost Gaming",
    heroText:
      "Ispirato ai booster popolari: ottimizzazione one-click, modalita alte prestazioni, pulizia e workflow stream.",
    running: "In esecuzione...",
    oneClickBoost: "Boost con un clic",
    desktopOnly: "Solo modalita desktop",
    desktopHint: "Avvia il progetto con Electron usando `npm run dev` dalla cartella root.",
    ramStatus: "Stato RAM",
    usedLabel: "Usata",
    loading: "Caricamento...",
    cores: "Core",
    uptime: "Uptime",
    tempQuickLook: "Panoramica TEMP",
    tempEntries: "Elementi TEMP",
    openTempFolder: "Apri cartella TEMP",
    quickTempClean: "Pulizia TEMP rapida",
    topProcesses: "Processi principali per memoria",
    noData: "Nessun dato.",
    boostControls: "Controlli Game Boost",
    boostHint:
      "Ordine consigliato: piano High/Ultimate, pulizia, DNS flush, poi avvia il gioco.",
    boostHintNoUltimate:
      "Ordine consigliato: piano High, pulizia, DNS flush, poi avvia il gioco.",
    setHigh: "Imposta High Performance",
    setUltimate: "Imposta Ultimate Performance",
    ultimateUnsupported: "Il piano Ultimate non e supportato su questo sistema.",
    fallbackHighWarning: "Ultimate non disponibile. E stato applicato High Performance.",
    restoreBalanced: "Ripristina Balanced",
    closeBackground: "Chiudi app in background",
    flushDns: "Flush DNS",
    steamMode: "Modalita Stream",
    steamHint:
      "Bilancia le priorita di OBS e gioco per stream piu fluido e meno scatti in gioco.",
    runSteamMode: "Avvia Modalita Stream",
    openSteamOnly: "Apri strumenti stream",
    cleanupTools: "Strumenti di pulizia",
    cleanupHint: "Usa dopo sessioni lunghe o prima di una ranked.",
    cleanTemp: "Pulisci file temp",
    flushDnsCache: "Svuota cache DNS",
    closeTrackedApps: "Chiudi app monitorate in background",
    aboutTitle: "Informazioni su FPS Forge",
    aboutText1:
      "L'app ottimizza risorse Windows senza overclock: piano energetico, pulizia e workflow launcher.",
    aboutText2:
      "Suggerimento: aggiorna i driver GPU e usa un limite FPS in-game adatto al monitor.",
    confirmTempClean:
      "Eliminare i file nella cartella TEMP principale? Suggerimento: chiudi i launcher prima.",
    actionStarted: (name) => `${name} avviato...`,
    actionError: (name, err) => `${name} errore: ${err}`,
    actionPowerPlan: "Piano energetico",
    actionTempCleanup: "Pulizia temp",
    actionDnsFlush: "DNS flush",
    actionBackgroundCleanup: "Pulizia background",
    actionOneClickBoost: "One-click game boost",
    actionSteamMode: "Modalita Stream",
    powerPlanSet: (plan) => `Piano energetico impostato: ${plan}.`,
    genericError: "Errore.",
    tempCleanupDone: (deleted, failed) =>
      `Pulizia temp completata. Eliminati ${deleted}, saltati ${failed}.`,
    dnsDone: "Cache DNS svuotata.",
    backgroundDone: (closed, attempted, names) =>
      `Chiusi ${closed}/${attempted} processi: ${names}.`,
    backgroundFailed: "Pulizia background non riuscita.",
    gameBoostFailed: "Game boost non riuscito.",
    gameBoostDone: (deleted, dnsOk, closed) =>
      `Boost completato: temp ${deleted} eliminati, DNS ${dnsOk ? "OK" : "FAIL"}, background ${closed} chiusi.`,
    steamModeFailed: "Modalita Stream non riuscita.",
    steamLaunched: "Bilanciamento OBS/Gioco applicato",
    steamLaunchFail: "Bilanciamento stream fallito",
    steamModeDone: (launch, deleted, closed) =>
      `${launch}. Temp ${deleted}, background chiusi ${closed}.`,
    licenseTitle: "Attiva FPS Forge",
    licenseSubtitle: "Una chiave = un solo PC. Inserisci la chiave acquistata.",
    licenseKeyLabel: "Chiave di licenza",
    licensePlaceholder: "FFG-XXXX-XXXX-XXXX-XXXX",
    licenseActivate: "Attiva",
    licenseActivating: "Attivazione...",
    licenseMachineHint: "ID macchina (supporto)",
    licenseCopyId: "Copia ID macchina",
    licenseError: "Attivazione fallita. Controlla chiave, internet o server.",
    licenseApiMissing:
      "API licenze mancante. Imposta FPSFORGE_LICENSE_API oppure license-api.json in %AppData%/FPS Forge con {\"apiBase\":\"https://...\"}.",
    licenseServerHint:
      "Se 'offline': incolla l'URL HTTPS del venditore, Salva, poi Attiva di nuovo.",
    licenseServerLabel: "URL server licenze",
    licenseServerPlaceholder: "https://tuo-servizio.onrender.com",
    licenseServerSave: "Salva URL",
    licenseServerSaved: "Salvato. Clicca Attiva di nuovo.",
    licenseServerBadUrl: "Deve iniziare con https:// (o http://localhost per test).",
    licenseOffline:
      "Impossibile raggiungere il server. Controlla internet, URL sotto, o attendi ~60s (hosting gratuito).",
    licenseKeyOnlyHint: "Inserisci solo la chiave — il server e gia incluso in questa build.",
  },
};

const maxFpsUi = {
  en: {
    title: "MAX FPS Mode (Aggressive)",
    hint:
      "Applies Ultimate plan + CPU policy + Game Mode/DVR tweaks + network profile + cleanup. Some steps may require admin rights.",
    hintNoUltimate:
      "Applies High plan + CPU policy + Game Mode/DVR tweaks + network profile + cleanup. Some steps may require admin rights.",
    confirm:
      "Apply aggressive MAX FPS profile now? This changes power and some Windows gaming settings.",
    done: (failed: number) =>
      `MAX FPS profile applied. ${failed > 0 ? `${failed} step(s) could not be applied.` : "All steps completed."}`,
    failed: "MAX FPS profile failed.",
  },
  de: {
    title: "MAX FPS Modus (Aggressiv)",
    hint:
      "Setzt Ultimate-Plan + CPU-Policy + Game-Mode/DVR Tweaks + Netzwerkprofil + Cleanup. Fuer manche Schritte sind Admin-Rechte noetig.",
    hintNoUltimate:
      "Setzt High-Plan + CPU-Policy + Game-Mode/DVR Tweaks + Netzwerkprofil + Cleanup. Fuer manche Schritte sind Admin-Rechte noetig.",
    confirm:
      "Aggressives MAX-FPS-Profil jetzt anwenden? Das aendert Energie- und einige Windows-Gaming-Einstellungen.",
    done: (failed: number) =>
      `MAX-FPS-Profil angewendet. ${failed > 0 ? `${failed} Schritt(e) konnten nicht gesetzt werden.` : "Alle Schritte abgeschlossen."}`,
    failed: "MAX-FPS-Profil fehlgeschlagen.",
  },
  bs: {
    title: "MAX FPS Mod (Agresivni)",
    hint:
      "Primjenjuje Ultimate plan + CPU policy + Game Mode/DVR tweakove + network profil + cleanup. Neki koraci traze admin prava.",
    hintNoUltimate:
      "Primjenjuje High plan + CPU policy + Game Mode/DVR tweakove + network profil + cleanup. Neki koraci traze admin prava.",
    confirm:
      "Primijeniti agresivni MAX FPS profil sada? Ovo mijenja power i neke Windows gaming postavke.",
    done: (failed: number) =>
      `MAX FPS profil primijenjen. ${failed > 0 ? `${failed} korak(a) nije uspio.` : "Svi koraci zavrseni."}`,
    failed: "MAX FPS profil nije uspio.",
  },
  fr: {
    title: "Mode MAX FPS (Agressif)",
    hint:
      "Applique plan Ultimate + politique CPU + tweaks Game Mode/DVR + profil reseau + nettoyage. Certaines etapes demandent les droits admin.",
    hintNoUltimate:
      "Applique plan High + politique CPU + tweaks Game Mode/DVR + profil reseau + nettoyage. Certaines etapes demandent les droits admin.",
    confirm:
      "Appliquer maintenant le profil MAX FPS agressif? Cela modifie l'alimentation et certains reglages gaming Windows.",
    done: (failed: number) =>
      `Profil MAX FPS applique. ${failed > 0 ? `${failed} etape(s) non appliquee(s).` : "Toutes les etapes sont terminees."}`,
    failed: "Le profil MAX FPS a echoue.",
  },
  it: {
    title: "Modalita MAX FPS (Aggressiva)",
    hint:
      "Applica piano Ultimate + policy CPU + tweak Game Mode/DVR + profilo rete + pulizia. Alcuni passaggi richiedono diritti admin.",
    hintNoUltimate:
      "Applica piano High + policy CPU + tweak Game Mode/DVR + profilo rete + pulizia. Alcuni passaggi richiedono diritti admin.",
    confirm:
      "Applicare ora il profilo MAX FPS aggressivo? Questo modifica alimentazione e alcune impostazioni gaming di Windows.",
    done: (failed: number) =>
      `Profilo MAX FPS applicato. ${failed > 0 ? `${failed} passaggio/i non applicato/i.` : "Tutti i passaggi completati."}`,
    failed: "Profilo MAX FPS non riuscito.",
  },
} as const;

const premiumUi = {
  en: { required: "Premium required for Boost/Stream/MAX features." },
  de: { required: "Premium wird fuer Boost/Stream/MAX Funktionen benoetigt." },
  bs: { required: "Premium je potreban za Boost/Stream/MAX funkcije." },
  fr: { required: "Premium requis pour les fonctions Boost/Stream/MAX." },
  it: { required: "Premium richiesto per funzioni Boost/Stream/MAX." },
} as const;

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatUptime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function getLoadTone(percent: number) {
  if (percent >= 85) return "critical";
  if (percent >= 65) return "warn";
  return "good";
}

export function App() {
  const api = window.boostPc;
  type LicenseStatus = Awaited<ReturnType<NonNullable<Window["boostPc"]>["getLicenseStatus"]>>;
  const [tab, setTab] = useState<Tab>("dashboard");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return saved && saved in translations ? (saved as Language) : "bs";
  });
  const [stats, setStats] = useState<BoostStatsPayload | null>(null);
  const [licenseOk, setLicenseOk] = useState<boolean | null>(null);
  const [licenseInfo, setLicenseInfo] = useState<LicenseStatus | null>(null);
  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [licenseErr, setLicenseErr] = useState("");
  const [licenseApiUrl, setLicenseApiUrl] = useState("");
  const [licenseApiBusy, setLicenseApiBusy] = useState(false);
  const [machineId, setMachineId] = useState("");
  const [showLicensePanel, setShowLicensePanel] = useState(false);
  const [securityState, setSecurityState] = useState<Awaited<
    ReturnType<NonNullable<Window["boostPc"]>["getSecurityStatus"]>
  > | null>(null);
  const [vpnBenchmarks, setVpnBenchmarks] = useState<
    Array<{ country: string; host: string; latencyMs: number | null }>
  >([]);
  const [vpnProfiles, setVpnProfiles] = useState<Array<{ name: string; connected: boolean }>>([]);
  const [selectedVpnProfile, setSelectedVpnProfile] = useState("");
  const t = translations[language];
  const maxFpsText = maxFpsUi[language];
  const premiumText = premiumUi[language];

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, language);
  }, [language]);

  const refresh = useCallback(async () => {
    if (!api?.getStats || licenseOk !== true) return;
    try {
      const raw = await api.getStats();
      if (!raw || !("totalMem" in raw)) {
        setStats(null);
        return;
      }
      setStats(raw);
    } catch (e) {
      setLog(String(e));
    }
  }, [api, licenseOk]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!api?.getLicenseStatus) {
        if (!cancelled) {
          setLicenseOk(true);
          setLicenseInfo(null);
        }
        return;
      }
      const st = await api.getLicenseStatus();
      if (cancelled) return;
      setLicenseInfo(st);
      setLicenseOk(Boolean(st.ok));
      if (typeof st.apiBase === "string") setLicenseApiUrl(st.apiBase);
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (licenseOk !== false) return;
    void (async () => {
      const mid = await api?.getMachineId?.();
      if (mid?.ok && mid.machineId) setMachineId(mid.machineId);
    })();
  }, [licenseOk, api]);

  useEffect(() => {
    if (licenseOk !== true) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(id);
  }, [refresh, licenseOk]);

  const runAction = async (name: string, fn: () => Promise<void>) => {
    setBusy(true);
    setLog(t.actionStarted(name));
    try {
      await fn();
    } catch (e) {
      setLog(t.actionError(name, String(e)));
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const setPlan = (plan: Plan) =>
    runAction(t.actionPowerPlan, async () => {
      const r = await api?.setPowerPlan?.(plan);
      if (r?.ok) {
        const activePlan = (r.plan as Plan | undefined) ?? plan;
        const base = t.powerPlanSet(activePlan);
        if (r.warningCode === "ultimate_fallback_high") {
          setLog(`${base} ${t.fallbackHighWarning}`);
          return;
        }
        setLog(base);
        return;
      }
      setLog(r?.message || t.genericError);
    });

  const runCleanTemp = () =>
    runAction(t.actionTempCleanup, async () => {
      if (!window.confirm(t.confirmTempClean))
        return;
      const r = await api?.cleanTempFiles?.();
      setLog(t.tempCleanupDone(r?.deleted ?? 0, r?.failed ?? 0));
    });

  const runDns = () =>
    runAction(t.actionDnsFlush, async () => {
      const r = await api?.flushDns?.();
      setLog(r?.ok ? t.dnsDone : r?.message || t.genericError);
    });

  const runCloseBackground = () =>
    runAction(t.actionBackgroundCleanup, async () => {
      const r = await api?.closeBackgroundApps?.();
      setLog(
        r?.ok
          ? t.backgroundDone(
              r.closed.length,
              r.attempted.length,
              r.closed.join(", ") || "-"
            )
          : t.backgroundFailed
      );
    });

  const runGameBoost = () =>
    runAction(t.actionOneClickBoost, async () => {
      const r = await api?.runGameBoost?.();
      if (!r?.ok) {
        setLog(t.gameBoostFailed);
        return;
      }
      setLog(t.gameBoostDone(r.cleanup.deleted, r.dns.ok, r.background.closed.length));
    });

  const runStreamMode = () =>
    runAction(t.actionSteamMode, async () => {
      const r = await api?.runStreamMode?.();
      if (!r?.ok) {
        setLog(t.steamModeFailed);
        return;
      }
      const balance = r.streamBalance;
      const launch = balance?.ok
        ? `${t.steamLaunched} (OBS ${balance.obsAdjusted ?? 0}/${balance.obsFound ?? 0}, Game ${balance.gamesAdjusted ?? 0}/${balance.gamesFound ?? 0})`
        : `${t.steamLaunchFail}${balance?.message ? `: ${balance.message}` : ""}`;
      setLog(
        t.steamModeDone(
          launch,
          r.boost.cleanup.deleted,
          r.boost.background.closed.length
        )
      );
    });

  const runMaxFpsBoost = () =>
    runAction(maxFpsText.title, async () => {
      if (!window.confirm(maxFpsText.confirm)) return;
      const r = await api?.runMaxFpsBoost?.();
      if (!r?.ok) {
        setLog(maxFpsText.failed);
        return;
      }
      const failedCount =
        (r.power.ok ? 0 : 1) +
        (r.processor.ok ? 0 : 1) +
        (r.registry.ok ? 0 : 1) +
        (r.network.ok ? 0 : 1) +
        (r.gameBoost.ok ? 0 : 1);
      setLog(maxFpsText.done(failedCount));
    });

  const refreshSecurityState = useCallback(async () => {
    if (!api?.getSecurityStatus) return;
    try {
      setSecurityState(await api.getSecurityStatus());
    } catch {
      setSecurityState(null);
    }
  }, [api]);

  const runDefenderQuickScan = () =>
    runAction("Defender quick scan", async () => {
      const r = await api?.defenderQuickScan?.();
      setLog(r?.ok ? "Defender quick scan started." : r?.message || "Defender quick scan failed.");
    });

  const runDefenderFullScan = () =>
    runAction("Defender full scan", async () => {
      const r = await api?.defenderFullScan?.();
      setLog(r?.ok ? "Defender full scan started." : r?.message || "Defender full scan failed.");
    });

  const openVpn = (providerId: string) =>
    runAction("Open VPN provider", async () => {
      const r = await api?.openVpnProvider?.(providerId);
      setLog(r?.ok ? `Opened ${r.url}` : r?.message || "Could not open VPN link.");
    });

  const scanVpnRegions = () =>
    runAction("Scan VPN regions", async () => {
      const r = await api?.getVpnRegionBenchmarks?.();
      if (!r?.ok) {
        setLog(r?.message || "VPN region scan failed.");
        return;
      }
      setVpnBenchmarks(r.rows || []);
      const best = [...(r.rows || [])]
        .filter((x) => typeof x.latencyMs === "number")
        .sort((a, b) => (a.latencyMs ?? 9999) - (b.latencyMs ?? 9999))[0];
      setLog(
        best
          ? `Best ping region right now: ${best.country} (${best.latencyMs} ms).`
          : "No region ping results available."
      );
    });

  const refreshVpnProfiles = () =>
    runAction("Load VPN profiles", async () => {
      const r = await api?.getVpnProfiles?.();
      if (!r?.ok) {
        setLog(r?.message || "Could not load VPN profiles.");
        return;
      }
      setVpnProfiles(r.profiles || []);
      if (!selectedVpnProfile && r.profiles?.[0]?.name) {
        setSelectedVpnProfile(r.profiles[0].name);
      }
      setLog(`Loaded ${r.profiles?.length || 0} Windows VPN profile(s).`);
    });

  const connectSelectedVpn = () =>
    runAction("Connect VPN profile", async () => {
      if (!selectedVpnProfile) {
        setLog("Select a VPN profile first.");
        return;
      }
      const r = await api?.connectVpnProfile?.(selectedVpnProfile);
      setLog(
        r?.ok
          ? `Connected VPN profile: ${r.profile || selectedVpnProfile}`
          : r?.message || "VPN profile connection failed."
      );
    });

  const memPercent = useMemo(() => Math.min(100, stats?.memUsedPercent ?? 0), [stats]);
  const memTone = getLoadTone(stats?.memUsedPercent ?? 0);
  const cpuTone = getLoadTone(stats?.cpuLoadPercent ?? 0);
  const diskTone = getLoadTone(stats?.diskLoadPercent ?? 0);
  const ultimateSupported = stats?.supportsUltimate ?? true;
  const licenseTier = String(licenseInfo?.tier || "free");
  const isPremium = licenseTier === "premium_monthly" || licenseTier === "premium_lifetime";
  const premiumBlocked = busy || !api || !isPremium;
  const boostHintText = ultimateSupported ? t.boostHint : t.boostHintNoUltimate;
  const maxFpsHintText = ultimateSupported ? maxFpsText.hint : maxFpsText.hintNoUltimate;
  const openTmp = () => void api?.openPath?.(stats?.tmpDir || "");

  /** Ugrađeni https:// Render URL u .exe — kupac ne mora dirati server polje */
  const licenseServerLocked = Boolean(licenseInfo?.apiBase?.startsWith("https://"));

  useEffect(() => {
    if (tab !== "security" || licenseOk !== true) return;
    void refreshSecurityState();
    void (async () => {
      const [bench, profiles] = await Promise.all([
        api?.getVpnRegionBenchmarks?.(),
        api?.getVpnProfiles?.(),
      ]);
      if (bench?.ok) setVpnBenchmarks(bench.rows || []);
      if (profiles?.ok) {
        setVpnProfiles(profiles.profiles || []);
        if (!selectedVpnProfile && profiles.profiles?.[0]?.name) {
          setSelectedVpnProfile(profiles.profiles[0].name);
        }
      }
    })();
  }, [tab, refreshSecurityState, licenseOk]);

  const saveLicenseServerUrl = async () => {
    setLicenseErr("");
    if (!api?.setLicenseApiBase) return;
    setLicenseApiBusy(true);
    try {
      const r = await api.setLicenseApiBase(licenseApiUrl.trim());
      if (!r?.ok) {
        const m = String(r?.message || "");
        if (m === "API_URL_HTTPS_REQUIRED" || m === "EMPTY_URL") {
          setLicenseErr(t.licenseServerBadUrl);
        } else {
          setLicenseErr(m || t.licenseError);
        }
        return;
      }
      const st = await api.getLicenseStatus();
      setLicenseInfo(st);
      setLicenseOk(Boolean(st.ok));
      if (typeof st.apiBase === "string") setLicenseApiUrl(st.apiBase);
      setLicenseErr(t.licenseServerSaved);
    } catch (e) {
      setLicenseErr(String(e));
    } finally {
      setLicenseApiBusy(false);
    }
  };

  const submitLicense = async () => {
    setLicenseErr("");
    if (!api?.activateLicense || !licenseKeyInput.trim()) return;
    setLicenseBusy(true);
    try {
      const trimmedUrl = licenseApiUrl.trim().replace(/\/$/, "");
      const currentBase = String(licenseInfo?.apiBase || "")
        .trim()
        .replace(/\/$/, "");
      if (trimmedUrl && api.setLicenseApiBase) {
        const okFormat =
          trimmedUrl.startsWith("https://") ||
          trimmedUrl.startsWith("http://127.0.0.1") ||
          trimmedUrl.startsWith("http://localhost");
        if (okFormat && trimmedUrl !== currentBase) {
          const sr = await api.setLicenseApiBase(licenseApiUrl.trim());
          if (!sr?.ok) {
            const m = String(sr?.message || "");
            setLicenseErr(m === "API_URL_HTTPS_REQUIRED" || m === "EMPTY_URL" ? t.licenseServerBadUrl : m || t.licenseError);
            return;
          }
          const st0 = await api.getLicenseStatus();
          setLicenseInfo(st0);
          setLicenseOk(Boolean(st0.ok));
          if (typeof st0.apiBase === "string") setLicenseApiUrl(st0.apiBase);
        }
      }

      const r = await api.activateLicense(licenseKeyInput);
      if (!r?.ok) {
        const msg = String(r?.message || "");
        if (msg === "LICENSE_SERVER_OFFLINE") {
          const stFresh = await api.getLicenseStatus();
          setLicenseInfo(stFresh);
          const base = String(stFresh?.apiBase || "").trim();
          setLicenseErr(`${t.licenseOffline}${base ? ` (${base})` : ""}`);
        } else if (msg === "KEY_ALREADY_USED") {
          setLicenseErr("This key is already used on another PC.");
        } else if (msg === "INVALID_KEY") {
          setLicenseErr("Invalid key. Check the key and try again.");
        } else {
          setLicenseErr(r?.message || t.licenseError);
        }
        return;
      }
      const st = await api.getLicenseStatus();
      setLicenseInfo(st);
      setLicenseOk(Boolean(st.ok));
      if (!st.ok) {
        setLicenseErr(st.message || t.licenseError);
        return;
      }
      void refresh();
      setShowLicensePanel(false);
    } catch (e) {
      setLicenseErr(String(e));
    } finally {
      setLicenseBusy(false);
    }
  };

  return (
    <div className="boost-root">
      {(showLicensePanel || licenseInfo?.reason === "api_missing") ? (
        <div className="license-overlay">
          <div className="license-card">
            <h2>{t.licenseTitle}</h2>
            <p className="muted">{t.licenseSubtitle}</p>
            {licenseOk === null ? (
              <p className="muted">{t.loading}</p>
            ) : (
              <>
                {!licenseInfo?.apiConfigured && licenseInfo?.reason === "api_missing" ? (
                  <p className="license-warn">{t.licenseApiMissing}</p>
                ) : null}
                {licenseServerLocked ? (
                  <p className="muted small" style={{ marginBottom: "12px" }}>
                    {t.licenseKeyOnlyHint}
                  </p>
                ) : (
                  <>
                    <p className="muted small" style={{ marginBottom: "10px" }}>
                      {t.licenseServerHint}
                    </p>
                    <label className="license-label" htmlFor="license-api-url">
                      {t.licenseServerLabel}
                    </label>
                    <input
                      id="license-api-url"
                      className="license-input"
                      value={licenseApiUrl}
                      onChange={(e) => setLicenseApiUrl(e.target.value)}
                      placeholder={t.licenseServerPlaceholder}
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      className="boost-btn secondary"
                      style={{ marginTop: "8px", marginBottom: "14px" }}
                      disabled={licenseApiBusy || !licenseApiUrl.trim()}
                      onClick={() => void saveLicenseServerUrl()}
                    >
                      {licenseApiBusy ? t.loading : t.licenseServerSave}
                    </button>
                  </>
                )}
                <label className="license-label" htmlFor="license-key-input">
                  {t.licenseKeyLabel}
                </label>
                <input
                  id="license-key-input"
                  className="license-input"
                  value={licenseKeyInput}
                  onChange={(e) => setLicenseKeyInput(e.target.value)}
                  placeholder={t.licensePlaceholder}
                  autoCapitalize="characters"
                />
                <p className="muted small">{t.licenseMachineHint}</p>
                <div className="license-machine-row">
                  <code>{machineId || "—"}</code>
                  <button
                    type="button"
                    className="boost-btn secondary"
                    disabled={!machineId}
                    onClick={() => void navigator.clipboard.writeText(machineId)}
                  >
                    {t.licenseCopyId}
                  </button>
                </div>
                {licenseErr ? <p className="license-warn">{licenseErr}</p> : null}
                <button
                  type="button"
                  className="boost-btn primary"
                  disabled={licenseBusy}
                  onClick={() => void submitLicense()}
                >
                  {licenseBusy ? t.licenseActivating : t.licenseActivate}
                </button>
                {licenseInfo?.reason !== "api_missing" ? (
                  <button
                    type="button"
                    className="boost-btn secondary"
                    style={{ marginTop: "10px" }}
                    onClick={() => setShowLicensePanel(false)}
                  >
                    Continue in free mode
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
      <aside className="boost-nav" aria-label="Glavni meni">
        <div className="boost-brand">
          <span>FPS</span> Forge
        </div>
        <div className="language-picker">
          <label htmlFor="lang-select">{t.languageLabel}</label>
          <select
            id="lang-select"
            className="language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            {languages.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}>
          {t.navDashboard}
        </button>
        <button className={tab === "boost" ? "active" : ""} onClick={() => setTab("boost")}>
          {t.navBoost}
        </button>
        <button className={tab === "steam" ? "active" : ""} onClick={() => setTab("steam")}>
          {t.navSteam}
        </button>
        <button className={tab === "cleanup" ? "active" : ""} onClick={() => setTab("cleanup")}>
          {t.navCleanup}
        </button>
        <button className={tab === "security" ? "active" : ""} onClick={() => setTab("security")}>
          Security
        </button>
        <button className={tab === "about" ? "active" : ""} onClick={() => setTab("about")}>
          {t.navAbout}
        </button>
      </aside>

      <main className="boost-main">
        <section className="hero">
          <div>
            <h1>{t.heroTitle}</h1>
            <p>{t.heroText}</p>
          </div>
          <button className="boost-btn primary large" disabled={premiumBlocked} onClick={() => void runGameBoost()}>
            {busy ? t.running : t.oneClickBoost}
          </button>
        </section>
        {(!isPremium && licenseOk !== null) ? (
          <div className="boost-log">
            {premiumText.required}{" "}
            <button
              type="button"
              className="boost-btn secondary"
              style={{ marginLeft: "8px", padding: "6px 10px", fontSize: "0.8rem" }}
              onClick={() => setShowLicensePanel(true)}
            >
              Activate premium key
            </button>
          </div>
        ) : null}

        {!api && (
          <div className="boost-card">
            <h2>{t.desktopOnly}</h2>
            <p>{t.desktopHint}</p>
          </div>
        )}

        {tab === "dashboard" && (
          <>
            <div className="grid-2">
              <div className="boost-card">
                <h2>{t.ramStatus}</h2>
                <p>
                  {stats ? (
                    <>
                      {t.usedLabel} <strong>{stats.memUsedPercent}%</strong> ({formatBytes(stats.usedMem)} /{" "}
                      {formatBytes(stats.totalMem)})
                    </>
                  ) : (
                    t.loading
                  )}
                </p>
                <div className="boost-meter" aria-hidden>
                  <span style={{ width: `${memPercent}%` }} />
                </div>
                <p className="muted">
                  CPU: {stats?.cpuModel || "—"} · {t.cores}: {stats?.cpuCount || "—"} · {t.uptime}:{" "}
                  {stats ? formatUptime(stats.uptimeSec) : "—"}
                </p>
                <div className="load-grid">
                  <div className={`load-pill ${cpuTone}`}>
                    <span>CPU Load</span>
                    <strong>{stats ? `${stats.cpuLoadPercent.toFixed(1)}%` : "—"}</strong>
                  </div>
                  <div className={`load-pill ${diskTone}`}>
                    <span>Disk Load</span>
                    <strong>{stats ? `${stats.diskLoadPercent.toFixed(1)}%` : "—"}</strong>
                  </div>
                  <div className={`load-pill ${memTone}`}>
                    <span>Memory Pressure</span>
                    <strong>{stats ? `${stats.memUsedPercent.toFixed(1)}%` : "—"}</strong>
                  </div>
                  <div className="load-pill neutral">
                    <span>Active Processes</span>
                    <strong>{stats?.processCount ?? "—"}</strong>
                  </div>
                </div>
              </div>

              <div className="boost-card">
                <h2>{t.tempQuickLook}</h2>
                <p>
                  {t.tempEntries}: <strong>{stats?.tempEntries ?? "—"}</strong>
                </p>
                <div className="boost-actions">
                  <button className="boost-btn secondary" disabled={!api} onClick={openTmp}>
                    {t.openTempFolder}
                  </button>
                  <button className="boost-btn secondary" disabled={!api || busy} onClick={() => void runCleanTemp()}>
                    {t.quickTempClean}
                  </button>
                </div>
              </div>
            </div>

            <div className="boost-card">
              <h2>{t.topProcesses}</h2>
              {stats?.topProcesses?.length ? (
                <div className="process-list">
                  {stats.topProcesses.map((p) => (
                    <div className="process-row" key={`${p.name}-${p.pid}`}>
                      <span>{p.name}</span>
                      <span>PID {p.pid}</span>
                      <span>{p.memoryMb} MB</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">{t.noData}</p>
              )}
            </div>
          </>
        )}

        {tab === "boost" && (
          <div className="boost-card">
            <h2>{t.boostControls}</h2>
            <p className="muted">{boostHintText}</p>
            <p className="muted">{maxFpsHintText}</p>
            <div className="boost-actions">
              <button className="boost-btn primary" disabled={premiumBlocked} onClick={() => void runMaxFpsBoost()}>
                {maxFpsText.title}
              </button>
              <button className="boost-btn" disabled={premiumBlocked} onClick={() => void setPlan("high")}>
                {t.setHigh}
              </button>
              {ultimateSupported ? (
                <button className="boost-btn" disabled={premiumBlocked} onClick={() => void setPlan("ultimate")}>
                  {t.setUltimate}
                </button>
              ) : null}
              <button className="boost-btn secondary" disabled={premiumBlocked} onClick={() => void setPlan("balanced")}>
                {t.restoreBalanced}
              </button>
              <button className="boost-btn" disabled={premiumBlocked} onClick={() => void runCloseBackground()}>
                {t.closeBackground}
              </button>
              <button className="boost-btn" disabled={premiumBlocked} onClick={() => void runDns()}>
                {t.flushDns}
              </button>
            </div>
          </div>
        )}

        {tab === "steam" && (
          <div className="boost-card">
            <h2>{t.steamMode}</h2>
            <p className="muted">{t.steamHint}</p>
            <div className="boost-actions">
              <button className="boost-btn primary" disabled={premiumBlocked} onClick={() => void runStreamMode()}>
                {t.runSteamMode}
              </button>
            </div>
          </div>
        )}

        {tab === "cleanup" && (
          <div className="boost-card">
            <h2>{t.cleanupTools}</h2>
            <p className="muted">{t.cleanupHint}</p>
            <div className="boost-actions">
              <button className="boost-btn" disabled={busy || !api} onClick={() => void runCleanTemp()}>
                {t.cleanTemp}
              </button>
              <button className="boost-btn" disabled={premiumBlocked} onClick={() => void runDns()}>
                {t.flushDnsCache}
              </button>
              <button className="boost-btn" disabled={premiumBlocked} onClick={() => void runCloseBackground()}>
                {t.closeTrackedApps}
              </button>
            </div>
          </div>
        )}

        {tab === "security" && (
          <div className="boost-card">
            <h2>Premium Security & VPN</h2>
            <p className="muted">
              Real features: Windows Defender scan controls, firewall/defender status, VPN adapter detection.
            </p>
            <div className="load-grid">
              <div className={`load-pill ${securityState?.defenderRealtimeEnabled ? "good" : "critical"}`}>
                <span>Defender Real-time</span>
                <strong>{securityState?.defenderRealtimeEnabled ? "Enabled" : "Disabled"}</strong>
              </div>
              <div className={`load-pill ${securityState?.defenderAntivirusEnabled ? "good" : "critical"}`}>
                <span>Defender AV</span>
                <strong>{securityState?.defenderAntivirusEnabled ? "Enabled" : "Disabled"}</strong>
              </div>
              <div className={`load-pill ${securityState?.firewallEnabled ? "good" : "critical"}`}>
                <span>Firewall</span>
                <strong>{securityState?.firewallEnabled ? "Enabled" : "Disabled"}</strong>
              </div>
              <div className={`load-pill ${securityState?.vpnActive ? "good" : "warn"}`}>
                <span>VPN Adapter</span>
                <strong>{securityState?.vpnActive ? "Active" : "Not detected"}</strong>
              </div>
            </div>
            {securityState?.vpnAdapters?.length ? (
              <p className="muted">Detected adapters: {securityState.vpnAdapters.join(", ")}</p>
            ) : null}
            <div className="boost-actions">
              <button className="boost-btn" disabled={premiumBlocked} onClick={() => void runDefenderQuickScan()}>
                Run Defender Quick Scan
              </button>
              <button className="boost-btn" disabled={premiumBlocked} onClick={() => void runDefenderFullScan()}>
                Run Defender Full Scan
              </button>
              <button className="boost-btn secondary" disabled={premiumBlocked} onClick={() => void refreshSecurityState()}>
                Refresh Security Status
              </button>
            </div>
            <p className="muted" style={{ marginTop: "10px" }}>
              VPN integrations (real providers, no fake built-in VPN):
            </p>
            <div className="boost-actions">
              <button className="boost-btn secondary" disabled={premiumBlocked} onClick={() => void openVpn("proton")}>
                Open Proton VPN
              </button>
              <button className="boost-btn secondary" disabled={premiumBlocked} onClick={() => void openVpn("windscribe")}>
                Open Windscribe VPN
              </button>
              <button className="boost-btn secondary" disabled={premiumBlocked} onClick={() => void openVpn("mullvad")}>
                Open Mullvad VPN
              </button>
            </div>
            <p className="muted" style={{ marginTop: "12px" }}>
              Region latency check (helps choose stable/low-ping route, does not guarantee matchmaking outcome):
            </p>
            <div className="boost-actions">
              <button className="boost-btn" disabled={premiumBlocked} onClick={() => void scanVpnRegions()}>
                Scan VPN Regions
              </button>
            </div>
            {vpnBenchmarks.length ? (
              <div className="process-list" style={{ marginTop: "10px" }}>
                {vpnBenchmarks
                  .slice()
                  .sort((a, b) => (a.latencyMs ?? 9999) - (b.latencyMs ?? 9999))
                  .map((row) => (
                    <div className="process-row" key={row.country}>
                      <span>{row.country}</span>
                      <span>{row.host}</span>
                      <span>{row.latencyMs !== null ? `${row.latencyMs} ms` : "N/A"}</span>
                    </div>
                  ))}
              </div>
            ) : null}
            <p className="muted" style={{ marginTop: "12px" }}>
              Windows built-in VPN profiles:
            </p>
            <div className="boost-actions">
              <button className="boost-btn secondary" disabled={premiumBlocked} onClick={() => void refreshVpnProfiles()}>
                Refresh VPN Profiles
              </button>
              <select
                className="language-select"
                style={{ minWidth: "220px" }}
                value={selectedVpnProfile}
                onChange={(e) => setSelectedVpnProfile(e.target.value)}
                disabled={premiumBlocked || !vpnProfiles.length}
              >
                {vpnProfiles.length ? (
                  vpnProfiles.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} {p.connected ? "(connected)" : ""}
                    </option>
                  ))
                ) : (
                  <option value="">No VPN profiles</option>
                )}
              </select>
              <button className="boost-btn" disabled={premiumBlocked || !selectedVpnProfile} onClick={() => void connectSelectedVpn()}>
                Connect Selected Profile
              </button>
            </div>
          </div>
        )}

        {tab === "about" && (
          <div className="boost-card">
            <h2>{t.aboutTitle}</h2>
            <p className="muted">{t.aboutText1}</p>
            <p className="muted">{t.aboutText2}</p>
          </div>
        )}

        {log ? <div className="boost-log">{log}</div> : null}
      </main>
    </div>
  );
}
