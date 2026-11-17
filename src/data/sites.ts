// Standorte = Epochen 1–5. Physikalische Werte in realen Größenordnungen,
// Kosten in Spielgeld (siehe DESIGN.md).

import type { SiteDef, SiteId } from '../sim/types';

const garten: SiteDef = {
  id: 'garten',
  epoch: 1,
  name: 'Garten',
  place: 'Hinter dem Haus in Windhusen',
  unlockCost: 0,
  permitSeconds: 0,
  unlockText: 'Opas Garten. Platz für ein paar Holzwindräder.',
  wind: { v10: 5.2, alpha: 0.3, gust: 0.25, diurnal: 0.15 },
  turbine: { name: 'Holzwindrad Marke Eigenbau', style: 'wood', baseCost: 15, growth: 1.15, maxCount: 10, cutIn: 2.5 },
  parts: {
    rotor: [
      { name: 'Holzlatten, 1,4 m', diameter: 1.4, cp: 0.2, cost: 0, why: 'Zusammengenagelte Latten. Fängt Wind, aber nicht elegant.', lexicon: 'holzwindrad' },
      { name: 'Geschnitzte Holzflügel, 1,8 m', diameter: 1.8, cp: 0.26, cost: 60, why: 'Ein Profil wie ein Flugzeugflügel und 65 % mehr Fläche (Fläche wächst mit dem Durchmesser²).', lexicon: 'rotorflaeche' },
      { name: 'Alu-Flügel, 2,4 m', diameter: 2.4, cp: 0.3, cost: 450, why: 'Doppelte Blattlänge = vierfache Fläche = vierfache Leistung.', lexicon: 'betz' },
      { name: 'GFK-Bausatz, 3,0 m', diameter: 3.0, cp: 0.34, cost: 1500, why: 'Glasfaserverstärkter Kunststoff: leicht, steif, sauber profiliert.', lexicon: 'gfk' },
    ],
    tower: [
      { name: 'Holzpfahl, 3 m', height: 3, needsFoundation: 0, cost: 0, why: 'Zwischen Hecke und Schuppen ist der Wind gebremst und verwirbelt.' },
      { name: 'Holzmast, 6 m', height: 6, needsFoundation: 0, cost: 40, why: 'Doppelte Höhe über dem Garten: rund 20 % mehr Wind, also fast 80 % mehr Leistung (v³).', lexicon: 'windprofil' },
      { name: 'Stahlrohrmast, 10 m', height: 10, needsFoundation: 1, cost: 600, why: 'Über den Dachfirst hinaus. Braucht Erdanker.' },
      { name: 'Gittermast, 15 m', height: 15, needsFoundation: 2, cost: 2000, why: 'Weit über Bäumen und Häusern weht der Wind gleichmäßiger. Braucht einen Betonsockel.', lexicon: 'gittermast' },
    ],
    foundation: [
      { name: 'Eingegraben', cost: 0, why: 'Ein Loch, ein Pfahl, festgetreten.' },
      { name: 'Erdanker mit Abspannseilen', cost: 150, why: 'Seile nehmen die Kippkräfte auf – nötig ab 10 m Mast.', lexicon: 'fundament' },
      { name: 'Betonsockel', cost: 900, why: 'Ein hoher Mast hebelt gewaltig am Boden. Beton hält dagegen.' },
    ],
    generator: [
      { name: 'Gebrauchte Lichtmaschine, 150 W', ratedKW: 0.15, eff: 0.6, cost: 0, why: 'Vom Schrottplatz. Macht aus Drehung Strom: Magnet, Spule, Bewegung.', lexicon: 'generator-prinzip' },
      { name: 'Überholte Lichtmaschine, 400 W', ratedKW: 0.4, eff: 0.68, cost: 120, why: 'Neue Lager und Wicklung: mehr Leistung, weniger Wärme.' },
      { name: 'Permanentmagnet-Generator, 1 kW', ratedKW: 1, eff: 0.78, cost: 500, why: 'Starke Magnete statt Erregerstrom – läuft schon bei wenig Wind an.', lexicon: 'pmg' },
      { name: 'Permanentmagnet-Generator, 2,5 kW', ratedKW: 2.5, eff: 0.82, cost: 2000, why: 'Groß genug für den GFK-Rotor bei Sturm.' },
    ],
    control: [
      { name: 'Keine Regelung', kind: 'none', breakAt: 15, cost: 0, why: 'Im Sturm dreht der Rotor ungebremst – ab etwa 15 m/s fliegen Späne.' },
      { name: 'Seitenfahne', kind: 'furl', furlAt: 10, cost: 80, why: 'Ab 10 m/s klappt die Fahne den Rotor aus dem Wind. Weniger Leistung, aber nichts bricht.', lexicon: 'seitenfahne' },
      { name: 'Seitenfahne, nachjustiert', kind: 'furl', furlAt: 12, cost: 500, why: 'Klappt erst bei 12 m/s weg: mehr Ertrag bei Starkwind.' },
    ],
  },
  chain: {
    cable: [
      { name: 'Alter Klingeldraht', capacityKW: 0.12, lossAtRated: 0.12, voltage: '12 V', levelCost: 15, levelName: 'Zweiter Draht parallel', cost: 0, why: '0,5 mm² Kupfer. Bei 12 V verträgt er nur 10 A – also 120 W.', lexicon: 'leitung-verluste' },
      { name: 'Lautsprecherkabel 1,5 mm²', capacityKW: 0.3, lossAtRated: 0.09, voltage: '12 V', levelCost: 45, levelName: 'Zweite Ader parallel', cost: 50, why: 'Dreifacher Querschnitt, ein Drittel des Widerstands.', lexicon: 'querschnitt' },
      { name: 'Erdkabel 6 mm²', capacityKW: 0.72, lossAtRated: 0.07, voltage: '12 V', levelCost: 280, levelName: 'Zweites Kabel parallel', cost: 380, why: '60 A bei 12 V. Dicker geht kaum noch – mehr Volt wären klüger.' },
      { name: '48-V-System mit 10 mm²', capacityKW: 4, lossAtRated: 0.04, voltage: '48 V', levelCost: 1500, levelName: 'Zweites Kabel parallel', cost: 2400, why: 'Vierfache Spannung, ein Viertel des Stroms, ein Sechzehntel der Verluste.', lexicon: 'spannung' },
    ],
  },
  protection: [
    { name: 'Kein Schutz', mode: 'none', cost: 0, why: 'Was zu heiß wird, brennt durch.' },
    { name: 'Schmelzsicherung', mode: 'fuse', cost: 8, why: 'Ein dünner Draht, der als Erstes schmilzt – und so die Leitung rettet. Danach von Hand tauschen.', lexicon: 'sicherung' },
    { name: 'Leitungsschutzschalter', mode: 'breaker', cost: 250, why: 'Schaltet bei Überlast ab und nach dem Abkühlen selbst wieder ein.', lexicon: 'schutzschalter' },
    { name: 'Laderegler mit Abregelung', mode: 'regulator', cost: 1800, why: 'Kappt sanft auf 100 %. Kein Ausfall mehr, aber der Überschuss geht verloren.', lexicon: 'einspeiseregler' },
  ],
  storage: [
    { name: 'Autobatterie 12 V', capacityKWh: 0.6, powerKW: 0.3, eff: 0.8, cost: 50, levelCost: 80, why: 'Speichert Mittagswind für den Abend, wenn alle Handys laden wollen.', lexicon: 'batterie' },
    { name: 'Batteriebank 4 kWh', capacityKWh: 4, powerKW: 1.5, eff: 0.85, cost: 800, levelCost: 600, why: 'Mehrere Akkus zusammengeschaltet – reicht für eine ganze Gartenparty.' },
  ],
  markets: ['nachbarn'],
  demand: {
    baseKW: 0.12,
    baseName: 'Familie Krause nebenan',
    customers: [
      { name: 'Nachbarin Hansen', addKW: 0.2, cost: 25, why: 'Handy, Radio und die Lichterkette im Apfelbaum.' },
      { name: 'Kiosk am Deich', addKW: 0.5, cost: 200, why: 'Ein Kühlschrank voller Brause läuft rund um die Uhr.' },
      { name: 'Campingplatz Windhusen', addKW: 1.2, cost: 900, why: 'Wohnmobile, Duschen, Kaffeemaschinen.' },
      { name: 'Dorffest-Bühne', addKW: 2.5, cost: 2500, why: 'Verstärker, Scheinwerfer und eine Zuckerwattemaschine.' },
    ],
  },
  wakeLoss: 0,
  maintenance: 0,
  repairSeconds: 20,
};

