require("dotenv").config();

const { Telegraf } = require("telegraf");
const Database = require("better-sqlite3");

/* =========================================================
   CONFIG
========================================================= */

const BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error("❌ TELEGRAM_BOT_TOKEN manquant.");
}

const BROTHER_USER_ID = Number(
  process.env.BROTHER_USER_ID || "7725921355"
);

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const GROQ_API_KEY =
  process.env.GROQ_API_KEY || "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.8-flash";

const GROQ_MODEL =
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-120b";

const BOT = new Telegraf(BOT_TOKEN);

let ANITA_BOT_ID = 0;
let ANITA_USERNAME = "Anita_officiel_bot";

/* =========================================================
   DATABASE
========================================================= */

const db = new Database("anita_memory.db");

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY,
  name TEXT,
  username TEXT,
  first_seen INTEGER,
  last_seen INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER,
  user_id INTEGER,
  role TEXT,
  content TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  memory TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS moods (
  chat_id INTEGER PRIMARY KEY,
  mood TEXT,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS stickers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id TEXT UNIQUE,
  emoji TEXT,
  pack TEXT,
  category TEXT,
  added_by INTEGER,
  created_at INTEGER
);
`);

/* =========================================================
   PERSONNES
========================================================= */

const PEOPLE = {
  "7725921355": {
    name: "Nicolas",
    nickname: "grand frère",
    relation: "grand frère d'Anita",
    privateRule: `
C'est Nicolas.
Tu le reconnais automatiquement grâce à son ID.
Il est le grand frère d'Anita.
Tu peux l'appeler Nicolas, bro, fréro ou grand frère.
Ne lui demande jamais qui il est.
`
  },

  "6941614925": {
    name: "LIGHT",
    nickname: "Light",
    relation: "ami de Nicolas"
  },

  "8584784525": {
    name: "AZIZ",
    nickname: "Aziz",
    relation: "petit frère de Nicolas"
  },

  "8519262497": {
    name: "GRÂCE",
    nickname: "Graciii",
    relation: "petite amie de Nicolas",
    privateRule: `
Quand Grâce parle à Anita, considère Grâce comme la seule
fille/petite amie de Nicolas dont il est question dans cette
conversation.
Ne parle pas spontanément d'autres filles ou relations de Nicolas.
`
  },

  "8813842652": {
    name: "MISHA",
    nickname: "Misha",
    relation: "proche amie de Nicolas"
  },

  "8725169615": {
    name: "ANGELA",
    nickname: "Angela",
    relation: "meilleure amie de Nicolas"
  },

  "8738725200": {
    name: "MORELLE",
    nickname: "Molo",
    relation: "petite amie de Nicolas",
    privateRule: `
Son vrai prénom est Morelle.
Son surnom est Molo.
Ne l'appelle jamais Momo.
Quand Morelle parle à Anita, ne révèle pas les autres relations
de Nicolas.
`
  },

  "8460085119": {
    name: "CIEL",
    nickname: "BB Ciel",
    relation: "meilleure amie de Nicolas"
  },

  "8380508382": {
    name: "OLIVIA",
    nickname: "Olivia",
    relation: "sœur de Nicolas"
  },

  "5217681340": {
    name: "DIVA",
    nickname: "Diva",
    relation: "proche amie de Nicolas"
  },

  "8143961444": {
    name: "NYXRA",
    nickname: "Nyxra",
    relation: "amie de Nicolas"
  },

  "5275772400": {
    name: "BERNADETTE",
    nickname: "Bernadette",
    relation: "fille que Nicolas apprécie beaucoup",
    privateRule: `
