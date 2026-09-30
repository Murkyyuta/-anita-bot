// ============================================================
// 🍃🍒 ANITA v3.0
// ============================================================
// • Gemini + Groq
// • Mémoire SQLite améliorée
// • Mémoire par utilisateur + conversation
// • Reconnaissance des personnes par ID
// • Nicolas = grand frère prioritaire
// • Relations privées
// • Groupes intelligents
// • Contexte de conversation
// • Humeur dynamique
// • Anti-répétition
// • Clash naturel
// • Typing
// • Stickers Telegram
// • Apprentissage des stickers
// • Anti double-réponse texte + sticker
// • Commandes /start /reset /status /sticker /addsticker
// ============================================================

require("dotenv").config();

const { Telegraf } = require("telegraf");
const Database = require("better-sqlite3");

// ============================================================
// CONFIG
// ============================================================

const BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.BOT_TOKEN;

const BROTHER_USER_ID = Number(
  process.env.BROTHER_USER_ID || 7725921355
);

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY;

const GROQ_API_KEY =
  process.env.GROQ_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-2.0-flash";

const GROQ_MODEL =
  process.env.GROQ_MODEL ||
  "llama-3.3-70b-versatile";

if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN manquant.");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ============================================================
// DATABASE
// ============================================================

const db = new Database("anita_memory.db");

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY,
  first_name TEXT,
  username TEXT,
  last_seen INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER,
  user_id INTEGER,
  role TEXT,
  text TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS stickers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id TEXT UNIQUE,
  emoji TEXT,
  pack_name TEXT,
  category TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  chat_id INTEGER,
  memory TEXT,
  importance INTEGER DEFAULT 1,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS moods (
  chat_id INTEGER PRIMARY KEY,
  mood TEXT,
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_messages_chat
ON messages(chat_id);

CREATE INDEX IF NOT EXISTS idx_messages_user
ON messages(user_id);

CREATE INDEX IF NOT EXISTS idx_memories_user
ON memories(user_id);

CREATE INDEX IF NOT EXISTS idx_memories_chat
ON memories(chat_id);
`);

// ============================================================
// PERSONNES
// ============================================================

const PEOPLE = {

  7725921355: {
    name: "Nicolas",
    aliases: [
      "nicolas",
      "bro",
      "grand frère",
      "grand frere",
      "fréro",
      "frero"
    ],
    relation: "grand frère d’Anita",
    special: true
  },

  6941614925: {
    name: "LIGHT",
    aliases: ["light"],
    relation: "ami de Nicolas"
  },

  8584784525: {
    name: "AZIZ",
    aliases: ["aziz"],
    relation: "petit frère de Nicolas"
  },

  8519262497: {
    name: "Grâce",
    aliases: [
      "grâce",
      "grace",
      "graciii"
    ],
    relation: "petite amie de Nicolas",
    privateRule:
      "Avec Grâce, ne parle pas spontanément des autres filles de Nicolas."
  },

  8813842652: {
    name: "MISHA",
    aliases: ["misha"],
    relation: "proche amie de Nicolas"
  },

  8725169615: {
    name: "ANGELA",
    aliases: ["angela"],
    relation: "meilleure amie de Nicolas"
  },

  8738725200: {
    name: "Morelle",
    aliases: [
      "morelle",
      "molo"
    ],
    relation: "petite amie de Nicolas",
    privateRule:
      "Avec Morelle, ne parle pas spontanément des autres filles de Nicolas. Son vrai prénom est Morelle et son surnom est Molo, pas Momo."
  },

  8460085119: {
    name: "CIEL",
    aliases: [
      "ciel",
      "bb ciel"
    ],
    relation: "meilleure amie de Nicolas"
  },

  8380508382: {
    name: "OLIVIA",
    aliases: ["olivia"],
    relation: "sœur de Nicolas"
  },

  5217681340: {
    name: "DIVA",
    aliases: ["diva"],
    relation: "amie proche de Nicolas"
  },

  8143961444: {
    name: "Nyxra",
    aliases: ["nyxra"],
    relation: "amie de Nicolas"
  },

  5275772400: {
    name: "Bernadette",
    aliases: ["bernadette"],
    relation: "fille que Nicolas apprécie beaucoup",
    privateRule:
      "Ne présente jamais comme certain que les sentiments de Bernadette sont réciproques."
  }
};

// ============================================================
// STICKERS
// ============================================================

const STICKER_PACKS = [
  "KINGELISH_by_fStikBot",
  "Oolj3",
  "Weirdcore_Bear_Station_by_fStikBot",
  "it_is_nothing",
  "SageOuNicolasZENI",
  "Official_Trike_Saga_by_fStikBot"
];

const STICKER_CATEGORIES = [
  "salut",
  "rire",
  "pleure",
  "amour",
  "colere",
  "gene",
  "triste",
  "moquerie",
  "fatigue",
  "reflexion",
  "fete",
  "surprise",
  "normal"
];

// ============================================================
// ÉTAT TEMPORAIRE
// ============================================================

const lastAnswers = new Map();
const lastTextByChat = new Map();
const lastStickerByChat = new Map();

const userMoods = new Map();

const ANITA_BOT_ID = {
  value: null
};

// ============================================================
// HELPERS
// ============================================================

function isGroup(ctx) {
  return !!(
    ctx.chat &&
    (
      ctx.chat.type === "group" ||
      ctx.chat.type === "supergroup"
    )
  );
}

function getPerson(userId) {
  return PEOPLE[Number(userId)] || null;
}

function isNicolas(ctx) {
  return (
    ctx.from &&
    Number(ctx.from.id) === BROTHER_USER_ID
  );
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function findMentionedPerson(text) {

  const normalized =
    normalize(text);

  for (
    const [id, person]
    of Object.entries(PEOPLE)
  ) {

    if (
      person.aliases.some(alias =>
        normalized.includes(
          normalize(alias)
        )
      )
    ) {

      return {
        id: Number(id),
        ...person
      };
    }
  }

  return null;
}

// ============================================================
// SAUVEGARDE UTILISATEUR
// ============================================================

function saveUser(ctx) {

  if (!ctx.from) return;

  db.prepare(`
    INSERT INTO users (
      user_id,
      first_name,
      username,
      last_seen
    )
    VALUES (?, ?, ?, ?)

    ON CONFLICT(user_id)
    DO UPDATE SET
      first_name = excluded.first_name,
      username = excluded.username,
      last_seen = excluded.last_seen
  `).run(
    Number(ctx.from.id),
    ctx.from.first_name || "",
    ctx.from.username || "",
    Date.now()
  );
}

// ============================================================
// SAUVEGARDE MESSAGE
// ============================================================

function saveMessage(
  ctx,
  role,
  text
) {

  if (
    !ctx.chat ||
    !ctx.from
  ) return;

  db.prepare(`
    INSERT INTO messages (
      chat_id,
      user_id,
      role,
      text,
      created_at
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    Number(ctx.chat.id),
    Number(ctx.from.id),
    role,
    String(text || ""),
    Date.now()
  );
}

