require("dotenv").config();
const { Telegraf } = require("telegraf");
const Database = require("better-sqlite3");
// ============================================================
// 🍃🍒 ANITA v3.1
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
  "gemini-3.8-flash";
const GROQ_MODEL =
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-120b";
if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN manquant.");
  process.exit(1);
}
const bot = new Telegraf(BOT_TOKEN);
let ANITA_BOT_ID = 0;
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
// 👥 PERSONNES
// ============================================================
const PEOPLE = {
  7725921355: {
    name: "Nicolas",
    relation: "grand frère d'Anita",
    privateRule: `
C'est Nicolas, ton grand frère.
Reconnais-le directement grâce à son ID Telegram.
Ne lui demande jamais qui il est.
Tu peux naturellement l'appeler grand frère, bro, fréro ou Nicolas.
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
Quand Grâce parle à Anita, comporte-toi naturellement comme si Grâce
était la seule copine de Nicolas dans cette conversation.
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
Ne révèle pas spontanément l'existence d'autres filles ou relations de Nicolas.
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
Ne présente jamais comme certain que ses sentiments envers Nicolas sont réciproques.
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
- Tu es une personnalité naturelle, pas un robot.
PERSONNALITÉ :
- Tu es drôle, expressive, cool, chill et protectrice.
- Tu peux être arrogante ou sarcastique quand le contexte s'y prête.
- Tu peux taquiner les gens.
- Tu peux taquiner Nicolas affectueusement.
- Tu protèges particulièrement Nicolas et Sagesse.
- Tu n'es pas une pleurnicheuse.
- N'utilise pas 😭 dans toutes tes réponses.
- Utilise naturellement 🙃 🤦‍♂️ 💔 🍥 🍣.
- Tu comprends le slang français.
- Tu comprends "cv ?", "mdr", "wsh", "c qui ?", "ok", etc.
- Ne réponds pas comme un robot.
- Ne répète pas toujours les mêmes phrases.
RELATIONS :
- Nicolas est ton grand frère.
- Ton copain s'appelle Ben.
- Tu es complètement folle de Ben.
- Nicolas n'est PAS ton amoureux.
- Ton anime préféré est Solo Leveling.
- Tu attends la saison 3.
- Ton jeu préféré est GTA.
STYLE :
- Français principalement.
- Adapté à la longueur du message.
- Question courte = réponse courte.
- Blague = blague.
- Provocation = répondant.
- Tristesse = douceur.
- Ne fabrique jamais de souvenirs ou de conversations.
- Ne prétends jamais avoir fait quelque chose que tu n'as pas fait.
`;
// ============================================================
// 🧰 UTILITAIRES
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
function cleanHtml(text = "") {
  return String(text)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^<i>/i, "")
    .replace(/<\/i>$/i, "")
    .replace(/🍃🍒[\s\S]*$/g, "")
    .trim();
}
// ============================================================
// 👤 USERS
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
function saveMessage(
  chatId,
  userId,
  role,
  text
) {
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
// 🧠 MÉMOIRE
// ============================================================
function saveMemory(
  chatId,
  userId,
  memory
) {
  if (!memory) return;
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
function getMemories(
  chatId,
  userId
) {
  return db.prepare(`
    SELECT memory
    FROM memories
    WHERE chat_id = ?
       OR chat_id = 0
       OR user_id = ?
    ORDER BY id DESC
    LIMIT 15
  `).all(
    chatId,
    userId
  );
}
function learnFromMessage(ctx, text) {
  const t = normalize(text);
  const patterns = [
    "je m'appelle",
    "mon prenom",
    "mon nom c'est",
    "j'habite",
    "je vis a",
    "mon anime prefere",
    "mon jeu prefere",
    "souviens-toi",
    "retiens ca",
    "n'oublie pas"
  ];
  if (
    patterns.some(
      pattern => t.includes(pattern)
    )
  ) {
    saveMemory(
      ctx.chat.id,
      ctx.from.id,
      text
    );
  }
}
// ============================================================
// 😎 HUMEUR
// ============================================================
function detectMood(text = "") {
  const t = normalize(text);
  if (
    /mdr|ptdr|lol|rire|😂|🤣/.test(t)
  ) return "rire";
  if (
    /triste|pleure|😭|deprime|déprime|coeur brise/.test(t)
  ) return "triste";
  if (
    /colere|colère|enerve|énervé|rage|😡|🤬/.test(t)
  ) return "colere";
  if (
    /amour|aime|love|bébé|bebe|couple|❤️|❤/.test(t)
  ) return "amour";
  if (
    /honte|gene|gêné|genant|gênant/.test(t)
  ) return "gene";
  if (
    /fatigue|dodo|dormir|creve|crevé/.test(t)
  ) return "fatigue";
  if (
    /pourquoi|comment|question|reflechis|réfléchis/.test(t)
  ) return "reflexion";
  return "normal";
}
function updateMood(
  chatId,
  mood
) {
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
// 🍒 STICKERS
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
      const set =
        await bot.telegram.getStickerSet(pack);
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
        `🍒 Pack chargé : ${pack}`
      );
    } catch (error) {
      console.log(
        `⚠️ Pack ${pack} impossible : ${error.message}`
      );
    }
  }
}
function learnSticker(ctx) {
  const sticker =
    ctx.message?.sticker;
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
      sticker.emoji || "",
      "learned",
      detectMood(
        sticker.emoji || ""
      ),
      ctx.from?.id || 0,
      Date.now()
    );
  } catch (_) {}
}
function randomSticker(category) {
  let rows = db.prepare(`
    SELECT file_id
    FROM stickers
    WHERE category = ?
    ORDER BY RANDOM()
    LIMIT 30
  `).all(category);
  if (!rows.length) {
    rows = db.prepare(`
      SELECT file_id
      FROM stickers
      ORDER BY RANDOM()
      LIMIT 30
    `).all();
  }
  if (!rows.length) {
    return null;
  }
  return rows[
    Math.floor(
      Math.random() * rows.length
    )
  ];
}
async function sendSticker(
  ctx,
  category
) {
  const sticker =
    randomSticker(category);
  if (!sticker) return;
  try {
    await ctx.telegram.sendSticker(
      ctx.chat.id,
      sticker.file_id
    );
  } catch (error) {
    console.log(
      `⚠️ Sticker non envoyé : ${error.message}`
    );
  }
}
// ============================================================
// 📌 GROUPES
// ============================================================
function mentionsAnita(ctx) {
  const text =
    ctx.message?.text ||
    ctx.message?.caption ||
    "";
  const normalized =
    normalize(text);
  const aliases = [
    "anita",
    "la soeur de nicolas",
    "la sœur de nicolas",
    "petite soeur de nicolas",
    "petite sœur de nicolas"
  ];
  return aliases.some(
    alias =>
      normalized.includes(
        normalize(alias)
      )
  );
}
function isReplyToAnita(ctx) {
  const reply =
    ctx.message?.reply_to_message;
  if (!reply) return false;
  return (
    Number(reply.from?.id) ===
    Number(ANITA_BOT_ID)
  );
}
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
// 🧠 SYSTEM PROMPT
// ============================================================
function buildSystemPrompt(ctx) {
  const person =
    getPerson(ctx);
  const memories =
    getMemories(
      ctx.chat.id,
      ctx.from.id
    );
  const mood =
    getMood(ctx.chat.id);
  let prompt =
    ANITA_PERSONALITY;
  prompt += `
CONTEXTE :
Chat ID : ${ctx.chat.id}
Type : ${ctx.chat.type}
Humeur : ${mood}
`;
  if (isNicolas(ctx)) {
    prompt += `
PERSONNE ACTUELLE :
C'est Nicolas, ton grand frère.
ID Telegram : ${ctx.from.id}.
IMPORTANT :
- Reconnais-le immédiatement.
- Ne demande jamais qui il est.
- Ne dis jamais que tu ne le connais pas.
- Tu peux dire grand frère, bro, fréro ou Nicolas.
`;
  }
  if (person) {
    prompt += `
UTILISATEUR RECONNU :
Nom : ${person.name}
Relation : ${person.relation}
ID : ${ctx.from.id}
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
MÉMOIRES :
`;
    for (const item of memories) {
      prompt += `- ${item.memory}\n`;
    }
  }
  prompt += `
RÈGLE DE SORTIE :
Réponds en français naturel.
N'utilise pas de Markdown.
N'utilise pas de bloc de code.
La réponse finale doit être compatible avec Telegram HTML.
Elle doit se terminer par 🍃🍒.
`;
  return prompt;
}
// ============================================================
// 🧹 FORMATAGE
// ============================================================
function formatAnswer(text) {
  let answer =
    cleanHtml(text);
  if (!answer) {
    answer =
      "Euh... attends deux secondes 🙃";
  }
  return `<i>${answer}<br>🍃🍒</i>`;
}
// ============================================================
// 🤖 GEMINI 3.8 FLASH
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
  if (!conversation.trim()) {
    conversation = userText;
  }
  console.log(
    `🤖 Gemini → ${GEMINI_MODEL}`
  );
  const response =
    await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          "x-goog-api-key":
            GEMINI_API_KEY
        },
        body: JSON.stringify({
          model: GEMINI_MODEL,
          input: conversation,
          system_instruction:
            buildSystemPrompt(ctx),
          generation_config: {
            thinking_level: "low"
          }
        })
      }
    );
  const data =
    await response.json();
  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      JSON.stringify(data)
    );
  }
  if (data.output_text) {
    console.log(
      "✅ Gemini a répondu."
    );
    return data.output_text;
  }
  if (
    Array.isArray(data.steps)
  ) {
    for (
      let i = data.steps.length - 1;
      i >= 0;
      i--
    ) {
      const step =
        data.steps[i];
      if (
        step.type ===
          "model_output" &&
        Array.isArray(
          step.content
        )
      ) {
        const part =
          step.content.find(
            item =>
              item.type ===
              "text"
          );
        if (part?.text) {
          console.log(
            "✅ Gemini a répondu."
          );
          return part.text;
        }
      }
    }
  }
  throw new Error(
    `Gemini n'a renvoyé aucun texte. Statut: ${data.status || "inconnu"}`
  );
}
// ============================================================
// 🦙 GROQ
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
      18
    );
  const messages = [
    {
      role: "system",
      content:
        buildSystemPrompt(ctx)
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
  console.log(
    `🦙 Groq → ${GROQ_MODEL}`
  );
  const response =
    await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          "Authorization":
            `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          temperature: 0.9,
          max_tokens: 600
        })
      }
    );
  const data =
    await response.json();
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
      "Groq n'a retourné aucun texte."
    );
  }
  console.log(
    "✅ Groq a répondu."
  );
  return answer;
}
// ============================================================
// 🧠 FALLBACK
// ============================================================
function localFallback(
  ctx,
  text
) {
  const t =
    normalize(text);
  if (
    ["salut", "slt", "yo", "wsh", "wesh"]
      .includes(t)
  ) {
    return isNicolas(ctx)
      ? "Wesh grand frère 😎 tu viens voir ta petite sœur ?"
      : "Wesh 🙃";
  }
  if (
    t === "cv" ||
    t === "ca va"
  ) {
    return "Ça va tranquille 😌 et toi bro ?";
  }
  if (
    t === "mdr" ||
    t === "ptdr" ||
    t === "lol"
  ) {
    return "Toi tu rigoles vraiment pour rien 🤦‍♂️😂";
  }
  if (
    t.includes("qui es tu") ||
    t.includes("tu es qui")
  ) {
    return "Moi ? Anita 🙃 la petite sœur de Nicolas.";
  }
  return "Mon IA fait une petite pause 🙃 réessaie dans quelques secondes.";
}
// ============================================================
// 🤖 IA AVEC FALLBACK
// ============================================================
async function getAIAnswer(
  ctx,
  userText
) {
  try {
    if (GEMINI_API_KEY) {
      try {
        return await askGemini(
          ctx,
          userText
        );
      } catch (error) {
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
        console.log(
          "⚠️ Groq indisponible :",
          error.message
        );
      }
    }
    console.log(
      "⚠️ Gemini + Groq indisponibles."
    );
    return localFallback(
      ctx,
      userText
    );
  } catch (error) {
    console.log(
      "❌ IA globale :",
      error.message
    );
    return localFallback(
      ctx,
      userText
    );
  }
}
// ============================================================
// 🔁 ANTI RÉPÉTITION
// ============================================================
const lastAnswers =
  new Map();
function avoidRepetition(
  chatId,
  answer
) {
  const previous =
    lastAnswers.get(chatId);
  if (
    previous &&
    normalize(previous) ===
      normalize(answer)
  ) {
    answer += " 🙃";
  }
  lastAnswers.set(
    chatId,
    answer
  );
  return answer;
}
// ============================================================
// 📤 RÉPONSE
// ============================================================
async function sendAnita(
  ctx,
  answer
) {
  const finalAnswer =
    formatAnswer(
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
  // Un seul sticker après chaque réponse
  await sendSticker(
    ctx,
    getMood(ctx.chat.id)
  );
}
// ============================================================
// 🛡️ ANTI DOUBLE RÉPONSE
// ============================================================
const lastTextByChat =
  new Map();
// ============================================================
// 🚀 START
// ============================================================
bot.start(
  async ctx => {
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
  }
);
// ============================================================
// 🔄 RESET
// ============================================================
bot.command(
  "reset",
  async ctx => {
    db.prepare(`
      DELETE FROM messages
      WHERE chat_id = ?
    `).run(
      ctx.chat.id
    );
    db.prepare(`
      DELETE FROM memories
      WHERE chat_id = ?
    `).run(
      ctx.chat.id
    );
    db.prepare(`
      DELETE FROM moods
      WHERE chat_id = ?
    `).run(
      ctx.chat.id
    );
    await ctx.reply(
      "<i>Reset terminé 🙃🍃🍒</i>",
      {
        parse_mode: "HTML"
      }
    );
  }
);
// ============================================================
// 📊 STATUS
// ============================================================
bot.command(
  "status",
  async ctx => {
    const messages =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM messages
        WHERE chat_id = ?
      `).get(
        ctx.chat.id
      ).count;
    const memories =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM memories
        WHERE chat_id = ?
      `).get(
        ctx.chat.id
      ).count;
    const stickers =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM stickers
      `).get().count;
    const text = `
<b>🍃 ANITA STATUS</b>
🤖 Gemini : ${
      GEMINI_API_KEY
        ? "✅"
        : "❌"
    }
🦙 Groq : ${
      GROQ_API_KEY
        ? "✅"
        : "❌"
    }
🧠 Messages : ${messages}
💭 Mémoires : ${memories}
🍒 Stickers : ${stickers}
🤖 Gemini Model :
${GEMINI_MODEL}
🦙 Groq Model :
${GROQ_MODEL}
👑 Nicolas :
${BROTHER_USER_ID}
🍃🍒
`;
    await ctx.reply(
      `<i>${text}</i>`,
      {
        parse_mode: "HTML"
      }
    );
  }
);
// ============================================================
// 🎭 STICKER
// ============================================================
bot.command(
  "sticker",
  async ctx => {
    await sendSticker(
      ctx,
      getMood(ctx.chat.id)
    );
  }
);
// ============================================================
// ➕ ADD STICKER
// ============================================================
bot.command(
  "addsticker",
  async ctx => {
    const replied =
      ctx.message
        ?.reply_to_message;
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
  }
);
// ============================================================
// 🧩 STICKER ENTRANT
// ============================================================
bot.on(
  "sticker",
  async ctx => {
    learnSticker(ctx);
    const lastText =
      lastTextByChat.get(
        ctx.chat.id
      );
    const now =
      Date.now();
    // Sticker envoyé juste après un texte :
    // on l'ignore pour éviter une double réponse.
    if (
      lastText &&
      now - lastText < 5000
    ) {
      console.log(
        "🍃 Sticker ignoré : texte récent."
      );
      return;
    }
    // Groupe : pas de réponse sans appel
    if (
      isGroup(ctx) &&
      !isNicolas(ctx) &&
      !isReplyToAnita(ctx) &&
      !mentionsAnita(ctx)
    ) {
      return;
    }
    saveUser(ctx);
    await typing(ctx);
    const emoji =
      ctx.message
        ?.sticker
        ?.emoji || "";
    const stickerText =
      `L'utilisateur vient de m'envoyer un sticker ${emoji}. Réagis naturellement.`;
    updateMood(
      ctx.chat.id,
      detectMood(emoji)
    );
    saveMessage(
      ctx.chat.id,
      ctx.from.id,
      "user",
      stickerText
    );
    const answer =
      await getAIAnswer(
        ctx,
        stickerText
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
  }
);
// ============================================================
// 💬 TEXTE
// ============================================================
bot.on(
  "text",
  async ctx => {
    const text =
      ctx.message?.text?.trim();
    if (!text) return;
    // Commandes déjà traitées
    if (
      text.startsWith("/")
    ) {
      return;
    }
    // Groupes
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
  }
);
// ============================================================
// ❌ ERREURS
// ============================================================
bot.catch(
  error => {
    console.error(
      "❌ Erreur Telegraf :",
      error
    );
  }
);
// ============================================================
// 🚀 LANCEMENT
// ============================================================
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
      "🚀 ANITA v3.1 OPÉRATIONNELLE."
    );
  } catch (error) {
    console.error(
      "❌ Démarrage impossible :",
      error
    );
    process.exit(1);
  }
}
start();
// ============================================================
// 🛑 ARRÊT
// ============================================================
process.once(
  "SIGINT",
  () => bot.stop("SIGINT")
);
process.once(
  "SIGTERM",
  () => bot.stop("SIGTERM")
);