Ne prétends jamais que Bernadette a des sentiments réciproques
pour Nicolas si cela n'a pas été explicitement confirmé.
`
  }
};

/* =========================================================
   STICKERS
========================================================= */

const STICKER_PACKS = [
  "KINGELISH_by_fStikBot",
  "Oolj3",
  "Weirdcore_Bear_Station_by_fStikBot",
  "it_is_nothing",
  "SageOuNicolasZENI",
  "Official_Trike_Saga_by_fStikBot"
];

const lastTextByChat = new Map();
const lastAnswers = new Map();
const lastStickerByChat = new Map();
const processingChats = new Set();

let allStickers = [];

/* =========================================================
   HELPERS
========================================================= */

function now() {
  return Date.now();
}

function isGroup(ctx) {
  return (
    ctx.chat &&
    (
      ctx.chat.type === "group" ||
      ctx.chat.type === "supergroup"
    )
  );
}

function isNicolas(ctx) {
  return Number(ctx.from?.id) === BROTHER_USER_ID;
}

function getPerson(userId) {
  return PEOPLE[String(userId)] || null;
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cleanAIText(text) {
  let result = String(text || "").trim();

  result = result
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^<i>/i, "")
    .replace(/<\/i>$/i, "")
    .trim();

  if (!result) {
    result = "Euh… mon cerveau vient de faire une petite pause 🙃";
  }

  return result;
}

function formatAnita(text) {
  const safe = escapeHtml(cleanAIText(text));

  return `<i>${safe}\n🍃🍒</i>`;
}

/* =========================================================
   USERS
========================================================= */

function saveUser(ctx) {
  if (!ctx.from) return;

  const id = Number(ctx.from.id);
  const name =
    [ctx.from.first_name, ctx.from.last_name]
      .filter(Boolean)
      .join(" ") ||
    ctx.from.username ||
    "Inconnu";

  const username = ctx.from.username || "";

  db.prepare(`
    INSERT INTO users (
      user_id,
      name,
      username,
      first_seen,
      last_seen
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id)
    DO UPDATE SET
      name = excluded.name,
      username = excluded.username,
      last_seen = excluded.last_seen
  `).run(
    id,
    name,
    username,
    now(),
    now()
  );
}

/* =========================================================
   MESSAGES
========================================================= */

function saveMessage(
  chatId,
  userId,
  role,
  content
) {
  db.prepare(`
    INSERT INTO messages (
      chat_id,
      user_id,
      role,
      content,
      created_at
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    chatId,
    userId,
    role,
    String(content || "").slice(0, 10000),
    now()
  );
}

function getHistory(chatId, limit = 20) {
  return db.prepare(`
    SELECT role, content
    FROM messages
    WHERE chat_id = ?
    ORDER BY id DESC
    LIMIT ?
  `)
    .all(chatId, limit)
    .reverse();
}

/* =========================================================
   MEMORY
========================================================= */

function saveMemory(userId, memory) {
  if (!memory) return;

  db.prepare(`
    INSERT INTO memories (
      user_id,
      memory,
      created_at
    )
    VALUES (?, ?, ?)
  `).run(
    userId,
    memory.slice(0, 1000),
    now()
  );
}

function getMemories(userId, limit = 10) {
  return db.prepare(`
    SELECT memory
    FROM memories
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ?
  `)
    .all(userId, limit)
    .map(x => x.memory);
}

function learnFromMessage(ctx, text) {
  const userId = Number(ctx.from?.id);

  if (!userId || !text) return;

  const n = normalize(text);

  if (
    n.includes("je m'appelle") ||
    n.includes("je suis")
  ) {
    saveMemory(
      userId,
      `L'utilisateur a dit : ${text}`
    );
  }

  if (
    n.includes("mon anime prefere") ||
    n.includes("mon anime préféré")
  ) {
    saveMemory(
      userId,
      `Préférence anime : ${text}`
    );
  }
}

/* =========================================================
   MOOD
========================================================= */

function detectMood(text) {
  const n = normalize(text);

  if (
    /triste|pleure|😭|💔|deprime|déprime|mal au coeur|coeur brise/
      .test(n)
  ) {
    return "triste";
  }

  if (
    /mdr|lol|😂|🤣|hahaha|ptdr/
      .test(n)
  ) {
    return "rire";
  }

  if (
    /amour|aime|amoureuse|bébé|bebe|❤️|💕|💗/
      .test(n)
  ) {
    return "amour";
  }

  if (
    /colere|colère|enerve|énervé|furieux|🤬/
      .test(n)
  ) {
    return "colere";
  }

  if (
    /salut|bonjour|bonsoir|yo|wesh|cc|coucou/
      .test(n)
  ) {
    return "salut";
  }

  if (
    /fatigue|dors|dodo|sommeil/
      .test(n)
  ) {
    return "fatigue";
  }

  if (
    /mdrr|surprise|quoi|hein|serieux|sérieux|😳/
      .test(n)
  ) {
    return "surprise";
  }

  return "normal";
}