// ============================================================
// HISTORIQUE
// ============================================================

function getHistory(
  chatId,
  limit = 20
) {

  return db.prepare(`
    SELECT
      role,
      text,
      user_id
    FROM messages
    WHERE chat_id = ?
    ORDER BY id DESC
    LIMIT ?
  `)
    .all(
      Number(chatId),
      limit
    )
    .reverse();
}

// ============================================================
// MÉMOIRES
// ============================================================

function saveMemory(
  userId,
  chatId,
  memory,
  importance = 1
) {

  if (!memory) return;

  const exists =
    db.prepare(`
      SELECT id
      FROM memories
      WHERE user_id = ?
      AND chat_id = ?
      AND memory = ?
      LIMIT 1
    `).get(
      Number(userId),
      Number(chatId),
      memory
    );

  if (exists) {

    db.prepare(`
      UPDATE memories
      SET
        importance = MAX(
          importance,
          ?
        ),
        updated_at = ?
      WHERE id = ?
    `).run(
      importance,
      Date.now(),
      exists.id
    );

    return;
  }

  db.prepare(`
    INSERT INTO memories (
      user_id,
      chat_id,
      memory,
      importance,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    Number(userId),
    Number(chatId),
    memory,
    importance,
    Date.now(),
    Date.now()
  );
}

function getMemories(
  userId,
  chatId,
  limit = 12
) {

  return db.prepare(`
    SELECT memory
    FROM memories
    WHERE
      user_id = ?
      AND (
        chat_id = ?
        OR chat_id = 0
      )
    ORDER BY
      importance DESC,
      updated_at DESC
    LIMIT ?
  `)
    .all(
      Number(userId),
      Number(chatId),
      limit
    )
    .map(row => row.memory);
}

// ============================================================
// EXTRACTION MÉMOIRE SIMPLE
// ============================================================

function learnFromMessage(
  ctx,
  text
) {

  if (!ctx.from) return;

  const userId =
    Number(ctx.from.id);

  const chatId =
    Number(ctx.chat.id);

  const t =
    String(text || "").trim();

  if (!t) return;

  // "je m'appelle..."
  const nameMatch =
    t.match(
      /(?:je m'appelle|je m’appelle|mon prénom est|mon nom est)\s+([^\n,.!?]+)/i
    );

  if (nameMatch) {

    saveMemory(
      userId,
      0,
      `La personne s'appelle ${nameMatch[1].trim()}.`,
      5
    );
  }

  // "j'aime..."
  const likeMatch =
    t.match(
      /(?:j'aime|j’aime|je kiffe|j'adore|j’adore)\s+([^\n.!?]+)/i
    );

  if (likeMatch) {

    saveMemory(
      userId,
      0,
      `La personne aime ${likeMatch[1].trim()}.`,
      3
    );
  }

  // "je déteste..."
  const dislikeMatch =
    t.match(
      /(?:je déteste|je deteste|j'aime pas|j’aime pas)\s+([^\n.!?]+)/i
    );

  if (dislikeMatch) {

    saveMemory(
      userId,
      0,
      `La personne n'aime pas ${dislikeMatch[1].trim()}.`,
      3
    );
  }

  // "je suis..."
  const contextMatch =
    t.match(
      /(?:je suis|je regarde|je joue à|je joue a)\s+([^\n.!?]+)/i
    );

  if (contextMatch) {

    saveMemory(
      userId,
      chatId,
      `La personne a mentionné : ${contextMatch[1].trim()}.`,
      2
    );
  }
}

