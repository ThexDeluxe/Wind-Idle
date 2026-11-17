# Rückenwind – Design & Startwerte

Dieses Dokument hält die konkreten Werte fest, mit denen das Spiel gebaut ist. Alle Inhalte stehen als Daten in `src/data/`, die Formeln in `src/sim/`.

## Grundprinzip: Physik echt, Geld Spielgeld

| Größe | Wert | Ort |
| --- | --- | --- |
| Zeitraffer | 1 Echtsekunde = 6 Spielminuten (0,1 Spielstunden); ein Spieltag = 4 min | `sim/weather.ts` |
| Simulation | feste Schrittweite 0,1 s (10 Ticks/s), Rendering per `requestAnimationFrame` | `ui/app.ts` |
| Spielfaktor | ×100 auf alle Erlöse (im Lexikon offen erklärt) | `GAME_FACTOR` |
| Erlös | `kWh × Preis (ct) / 100 × 100 × Multiplikatoren × (1 − Wartung)` | `sim/site.ts` |
| Kurbel | 1 Klick = 2 Wh (≈ 100 W Muskelkraft bei 5 Klicks/s), verkauft zum Nachbarschaftspreis | `CLICK_KWH` |

## Wind

- `P = ½ · ρ · A · v³ · cp`, ρ = 1,225 kg/m³, Betz-Grenze 0,593.
- Höhenprofil `v(h) = v10 · (h/10)^α`.
- Wetterlage: glattes Rauschen (Gitter 18 Spielstunden), auf Weibull k = 2 abgebildet, Untergrenze 25 % des Mittels (lange Totalflauten machen keinen Spaß), Winter +12 %.
- Böen: schnelles Rauschen (Periode ≈ 2,5 Echtsekunden), Stärke je Standort.
- Ereignisse (einmal pro Spieltag gewürfelt, ab Epoche 1): Sturm (mit 1 Spieltag Vorwarnung), Flaute, Preisspitze, Netzengpass (Redispatch, 95 % entschädigt), Vereisung (Winter), Gewitter (Sommer, Blitzschaden ohne Blitzschutz).

| Standort | v10 | α | Böen | Ø Wind an der Nabe (Start → Ausbau) |
| --- | --- | --- | --- | --- |
| Garten | 5,2 m/s | 0,30 | 0,25 | 3,6 → 5,9 m/s |
| Bauernhof | 5,0 m/s | 0,18 | 0,18 | 5,2 → 6,2 m/s |
| Deich | 5,2 m/s | 0,16 | 0,12 | 6,8 → 7,3 m/s |
| Geest | 4,3 m/s | 0,20 | 0,10 | 7,1 → 7,6 m/s |
| Nordsee | 7,3 m/s | 0,10 | 0,07 | 9,3 → 9,8 m/s |

## Strompreis

| Markt | Preis | Besonderheit |
| --- | --- | --- |
| Nachbarschaft | 40 ct/kWh, 18–22 Uhr 50 ct | Nachfrage begrenzt (Grundbedarf 0,12 kW + Kunden), Tagesprofil mit Abendspitze |
| Einspeisevergütung | Hof 10 ct (erste 3 kW Eigenverbrauch zu 30 ct), Deich 9 ct | unbegrenzt |
| Börse | Ø ≈ 8,4 ct, Tagesprofil (Morgen-/Abendspitze, Mittagstal), Winter teurer, Wind drückt den Preis (`1 − 0,5 · (Wetterlage − 0,9)`), ±1,2 ct Rauschen, negative Preise an windigen Wochenend-Mittagen (~0,5 % der Stunden) | Day-Ahead: je Spielstunde konstant, daher prognostizierbar |
| PPA | 8,5 ct fest | per Forschung |

## Energiekette und Überlast

Kette je Standort: Wind → Rotor → Generator → Leitung → Trafo → Speicher → Netzanschluss/Nachfrage → Markt.

- Auslastung `u = Leistung / Nennleistung`. Temperatur `T += dt · (a · max(0, u² − 1) − b · T)`.