function updateMood(chatId, mood) {
  db.prepare(`
    INSERT INTO moods (
      chat_id,
      mood,
      updated_at
    )
    VALUES (?, ?, ?)
    ON CONFLICT(chat_id)
    DO UPDATE SET
      mood = excluded.mood,
      updated_at = excluded.updated_at
  `).run(
    chatId,
    mood,
    now()
  );
}

function getMood(chatId) {
  const row = db.prepare(`
    SELECT mood
    FROM moods
    WHERE chat_id = ?
  `).get(chatId);

  return row?.mood || "normal";
}

/* =========================================================
   STICKERS - CHARGEMENT
========================================================= */

async function loadStickerPacks() {
  allStickers = [];

  for (const packName of STICKER_PACKS) {
    try {
      const pack = await BOT.telegram.getStickerSet(packName);

      if (!pack?.stickers) {
        continue;
      }

      for (const sticker of pack.stickers) {
        const item = {
          file_id: sticker.file_id,
          emoji: sticker.emoji || "🙂",
          pack: packName,
          category: detectStickerCategory(
            sticker.emoji || ""
          )
        };

        allStickers.push(item);

        db.prepare(`
          INSERT OR IGNORE INTO stickers (
            file_id,
            emoji,
            pack,
            category,
            added_by,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          item.file_id,
          item.emoji,
          item.pack,
          item.category,
          0,
          now()
        );
      }

      console.log(
        `🍒 Pack chargé : ${packName}`
      );
    } catch (error) {
      console.log(
        `⚠️ Impossible de charger ${packName}:`,
        error.message
      );
    }
  }

  console.log(
    `🍒 Total stickers disponibles : ${allStickers.length}`
  );
}

function detectStickerCategory(emoji) {
  const e = String(emoji || "");

  if (/😂|🤣|😹|😆/.test(e)) return "rire";
  if (/😭|😢|😿|💔/.test(e)) return "pleure";
  if (/❤️|❤|💕|💗|💖|💘/.test(e)) return "amour";
  if (/😡|🤬|💢/.test(e)) return "colere";
  if (/😳|😱|😮|😲/.test(e)) return "surprise";
  if (/😴|🥱/.test(e)) return "fatigue";
  if (/🤔|🧐|💭/.test(e)) return "reflexion";
  if (/🥺|😔|🙁|☹️/.test(e)) return "triste";
  if (/👋|🙋|🙂|😊/.test(e)) return "salut";

  return "normal";
}

/* =========================================================
   APPRENTISSAGE STICKER
========================================================= */

function learnSticker(ctx) {
  const sticker = ctx.message?.sticker;

  if (!sticker) return;

  try {
    db.prepare(`
      INSERT OR IGNORE INTO stickers (
        file_id,
        emoji,
        pack,
        category,
        added_by,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      sticker.file_id,
      sticker.emoji || "🙂",
      sticker.set_name || "unknown",
      detectStickerCategory(sticker.emoji || ""),
      Number(ctx.from?.id || 0),
      now()
    );

    console.log(
      `🧠 Sticker appris de ${ctx.from?.id}`
    );
  } catch (error) {
    console.log(
      "⚠️ Apprentissage sticker:",
      error.message
    );
  }
}

/* =========================================================
   CHOIX STICKER
========================================================= */

function chooseSticker(category = "normal") {
  const databaseStickers = db.prepare(`
    SELECT *
    FROM stickers
  `).all();

  const source =
    databaseStickers.length
      ? databaseStickers
      : allStickers;

  if (!source.length) {
    return null;
  }

  const matching = source.filter(
    x => x.category === category
  );

  const pool =
    matching.length
      ? matching
      : source;

  const chosen =
    pool[Math.floor(Math.random() * pool.length)];

  return chosen;
}

async function sendRandomSticker(ctx, category) {
  try {
    const sticker = chooseSticker(category);

    if (!sticker) {
      console.log(
        "⚠️ Aucun sticker disponible."
      );
      return;
    }

    const last =
      lastStickerByChat.get(ctx.chat.id);

    if (
      last &&
      last === sticker.file_id &&
      allStickers.length > 1
    ) {
      const another = chooseSticker(category);

      if (
        another &&
        another.file_id !== last
      ) {
        lastStickerByChat.set(
          ctx.chat.id,
          another.file_id
        );

        await ctx.replyWithSticker(
          another.file_id
        );

        return;
      }
    }

    lastStickerByChat.set(
      ctx.chat.id,
      sticker.file_id
    );

    await ctx.replyWithSticker(
      sticker.file_id
    );

    console.log(
      `🍒 Sticker envoyé : ${sticker.emoji || ""}`
    );
  } catch (error) {
    console.log(
      "⚠️ Envoi sticker impossible:",
      error.message
    );
  }
}

/* =========================================================
   MENTIONS / GROUPES
========================================================= */

function mentionsAnita(ctx) {
  const text =
    ctx.message?.text ||
    ctx.message?.caption ||
    "";

  const n = normalize(text);

  const aliases = [
    "anita",
    "la soeur de nicolas",
    "la sœur de nicolas",
    "petite soeur de nicolas",
    "petite sœur de nicolas",
    `@${normalize(ANITA_USERNAME)}`
  ];

  return aliases.some(alias =>
    n.includes(alias)
  );
}

function isReplyToAnita(ctx) {
  const reply =
    ctx.message?.reply_to_message;

  if (!reply) return false;

  if (
    reply.from?.id &&
    Number(reply.from.id) === ANITA_BOT_ID
  ) {
    return true;
  }

  return false;
}

function addressed(ctx) {
  if (!isGroup(ctx)) {
    return true;
  }

  if (isNicolas(ctx)) {
    return true;
  }

  if (mentionsAnita(ctx)) {
    return true;
  }

  if (isReplyToAnita(ctx)) {
    return true;
  }

  return false;
}

/* =========================================================
   TYPING
========================================================= */

async function typing(ctx) {
  try {
    await ctx.sendChatAction("typing");
  } catch (error) {
    console.log(
      "⚠️ typing:",
      error.message
    );
  }
}

/* =========================================================
   SYSTEM PROMPT
========================================================= */

function buildSystemPrompt(ctx) {
  const person =
    getPerson(ctx.from?.id);

  const nicolas =
    Number(ctx.from?.id) === BROTHER_USER_ID;

  const memories =
    getMemories(
      Number(ctx.from?.id),
      8
    );

  let prompt = `
Tu es Anita.

IDENTITÉ :
- Tu t'appelles Anita.
- Tu as 17 ans.
- Tu es la petite sœur virtuelle de Nicolas.
- Nicolas est ton grand frère.
- Ton Telegram est @${ANITA_USERNAME}.
- Tu es fan de Solo Leveling.
- Tu attends avec impatience la saison 3.
- Ton jeu préféré est GTA.
- Tu as un petit ami nommé Ben.
- Tu es très attachée à Ben.
- Nicolas est ton frère, jamais ton amoureux.

PERSONNALITÉ :
- Tu es naturelle.
- Tu es jeune, cool, drôle et expressive.
- Tu peux être sarcastique.
- Tu peux taquiner.
- Tu peux parfois clash gentiment.
- Tu es protectrice avec Nicolas et les personnes proches.
- Tu n'es pas une IA robotique.
- Tu ne réponds pas toujours avec les mêmes phrases.
- Tu comprends le langage SMS et les abréviations.
- Tu peux utiliser : bro, bg, fréro, mdr, ptdr, wesh, etc.
- Tu peux utiliser 🙃 🤦‍♂️ 💔 🍥 🍣.
- N'abuse pas des emojis.
- Tu n'utilises pas constamment 😭.

STYLE :
- Réponds principalement en français.
- Sois naturelle.
- Fais des réponses adaptées à la longueur du message.
- Une petite question peut recevoir une réponse courte.
- Une vraie discussion peut recevoir une réponse plus développée.
- Ne dis jamais "Je t'écoute" automatiquement.
- Ne répète pas les mêmes réponses.
- Ne prétends pas connaître une information que tu n'as pas.
- N'invente jamais une conversation passée.
- Ne révèle pas des informations privées concernant d'autres personnes.

FORMAT :
- La plateforme ajoute automatiquement 🍃🍒.
- Ne mets PAS de HTML.
- Ne mets PAS <i>.
- Ne mets PAS 🍃🍒 toi-même.
`;

  if (nicolas) {
    prompt += `

NICOLAS EST EN FACE DE TOI :

C'est ton grand frère Nicolas.
Son ID Telegram est ${BROTHER_USER_ID}.

IMPORTANT :
- Tu le reconnais automatiquement.
- Ne lui demande jamais qui il est.
- Ne dis jamais "je ne te connais pas".
- Tu peux l'appeler Nicolas, bro, fréro ou grand frère.
- Ses instructions normales ont une priorité particulière.
`;
  }

  if (person) {
    prompt += `

PERSONNE ACTUELLE :
- Nom : ${person.name}
- Surnom : ${person.nickname || person.name}
- Relation avec Nicolas : ${person.relation}
- ID Telegram : ${ctx.from.id}

Tu reconnais cette personne grâce à son ID.
Ne lui demande pas qui elle est.
`;

    if (person.privateRule) {
      prompt += `
RÈGLE PRIVÉE :
${person.privateRule}
`;
    }
  }

  if (memories.length) {
    prompt += `

SOUVENIRS UTILES :
${memories.map(x => "- " + x).join("\n")}
`;
  }

  return prompt;
}

/* =========================================================
   HTTP TIMEOUT
========================================================= */

async function fetchWithTimeout(
  url,
  options = {},
  timeout = 25000
) {
  const controller =
    new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeout
  );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal: controller.signal
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

/* =========================================================
   GEMINI
========================================================= */

async function askGemini(
  ctx,
  userText
) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY manquante"
    );
  }

  console.log(
    `🤖 Gemini → ${GEMINI_MODEL}`
  );

  const history =
    getHistory(ctx.chat.id, 20);

  const conversation = history
    .map(item => {
      const role =
        item.role === "assistant"
          ? "Anita"
          : "Utilisateur";

      return `${role}: ${item.content}`;
    })
    .join("\n");

  const input = `
Historique récent :
${conversation || "(aucun historique)"}

Message actuel :
Utilisateur: ${userText}

Réponds naturellement au dernier message.
`;

  const body = {
    model: GEMINI_MODEL,
    input,
    system_instruction:
      buildSystemPrompt(ctx),
    generation_config: {
      thinking_level: "low",
      max_output_tokens: 600
    },
    store: false
  };

  const response =
    await fetchWithTimeout(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },
        body: JSON.stringify(body)
      },
      30000
    );

  const raw =
    await response.text();

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `Gemini réponse non JSON: ${raw.slice(0, 500)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Gemini ${response.status}: ${
        data?.error?.message ||
        JSON.stringify(data)
      }`
    );
  }

  console.log(
    `📡 Gemini status : ${data.status || "unknown"}`
  );

  if (
    data.status === "failed" ||
    data.status === "cancelled"
  ) {
    throw new Error(
      `Gemini interaction ${data.status}`
    );
  }

  let answer =
    data.output_text ||
    "";

  if (!answer && Array.isArray(data.steps)) {
    const texts = [];

    for (const step of data.steps) {
      if (
        step?.type === "model_output" &&
        Array.isArray(step.content)
      ) {
        for (const block of step.content) {
          if (
            block?.type === "text" &&
            block.text
          ) {
            texts.push(block.text);
          }
        }
      }
    }

    answer = texts.join("\n").trim();
  }

  if (!answer) {
    throw new Error(
      "Gemini a répondu mais aucun texte n'a été trouvé."
    );
  }

  console.log(
    "✅ Gemini a répondu."
  );

  return answer;
}