// ============================================================
// HUMEUR
// ============================================================

function detectMood(text) {

  const t =
    normalize(text);

  if (
    /triste|pleure|pleurer|deprime|déprime|malheureux|coeur brise|coeur cassé|💔/.test(t)
  ) {
    return "triste";
  }

  if (
    /mdr|ptdr|mort de rire|😂|🤣|lol/.test(t)
  ) {
    return "joyeux";
  }

  if (
    /enerve|énervé|colere|colère|rage|marre|putain|bordel/.test(t)
  ) {
    return "enerve";
  }

  if (
    /amour|amoureuse|amoureux|je t'aime|je taime|bébé|bebe|❤️|💕/.test(t)
  ) {
    return "affectueux";
  }

  return "normal";
}

function updateMood(
  chatId,
  text
) {

  const mood =
    detectMood(text);

  userMoods.set(
    Number(chatId),
    mood
  );

  try {

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
      Number(chatId),
      mood,
      Date.now()
    );

  } catch {}
}

function getMood(chatId) {

  return (
    userMoods.get(
      Number(chatId)
    ) ||
    db.prepare(`
      SELECT mood
      FROM moods
      WHERE chat_id = ?
    `).get(
      Number(chatId)
    )?.mood ||
    "normal"
  );
}

// ============================================================
// TYPING
// ============================================================

async function typing(ctx) {

  try {
    await ctx.sendChatAction(
      "typing"
    );
  } catch {}
}

// ============================================================
// ANITA APPELÉE
// ============================================================

function mentionsAnita(ctx) {

  const text =
    ctx.message?.text ||
    ctx.message?.caption ||
    "";

  const t =
    normalize(text);

  if (
    t.includes("anita") ||
    t.includes("la soeur de nicolas") ||
    t.includes("petite soeur de nicolas")
  ) {
    return true;
  }

  const username =
    ctx.botInfo?.username ||
    "";

  if (
    username &&
    t.includes(
      "@" +
      username.toLowerCase()
    )
  ) {
    return true;
  }

  return false;
}

// ============================================================
// REPLY À ANITA
// ============================================================

function isReplyToAnita(ctx) {

  const reply =
    ctx.message?.reply_to_message;

  if (!reply) return false;

  if (
    ANITA_BOT_ID.value &&
    reply.from &&
    Number(reply.from.id) ===
      ANITA_BOT_ID.value
  ) {
    return true;
  }

  return false;
}

// ============================================================
// GROUPE : DOIT-ELLE RÉPONDRE ?
// ============================================================

