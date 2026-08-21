// Génère mobile/src/data/reading.json à partir de mini-textes espagnols
// écrits à la main directement dans ce script, chacun avec 1-2 questions
// de compréhension à choix multiple (voir README.md de ce dossier pour
// la justification du format).
//
// Usage : node generate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'src', 'data', 'reading.json');

// Texte en espagnol (2-3 phrases, niveau A1/A2) ; question(s) et options
// de réponse en ANGLAIS — même répartition langue-cible/langue-support
// que le reste de l'app (contenu en espagnol, vérification en anglais),
// pour ne pas cumuler la difficulté de lecture ET de compréhension de la
// question elle-même. `correctIndex` pointe dans `options`.
const TEXTS = [
  {
    theme: 'rutina diaria',
    spanish: 'María se despierta a las siete de la mañana. Desayuna café con tostadas y luego camina hasta la oficina. Le gusta llegar temprano al trabajo.',
    questions: [
      { question: 'What does María have for breakfast?', options: ['Coffee with toast', 'Cereal with milk', 'Eggs and juice'], correctIndex: 0 },
      { question: 'How does María get to the office?', options: ['By bus', 'She walks', 'By car'], correctIndex: 1 },
    ],
  },
  {
    theme: 'mercado',
    spanish: 'Todos los sábados, Pedro va al mercado del pueblo. Compra frutas frescas, verduras y a veces pescado. El mercado cierra a las dos de la tarde.',
    questions: [
      { question: 'When does Pedro go to the market?', options: ['Every Saturday', 'Every Sunday', 'Every day'], correctIndex: 0 },
      { question: 'What time does the market close?', options: ['At noon', 'At 2 in the afternoon', 'At 6 in the evening'], correctIndex: 1 },
    ],
  },
  {
    theme: 'el tiempo',
    spanish: 'Hoy hace mucho sol en la ciudad, pero mañana va a llover. La semana que viene el tiempo será más frío, según el pronóstico.',
    questions: [
      { question: "What's the weather like today?", options: ['Rainy', 'Sunny', 'Snowy'], correctIndex: 1 },
      { question: 'What will the weather be like next week?', options: ['Colder', 'Warmer', 'The same'], correctIndex: 0 },
    ],
  },
  {
    theme: 'cena familiar',
    spanish: 'La familia se reúne cada domingo para cenar juntos. La abuela cocina una sopa deliciosa y todos hablan de la semana. Después de cenar, ven una película.',
    questions: [
      { question: 'When does the family have dinner together?', options: ['Every Friday', 'Every Sunday', 'Every Monday'], correctIndex: 1 },
      { question: 'What do they do after dinner?', options: ['Watch a movie', 'Play cards', 'Go for a walk'], correctIndex: 0 },
    ],
  },
  {
    theme: 'planes de fin de semana',
    spanish: 'Este fin de semana, Laura y sus amigos van a ir a la montaña. Quieren hacer senderismo y después descansar cerca de un lago. Van a dormir en una cabaña pequeña.',
    questions: [
      { question: 'Where are Laura and her friends going?', options: ['To the beach', 'To the mountain', 'To the city'], correctIndex: 1 },
      { question: 'Where will they sleep?', options: ['In a hotel', 'In a small cabin', 'In a tent'], correctIndex: 1 },
    ],
  },
  {
    theme: 'mascota',
    spanish: 'Diego tiene un perro que se llama Rex. Todas las mañanas lo saca a pasear por el parque. Rex es muy juguetón y le encanta correr detrás de la pelota.',
    questions: [
      { question: "What is Diego's dog called?", options: ['Rex', 'Max', 'Toby'], correctIndex: 0 },
      { question: 'What does Rex love to do?', options: ['Sleep all day', 'Chase the ball', 'Swim in the lake'], correctIndex: 1 },
    ],
  },
  {
    theme: 'trabajo',
    spanish: 'Ana trabaja en un hospital como enfermera. Su turno empieza a las ocho de la noche y termina a las seis de la mañana. Le gusta mucho ayudar a los pacientes.',
    questions: [
      { question: 'Where does Ana work?', options: ['At a school', 'At a hospital', 'At a restaurant'], correctIndex: 1 },
      { question: "What time does Ana's shift start?", options: ['8 in the morning', '8 at night', '6 at night'], correctIndex: 1 },
    ],
  },
  {
    theme: 'cumpleaños',
    spanish: 'Hoy es el cumpleaños de Sofía. Sus padres organizaron una fiesta sorpresa con globos y un pastel de chocolate. Todos sus amigos vinieron a celebrar con ella.',
    questions: [
      { question: 'What kind of cake did they have?', options: ['Vanilla cake', 'Chocolate cake', 'Fruit cake'], correctIndex: 1 },
      { question: 'What kind of party was it?', options: ['A surprise party', 'A small dinner', 'A picnic'], correctIndex: 0 },
    ],
  },
  {
    theme: 'playa',
    spanish: 'En verano, la familia López siempre viaja a la playa. Los niños construyen castillos de arena y nadan en el mar. Por la noche, cenan pescado fresco en un restaurante.',
    questions: [
      { question: 'What do the children build?', options: ['Sandcastles', 'Boats', 'Kites'], correctIndex: 0 },
      { question: 'What do they eat for dinner?', options: ['Pizza', 'Fresh fish', 'Pasta'], correctIndex: 1 },
    ],
  },
  {
    theme: 'cocina',
    spanish: 'Carlos aprendió a cocinar viendo videos en internet. Ahora prepara una paella deliciosa los domingos. A su familia le encanta el arroz con mariscos.',
    questions: [
      { question: 'How did Carlos learn to cook?', options: ['At a cooking school', 'By watching videos online', 'From his grandmother'], correctIndex: 1 },
      { question: 'What dish does he prepare on Sundays?', options: ['Paella', 'Tortilla', 'Gazpacho'], correctIndex: 0 },
    ],
  },
  {
    theme: 'médico',
    spanish: 'Juan tenía dolor de cabeza y fiebre, así que fue al médico. La doctora le recetó unas pastillas y le dijo que descansara. Después de tres días, Juan se sintió mejor.',
    questions: [
      { question: 'Why did Juan go to the doctor?', options: ['A broken arm', 'Headache and fever', 'A toothache'], correctIndex: 1 },
      { question: 'How long did it take for Juan to feel better?', options: ['One day', 'Three days', 'A week'], correctIndex: 1 },
    ],
  },
  {
    theme: 'ropa',
    spanish: 'Elena necesita comprar ropa nueva para el invierno. Va a una tienda en el centro y compra un abrigo azul y unas botas negras. Gasta menos dinero del que esperaba.',
    questions: [
      { question: 'What color is the coat Elena buys?', options: ['Black', 'Blue', 'Green'], correctIndex: 1 },
      { question: 'How much money did Elena spend?', options: ['More than expected', 'Less than expected', 'Exactly what she expected'], correctIndex: 1 },
    ],
  },
  {
    theme: 'café',
    spanish: 'Cada mañana, Roberto prepara café antes de ir a trabajar. Le gusta tomarlo solo, sin azúcar ni leche. Dice que el café le ayuda a despertarse.',
    questions: [
      { question: 'How does Roberto take his coffee?', options: ['With milk', 'With sugar', 'Black, without sugar or milk'], correctIndex: 2 },
    ],
  },
  {
    theme: 'llamada',
    spanish: 'Isabel llamó a su amiga Clara por teléfono. Hablaron durante una hora sobre sus vacaciones. Clara le contó que va a viajar a México en diciembre.',
    questions: [
      { question: 'How long did they talk?', options: ['Thirty minutes', 'One hour', 'Two hours'], correctIndex: 1 },
      { question: 'Where is Clara going to travel?', options: ['Mexico', 'Argentina', 'Peru'], correctIndex: 0 },
    ],
  },
  {
    theme: 'museo',
    spanish: 'El sábado pasado, Tomás visitó un museo de arte con su clase. Vio pinturas muy famosas y aprendió sobre la historia del país. Al final, compró una postal como recuerdo.',
    questions: [
      { question: 'What did Tomás see at the museum?', options: ['Famous paintings', 'Old cars', 'Dinosaur bones'], correctIndex: 0 },
      { question: 'What did Tomás buy at the end?', options: ['A book', 'A postcard', 'A T-shirt'], correctIndex: 1 },
    ],
  },
];

function slugify(theme, index) {
  const base = theme
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `reading_${base}_${index}`;
}

function main() {
  const entries = TEXTS.map((t, index) => ({
    id: slugify(t.theme, index + 1),
    spanish: t.spanish,
    theme: t.theme,
    questions: t.questions,
  }));

  const duplicateIds = entries.length - new Set(entries.map((e) => e.id)).size;
  if (duplicateIds > 0) {
    throw new Error(`${duplicateIds} identifiant(s) dupliqué(s) — ne devrait jamais arriver.`);
  }
  for (const entry of entries) {
    if (entry.questions.length === 0 || entry.questions.length > 2) {
      throw new Error(`${entry.id}: attendu 1 ou 2 questions, trouvé ${entry.questions.length}.`);
    }
    for (const q of entry.questions) {
      if (q.correctIndex < 0 || q.correctIndex >= q.options.length) {
        throw new Error(`${entry.id}: correctIndex hors limites pour la question "${q.question}".`);
      }
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf8');

  const totalQuestions = entries.reduce((sum, e) => sum + e.questions.length, 0);
  console.log(`✓ ${entries.length} textes écrits dans ${path.relative(process.cwd(), OUTPUT_PATH)} (${totalQuestions} questions au total).`);
}

main();