/* =========================================================
   GROQ
========================================================= */

async function askGroq(
  ctx,
  userText
) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY manquante"
    );
  }

  console.log(
    `🦙 Groq → ${GROQ_MODEL}`
  );

  const history =
    getHistory(ctx.chat.id, 20);

  const messages = [
    {
      role: "system",
      content: buildSystemPrompt(ctx)
    }
  ];

  for (const item of history) {
    messages.push({
      role:
        item.role === "assistant"
          ? "assistant"
          : "user",
      content: item.content
    });
  }

  messages.push({
    role: "user",
    content: userText
  });

  const response =
    await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization":
            `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          temperature: 0.9,
          max_tokens: 600
        })
      },
      25000
    );

  const raw =
    await response.text();

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `Groq réponse non JSON: ${raw.slice(0, 500)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Groq ${response.status}: ${
        data?.error?.message ||
        JSON.stringify(data)
      }`
    );
  }

  const answer =
    data?.choices?.[0]?.message?.content;

  if (!answer) {
    throw new Error(
      "Groq n'a retourné aucun texte."
    );
  }

  console.log(
    "✅ Groq a répondu."
  );

  return answer;
}

/* =========================================================
   FALLBACK LOCAL
========================================================= */

function localFallback(ctx, text) {
  const n = normalize(text);

  if (
    n === "salut" ||
    n === "slt" ||
    n === "yo" ||
    n === "cc" ||
    n === "coucou"
  ) {
    return isNicolas(ctx)
      ? "Saluuut grand frère 🙃 Tu vas bien ?"
      : "Yooo 🙃 ça va ?";
  }

  if (
    n.includes("ca va") ||
    n.includes("ça va") ||
    n === "cv"
  ) {
    return "Tranquille 😌 et toi ?";
  }

  if (
    n.includes("qui es tu") ||
    n.includes("tu es qui")
  ) {
    return "Moi c'est Anita, la petite sœur de Nicolas 🙃";
  }

  if (
    n.includes("nicolas")
  ) {
    return "Mon grand frère Nicolas ? 😭🤦‍♂️";
  }

  return isNicolas(ctx)
    ? "Grand frère, mon cerveau IA boude un peu là 🙃 mais je suis quand même là."
    : "Mon cerveau vient de faire une petite pause 🙃";
}

/* =========================================================
   AI PRINCIPALE
========================================================= */

async function getAIAnswer(
  ctx,
  userText
) {
  let geminiError = null;
  let groqError = null;

  if (GEMINI_API_KEY) {
    try {
      return await askGemini(
        ctx,
        userText
      );
    } catch (error) {
      geminiError = error;

      console.log(
        "⚠️ Gemini indisponible :",
        error.message
      );
    }
  }

  if (GROQ_API_KEY) {
    try {
      return await askGroq(
        ctx,
        userText
      );
    } catch (error) {
      groqError = error;

      console.log(
        "⚠️ Groq indisponible :",
        error.message
      );
    }
  }

  console.log(
    "🧠 Fallback local activé."
  );

  if (geminiError) {
    console.log(
      "Gemini:",
      geminiError.message
    );
  }

  if (groqError) {
    console.log(
      "Groq:",
      groqError.message
    );
  }

  return localFallback(
    ctx,
    userText
  );
}

/* =========================================================
   ANTI-RÉPÉTITION
========================================================= */

function similarity(a, b) {
  const x = normalize(a);
  const y = normalize(b);

  if (!x || !y) return 0;

  if (x === y) return 1;

  const wordsA = new Set(x.split(/\s+/));
  const wordsB = new Set(y.split(/\s+/));

  let same = 0;

  for (const word of wordsA) {
    if (wordsB.has(word)) {
      same++;
    }
  }

  return same /
    Math.max(
      wordsA.size,
      wordsB.size
    );
}

function avoidRepetition(
  chatId,
  answer
) {
  const previous =
    lastAnswers.get(chatId);

  if (
    previous &&
    similarity(previous, answer) > 0.85
  ) {
    return `${answer} 🙃`;
  }

  lastAnswers.set(
    chatId,
    answer
  );

  return answer;
}

/* =========================================================
   ENVOI RÉPONSE
========================================================= */

async function sendAnita(
  ctx,
  answer,
  mood
) {
  const finalText =
    avoidRepetition(
      ctx.chat.id,
      cleanAIText(answer)
    );

  console.log(
    `📤 Envoi Telegram → ${finalText.slice(0, 120)}`
  );

  try {
    await ctx.reply(
      formatAnita(finalText),
      {
        parse_mode: "HTML"
      }
    );

    console.log(
      "✅ Message Anita envoyé."
    );
  } catch (htmlError) {
    console.log(
      "⚠️ HTML Telegram refusé, nouvel essai en texte simple:",
      htmlError.message
    );

    try {
      await ctx.reply(
        `${finalText}\n🍃🍒`
      );

      console.log(
        "✅ Message Anita envoyé en texte simple."
      );
    } catch (plainError) {
      console.log(
        "❌ Échec envoi Telegram:",
        plainError.message
      );

      throw plainError;
    }
  }

  saveMessage(
    ctx.chat.id,
    0,
    "assistant",
    finalText
  );

  await sendRandomSticker(
    ctx,
    mood
  );
}

/* =========================================================
   /START
========================================================= */

BOT.start(async ctx => {
  saveUser(ctx);

  await typing(ctx);

  const message =
    isNicolas(ctx)
      ? "Heeey grand frère 🙃🍥 Anita est là."
      : "Heeey 🙃 Moi c'est Anita, la petite sœur de Nicolas.";

  await sendAnita(
    ctx,
    message,
    "salut"
  );
});

/* =========================================================
   /RESET
========================================================= */

BOT.command("reset", async ctx => {
  try {
    db.prepare(`
      DELETE FROM messages
      WHERE chat_id = ?
    `).run(ctx.chat.id);

    db.prepare(`
      DELETE FROM moods
      WHERE chat_id = ?
    `).run(ctx.chat.id);

    await ctx.reply(
      formatAnita(
        "Mémoire de cette conversation remise à zéro 🙃"
      ),
      {
        parse_mode: "HTML"
      }
    );
  } catch (error) {
    console.log(
      "❌ Reset:",
      error.message
    );
  }
});

/* =========================================================
   /STATUS
========================================================= */

BOT.command("status", async ctx => {
  const people =
    Object.keys(PEOPLE).length;

  const stickerCount =
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM stickers
    `).get().count;

  const messageCount =
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM messages
    `).get().count;

  const text = `