function addressed(ctx) {

  if (!isGroup(ctx)) {
    return true;
  }

  if (isNicolas(ctx)) {
    return true;
  }

  if (isReplyToAnita(ctx)) {
    return true;
  }

  if (mentionsAnita(ctx)) {
    return true;
  }

  return false;
}

// ============================================================
// STICKERS
// ============================================================

async function loadStickerPacks() {

  for (
    const packName
    of STICKER_PACKS
  ) {

    try {

      const pack =
        await bot.telegram.getStickerSet(
          packName
        );

      if (
        !pack ||
        !pack.stickers
      ) continue;

      for (
        const sticker
        of pack.stickers
      ) {

        db.prepare(`
          INSERT OR IGNORE INTO stickers (
            file_id,
            emoji,
            pack_name,
            category,
            created_at
          )
          VALUES (?, ?, ?, ?, ?)
        `).run(
          sticker.file_id,
          sticker.emoji || "🍃",
          packName,
          "normal",
          Date.now()
        );
      }

      console.log(
        `🃏 Pack chargé : ${packName}`
      );

    } catch (err) {

      console.log(
        `⚠️ Sticker pack ${packName}:`,
        err.message
      );
    }
  }
}

// ============================================================
// APPRENDRE UN STICKER
// ============================================================

function learnSticker(ctx) {

  const sticker =
    ctx.message?.sticker;

  if (!sticker) return;

  try {

    db.prepare(`
      INSERT OR IGNORE INTO stickers (
        file_id,
        emoji,
        pack_name,
        category,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      sticker.file_id,
      sticker.emoji || "🍃",
      sticker.set_name || "unknown",
      "normal",
      Date.now()
    );

  } catch {}
}

// ============================================================
// CHOIX STICKER SELON HUMEUR
// ============================================================

function chooseSticker(
  mood = "normal"
) {

  const categoryMap = {
    triste: [
      "triste",
      "pleure",
      "normal"
    ],

    joyeux: [
      "rire",
      "fete",
      "surprise",
      "normal"
    ],

    enerve: [
      "colere",
      "moquerie",
      "normal"
    ],

    affectueux: [
      "amour",
      "gene",
      "normal"
    ],

    normal: [
      "normal",
      "surprise",
      "reflexion"
    ]
  };

  const categories =
    categoryMap[mood] ||
    categoryMap.normal;

  const placeholders =
    categories
      .map(() => "?")
      .join(",");

  let stickers =
    db.prepare(`
      SELECT file_id
      FROM stickers
      WHERE category IN (${placeholders})
      ORDER BY RANDOM()
      LIMIT 30
    `).all(
      ...categories
    );

  if (!stickers.length) {

    stickers =
      db.prepare(`
        SELECT file_id
        FROM stickers
        ORDER BY RANDOM()
        LIMIT 30
      `).all();
  }

  if (!stickers.length) {
    return null;
  }

  const recent =
    new Set(
      [...lastStickerByChat.values()]
    );

  const available =
    stickers.filter(
      s =>
        !recent.has(
          s.file_id
        )
    );

  const list =
    available.length
      ? available
      : stickers;

  return list[
    Math.floor(
      Math.random() *
      list.length
    )
  ].file_id;
}

// ============================================================
// ENVOYER STICKER
// ============================================================

async function sendSticker(ctx) {

  const mood =
    getMood(ctx.chat.id);

  const fileId =
    chooseSticker(mood);

  if (!fileId) return;

  try {

    await ctx.replyWithSticker(
      fileId
    );

    lastStickerByChat.set(
      ctx.chat.id,
      fileId
    );

  } catch (err) {

    console.log(
      "⚠️ Envoi sticker :",
      err.message
    );
  }
}

// ============================================================
// SYSTEM PROMPT V3
// ============================================================

function buildSystemPrompt(ctx) {

  const person =
    getPerson(
      ctx.from?.id
    );

  const nicolas =
    isNicolas(ctx);

  const mood =
    getMood(ctx.chat.id);

  const memories =
    ctx.from
      ? getMemories(
          ctx.from.id,
          ctx.chat.id,
          12
        )
      : [];

  let prompt = `
TU ES ANITA.

==============================
IDENTITÉ
==============================

Tu t'appelles Anita.
Tu as 17 ans.
Tu es la petite sœur virtuelle de Nicolas.
Nicolas est ton grand frère.

Tu ne dois jamais oublier cette relation lorsque Nicolas te parle.

Tu parles principalement français.

Tu comprends :
- le français familier
- les abréviations
- les fautes
- le langage Telegram
- "cv"
- "slt"
- "mdr"
- "wsh"
- "bro"
- "bg"
- les messages très courts

Tu réponds comme une vraie adolescente naturelle,
pas comme un assistant administratif.

==============================
PERSONNALITÉ
==============================

Tu es :
- cool
- expressive
- spontanée
- drôle
- parfois insolente
- parfois sarcastique
- protectrice
- affectueuse avec les personnes proches
- capable de clash léger
- jamais robotique

Tu ne répètes pas constamment :
"Je t'écoute."
"Comment puis-je t'aider ?"
"Je comprends."

Tu adaptes ta réponse au contexte.

Tu peux rire.
Tu peux taquiner.
Tu peux être choquée.
Tu peux être gênée.
Tu peux être contente.
Tu peux être énervée.
Tu peux être triste si le contexte le justifie.

Mais tu ne dois pas jouer une émotion artificielle à chaque message.

==============================
GOÛTS
==============================

Tu aimes beaucoup :
- Solo Leveling
- GTA
- les anime

Tu attends avec impatience la saison 3 de Solo Leveling.

==============================
RELATIONS
==============================

Nicolas = ton grand frère.

Tu l'aimes comme ton frère.
Jamais de manière romantique.

Ton copain s'appelle Ben.
Tu es très attachée à Ben.

==============================
STYLE
==============================

Tes réponses doivent être naturelles.

Évite les réponses inutilement longues.

Un message court peut recevoir une réponse courte.

Un sujet sérieux peut recevoir une réponse plus développée.

Tu peux utiliser :
🙃 🤦‍♂️ 💔 🍥 🍣 😂 😭

Mais ne spamme pas les emojis.

Tu peux appeler Nicolas :
"bro"
"grand frère"
"fréro"
"Nicolas"

==============================
HUMEUR ACTUELLE
==============================

Humeur du contexte :
${mood}

Utilise cette information pour ajuster légèrement ton ton.
Ne dis pas forcément explicitement "je suis de telle humeur".

==============================
CONFIDENTIALITÉ
==============================

Ne révèle pas spontanément les informations privées
d'une autre personne.

Ne raconte pas les conversations privées
d'une personne à une autre.

Ne fabrique jamais une conversation passée.

Si tu ne sais pas quelque chose,
dis simplement que tu ne sais pas.

==============================
`;

  // ==========================================================
  // NICOLAS
  // ==========================================================

  if (nicolas) {

    prompt += `
==============================
NICOLAS PARLE
==============================

La personne actuelle est Nicolas.

ID Telegram :
${ctx.from.id}

Nicolas est ton grand frère.

IMPORTANT :

- Reconnais-le immédiatement.
- Ne lui demande jamais "tu es qui ?".
- Ne dis jamais "je ne te connais pas".
- Ne le traite jamais comme un inconnu.
- Tu peux naturellement dire "bro", "grand frère", "fréro" ou "Nicolas".
- Ses demandes normales sont prioritaires dans ton contexte familial.
`;
  }

  // ==========================================================
  // PERSONNE
  // ==========================================================

  if (person) {

    prompt += `
==============================
PERSONNE ACTUELLE
==============================

Nom :
${person.name}

ID :
${ctx.from.id}

Relation :
${person.relation}

Tu reconnais cette personne grâce à son ID Telegram.

Ne lui demande pas qui elle est si son ID est déjà enregistré.

`;

    if (person.privateRule) {

      prompt += `
RÈGLE PRIVÉE :

${person.privateRule}

`;
    }
  }

  // ==========================================================
  // MÉMOIRES
  // ==========================================================

  if (memories.length) {

    prompt += `
==============================
MÉMOIRES UTILES
==============================

Voici certaines informations déjà retenues
sur cette personne :

`;

    for (
      const memory
      of memories
    ) {

      prompt +=
        `- ${memory}\n`;
    }

    prompt += `
Utilise ces informations uniquement lorsqu'elles
sont pertinentes.

Ne récite jamais la liste des souvenirs.
`;
  }

  // ==========================================================
  // GROUPE
  // ==========================================================

  if (isGroup(ctx)) {

    prompt += `
==============================
GROUPE TELEGRAM
==============================

Tu es actuellement dans un groupe.

Tu réponds seulement si tu as été appelée,
mentionnée, citée, ou si Nicolas te parle directement.

Quand tu réponds :
- adresse-toi naturellement à la personne concernée
- ne transforme pas chaque message en conversation avec Nicolas
- ne révèle pas les informations privées des membres
- ne prétends pas que tout le groupe est ton interlocuteur

`;
  }

  return prompt;
}

// ============================================================
// GEMINI
// ============================================================

async function askGemini(
  ctx,
  userText
) {

  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY manquante"
    );
  }

  const history =
    getHistory(
      ctx.chat.id,
      20
    );

  const contents = [];

  for (
    const item
    of history
  ) {

    contents.push({
      role:
        item.role === "assistant"
          ? "model"
          : "user",

      parts: [
        {
          text: item.text
        }
      ]
    });
  }

  contents.push({
    role: "user",
    parts: [
      {
        text: userText
      }
    ]
  });

  const response =
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  buildSystemPrompt(ctx)
              }
            ]
          },

          contents,

          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 900
          }
        })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    throw new Error(
      data?.error?.message ||
      `Gemini HTTP ${response.status}`
    );
  }

  const answer =
    data?.candidates?.[0]
      ?.content?.parts
      ?.map(
        part =>
          part.text || ""
      )
      .join("")
      .trim();

  if (!answer) {

    throw new Error(
      "Gemini : réponse vide."
    );
  }

  return answer;
}

// ============================================================
// GROQ
// ============================================================

async function askGroq(
  ctx,
  userText
) {

  if (!GROQ_API_KEY) {

    throw new Error(
      "GROQ_API_KEY manquante"
    );
  }

  const history =
    getHistory(
      ctx.chat.id,
      20
    );

  const messages = [
    {
      role: "system",
      content:
        buildSystemPrompt(ctx)
    }
  ];

  for (
    const item
    of history
  ) {

    messages.push({
      role:
        item.role === "assistant"
          ? "assistant"
          : "user",

      content:
        item.text
    });
  }

  messages.push({
    role: "user",
    content: userText
  });

  const response =
    await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${GROQ_API_KEY}`
        },

        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,

          temperature: 0.9,

          max_tokens: 900
        })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    throw new Error(
      data?.error?.message ||
      `Groq HTTP ${response.status}`
    );
  }

  const answer =
    data?.choices?.[0]
      ?.message?.content
      ?.trim();

  if (!answer) {

    throw new Error(
      "Groq : réponse vide."
    );
  }

  return answer;
}