const hof: SiteDef = {
  id: 'hof',
  epoch: 2,
  name: 'Bauernhof',
  place: 'Hof Petersen, freies Feld',
  unlockCost: 800,
  permitSeconds: 30,
  unlockText: 'Bauer Petersen verpachtet dir einen Streifen Feld. Und: Du darfst ins Netz einspeisen!',
  wind: { v10: 5.0, alpha: 0.18, gust: 0.18, diurnal: 0.1 },
  turbine: { name: 'Kleinwindanlage', style: 'small', baseCost: 250, growth: 1.12, maxCount: 25, cutIn: 3 },
  parts: {
    rotor: [
      { name: 'Rotor 5 m', diameter: 5, cp: 0.3, cost: 0, why: 'Drei GFK-Blätter, fertig gekauft.' },
      { name: 'Rotor 8 m', diameter: 8, cp: 0.33, cost: 900, why: '2,6-fache Fläche. Achtung: Bei Starkwind schafft der alte Generator das nicht.' },
      { name: 'Rotor 12 m', diameter: 12, cp: 0.36, cost: 7200, why: 'Mehr als doppelt so viel Fläche wie 8 m.' },
      { name: 'Rotor 15 m', diameter: 15, cp: 0.38, cost: 33000, why: '177 m² Rotorfläche – so groß wie ein Tennisplatz-Viertel.' },
    ],
    tower: [
      { name: 'Gittermast 12 m', height: 12, needsFoundation: 0, cost: 0, why: 'Über die Hecken des Hofs hinaus.' },
      { name: 'Gittermast 18 m', height: 18, needsFoundation: 1, cost: 1500, why: '+7 % Wind ≈ +23 % Leistung. Braucht ein Betonfundament.' },
      { name: 'Rohrmast 24 m', height: 24, needsFoundation: 1, cost: 8400, why: 'Ruhigerer Wind, weniger Böen.' },
      { name: 'Rohrmast 30 m', height: 30, needsFoundation: 2, cost: 30000, why: 'Die Grenze dessen, was als Kleinwindanlage durchgeht.' },
    ],
    foundation: [
      { name: 'Punktfundament', cost: 0, why: 'Vier Betonklötze für die Mastbeine.' },
      { name: 'Betonfundament', cost: 2400, why: 'Eine Platte, die den Mast auch bei Sturm hält.' },
      { name: 'Verstärktes Fundament', cost: 18000, why: 'Stahlbewehrt, tiefer gegründet – für 30 m Mast.' },
    ],
    generator: [
      { name: 'Asynchrongenerator 5 kW', ratedKW: 5, eff: 0.85, cost: 0, why: 'Robust und einfach, mit Wechselrichter fürs Netz.', lexicon: 'asynchron' },
      { name: 'Asynchrongenerator 12 kW', ratedKW: 12, eff: 0.87, cost: 1800, why: 'Passt zum 8-m-Rotor.' },
      { name: 'Generator 25 kW', ratedKW: 25, eff: 0.89, cost: 12000, why: 'Passt zum 12-m-Rotor.' },
      { name: 'Generator 50 kW', ratedKW: 50, eff: 0.9, cost: 42000, why: 'Passt zum 15-m-Rotor.' },
    ],
    control: [
      { name: 'Stall-Regelung', kind: 'stall', stallAt: 11, cutOut: 25, cost: 0, why: 'Die Blätter sind so geformt, dass die Strömung bei Starkwind abreißt. Passiv, aber unpräzise.', lexicon: 'stall' },
      { name: 'Elektrischer Pitch', kind: 'pitch', cutOut: 25, cost: 15000, why: 'Motoren drehen die Blätter aus dem Wind: Der Generator bleibt immer bei 100 %.', lexicon: 'pitch' },
    ],
  },
  chain: {
    cable: [
      { name: 'Erdkabel 4×16 mm²', capacityKW: 30, lossAtRated: 0.05, voltage: '400 V', levelCost: 360, levelName: 'Zweites Kabel', cost: 0, why: 'Drehstrom mit 400 V – wie in jeder Werkstatt.', lexicon: 'wechselstrom' },
      { name: 'Erdkabel 4×120 mm²', capacityKW: 200, lossAtRated: 0.035, voltage: '400 V', levelCost: 3000, levelName: 'Zweites Kabel', cost: 9000, why: 'Daumendick. Mehr Kupfer, weniger Widerstand.' },
      { name: 'Mittelspannungskabel 20 kV', capacityKW: 2000, lossAtRated: 0.012, voltage: '20 kV', levelCost: 24000, levelName: 'Zweites System', cost: 72000, requires: { slot: 'trafo', tier: 2 }, why: '50-fache Spannung: Die Verluste sinken auf einen Bruchteil. Braucht eine eigene Trafostation.' },
    ],
    trafo: [
      { name: 'Anteil am Ortsnetztrafo, 25 kVA', capacityKW: 25, lossAtRated: 0.01, voltage: '0,4 kV', levelCost: 300, levelName: 'Mehr Anteil buchen', cost: 0, why: 'Du teilst dir den Trafo der Stadtwerke mit dem Dorf.', lexicon: 'trafo' },
      { name: 'Verstärkter Ortsnetztrafo, 160 kVA', capacityKW: 160, lossAtRated: 0.01, voltage: '0,4 kV', levelCost: 2400, levelName: 'Lüfter nachrüsten', cost: 6000, why: 'Die Stadtwerke tauschen den Trafo – auf deine Kosten.' },
      { name: 'Eigene Trafostation 0,4/20 kV, 630 kVA', capacityKW: 630, lossAtRated: 0.008, voltage: '20 kV', levelCost: 15000, levelName: 'Zweiter Trafo', cost: 48000, why: 'Hebt die Spannung auf 20 kV. Gleiche Leistung, ein Fünfzigstel des Stroms.' },
    ],
    grid: [
      { name: 'Hausanschluss 25 kW', capacityKW: 25, lossAtRated: 0, voltage: '0,4 kV', levelCost: 360, levelName: 'Anschlussleistung erhöhen', cost: 0, why: 'Mehr nimmt der Netzbetreiber über den Hausanschluss nicht ab.', lexicon: 'einspeiseverguetung' },
      { name: 'Niederspannungsanschluss 150 kW', capacityKW: 150, lossAtRated: 0, voltage: '0,4 kV', levelCost: 2400, levelName: 'Anschlussleistung erhöhen', cost: 6000, why: 'Ein eigener Anschluss direkt am Ortsnetz.' },
      { name: 'Mittelspannungsanschluss 1,2 MW', capacityKW: 1200, lossAtRated: 0, voltage: '20 kV', levelCost: 18000, levelName: 'Anschlussleistung erhöhen', cost: 54000, requires: { slot: 'trafo', tier: 2 }, why: 'Einspeisung direkt ins 20-kV-Netz.' },
    ],
  },
  protection: [
    { name: 'Schmelzsicherung', mode: 'fuse', cost: 0, why: 'Pflicht am Hausanschluss. Schmilzt bei Überlast.' },
    { name: 'Leitungsschutzschalter', mode: 'breaker', cost: 720, why: 'Schaltet nach dem Abkühlen automatisch wieder ein.' },
    { name: 'Einspeisemanagement', mode: 'regulator', cost: 6000, why: 'Regelt die Anlagen herunter, bevor etwas überlastet. Überschuss geht verloren.' },
  ],
  storage: [
    { name: 'Batteriespeicher 20 kWh', capacityKWh: 20, powerKW: 10, eff: 0.88, cost: 2400, levelCost: 1500, why: 'Wie ein großer Heimspeicher. Fängt ab, was das Netz gerade nicht nimmt.' },
    { name: 'Lithium-Speicher 150 kWh', capacityKWh: 150, powerKW: 60, eff: 0.9, cost: 24000, levelCost: 12000, why: 'Ein Kühlschrankschrank voller Zellen.' },
  ],
  markets: ['verguetung'],
  selfUse: { kW: 3, priceCt: 30 },
  feedInCt: 10,
  wakeLoss: 0,
  maintenance: 0.02,
  repairSeconds: 30,
};

