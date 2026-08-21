// Génère mobile/src/data/expressions.json à partir d'une liste
// d'expressions/locutions espagnoles courantes, écrite à la main
// directement dans ce script (voir README.md de ce dossier pour la
// justification de ce choix plutôt qu'une source ouverte type
// doozan/spanish_data).
//
// Usage : node generate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'src', 'data', 'expressions.json');

// spanish/english/exampleEs/exampleEn/theme — voir README.md pour la
// méthode (curation manuelle, pas de source ouverte automatisée).
const EXPRESSIONS = [
  { spanish: 'no hay de qué', english: "you're welcome / don't mention it", exampleEs: '—Muchas gracias por tu ayuda. —No hay de qué.', exampleEn: '"Thank you so much for your help." "Don\'t mention it."', theme: 'cortesía' },
  { spanish: 'de vez en cuando', english: 'once in a while', exampleEs: 'De vez en cuando vamos al cine los fines de semana.', exampleEn: 'Once in a while we go to the movies on weekends.', theme: 'tiempo' },
  { spanish: 'más vale tarde que nunca', english: 'better late than never', exampleEs: 'Llegó una hora tarde, pero más vale tarde que nunca.', exampleEn: 'He arrived an hour late, but better late than never.', theme: 'tiempo' },
  { spanish: 'poco a poco', english: 'little by little', exampleEs: 'Poco a poco está aprendiendo a hablar español.', exampleEn: "Little by little she's learning to speak Spanish.", theme: 'tiempo' },
  { spanish: 'a menudo', english: 'often', exampleEs: 'A menudo llueve en esta ciudad durante el invierno.', exampleEn: 'It often rains in this city during winter.', theme: 'tiempo' },
  { spanish: 'en seguida', english: 'right away', exampleEs: 'Voy en seguida, dame un minuto.', exampleEn: "I'm coming right away, give me a minute.", theme: 'tiempo' },
  { spanish: 'de ahora en adelante', english: 'from now on', exampleEs: 'De ahora en adelante voy a estudiar todos los días.', exampleEn: "From now on I'm going to study every day.", theme: 'tiempo' },
  { spanish: 'hoy en día', english: 'nowadays', exampleEs: 'Hoy en día casi todo el mundo tiene un teléfono móvil.', exampleEn: 'Nowadays almost everyone has a mobile phone.', theme: 'tiempo' },
  { spanish: 'cuanto antes', english: 'as soon as possible', exampleEs: 'Necesito la respuesta cuanto antes.', exampleEn: 'I need the answer as soon as possible.', theme: 'tiempo' },
  { spanish: 'tener prisa', english: 'to be in a hurry', exampleEs: 'No puedo hablar ahora, tengo prisa.', exampleEn: "I can't talk right now, I'm in a hurry.", theme: 'tiempo' },
  { spanish: 'en un abrir y cerrar de ojos', english: 'in the blink of an eye', exampleEs: 'El verano pasó en un abrir y cerrar de ojos.', exampleEn: 'The summer went by in the blink of an eye.', theme: 'tiempo' },
  { spanish: 'dar la lata', english: 'to be a pain / to bother someone', exampleEs: 'Mi hermano pequeño no para de dar la lata.', exampleEn: "My little brother won't stop being a pain.", theme: 'emociones' },
  { spanish: 'estar hasta las narices', english: 'to be fed up', exampleEs: 'Estoy hasta las narices de este ruido.', exampleEn: "I'm fed up with this noise.", theme: 'emociones' },
  { spanish: 'ponerse las pilas', english: "to get one's act together", exampleEs: 'Si quieres aprobar el examen, tienes que ponerte las pilas.', exampleEn: 'If you want to pass the exam, you need to get your act together.', theme: 'emociones' },
  { spanish: 'meter la pata', english: "to put one's foot in it / mess up", exampleEs: 'Metí la pata al mencionar su exnovio.', exampleEn: 'I put my foot in it by mentioning her ex-boyfriend.', theme: 'emociones' },
  { spanish: 'tomar el pelo', english: "to pull someone's leg", exampleEs: '¿Me estás tomando el pelo o hablas en serio?', exampleEn: 'Are you pulling my leg or are you serious?', theme: 'emociones' },
  { spanish: 'estar en las nubes', english: "to have one's head in the clouds", exampleEs: 'Perdona, estaba en las nubes, ¿qué decías?', exampleEn: "Sorry, I had my head in the clouds, what were you saying?", theme: 'emociones' },
  { spanish: 'echar de menos', english: 'to miss someone', exampleEs: 'Echo de menos a mi familia cuando viajo.', exampleEn: 'I miss my family when I travel.', theme: 'emociones' },
  { spanish: 'quedarse de piedra', english: 'to be stunned', exampleEs: 'Me quedé de piedra cuando escuché la noticia.', exampleEn: 'I was stunned when I heard the news.', theme: 'emociones' },
  { spanish: 'sacar de quicio', english: 'to drive someone crazy', exampleEs: 'Ese ruido me saca de quicio.', exampleEn: 'That noise drives me crazy.', theme: 'emociones' },
  { spanish: 'estar como pez en el agua', english: "to be in one's element", exampleEs: 'En la cocina, está como pez en el agua.', exampleEn: "In the kitchen, she's in her element.", theme: 'emociones' },
  { spanish: 'estar como una cabra', english: 'to be crazy / nuts', exampleEs: 'Mi tío está como una cabra, siempre hace locuras.', exampleEn: 'My uncle is nuts, he always does crazy things.', theme: 'emociones' },
  { spanish: 'tirar la toalla', english: 'to throw in the towel', exampleEs: 'No voy a tirar la toalla tan fácilmente.', exampleEn: "I'm not going to throw in the towel that easily.", theme: 'emociones' },
  { spanish: 'estar en la luna', english: 'to be daydreaming', exampleEs: 'Siempre está en la luna durante las clases.', exampleEn: "He's always daydreaming during class.", theme: 'emociones' },
  { spanish: 'tener mono', english: 'to have withdrawal / cravings', exampleEs: 'Tengo mono de chocolate, necesito comer algo dulce.', exampleEn: 'I have a chocolate craving, I need to eat something sweet.', theme: 'emociones' },
  { spanish: 'dar en el clavo', english: 'to hit the nail on the head', exampleEs: 'Con esa explicación, diste en el clavo.', exampleEn: 'With that explanation, you hit the nail on the head.', theme: 'comunicación' },
  { spanish: 'hablar por los codos', english: 'to talk a lot / chatter', exampleEs: 'Mi abuela habla por los codos cuando llama.', exampleEn: 'My grandmother talks a lot when she calls.', theme: 'comunicación' },
  { spanish: 'no tener pelos en la lengua', english: 'to not mince words', exampleEs: 'Mi jefa no tiene pelos en la lengua, dice lo que piensa.', exampleEn: 'My boss doesn\'t mince words, she says what she thinks.', theme: 'comunicación' },
  { spanish: 'poner los puntos sobre las íes', english: "to dot the i's and cross the t's / clarify", exampleEs: 'Vamos a poner los puntos sobre las íes antes de firmar.', exampleEn: "Let's clarify everything before signing.", theme: 'comunicación' },
  { spanish: 'poner las cartas sobre la mesa', english: "to lay one's cards on the table", exampleEs: 'Es hora de poner las cartas sobre la mesa y hablar claro.', exampleEn: "It's time to lay our cards on the table and speak clearly.", theme: 'comunicación' },
  { spanish: 'irse por las ramas', english: 'to beat around the bush', exampleEs: 'Deja de irte por las ramas y responde la pregunta.', exampleEn: 'Stop beating around the bush and answer the question.', theme: 'comunicación' },
  { spanish: 'ser pan comido', english: 'to be a piece of cake', exampleEs: 'El examen fue pan comido.', exampleEn: 'The exam was a piece of cake.', theme: 'dificultad' },
  { spanish: 'estar en pañales', english: 'to be in its infancy', exampleEs: 'El proyecto todavía está en pañales.', exampleEn: "The project is still in its infancy.", theme: 'dificultad' },
  { spanish: 'estar entre la espada y la pared', english: 'to be between a rock and a hard place', exampleEs: 'Con esas dos opciones, estoy entre la espada y la pared.', exampleEn: "With those two options, I'm between a rock and a hard place.", theme: 'dificultad' },
  { spanish: 'no dar pie con bola', english: 'to not get anything right', exampleEs: 'Hoy no doy pie con bola, todo me sale mal.', exampleEn: "I can't get anything right today, everything is going wrong.", theme: 'dificultad' },
  { spanish: 'coser y cantar', english: 'to be a piece of cake (very easy)', exampleEs: 'Para él, arreglar ordenadores es coser y cantar.', exampleEn: 'For him, fixing computers is a piece of cake.', theme: 'dificultad' },
  { spanish: 'más vale prevenir que curar', english: 'better safe than sorry', exampleEs: 'Lleva un paraguas, más vale prevenir que curar.', exampleEn: 'Take an umbrella, better safe than sorry.', theme: 'consejos' },
  { spanish: 'no hay mal que por bien no venga', english: 'every cloud has a silver lining', exampleEs: 'Perdí el tren, pero no hay mal que por bien no venga: conocí a un viejo amigo.', exampleEn: 'I missed the train, but every cloud has a silver lining: I met an old friend.', theme: 'consejos' },
  { spanish: 'en boca cerrada no entran moscas', english: 'silence is golden', exampleEs: 'Mejor no digas nada; en boca cerrada no entran moscas.', exampleEn: "Better not say anything; silence is golden.", theme: 'consejos' },
  { spanish: 'a caballo regalado no se le mira el diente', english: "don't look a gift horse in the mouth", exampleEs: 'Te regalaron un coche usado, a caballo regalado no se le mira el diente.', exampleEn: "They gave you a used car, don't look a gift horse in the mouth.", theme: 'consejos' },
  { spanish: 'querer es poder', english: "where there's a will there's a way", exampleEs: 'No es fácil, pero querer es poder.', exampleEn: "It's not easy, but where there's a will there's a way.", theme: 'consejos' },
  { spanish: 'cada loco con su tema', english: 'to each their own', exampleEs: 'A mí no me gusta el fútbol, pero cada loco con su tema.', exampleEn: "I don't like football, but to each their own.", theme: 'consejos' },
  { spanish: 'camarón que se duerme se lo lleva la corriente', english: 'the early bird catches the worm', exampleEs: 'Levántate temprano; camarón que se duerme se lo lleva la corriente.', exampleEn: 'Get up early; the early bird catches the worm.', theme: 'consejos' },
  { spanish: 'ojos que no ven, corazón que no siente', english: 'out of sight, out of mind', exampleEs: 'No le cuentes el problema; ojos que no ven, corazón que no siente.', exampleEn: "Don't tell him about the problem; out of sight, out of mind.", theme: 'consejos' },
  { spanish: 'al mal tiempo, buena cara', english: 'keep a positive attitude in hard times', exampleEs: 'Perdimos el partido, pero al mal tiempo, buena cara.', exampleEn: 'We lost the match, but let\'s keep a positive attitude.', theme: 'consejos' },
  { spanish: 'no hay dos sin tres', english: 'things happen in threes', exampleEs: 'Ya perdí las llaves dos veces esta semana; no hay dos sin tres.', exampleEn: "I've already lost my keys twice this week; things happen in threes.", theme: 'consejos' },
  { spanish: 'dar una mano', english: 'to lend a hand', exampleEs: '¿Me puedes dar una mano con las maletas?', exampleEn: 'Can you lend me a hand with the suitcases?', theme: 'relaciones' },
  { spanish: 'hacer la vista gorda', english: 'to turn a blind eye', exampleEs: 'El profesor hizo la vista gorda cuando llegamos tarde.', exampleEn: 'The teacher turned a blind eye when we arrived late.', theme: 'relaciones' },
  { spanish: 'hacer borrón y cuenta nueva', english: 'to start with a clean slate', exampleEs: 'Después de la discusión, decidimos hacer borrón y cuenta nueva.', exampleEn: 'After the argument, we decided to start with a clean slate.', theme: 'relaciones' },
  { spanish: 'costar un ojo de la cara', english: 'to cost an arm and a leg', exampleEs: 'Ese hotel cuesta un ojo de la cara.', exampleEn: 'That hotel costs an arm and a leg.', theme: 'dinero' },
  { spanish: 'estar sin blanca', english: 'to be broke', exampleEs: 'No puedo salir esta noche, estoy sin blanca.', exampleEn: "I can't go out tonight, I'm broke.", theme: 'dinero' },
  { spanish: 'ganarse el pan', english: "to earn one's living", exampleEs: 'Trabaja duro para ganarse el pan.', exampleEn: 'He works hard to earn his living.', theme: 'dinero' },
  { spanish: 'tirar la casa por la ventana', english: 'to spare no expense', exampleEs: 'Para la boda, tiraron la casa por la ventana.', exampleEn: 'For the wedding, they spared no expense.', theme: 'dinero' },
  { spanish: 'no tener ni pizca de', english: 'to not have the slightest bit of', exampleEs: 'No tengo ni pizca de hambre ahora mismo.', exampleEn: "I don't have the slightest bit of hunger right now.", theme: 'cantidad' },
  { spanish: 'a ojo de buen cubero', english: 'roughly / by eye (estimate)', exampleEs: 'Calculé la cantidad a ojo de buen cubero.', exampleEn: 'I estimated the amount roughly, by eye.', theme: 'cantidad' },
  { spanish: 'de pe a pa', english: 'from beginning to end', exampleEs: 'Leí el libro de pe a pa en un fin de semana.', exampleEn: 'I read the book from beginning to end in one weekend.', theme: 'cantidad' },
  { spanish: 'llover a cántaros', english: 'to rain cats and dogs', exampleEs: 'No salgas, está lloviendo a cántaros.', exampleEn: "Don't go out, it's raining cats and dogs.", theme: 'clima' },
  { spanish: 'hace un frío que pela', english: "it's freezing cold", exampleEs: 'Ponte el abrigo, hace un frío que pela.', exampleEn: "Put on your coat, it's freezing cold.", theme: 'clima' },
  { spanish: 'no pegar ojo', english: 'not to sleep a wink', exampleEs: 'Anoche no pegué ojo por el ruido de la calle.', exampleEn: "Last night I didn't sleep a wink because of the street noise.", theme: 'cuerpo' },
  { spanish: 'no ver tres en un burro', english: 'to not be able to see a thing', exampleEs: 'Sin mis gafas, no veo tres en un burro.', exampleEn: "Without my glasses, I can't see a thing.", theme: 'cuerpo' },
];

function slugify(spanish) {
  return spanish
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function main() {
  const seenIds = new Set();
  const entries = EXPRESSIONS.map((e) => {
    let id = `expr_${slugify(e.spanish)}`;
    // Filet de sécurité si deux expressions se réduisaient au même
    // identifiant après normalisation (aucun cas connu dans la liste
    // actuelle, vérifié ci-dessous par l'assertion d'unicité finale).
    let suffix = 2;
    while (seenIds.has(id)) {
      id = `expr_${slugify(e.spanish)}_${suffix}`;
      suffix += 1;
    }
    seenIds.add(id);
    return { id, ...e };
  });

  const duplicateIds = entries.length - new Set(entries.map((e) => e.id)).size;
  if (duplicateIds > 0) {
    throw new Error(`${duplicateIds} identifiant(s) dupliqué(s) après slugification — ne devrait jamais arriver.`);
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf8');

  console.log(`✓ ${entries.length} expressions écrites dans ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  const themeCounts = {};
  for (const e of entries) themeCounts[e.theme] = (themeCounts[e.theme] ?? 0) + 1;
  console.log('  Par thème :', themeCounts);
}

main();