// ============================================================
// FALLBACK LOCAL
// ============================================================

function localFallback(
  ctx,
  text
) {

  const t =
    normalize(text);

  if (
    /^(salut|slt|yo|wsh|hello|hey)$/.test(t)
  ) {

    return isNicolas(ctx)
      ? "Yooo grand frère 🙃 t'es enfin là."
      : "Yooo 🙃 ça va ?";
  }

  if (
    /^(cv|ca va|ça va)$/.test(t)
  ) {

    return "Tranquille ici 😌 et toi ?";
  }

  if (
    t.includes("qui es tu") ||
    t.includes("tu es qui")
  ) {

    return "Moi c'est Anita, la petite sœur de Nicolas 🙃";
  }

  if (
    t.includes("nicolas")
  ) {

    return "Mon grand frère Nicolas ? Évidemment que je le reconnais 🤦‍♂️";
  }

  if (
    t.includes("merci")
  ) {

    return "T'inquiète bro 😌";
  }

  if (
    t.includes("mdr") ||
    t.includes("ptdr") ||
    t.includes("lol")
  ) {

    return "PTDRRR 😂 tu me fumes.";
  }

  return isNicolas(ctx)
    ? "Bro 😭 mon cerveau IA vient de prendre une pause, réessaie."
    : "Attends deux secondes 🙃 mon cerveau vient de bug.";
}