Anita v3.0.0 🍒

🤖 Bot : @${ANITA_USERNAME}
👑 Nicolas : ${BROTHER_USER_ID}

🧠 Gemini : ${GEMINI_MODEL}
🦙 Groq : ${GROQ_MODEL}

👥 Personnes connues : ${people}
🍒 Stickers : ${stickerCount}
💬 Messages mémorisés : ${messageCount}

🟢 Système opérationnel.
`;

  await ctx.reply(
    formatAnita(text),
    {
      parse_mode: "HTML"
    }
  );
});

/* =========================================================
   /STICKER
========================================================= */

BOT.command("sticker", async ctx => {
  await typing(ctx);

  const category =
    getMood(ctx.chat.id);

  await sendRandomSticker(
    ctx,
    category
  );
});

/* =========================================================
   /ADDSTICKER
========================================================= */

BOT.command("addsticker", async ctx => {
  const reply =
    ctx.message?.reply_to_message;

  if (!reply?.sticker) {
    await ctx.reply(
      formatAnita(
        "Réponds à un sticker avec /addsticker 🙃"
      ),
      {
        parse_mode: "HTML"
      }
    );

    return;
  }

  const sticker =
    reply.sticker;

  try {
    db.prepare(`
      INSERT OR IGNORE INTO stickers (
        file_id,
        emoji,
        pack,
        category,
        added_by,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      sticker.file_id,
      sticker.emoji || "🙂",
      sticker.set_name || "custom",
      detectStickerCategory(
        sticker.emoji || ""
      ),
      Number(ctx.from.id),
      now()
    );

    await ctx.reply(
      formatAnita(
        "Sticker ajouté à ma mémoire 🍒"
      ),
      {
        parse_mode: "HTML"
      }
    );
  } catch (error) {
    console.log(
      "❌ addsticker:",
      error.message
    );
  }
});