const deich: SiteDef = {
  id: 'deich',
  epoch: 3,
  name: 'Bürgerwind am Deich',
  place: 'Feld hinterm Deich',
  unlockCost: 100000,
  permitSeconds: 60,
  unlockText: 'Die Bürgerversammlung stimmt zu: Windhusen bekommt einen Bürgerwindpark! Jeder im Dorf kann Anteile kaufen.',
  wind: { v10: 5.2, alpha: 0.16, gust: 0.12, diurnal: 0.06 },
  turbine: { name: 'Bürgerwindrad', style: 'classic', baseCost: 25000, growth: 1.07, maxCount: 40, cutIn: 3 },
  parts: {
    rotor: [
      { name: 'Rotor 40 m', diameter: 40, cp: 0.4, cost: 0, why: 'Klassiker der 90er: drei Blätter, 40 m Durchmesser.' },
      { name: 'Rotor 60 m', diameter: 60, cp: 0.43, cost: 180000, why: 'Mehr als doppelt so viel Fläche. Der 500-kW-Generator wird das nicht mögen.' },
      { name: 'Rotor 80 m', diameter: 80, cp: 0.45, cost: 1500000, why: '5.000 m² Rotorfläche – fast ein Fußballfeld-Drittel.' },
    ],
    tower: [
      { name: 'Stahlrohrturm 50 m', height: 50, needsFoundation: 0, cost: 0, why: 'In 50 m Höhe weht es rund 30 % stärker als am Boden.' },
      { name: 'Stahlrohrturm 65 m', height: 65, needsFoundation: 1, cost: 150000, why: '+4 % Wind ≈ +13 % Leistung.' },
      { name: 'Stahlrohrturm 80 m', height: 80, needsFoundation: 2, cost: 1100000, why: 'Höher hinaus, gleichmäßigerer Wind.' },
    ],
    foundation: [
      { name: 'Flachgründung', cost: 0, why: 'Eine runde Betonplatte, 15 m Durchmesser.' },
      { name: 'Verstärkte Flachgründung', cost: 90000, why: 'Mehr Beton, mehr Stahl.' },
      { name: 'Pfahlgründung', cost: 720000, why: 'In der weichen Marsch tragen erst Pfähle in festen Boden.', lexicon: 'fundament' },
    ],
    generator: [
      { name: 'Asynchrongenerator 500 kW', ratedKW: 500, eff: 0.92, cost: 0, why: 'Mit Getriebe: Der Rotor dreht 30-mal pro Minute, der Generator 1.500-mal.', lexicon: 'getriebe' },
      { name: 'Doppelt gespeister Generator 1,2 MW', ratedKW: 1200, eff: 0.94, cost: 240000, why: 'Kann bei wechselnder Drehzahl einspeisen – ideal für böigen Wind.', lexicon: 'dfig' },
      { name: 'Doppelt gespeister Generator 2 MW', ratedKW: 2000, eff: 0.945, cost: 1800000, why: 'Passt zum 80-m-Rotor.' },
    ],
    control: [
      { name: 'Stall-Regelung', kind: 'stall', stallAt: 11.5, cutOut: 25, cost: 0, why: 'Passive Begrenzung durch Strömungsabriss.' },
      { name: 'Pitch-Regelung', kind: 'pitch', cutOut: 25, cost: 180000, why: 'Die Blätter drehen sich aus dem Wind – exakt auf Nennleistung.', lexicon: 'pitch' },
      { name: 'Pitch + Azimut-Nachführung', kind: 'pitch', cutOut: 25, bonus: 0.04, cost: 900000, why: 'Die Gondel dreht sich genauer in den Wind: +4 % Ertrag.', lexicon: 'azimut' },
    ],
  },
  chain: {
    cable: [
      { name: 'Mittelspannungskabel 20 kV', capacityKW: 4000, lossAtRated: 0.025, voltage: '20 kV', levelCost: 24000, levelName: 'Zweites Kabelsystem', cost: 0, why: 'Jede Anlage hat unten im Turm einen Trafo auf 20 kV.' },
      { name: 'Parkverkabelung 33 kV', capacityKW: 20000, lossAtRated: 0.018, voltage: '33 kV', levelCost: 360000, levelName: 'Zweites Kabelsystem', cost: 1800000, why: 'Höhere Spannung für mehr Anlagen am selben Kabel.' },
    ],
    trafo: [
      { name: 'Übergabestation 2,5 MVA', capacityKW: 2500, lossAtRated: 0.01, voltage: '20 kV', levelCost: 30000, levelName: 'Zusätzlicher Trafo', cost: 0, why: 'Sammelt den Strom der Anlagen und übergibt ihn ans Netz.' },
      { name: 'Umspannwerk 20/110 kV, 40 MVA', capacityKW: 40000, lossAtRated: 0.006, voltage: '110 kV', levelCost: 720000, levelName: 'Zweiter Umspanner', cost: 3600000, why: 'Ein eigenes Umspannwerk hebt auf 110 kV – Hochspannung.', lexicon: 'umspannwerk' },
    ],
    grid: [
      { name: 'Mittelspannungsnetz 2,5 MW', capacityKW: 2500, lossAtRated: 0, voltage: '20 kV', levelCost: 36000, levelName: 'Einspeiseleistung erhöhen', cost: 0, why: 'Das 20-kV-Netz des Dorfes nimmt nur begrenzt auf.' },
      { name: 'Hochspannungsnetz 110 kV, 40 MW', capacityKW: 40000, lossAtRated: 0, voltage: '110 kV', levelCost: 900000, levelName: 'Einspeiseleistung erhöhen', cost: 4200000, requires: { slot: 'trafo', tier: 1 }, why: 'Anschluss ans regionale Hochspannungsnetz.' },
    ],
  },
  protection: [
    { name: 'Leistungsschalter', mode: 'breaker', cost: 0, why: 'Trennt bei Überlast und schaltet nach dem Abkühlen wieder zu.' },
    { name: 'Einspeiseregler', mode: 'regulator', cost: 150000, why: 'Drosselt den Park, bevor Leitung oder Trafo überlasten.' },
  ],
  storage: [
    { name: 'Containerspeicher 2 MWh', capacityKWh: 2000, powerKW: 1000, eff: 0.9, cost: 360000, levelCost: 240000, why: 'Ein Schiffscontainer voller Lithium-Zellen.', lexicon: 'grossspeicher' },
  ],
  markets: ['verguetung', 'boerse'],
  feedInCt: 9,
  wakeLoss: 0.03,
  maintenance: 0.03,
  repairSeconds: 45,
};