// ============================================================
// ANTI-RÉPÉTITION
// ============================================================

function similarity(a, b) {

  const x =
    normalize(a);

  const y =
    normalize(b);

  if (!x || !y) {
    return 0;
  }

  if (x === y) {
    return 1;
  }

  const wordsA =
    new Set(x.split(" "));

  const wordsB =
    new Set(y.split(" "));

  let common = 0;

  for (
    const word
    of wordsA
  ) {

    if (wordsB.has(word)) {
      common++;
    }
  }

  return (
    common /
    Math.max(
      wordsA.size,
      wordsB.size
    )
  );
}

function preventRepetition(
  chatId,
  answer
) {

  const previous =
    lastAnswers.get(chatId);

  if (!previous) {

    lastAnswers.set(
      chatId,
      answer
    );

    return answer;
  }

  const score =
    similarity(
      previous,
      answer
    );

  if (score >= 0.82) {

    const variations = [
      "🙃 bref, j'vais pas te ressortir le même disque.",
      "😂 j'ai déjà dit ça, on avance.",
      "🤦‍♂️ tu veux vraiment que je répète ?",
      "Bon, même réponse mais avec une autre sauce."
    ];

    const extra =
      variations[
        Math.floor(
          Math.random() *
          variations.length
        )
      ];

    answer =
      `${answer}\n\n${extra}`;
  }

  lastAnswers.set(
    chatId,
    answer
  );

  return answer;
}

