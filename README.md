# Rückenwind

Ein Idle-Spiel über Windenergie: Du startest mit einer Handkurbel am Gartenzaun, stellst dir bald das erste hölzerne Windrad Marke Eigenbau in den Garten und baust Schritt für Schritt bis zum Offshore-Windpark mit mehreren Gigawatt in der Nordsee.

Nebenbei erklärt das Spiel, wie Windkraftanlagen und Stromnetz funktionieren – über die Mechaniken selbst, nicht über Texttafeln.

## Spielen

```bash
npm install
npm run dev      # Entwicklungsserver, http://localhost:5173
npm run build    # statischer Build in dist/ (läuft auf jedem Webspace)
```

Steuerung: Kurbel anklicken oder **Leertaste**. Tasten **1–5** wechseln die Shop-Reiter. Läuft auf Desktop und Handy, der Spielstand liegt im Browser (Export/Import im Menü).

## Was dich erwartet

- **Sechs Epochen:** Kurbel → Garten → Bauernhof → Bürgerwind am Deich → Windpark auf der Geest → Offshore Nordsee.
- **Die Kette ist nur so stark wie ihr schwächstes Glied:** Rotor, Turm, Generator, Leitung, Trafo und Netzanschluss müssen zueinander passen. Wer einseitig ausbaut, lässt Leitungen durchbrennen oder den Trafo abschalten.
- **Echte Physik:** P = ½ · ρ · A · v³ · cp, Höhenprofil des Winds, Leistungskurve mit Anlauf, Nennleistung und Sturmabschaltung, Leitungsverluste ∝ I².
- **Schwankender Strompreis:** Nachbarschaft, Einspeisevergütung, Börse mit Tagesgang, Merit-Order und negativen Preisen, Liefervertrag (PPA); Speicher mit Regeln.
- **Lernen nebenbei:** „Warum?“-Zeilen im Shop, Schadensmeldungen mit Ursache, Opa Hinnerks Logbuch, Nachrichtenticker, 54 Lexikon-Karten, Energiefluss-Leiste.
- **Meta:** 39 Forschungen und Meilensteine, Wetter-Ereignisse, 26 Erfolge, Offline-Ertrag, Prestige („Repowering“).

## Entwicklung

```bash
npm test         # Vitest: Physik, Überlast, Preise, Offline, Speicherstand
npm run typecheck
npm run balance -- --hours 8 --seed 42   # Balancing-Bot spielt headless und misst das Pacing
```

| Ordner | Inhalt |
| --- | --- |
| `src/sim/` | Simulation als reine Logik: Wind, Preis, Physik, Energiekette, Spielzustand |
| `src/data/` | Inhalte als Daten: Standorte und Bauteile, Forschung, Erfolge, Texte |
| `src/state/` | Speichern, Laden, Export/Import, Migration |
| `src/ui/` | Oberfläche: Canvas-Szene, Shop, Energiefluss, Kopfleiste, Modale |
| `tools/` | Balancing-Simulator |
| `tests/` | Unit-Tests |

Konkrete Zahlen und Formeln: [DESIGN.md](DESIGN.md).