const geest: SiteDef = {
  id: 'geest',
  epoch: 4,
  name: 'Windpark Geest',
  place: 'Hügelland im Hinterland',
  unlockCost: 6000000,
  permitSeconds: 90,
  unlockText: 'Das Umweltgutachten ist durch, das Umspannwerk geplant: Platz für einen echten Windpark.',
  wind: { v10: 4.3, alpha: 0.2, gust: 0.1, diurnal: 0.05 },
  turbine: { name: 'Moderne Onshore-Anlage', style: 'modern', baseCost: 250000, growth: 1.02, maxCount: 120, cutIn: 3 },
  parts: {
    rotor: [
      { name: 'Rotor 120 m', diameter: 120, cp: 0.45, cost: 0, why: 'Jedes Blatt 59 m lang – länger als ein Airbus A320.' },
      { name: 'Rotor 150 m', diameter: 150, cp: 0.46, cost: 24000000, why: '56 % mehr Fläche als 120 m.' },
      { name: 'Rotor 170 m', diameter: 170, cp: 0.47, cost: 150000000, why: 'Schwachwindrotor: riesig, damit auch mäßiger Wind viel bringt.' },
    ],
    tower: [
      { name: 'Stahlrohrturm 120 m', height: 120, needsFoundation: 0, cost: 0, why: 'In 120 m Höhe weht es über 60 % stärker als in 10 m.' },
      { name: 'Hybridturm 150 m', height: 150, needsFoundation: 1, cost: 18000000, why: 'Unten Beton, oben Stahl.', lexicon: 'hybridturm' },
      { name: 'Hybridturm 170 m', height: 170, needsFoundation: 2, cost: 120000000, why: 'Fast so hoch wie der Kölner Dom (157 m) – plus Rotor.' },
    ],
    foundation: [
      { name: 'Flachgründung', cost: 0, why: '1.500 m³ Beton.' },
      { name: 'Flachgründung XL', cost: 12000000, why: 'Breiter und schwerer für höhere Türme.' },
      { name: 'Pfahlgründung', cost: 90000000, why: 'Für 170 m Turm auf weichem Grund.' },
    ],
    generator: [
      { name: 'Doppelt gespeister Generator 3 MW', ratedKW: 3000, eff: 0.945, cost: 0, why: 'Bewährter Standard mit Getriebe.' },
      { name: 'Generator 5 MW', ratedKW: 5000, eff: 0.95, cost: 30000000, why: 'Passt zum 150-m-Rotor.' },
      { name: 'Direktantrieb 7 MW', ratedKW: 7000, eff: 0.955, cost: 180000000, why: 'Ohne Getriebe: Ein riesiger Ringgenerator dreht so langsam wie der Rotor. Weniger Verschleiß.', lexicon: 'direktantrieb' },
    ],
    control: [
      { name: 'Pitch-Regelung', kind: 'pitch', cutOut: 25, cost: 0, why: 'Standard bei allen großen Anlagen.' },
      { name: 'Einzelblattverstellung', kind: 'pitch', cutOut: 25, bonus: 0.03, cost: 15000000, why: 'Jedes Blatt einzeln geregelt: gleicht Höhenunterschiede im Wind aus. +3 % Ertrag.' },
    ],
  },
  chain: {
    cable: [
      { name: 'Parkverkabelung 33 kV', capacityKW: 30000, lossAtRated: 0.02, voltage: '33 kV', levelCost: 600000, levelName: 'Zusätzlicher Kabelstrang', cost: 0, why: 'Mehrere Anlagen hängen in Reihe an einem Strang.' },
      { name: 'Parkverkabelung 66 kV', capacityKW: 150000, lossAtRated: 0.012, voltage: '66 kV', levelCost: 9000000, levelName: 'Zusätzlicher Kabelstrang', cost: 36000000, why: 'Doppelte Spannung, viertel Verluste.' },
    ],
    trafo: [
      { name: 'Umspannwerk 33/110 kV, 40 MVA', capacityKW: 40000, lossAtRated: 0.006, voltage: '110 kV', levelCost: 720000, levelName: 'Zusätzlicher Umspanner', cost: 0, why: 'Ölgekühlte Transformatoren so groß wie ein Lkw.', lexicon: 'umspannwerk' },
      { name: 'Umspannwerk 110/380 kV, 400 MVA', capacityKW: 400000, lossAtRated: 0.004, voltage: '380 kV', levelCost: 12000000, levelName: 'Zusätzlicher Umspanner', cost: 48000000, why: 'Anschluss an die Höchstspannung – die Autobahn des Stroms.' },
    ],
    grid: [
      { name: 'Hochspannung 110 kV, 40 MW', capacityKW: 40000, lossAtRated: 0, voltage: '110 kV', levelCost: 900000, levelName: 'Einspeiseleistung erhöhen', cost: 0, why: 'Regionales Verteilnetz.' },
      { name: 'Höchstspannung 380 kV, 500 MW', capacityKW: 500000, lossAtRated: 0, voltage: '380 kV', levelCost: 15000000, levelName: 'Einspeiseleistung erhöhen', cost: 60000000, requires: { slot: 'trafo', tier: 1 }, why: 'Übertragungsnetz: Strom für Hamburg und weiter.' },
    ],
  },
  protection: [
    { name: 'Leistungsschalter + Netzschutz', mode: 'breaker', cost: 0, why: 'Trennt bei Überlast, schaltet automatisch wieder zu.' },
    { name: 'Parkregler', mode: 'regulator', cost: 4800000, why: 'Ein Rechner regelt alle Anlagen so, dass nichts überlastet.', lexicon: 'einspeiseregler' },
  ],
  storage: [
    { name: 'Großbatteriespeicher 40 MWh', capacityKWh: 40000, powerKW: 20000, eff: 0.9, cost: 18000000, levelCost: 9000000, why: 'Kauft billig bei Sturm, verkauft teuer am Abend.', lexicon: 'grossspeicher' },
  ],
  markets: ['boerse', 'ppa'],
  wakeLoss: 0.07,
  maintenance: 0.03,
  repairSeconds: 60,
};