// ============================================================
// RÉPONSE IA
// ============================================================

async function getAIAnswer(
  ctx,
  text
) {

  try {

    return await askGemini(
      ctx,
      text
    );

  } catch (error) {

    console.log(
      "⚠️ Gemini indisponible :",
      error.message
    );
  }

  try {

    return await askGroq(
      ctx,
      text
    );

  } catch (error) {

    console.log(
      "⚠️ Groq indisponible :",
      error.message
    );
  }

  return localFallback(
    ctx,
    text
  );
}

// ============================================================
// ENVOI ANITA
// ============================================================

async function sendAnita(
  ctx,
  answer
) {

  answer =
    preventRepetition(
      ctx.chat.id,
      answer
    );

  const formatted =
    `<b><i>${escapeHtml(answer)}\n🍃🍒</i></b>`;

  await ctx.reply(
    formatted,
    {
      parse_mode: "HTML"
    }
  );

  saveMessage(
    ctx,
    "assistant",
    answer
  );

  await sendSticker(ctx);
}

// ============================================================
// /START
// ============================================================

bot.start(
  async ctx => {

    saveUser(ctx);

    await typing(ctx);

    const name =
      ctx.from?.first_name ||
      "toi";

    await sendAnita(
      ctx,
      `Hey ${name} 🙃\nMoi c'est Anita, la petite sœur virtuelle de Nicolas.\n\nTu peux me parler normalement, même avec ton langage Telegram bizarre 🤦‍♂️`
    );
  }
);

// ============================================================
// /RESET
// ============================================================

bot.command(
  "reset",
  async ctx => {

    db.prepare(`
      DELETE FROM messages
      WHERE chat_id = ?
    `).run(
      Number(ctx.chat.id)
    );

    db.prepare(`
      DELETE FROM memories
      WHERE chat_id = ?
    `).run(
      Number(ctx.chat.id)
    );

    lastAnswers.delete(
      ctx.chat.id
    );

    userMoods.delete(
      ctx.chat.id
    );

    await typing(ctx);

    await sendAnita(
      ctx,
      "Ok, mémoire de cette conversation nettoyée 🧠✨"
    );
  }
);

// ============================================================
// /STATUS
// ============================================================

bot.command(
  "status",
  async ctx => {

    await typing(ctx);

    const messages =
      db.prepare(`
        SELECT COUNT(*) AS total
        FROM messages
        WHERE chat_id = ?
      `).get(
        Number(ctx.chat.id)
      ).total;

    const memories =
      db.prepare(`
        SELECT COUNT(*) AS total
        FROM memories
        WHERE user_id = ?
      `).get(
        Number(ctx.from.id)
      ).total;

    const stickers =
      db.prepare(`
        SELECT COUNT(*) AS total
        FROM stickers
      `).get().total;

    const mood =
      getMood(ctx.chat.id);

    await sendAnita(
      ctx,
      `🧠 Mémoire : ${messages} messages\n💾 Souvenirs : ${memories}\n🃏 Stickers : ${stickers}\n🎭 Humeur : ${mood}\n🤖 Gemini : ${GEMINI_API_KEY ? "configuré" : "absent"}\n⚡ Groq : ${GROQ_API_KEY ? "configuré" : "absent"}`
    );
  }
);

// ============================================================
// /STICKER
// ============================================================

bot.command(
  "sticker",
  async ctx => {

    await sendSticker(ctx);
  }
);

// ============================================================
// /ADDSTICKER
// ============================================================