| Bauteil | a | b | Dauerhaft kritisch ab |
| --- | --- | --- | --- |
| Generator | 0,25 | 0,06 | u ≈ 1,11 |
| Leitung | 0,60 | 0,12 | u ≈ 1,10 |
| Trafo | 0,09 | 0,025 | u ≈ 1,13 (träge, darf kurz überlastet werden) |

- Leitungsverluste: `Verlust = P · Verlust_bei_Nennlast · u` (also ∝ I²).
- Schutzstufen: keiner (Schaden bei T ≥ 1, Reparatur kostet Geld und Zeit, Klicken beschleunigt) → Sicherung (löst bei T ≥ 0,92 aus, Klick zum Zurücksetzen) → Schutzschalter (schaltet bei T < 0,35 selbst wieder ein) → Regler (kappt auf 100 %, Überschuss geht verloren).
- Trafo hat immer eigenen Temperaturschutz: Abschaltung + 5 % Alterung (max. 30 %), „Trafo überholen“ setzt zurück.
- Netzanschluss: harte Grenze, Überschuss wird abgeregelt.
- Offline: kein Schaden, Regler erzwungen, Speicher ruht, max. 12 h (24 h mit Forschung).

## Standorte (Epochen)

| Epoche | Standort | Tor | Genehmigung | Anlage (Start) | Grundpreis | Wachstum | Max. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Kurbel | – | – | Fahrraddynamo | – | – | – |
| 1 | Garten | erstes Holzwindrad | – | Holzwindrad 150 W, 1,4 m | 15 € | 1,15 | 10 |
| 2 | Bauernhof | 800 € | 30 s | Kleinwindanlage 5 kW, 5 m | 250 € | 1,12 | 25 |
| 3 | Deich | 100.000 € | 60 s | Bürgerwindrad 500 kW, 40 m | 25.000 € | 1,07 | 40 |
| 4 | Geest | 6 Mio. € | 90 s | Onshore 3 MW, 120 m | 250.000 € | 1,02 | 120 |
| 5 | Nordsee | 150 Mio. € | 120 s | Offshore 12 MW, 200 m | 1,5 Mio. € | 1,012 | 400 |

Jeder Standort hat Stufen für Rotor, Turm, Fundament (Voraussetzung für hohe Türme), Generator und Regelung sowie Leitung, Trafo und Netzanschluss (Stufen = neue Spannungsebene, „×2“ = Kapazität verdoppeln für das 2,5-fache des letzten Preises), Schutz und Speicher. Alle Werte: `src/data/sites.ts`.

## Pacing (Balancing-Bot, `npm run balance`)

Der Bot kauft nach Amortisationszeit und klickt 30 min lang 3-mal pro Sekunde. Ergebnisse für drei Seeds:

| Meilenstein | Ziel | Bot (Seeds 42 / 1 / 7) |
| --- | --- | --- |
| Erstes Windrad | ~1 min | 1 min |
| Bauernhof | ~20 min | 18–19 min |
| Deich | ~1 h | 1 h 30 – 1 h 47 |
| Geest | ~2,5 h | 2 h 13 – 3 h 33 |
| Offshore | ~5 h | 3 h 50 – 6 h 50 |

Die Streuung kommt vom Wetter (Seed). Ein aktiver Mensch ist meist schneller als der Bot.

## Prestige

„Repowering“ ab 1 GW installierter Offshore-Leistung. Know-how `K = ⌊√(gelieferte Energie / 1 GWh)⌋`, je Punkt +2 % auf alle Einnahmen. Lexikon, Erfolge und gelieferte Energie bleiben erhalten.

## Annahmen und bewusste Vereinfachungen

- Strom in der Ampere-Anzeige: `I = P / U` (ohne √3 für Drehstrom).
- Alle Anlagen eines Standorts sind baugleich und sehen denselben Wind; Schäden treffen daher alle gleichzeitig.
- Kosten sind Spielgeld und nicht real; das Lexikon nennt reale Größenordnungen.
- Kapazitätsfaktoren: Garten 5–15 %, Hof 14–23 %, Deich 23–32 %, Geest ~40 %, Nordsee ~50 % (vor Parkverlusten).