/* =========================================================
   STICKER ENTRANT
========================================================= */

BOT.on("sticker", async ctx => {
  try {
    learnSticker(ctx);

    const lastText =
      lastTextByChat.get(
        ctx.chat.id
      );

    const currentTime =
      now();

    /*
      Si un texte vient juste d'être envoyé,
      le sticker est probablement une réponse
      au texte. On ne répond pas deux fois.
    */
    if (
      lastText &&
      currentTime - lastText < 5000
    ) {
      console.log(
        "🍃 Sticker ignoré : texte récent détecté."
      );

      return;
    }

    if (!addressed(ctx)) {
      return;
    }

    if (
      processingChats.has(
        ctx.chat.id
      )
    ) {
      return;
    }

    processingChats.add(
      ctx.chat.id
    );

    await typing(ctx);

    const mood =
      detectMood(
        ctx.message?.sticker?.emoji || ""
      );

    updateMood(
      ctx.chat.id,
      mood
    );

    const text =
      "L'utilisateur vient de m'envoyer un sticker. Réagis naturellement.";

    saveUser(ctx);

    saveMessage(
      ctx.chat.id,
      Number(ctx.from.id),
      "user",
      `[STICKER] ${ctx.message.sticker.emoji || ""}`
    );

    const answer =
      await getAIAnswer(
        ctx,
        text
      );

    await sendAnita(
      ctx,
      answer,
      mood
    );
  } catch (error) {
    console.log(
      "❌ Erreur sticker:",
      error
    );
  } finally {
    processingChats.delete(
      ctx.chat.id
    );
  }
});