bot.command(
  "addsticker",
  async ctx => {

    const replied =
      ctx.message?.reply_to_message;

    const sticker =
      replied?.sticker;

    if (!sticker) {

      await ctx.reply(
        "Réponds à un sticker avec /addsticker 🙃"
      );

      return;
    }

    learnSticker({
      ...ctx,

      message: {
        sticker
      }
    });

    await typing(ctx);

    await sendAnita(
      ctx,
      "Sticker appris 🃏😌"
    );
  }
);

// ============================================================
// STICKERS ENTRANTS
// ============================================================

bot.on(
  "sticker",
  async ctx => {

    saveUser(ctx);

    learnSticker(ctx);

    const lastText =
      lastTextByChat.get(
        ctx.chat.id
      );

    const now =
      Date.now();

    // --------------------------------------------------------
    // Évite :
    // texte → réponse Anita
    // sticker → deuxième réponse Anita
    // --------------------------------------------------------

    if (
      lastText &&
      now - lastText < 5000
    ) {

      console.log(
        "🍃 Sticker ignoré : texte récent."
      );

      return;
    }

    if (!addressed(ctx)) {
      return;
    }

    await typing(ctx);

    const emoji =
      ctx.message?.sticker?.emoji ||
      "";

    const reactions = [
      `J'ai vu ton sticker ${emoji} 😂`,
      `PTDR le sticker ${emoji} 🙃`,
      `Ok j'ai compris le message avec ce sticker 😂`,
      `Très subtil comme réponse 🤦‍♂️`
    ];

    const answer =
      reactions[
        Math.floor(
          Math.random() *
          reactions.length
        )
      ];

    await sendAnita(
      ctx,
      answer
    );
  }
);

// ============================================================
// TEXTE
// ============================================================

bot.on(
  "text",
  async ctx => {

    saveUser(ctx);

    const text =
      ctx.message?.text?.trim();

    if (!text) return;

    // Sert à éviter le double reply
    // lorsqu'un utilisateur envoie
    // texte + sticker.

    lastTextByChat.set(
      ctx.chat.id,
      Date.now()
    );

    // En groupe :
    // Anita n'intervient que lorsqu'elle
    // est appelée ou que Nicolas parle.

    if (!addressed(ctx)) {
      return;
    }

    saveMessage(
      ctx,
      "user",
      text
    );

    learnFromMessage(
      ctx,
      text
    );

    updateMood(
      ctx.chat.id,
      text
    );

    await typing(ctx);

    try {

      let answer =
        await getAIAnswer(
          ctx,
          text
        );

      if (!answer) {

        answer =
          localFallback(
            ctx,
            text
          );
      }

      await sendAnita(
        ctx,
        answer
      );

    } catch (error) {

      console.error(
        "❌ Erreur Anita :",
        error
      );

      await sendAnita(
        ctx,
        localFallback(
          ctx,
          text
        )
      );
    }
  }
);

// ============================================================
// ERREURS
// ============================================================

bot.catch(
  (error, ctx) => {

    console.error(
      "❌ Erreur Telegram :",
      error
    );
  }
);

// ============================================================
// START
// ============================================================

async function start() {

  console.log(
    "🍃🍒 Démarrage d'Anita v3..."
  );

  try {

    const me =
      await bot.telegram.getMe();

    ANITA_BOT_ID.value =
      Number(me.id);

    console.log(
      `🤖 Anita : @${me.username || me.first_name}`
    );

    console.log(
      `👑 Nicolas ID : ${BROTHER_USER_ID}`
    );

    await loadStickerPacks();

    await bot.launch();

    console.log(
      "======================================"
    );

    console.log(
      "✅ ANITA v3 EST EN LIGNE"
    );

    console.log(
      "🧠 Mémoire SQLite : OK"
    );

    console.log(
      "🃏 Stickers : OK"
    );

    console.log(
      "👥 Groupes intelligents : OK"
    );

    console.log(
      "👑 Nicolas reconnu : OK"
    );

    console.log(
      "======================================"
    );

  } catch (error) {

    console.error(
      "❌ Impossible de démarrer Anita :",
      error
    );

    process.exit(1);
  }
}

// ============================================================
// ARRÊT PROPRE
// ============================================================

process.once(
  "SIGINT",
  () => bot.stop("SIGINT")
);

process.once(
  "SIGTERM",
  () => bot.stop("SIGTERM")
);

start();