const nordsee: SiteDef = {
  id: 'nordsee',
  epoch: 5,
  name: 'Offshore Nordsee',
  place: '80 km vor der Küste',
  unlockCost: 150000000,
  permitSeconds: 120,
  unlockText: 'Zuschlag in der Ausschreibung! Das Errichterschiff ist gechartert. Auf in die Nordsee.',
  wind: { v10: 7.3, alpha: 0.1, gust: 0.07, diurnal: 0.02 },
  turbine: { name: 'Offshore-Anlage', style: 'offshore', baseCost: 1500000, growth: 1.012, maxCount: 400, cutIn: 3 },
  parts: {
    rotor: [
      { name: 'Rotor 200 m', diameter: 200, cp: 0.46, cost: 0, why: 'Die Rotorfläche entspricht fast fünf Fußballfeldern.' },
      { name: 'Rotor 236 m', diameter: 236, cp: 0.47, cost: 300000000, why: 'Ein Blatt ist 115 m lang und über 30 t schwer.', lexicon: 'cfk' },
      { name: 'Rotor 260 m', diameter: 260, cp: 0.48, cost: 2000000000, why: 'Die größten Rotoren der Welt. Eine Umdrehung überstreicht 5 Hektar.' },
    ],
    tower: [
      { name: 'Nabenhöhe 130 m', height: 130, needsFoundation: 0, cost: 0, why: 'Über dem Meer bremst fast nichts den Wind.' },
      { name: 'Nabenhöhe 150 m', height: 150, needsFoundation: 1, cost: 200000000, why: 'Mehr Höhe für größere Rotoren.' },
      { name: 'Nabenhöhe 165 m', height: 165, needsFoundation: 2, cost: 1500000000, why: 'Die Blattspitze reicht fast 300 m hoch.' },
    ],
    foundation: [
      { name: 'Monopile', cost: 0, why: 'Ein Stahlrohr, 8 m dick, 40 m tief in den Meeresboden gerammt.', lexicon: 'monopile' },
      { name: 'XL-Monopile', cost: 150000000, why: '10 m Durchmesser, 2.000 t Stahl.' },
      { name: 'Jacket', cost: 1000000000, why: 'Ein Stahlgitter mit vier Beinen – für tiefes Wasser und schwere Anlagen.', lexicon: 'jacket' },
    ],
    generator: [
      { name: 'Generator 12 MW', ratedKW: 12000, eff: 0.95, cost: 0, why: 'Eine Umdrehung versorgt einen Haushalt zwei Tage.' },
      { name: 'Generator 15 MW', ratedKW: 15000, eff: 0.955, cost: 400000000, why: 'Passt zum 236-m-Rotor.' },
      { name: 'Generator 20 MW', ratedKW: 20000, eff: 0.96, cost: 3000000000, why: 'Die Spitze der Technik.' },
    ],
    control: [
      { name: 'Pitch-Regelung', kind: 'pitch', cutOut: 25, cost: 0, why: 'Abschaltung bei 25 m/s.' },
      { name: 'Pitch + Sturmregelung', kind: 'pitch', cutOut: 31, cost: 200000000, why: 'Statt bei 25 m/s abzuschalten, fährt die Anlage langsam herunter und läuft bis 31 m/s weiter.' },
    ],
  },
  chain: {
    cable: [
      { name: 'Innerparkverkabelung 66 kV', capacityKW: 200000, lossAtRated: 0.015, voltage: '66 kV', levelCost: 20000000, levelName: 'Zusätzlicher Kabelstrang', cost: 0, why: 'Seekabel zwischen den Anlagen, im Meeresboden eingespült.', lexicon: 'seekabel' },
      { name: 'HGÜ-Exportkabel ±320 kV', capacityKW: 1200000, lossAtRated: 0.008, voltage: '±320 kV DC', levelCost: 400000000, levelName: 'Zweites Kabelpaar', cost: 1500000000, requires: { slot: 'trafo', tier: 1 }, why: 'Gleichstrom über 100 km: kein Blindstrom, kaum Verluste.', lexicon: 'hgue' },
      { name: 'HGÜ-Exportkabel ±525 kV', capacityKW: 2000000, lossAtRated: 0.005, voltage: '±525 kV DC', levelCost: 1500000000, levelName: 'Zweites Kabelpaar', cost: 6000000000, requires: { slot: 'trafo', tier: 1 }, why: 'Die neueste Generation: 2 GW pro Kabelpaar.' },
    ],
    trafo: [
      { name: 'Umspannplattform 66/220 kV', capacityKW: 300000, lossAtRated: 0.006, voltage: '220 kV', levelCost: 30000000, levelName: 'Zweite Plattform', cost: 0, why: 'Eine Plattform auf Stelzen mitten im Meer.' },
      { name: 'HGÜ-Konverterplattform 1,2 GW', capacityKW: 1200000, lossAtRated: 0.01, voltage: '±320 kV DC', levelCost: 600000000, levelName: 'Zweite Konverterplattform', cost: 2000000000, why: 'Macht aus Wechselstrom Gleichstrom. So groß wie ein Bürohaus.', lexicon: 'hgue' },
    ],
    grid: [
      { name: 'Netzverknüpfungspunkt 220 kV', capacityKW: 300000, lossAtRated: 0, voltage: '220 kV', levelCost: 30000000, levelName: 'Einspeiseleistung erhöhen', cost: 0, why: 'An Land übernimmt das Übertragungsnetz.' },
      { name: 'HGÜ-Landstation 1,2 GW', capacityKW: 1200000, lossAtRated: 0, voltage: '380 kV', levelCost: 500000000, levelName: 'Einspeiseleistung erhöhen', cost: 1800000000, requires: { slot: 'trafo', tier: 1 }, why: 'Wandelt zurück in Wechselstrom und speist ins 380-kV-Netz.' },
    ],
  },
  protection: [
    { name: 'Leistungsschalter', mode: 'breaker', cost: 0, why: 'Trennt bei Überlast.' },
    { name: 'Offshore-Parkregler', mode: 'regulator', cost: 150000000, why: 'Hält jeden Strang unter 100 %.' },
  ],
  storage: [
    { name: 'Großspeicher an Land 400 MWh', capacityKWh: 400000, powerKW: 200000, eff: 0.9, cost: 400000000, levelCost: 200000000, why: 'Puffert Sturmspitzen für die Abendspitze.' },
  ],
  markets: ['boerse', 'ppa'],
  wakeLoss: 0.1,
  maintenance: 0.06,
  repairSeconds: 90,
};

export const SITES: Record<SiteId, SiteDef> = { garten, hof, deich, geest, nordsee };
export const SITE_LIST: SiteDef[] = [garten, hof, deich, geest, nordsee];

export const MARKET_INFO: Record<string, { name: string; why: string }> = {
  nachbarn: { name: 'Nachbarschaft', why: 'Feste 40 ct/kWh, abends 50 ct. Aber die Nachbarn brauchen nur begrenzt Strom.' },
  verguetung: { name: 'Einspeisevergütung', why: 'Fester Preis pro kWh, unbegrenzte Abnahme. Sicher, aber ohne Chancen.' },
  boerse: { name: 'Strombörse', why: 'Preis ändert sich jede Stunde: abends teuer, bei viel Wind billig, manchmal negativ.' },
  ppa: { name: 'Liefervertrag (PPA)', why: 'Ein Industriekunde zahlt fest 8,5 ct/kWh – egal was die Börse macht.' },
};