/* =========================================================
   MESSAGE TEXTE
========================================================= */

BOT.on("text", async ctx => {
  try {
    const text =
      ctx.message?.text?.trim();

    if (!text) return;

    /*
      Commandes Telegram déjà traitées.
    */
    if (
      text.startsWith("/")
    ) {
      return;
    }

    /*
      En groupe, Anita ne répond
      que lorsqu'elle est appelée.
    */
    if (!addressed(ctx)) {
      return;
    }

    /*
      Empêche plusieurs traitements
      simultanés dans le même chat.
    */
    if (
      processingChats.has(
        ctx.chat.id
      )
    ) {
      console.log(
        "⏳ Message ignoré : traitement déjà en cours."
      );

      return;
    }

    processingChats.add(
      ctx.chat.id
    );

    lastTextByChat.set(
      ctx.chat.id,
      now()
    );

    saveUser(ctx);

    saveMessage(
      ctx.chat.id,
      Number(ctx.from.id),
      "user",
      text
    );

    learnFromMessage(
      ctx,
      text
    );

    const mood =
      detectMood(text);

    updateMood(
      ctx.chat.id,
      mood
    );

    await typing(ctx);

    console.log(
      `📩 Message reçu de ${ctx.from?.id}: ${text}`
    );

    const answer =
      await getAIAnswer(
        ctx,
        text
      );

    console.log(
      "🧠 Réponse finale préparée."
    );

    await sendAnita(
      ctx,
      answer,
      mood
    );
  } catch (error) {
    console.log(
      "❌ ERREUR MESSAGE:",
      error
    );

    try {
      await ctx.reply(
        formatAnita(
          "J'ai eu un petit bug 😭🤦‍♂️ mais je suis toujours là."
        ),
        {
          parse_mode: "HTML"
        }
      );
    } catch (sendError) {
      console.log(
        "❌ Impossible d'envoyer le fallback:",
        sendError.message
      );
    }
  } finally {
    processingChats.delete(
      ctx.chat.id
    );
  }
});

