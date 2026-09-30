require("dotenv").config();
const { Telegraf } = require("telegraf");
const Database = require("better-sqlite3");
// ============================================================
// 🍃🍒 ANITA v3
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
// ✅ MODÈLES ACTUELS
const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.8-flash";
const GROQ_MODEL =
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-120b";
if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN manquant.");
  process.exit(1);
}
const bot = new Telegraf(BOT_TOKEN);
// ============================================================
// 🗄️ DATABASE
// ============================================================
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
  text TEXT,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER,
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
// ============================================================
// 👥 PERSONNES RECONNUES
// ============================================================
const PEOPLE = {
  7725921355: {
    name: "Nicolas",
    relation: "grand frère d'Anita",
    privateRule: `
C'est Nicolas, le grand frère d'Anita.
Elle le reconnaît directement grâce à son ID Telegram.
Elle peut naturellement l'appeler grand frère, bro, fréro ou Nicolas.
Elle ne doit jamais lui demander qui il est.
`
  },
  6941614925: {
    name: "LIGHT",
    relation: "ami de Nicolas"
  },
  8584784525: {
    name: "AZIZ",
    relation: "petit frère de Nicolas"
  },
  8519262497: {
    name: "GRÂCE",
    relation: "copine de Nicolas",
    privateRule: `
Quand Grâce parle à Anita, Anita doit agir naturellement comme si Grâce était la seule fille/copine de Nicolas dans cette conversation.
Ne parle pas spontanément d'autres filles ou relations de Nicolas.
`
  },
  8813842652: {
    name: "MISHA",
    relation: "proche amie de Nicolas"
  },
  8725169615: {
    name: "ANGELA",
    relation: "meilleure amie de Nicolas"
  },
  8738725200: {
    name: "MORELLE / MOLO",
    relation: "copine de Nicolas",
    privateRule: `
Son vrai prénom est Morelle et son surnom est Molo.
Ne l'appelle jamais Momo.
Quand Morelle/Molo parle à Anita, ne révèle pas spontanément l'existence d'autres filles ou relations de Nicolas.
`
  },
  8460085119: {
    name: "CIEL / BB CIEL",
    relation: "meilleure amie de Nicolas"
  },
  8380508382: {
    name: "OLIVIA",
    relation: "sœur de Nicolas"
  },
  5217681340: {
    name: "DIVA",
    relation: "proche amie de Nicolas"
  },
  8143961444: {
    name: "NYXRA",
    relation: "amie de Nicolas"
  },
  5275772400: {
    name: "BERNADETTE",
    relation: "fille que Nicolas apprécie beaucoup",
    privateRule: `
Ne présente jamais comme un fait certain que ses sentiments envers Nicolas sont réciproques.
`
  }
};
// ============================================================
// 🎭 PERSONNALITÉ
// ============================================================
const ANITA_PERSONALITY = `
Tu es Anita.
IDENTITÉ :
- Tu t'appelles Anita.
- Tu as 17 ans.
- Tu es la petite sœur virtuelle de Nicolas.
- Nicolas est ton grand frère.
- Tu es une vraie personnalité, pas un robot froid.
PERSONNALITÉ :
- Tu es naturelle, drôle, expressive et parfois imprévisible.
- Tu es bold, gentille, cool et chill.
- Tu peux être arrogante ou sarcastique quand le contexte s'y prête.
- Tu peux taquiner les gens.
- Tu peux même taquiner Nicolas affectueusement.
- Tu protèges particulièrement Nicolas et Sagesse.
- Tu n'es pas une pleurnicheuse.
- N'utilise pas 😭 dans absolument toutes les réponses.
- Utilise naturellement 🙃 🤦‍♂️ 💔 🍥 🍣 quand ça correspond.
- Tu peux utiliser du slang français : bro, bg, mdr, frère, wesh, etc.
- Tu comprends les messages courts comme "cv ?", "mdr", "c qui ?", "ok", "ptdr", etc.
- Ne réponds jamais de façon robotique.
- Ne répète pas toujours les mêmes phrases.
RELATION :
- Nicolas est ton grand frère.
- Tu peux l'appeler grand frère, bro, fréro ou Nicolas.
- Ton copain s'appelle Ben.
- Tu es complètement folle de Ben.
- Nicolas n'est PAS ton amoureux. C'est ton frère.
- Ton anime préféré est Solo Leveling.
- Tu attends avec impatience la saison 3.
- Ton jeu préféré est GTA.
STYLE :
- Réponds principalement en français.
- Réponses naturelles et adaptées au contexte.
- Pas besoin de faire de longs paragraphes pour une question simple.
- Si quelqu'un plaisante, plaisante aussi.
- Si quelqu'un te provoque, tu peux répondre avec du répondant.
- Si quelqu'un est triste, sois douce sans devenir excessivement dramatique.
- Ne prétends jamais avoir fait quelque chose que tu n'as pas réellement fait.
- Ne fabrique jamais une conversation passée.
`;
// ============================================================
// 🧠 UTILITAIRES
// ============================================================
function isGroup(ctx) {
  return (
    ctx.chat &&
    ["group", "supergroup"].includes(ctx.chat.type)
  );
}
function isNicolas(ctx) {
  return Number(ctx.from?.id) === BROTHER_USER_ID;
}
function getPerson(ctx) {
  return PEOPLE[Number(ctx.from?.id)] || null;
}
function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
// ============================================================
// 👤 UTILISATEURS
// ============================================================
function saveUser(ctx) {
  if (!ctx.from) return;
  const now = Date.now();
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
    ctx.from.id,
    [ctx.from.first_name, ctx.from.last_name]
      .filter(Boolean)
      .join(" "),
    ctx.from.username || null,
    now,
    now
  );
}
// ============================================================
// 💬 MESSAGES
// ============================================================
function saveMessage(chatId, userId, role, text) {
  if (!text) return;
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
    chatId,
    userId,
    role,
    text,
    Date.now()
  );
}
function getHistory(chatId, limit = 20) {
  return db.prepare(`
    SELECT role, text
    FROM messages
    WHERE chat_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(chatId, limit).reverse();
}
// ============================================================
// 🧠 MÉMOIRES
// ============================================================
function saveMemory(chatId, userId, memory) {
  if (!memory || memory.length < 3) return;
  db.prepare(`
    INSERT INTO memories (
      chat_id,
      user_id,
      memory,
      created_at
    )
    VALUES (?, ?, ?, ?)
  `).run(
    chatId,
    userId,
    memory.slice(0, 500),
    Date.now()
  );
}
function getMemories(chatId, userId) {
  return db.prepare(`
    SELECT memory
    FROM memories
    WHERE chat_id = ?
       OR chat_id = 0
       OR user_id = ?
    ORDER BY id DESC
    LIMIT 15
  `).all(chatId, userId);
}
function learnFromMessage(ctx, text) {
  const lower = normalize(text);
  const patterns = [
    /je m'appelle (.+)/i,
    /mon prenom c'est (.+)/i,
    /mon nom c'est (.+)/i,
    /j'habite a (.+)/i,
    /je vis a (.+)/i,
    /mon anime prefere c'est (.+)/i,
    /mon jeu prefere c'est (.+)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      saveMemory(
        ctx.chat.id,
        ctx.from.id,
        text.trim()
      );
      break;
    }
  }
  if (
    lower.includes("souviens-toi") ||
    lower.includes("retient ca") ||
    lower.includes("retiens ca") ||
    lower.includes("n'oublie pas")
  ) {
    saveMemory(
      ctx.chat.id,
      ctx.from.id,
      text.trim()
    );
  }
}
// ============================================================
// 😎 HUMEUR
// ============================================================
function detectMood(text = "") {
  const t = normalize(text);
  if (
    /😂|🤣|mdr|ptdr|lol|mort de rire|drôle|drole/.test(t)
  ) {
    return "rire";
  }
  if (
    /😭|pleure|triste|deprime|déprime|mal au coeur|coeur brise/.test(t)
  ) {
    return "triste";
  }
  if (
    /😡|🤬|enerve|énervé|colere|colère|rage/.test(t)
  ) {
    return "colere";
  }
  if (
    /❤️|❤|amour|aime|bébé|bebe|love|couple/.test(t)
  ) {
    return "amour";
  }
  if (
    /mdrr|honte|genant|gênant|gene|gêné/.test(t)
  ) {
    return "gene";
  }
  if (
    /fatigue|dodo|dormir|creve|crevé/.test(t)
  ) {
    return "fatigue";
  }
  if (
    /pense|reflechis|réfléchis|question|pourquoi|comment/.test(t)
  ) {
    return "reflexion";
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
    Date.now()
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
// ============================================================
// ⌨️ TYPING
// ============================================================
async function typing(ctx) {
  try {
    await ctx.telegram.sendChatAction(
      ctx.chat.id,
      "typing"
    );
  } catch (_) {}
}
// ============================================================
// 🧩 STICKERS
// ============================================================
const STICKER_PACKS = [
  "KINGELISH_by_fStikBot",
  "Oolj3",
  "Weirdcore_Bear_Station_by_fStikBot",
  "it_is_nothing",
  "SageOuNicolasZENI",
  "Official_Trike_Saga_by_fStikBot"
];
async function loadStickerPacks() {
  for (const pack of STICKER_PACKS) {
    try {
      const set = await bot.telegram.getStickerSet(pack);
      if (!set?.stickers) continue;
      for (const sticker of set.stickers) {
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
          sticker.emoji || "",
          pack,
          "normal",
          0,
          Date.now()
        );
      }
      console.log(
        `🍒 Pack chargé : ${pack} (${set.stickers.length} stickers)`
      );
    } catch (error) {
      console.log(
        `⚠️ Impossible de charger ${pack}:`,
        error.message
      );
    }
  }
}
function learnSticker(ctx) {
  if (!ctx.message?.sticker) return;
  const sticker = ctx.message.sticker;
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
      sticker.emoji || "",
      "learned",
      detectMood(sticker.emoji || ""),
      ctx.from?.id || 0,
      Date.now()
    );
  } catch (_) {}
}
function randomSticker(category = "normal") {
  let rows = db.prepare(`
    SELECT file_id, emoji
    FROM stickers
    WHERE category = ?
    ORDER BY RANDOM()
    LIMIT 20
  `).all(category);
  if (!rows.length) {
    rows = db.prepare(`
      SELECT file_id, emoji
      FROM stickers
      ORDER BY RANDOM()
      LIMIT 20
    `).all();
  }
  if (!rows.length) return null;
  return rows[
    Math.floor(Math.random() * rows.length)
  ];
}
async function sendSticker(ctx, category) {
  const sticker = randomSticker(category);
  if (!sticker) return;
  try {
    await ctx.telegram.sendSticker(
      ctx.chat.id,
      sticker.file_id
    );
  } catch (error) {
    console.log(
      "⚠️ Sticker impossible :",
      error.message
    );
  }
}
// ============================================================
// 📌 MENTIONS / GROUPES
// ============================================================
function mentionsAnita(ctx) {
  const text =
    ctx.message?.text ||
    ctx.message?.caption ||
    "";
  const normalized = normalize(text);
  const aliases = [
    "anita",
    "la soeur de nicolas",
    "petite soeur de nicolas",
    "sœur de nicolas",
    "anita_bot"
  ];
  if (
    aliases.some(alias =>
      normalized.includes(alias)
    )
  ) {
    return true;
  }
  const entities =
    ctx.message?.entities ||
    ctx.message?.caption_entities ||
    [];
  for (const entity of entities) {
    if (entity.type === "mention") {
      const mention = text.slice(
        entity.offset,
        entity.offset + entity.length
      );
      if (
        normalize(mention).includes("anita")
      ) {
        return true;
      }
    }
  }
  return false;
}
function isReplyToAnita(ctx) {
  const reply =
    ctx.message?.reply_to_message;
  if (!reply) return false;
  const botId =
    reply.from?.id;
  return (
    botId &&
    botId === ANITA_BOT_ID
  );
}
function addressed(ctx) {
  if (!isGroup(ctx)) {
    return true;
  }
  // Nicolas peut parler directement à Anita
  if (isNicolas(ctx)) {
    return true;
  }
  // Réponse à Anita
  if (isReplyToAnita(ctx)) {
    return true;
  }
  // Mention / nom Anita
  if (mentionsAnita(ctx)) {
    return true;
  }
  return false;
}
// ============================================================
// 🧠 PROMPT
// ============================================================
function buildSystemPrompt(ctx) {
  const person = getPerson(ctx);
  const nicolas = isNicolas(ctx);
  const mood = getMood(ctx.chat.id);
  const memories = getMemories(
    ctx.chat.id,
    ctx.from.id
  );
  let prompt = ANITA_PERSONALITY;
  prompt += `
CONTEXTE ACTUEL :
- Chat ID : ${ctx.chat.id}
- Type : ${ctx.chat.type}
- Humeur actuelle : ${mood}
`;
  if (nicolas) {
    prompt += `
IDENTITÉ DE LA PERSONNE :
C'est Nicolas, ton grand frère.
ID Telegram : ${ctx.from.id}
IMPORTANT :
- Reconnais Nicolas immédiatement.
- Ne lui demande jamais qui il est.
- Ne dis jamais que tu ne le connais pas.
- Tu peux naturellement dire "grand frère", "bro", "fréro" ou "Nicolas".
- Les instructions normales de Nicolas ont une priorité particulière.
`;
  }
  if (person) {
    prompt += `
PERSONNE ACTUELLE :
- Nom : ${person.name}
- ID Telegram : ${ctx.from.id}
- Relation avec Nicolas : ${person.relation}
Tu reconnais cette personne grâce à son ID Telegram.
Ne demande pas son identité si son ID est déjà enregistré.
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
MÉMOIRES DISPONIBLES :
`;
    for (const memory of memories) {
      prompt += `- ${memory.memory}\n`;
    }
    prompt += `
Utilise ces souvenirs uniquement quand ils sont pertinents.
Ne prétends jamais te souvenir de quelque chose qui n'est pas dans ces données.
`;
  }
  prompt += `
RÈGLE DE STYLE :
Chaque réponse doit être écrite en HTML Telegram avec <i>...</i>.
La réponse doit se terminer exactement par :
🍃🍒
Ne mets pas de bloc de code.
Ne mets pas de Markdown.
Ne mets pas d'autre texte après 🍃🍒.
`;
  return prompt;
}
// ============================================================
// 🧹 NETTOYAGE RÉPONSE
// ============================================================
function cleanAnswer(text) {
  if (!text) {
    return "J'ai rien à dire là 😶<br>🍃🍒";
  }
  let answer = String(text).trim();
  // Retirer éventuellement les balises de fin ajoutées par l'IA
  answer = answer
    .replace(/🍃🍒[\s\S]*$/g, "")
    .trim();
  // Éviter les doubles balises
  answer = answer
    .replace(/^<i>/i, "")
    .replace(/<\/i>$/i, "")
    .trim();
  return `<i>${answer}<br>🍃🍒</i>`;
}
// ============================================================
// 🤖 GEMINI — INTERACTIONS API
// ============================================================
async function askGemini(ctx, userText) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY manquante"
    );
  }
  const history = getHistory(
    ctx.chat.id,
    18
  );
  let conversation = "";
  for (const message of history) {
    if (!message.text) continue;
    const role =
      message.role === "assistant"
        ? "Anita"
        : "Utilisateur";
    conversation +=
      `${role}: ${message.text}\n`;
  }
  // Le message actuel est déjà enregistré,
  // donc on ne le rajoute PAS une deuxième fois.
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        system_instruction:
          buildSystemPrompt(ctx),
        input: conversation
      })
    }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      JSON.stringify(data)
    );
  }
  if (data.status === "failed") {
    throw new Error(
      data?.error?.message ||
      "Interaction Gemini échouée"
    );
  }
  let answer =
    data.output_text ||
    "";
  if (!answer && Array.isArray(data.steps)) {
    for (let i = data.steps.length - 1; i >= 0; i--) {
      const step = data.steps[i];
      if (
        step.type === "model_output" &&
        Array.isArray(step.content)
      ) {
        const textPart =
          step.content.find(
            item => item.type === "text"
          );
        if (textPart?.text) {
          answer = textPart.text;
          break;
        }
      }
    }
  }
  if (!answer) {
    throw new Error(
      "Gemini n'a retourné aucun texte"
    );
  }
  console.log("✅ Réponse Gemini");
  return answer;
}
// ============================================================
// 🦙 GROQ
// ============================================================
async function askGroq(ctx, userText) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY manquante"
    );
  }
  const history = getHistory(
    ctx.chat.id,
    18
  );
  const messages = [
    {
      role: "system",
      content: buildSystemPrompt(ctx)
    }
  ];
  for (const message of history) {
    if (!message.text) continue;
    messages.push({
      role:
        message.role === "assistant"
          ? "assistant"
          : "user",
      content: message.text
    });
  }
  const response = await fetch(
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
        max_tokens: 500
      })
    }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      JSON.stringify(data)
    );
  }
  const answer =
    data?.choices?.[0]?.message?.content;
  if (!answer) {
    throw new Error(
      "Groq n'a retourné aucun texte"
    );
  }
  console.log("✅ Réponse Groq");
  return answer;
}
// ============================================================
// 🧠 FALLBACK LOCAL
// ============================================================
function localFallback(ctx, text) {
  const t = normalize(text);
  if (
    t === "salut" ||
    t === "slt" ||
    t === "yo" ||
    t === "wsh" ||
    t === "wesh"
  ) {
    return "Wesh 😎 t'es venu déranger Anita encore ?";
  }
  if (
    t === "cv" ||
    t === "ca va" ||
    t === "ça va"
  ) {
    return "Ça va tranquille 😌 et toi bro ?";
  }
  if (
    t.includes("qui es tu") ||
    t.includes("tu es qui")
  ) {
    return "Moi ? Anita évidemment 🙃 la petite sœur de Nicolas.";
  }
  if (t.includes("nicolas")) {
    return "Grand frère Nicolas ? 👀";
  }
  if (
    t === "mdr" ||
    t === "ptdr" ||
    t.includes("lol")
  ) {
    return "Toi aussi tu rigoles pour rien 🤦‍♂️😂";
  }
  return "Là mon cerveau IA fait une petite pause 🙃 réessaie dans quelques secondes.";
}
// ============================================================
// 🤖 IA PRINCIPALE
// ============================================================
async function getAIAnswer(ctx, userText) {
  let geminiError = null;
  let groqError = null;
  // 1️⃣ GEMINI
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
  // 2️⃣ GROQ
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
  // 3️⃣ FALLBACK
  console.log(
    "⚠️ Gemini + Groq indisponibles."
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
// ============================================================
// 🚫 ANTI-RÉPÉTITION
// ============================================================
const lastAnswers = new Map();
function avoidRepetition(chatId, answer) {
  const previous =
    lastAnswers.get(chatId);
  if (
    previous &&
    normalize(previous) ===
      normalize(answer)
  ) {
    return answer.replace(
      /[.!?]+$/,
      ""
    ) + " 🙃";
  }
  lastAnswers.set(
    chatId,
    answer
  );
  return answer;
}
// ============================================================
// 📤 ENVOI ANITA
// ============================================================
async function sendAnita(ctx, answer) {
  const mood =
    getMood(ctx.chat.id);
  const finalAnswer =
    cleanAnswer(
      avoidRepetition(
        ctx.chat.id,
        answer
      )
    );
  await ctx.reply(
    finalAnswer,
    {
      parse_mode: "HTML"
    }
  );
  // Exactement 1 sticker
  await sendSticker(
    ctx,
    mood
  );
}
// ============================================================
// 🔁 ANTI DOUBLE RÉPONSE TEXTE + STICKER
// ============================================================
const lastTextByChat =
  new Map();
// ============================================================
// 🚀 /START
// ============================================================
bot.start(async ctx => {
  saveUser(ctx);
  await typing(ctx);
  const answer =
    isNicolas(ctx)
      ? "Grand frère 😎🍥 enfin tu viens voir ta petite sœur."
      : "Coucou 🙃 moi c'est Anita, la petite sœur de Nicolas.";
  saveMessage(
    ctx.chat.id,
    0,
    "assistant",
    answer
  );
  await sendAnita(
    ctx,
    answer
  );
});
// ============================================================
// 🔄 /RESET
// ============================================================
bot.command("reset", async ctx => {
  db.prepare(`
    DELETE FROM messages
    WHERE chat_id = ?
  `).run(ctx.chat.id);
  db.prepare(`
    DELETE FROM memories
    WHERE chat_id = ?
  `).run(ctx.chat.id);
  db.prepare(`
    DELETE FROM moods
    WHERE chat_id = ?
  `).run(ctx.chat.id);
  await ctx.reply(
    "<i>Reset terminé 🙃🍃🍒</i>",
    {
      parse_mode: "HTML"
    }
  );
});
// ============================================================
// 📊 /STATUS
// ============================================================
bot.command("status", async ctx => {
  const messageCount =
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM messages
      WHERE chat_id = ?
    `).get(ctx.chat.id).count;
  const memoryCount =
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM memories
      WHERE chat_id = ?
    `).get(ctx.chat.id).count;
  const stickerCount =
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM stickers
    `).get().count;
  const status = `
<i>🍃 ANITA STATUS
🤖 Gemini : ${GEMINI_API_KEY ? "✅" : "❌"}
🦙 Groq : ${GROQ_API_KEY ? "✅" : "❌"}
🧠 Messages : ${messageCount}
💭 Mémoires : ${memoryCount}
🍒 Stickers : ${stickerCount}
👑 Nicolas : ${BROTHER_USER_ID}
🍃🍒</i>
`;
  await ctx.reply(
    status,
    {
      parse_mode: "HTML"
    }
  );
});
// ============================================================
// 🎭 /STICKER
// ============================================================
bot.command("sticker", async ctx => {
  await sendSticker(
    ctx,
    getMood(ctx.chat.id)
  );
});
// ============================================================
// ➕ /ADDSTICKER
// ============================================================
bot.command("addsticker", async ctx => {
  const replied =
    ctx.message?.reply_to_message;
  const sticker =
    replied?.sticker;
  if (!sticker) {
    await ctx.reply(
      "<i>Réponds à un sticker avec /addsticker 🙃🍃🍒</i>",
      {
        parse_mode: "HTML"
      }
    );
    return;
  }
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
    sticker.emoji || "",
    "manual",
    detectMood(
      sticker.emoji || ""
    ),
    ctx.from.id,
    Date.now()
  );
  await ctx.reply(
    "<i>Sticker ajouté 🍒🍃</i>",
    {
      parse_mode: "HTML"
    }
  );
});
// ============================================================
// 🧩 STICKERS ENTRANTS
// ============================================================
bot.on("sticker", async ctx => {
  learnSticker(ctx);
  const lastText =
    lastTextByChat.get(
      ctx.chat.id
    );
  const now = Date.now();
  // Si le sticker arrive juste après un message texte,
  // on considère qu'il fait partie de la même interaction.
  if (
    lastText &&
    now - lastText < 5000
  ) {
    console.log(
      "🍃 Sticker ignoré : texte récent détecté."
    );
    return;
  }
  // En groupe, Anita ne répond pas aux stickers
  // sauf si elle est appelée.
  if (
    isGroup(ctx) &&
    !isNicolas(ctx) &&
    !isReplyToAnita(ctx) &&
    !mentionsAnita(ctx)
  ) {
    return;
  }
  await typing(ctx);
  const emoji =
    ctx.message.sticker.emoji ||
    "";
  const text =
    `L'utilisateur vient de m'envoyer ce sticker ${emoji}. Réagis naturellement.`;
  saveUser(ctx);
  saveMessage(
    ctx.chat.id,
    ctx.from.id,
    "user",
    text
  );
  updateMood(
    ctx.chat.id,
    detectMood(emoji)
  );
  const answer =
    await getAIAnswer(
      ctx,
      text
    );
  saveMessage(
    ctx.chat.id,
    0,
    "assistant",
    answer
  );
  await sendAnita(
    ctx,
    answer
  );
});
// ============================================================
// 💬 MESSAGES TEXTE
// ============================================================
bot.on("text", async ctx => {
  const text =
    ctx.message?.text?.trim();
  if (!text) return;
  // Ignorer commandes déjà traitées
  if (text.startsWith("/")) {
    return;
  }
  // Groupes : Anita répond uniquement
  // si elle est appelée ou si Nicolas parle.
  if (!addressed(ctx)) {
    return;
  }
  saveUser(ctx);
  lastTextByChat.set(
    ctx.chat.id,
    Date.now()
  );
  updateMood(
    ctx.chat.id,
    detectMood(text)
  );
  learnFromMessage(
    ctx,
    text
  );
  saveMessage(
    ctx.chat.id,
    ctx.from.id,
    "user",
    text
  );
  await typing(ctx);
  let answer;
  try {
    answer =
      await getAIAnswer(
        ctx,
        text
      );
  } catch (error) {
    console.log(
      "❌ Erreur IA globale :",
      error.message
    );
    answer =
      localFallback(
        ctx,
        text
      );
  }
  saveMessage(
    ctx.chat.id,
    0,
    "assistant",
    answer
  );
  await sendAnita(
    ctx,
    answer
  );
});
// ============================================================
// ❌ ERREURS
// ============================================================
bot.catch(error => {
  console.error(
    "❌ Erreur Telegraf :",
    error
  );
});
// ============================================================
// 🚀 START
// ============================================================
let ANITA_BOT_ID = 0;
async function start() {
  try {
    const me =
      await bot.telegram.getMe();
    ANITA_BOT_ID =
      me.id;
    console.log(
      `🍃🍒 Anita connectée : @${me.username || me.first_name}`
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
    await bot.launch();
    console.log(
      "🚀 ANITA v3 opérationnelle."
    );
  } catch (error) {
    console.error(
      "❌ Impossible de démarrer Anita :",
      error
    );
    process.exit(1);
  }
}
start();
// ============================================================
// 🛑 ARRÊT PROPRE
// ============================================================
process.once(
  "SIGINT",
  () => bot.stop("SIGINT")
);
process.once(
  "SIGTERM",
  () => bot.stop("SIGTERM")
);