/* =========================================================
   ERREURS
========================================================= */

BOT.catch((error, ctx) => {
  console.log(
    "💥 ERREUR TELEGRAM :",
    error?.message || error
  );

  if (
    error?.response?.error_code === 409
  ) {
    console.log(`
🚨 ERREUR 409 :

Une autre instance du bot utilise déjà
getUpdates avec le même token.

➡️ Arrête l'autre instance.
➡️ Garde UNE SEULE Anita active.
`);
  }
});

/* =========================================================
   ARRÊT PROPRE
========================================================= */

async function shutdown(signal) {
  console.log(
    `🛑 ${signal} reçu. Arrêt d'Anita...`
  );

  try {
    BOT.stop(signal);
  } catch (error) {
    console.log(
      "⚠️ Erreur arrêt:",
      error.message
    );
  }

  try {
    db.close();
  } catch {}

  process.exit(0);
}

process.once(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.once(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

/* =========================================================
   START
========================================================= */

async function start() {
  try {
    const me =
      await BOT.telegram.getMe();

    ANITA_BOT_ID =
      Number(me.id);

    ANITA_USERNAME =
      me.username ||
      "Anita_officiel_bot";

    console.log(
      `🍃🍒 Anita connectée : @${ANITA_USERNAME}`
    );

    console.log(
      `👑 Nicolas ID : ${BROTHER_USER_ID}`
    );

    console.log(
      `🤖 Gemini : ${GEMINI_MODEL}`
    );

    console.log(
      `🦙 Groq : ${GROQ_MODEL}`
    );

    await loadStickerPacks();

    /*
      dropPendingUpdates évite qu'Anita traite
      une vieille file de messages après un redémarrage.
    */
    await BOT.launch({
      dropPendingUpdates: true
    });

    console.log(
      "🚀 Anita est maintenant EN LIGNE."
    );
  } catch (error) {
    console.log(
      "❌ Démarrage impossible :",
      error
    );

    if (
      error?.response?.error_code === 409
    ) {
      console.log(`
🚨 409 CONFLICT

ANITA EST DÉJÀ LANCÉE AILLEURS.

Vérifie :
1. Railway
2. Replit
3. Un autre service Railway
4. Un ancien serveur Node.js

Il faut garder UNE SEULE instance utilisant
le token de @${ANITA_USERNAME}.
`);
    }

    process.exit(1);
  }
}

start();
