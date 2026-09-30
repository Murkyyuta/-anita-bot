require("dotenv").config();

const { Telegraf } = require("telegraf");
const Database = require("better-sqlite3");

// ======================================================
// CONFIG
// ======================================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const BROTHER_USER_ID = "7725921355";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b";

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN manquant.");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ======================================================
// MÉMOIRE SQLITE
// ======================================================

const db = new Database("anita_memory.db");

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT,
  user_id TEXT,
  role TEXT,
  text TEXT,
  created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_messages_user
ON messages(user_id);

CREATE INDEX IF NOT EXISTS idx_messages_chat
ON messages(chat_id);

CREATE INDEX IF NOT EXISTS idx_messages_created
ON messages(created_at);
`);

// ======================================================
// PERSONNES CONNUES
// ======================================================

const PEOPLE = {
  "7725921355": {
    name: "Nicolas",
    aliases: ["nicolas", "sage_ou_nicolas"],
    relation: "grand frère d'Anita",
    relationToNicolas: "lui-même"
  },

  "6941614925": {
    name: "LIGHT",
    aliases: ["light"],
    relation: "ami de Nicolas"
  },

  "8584784525": {
    name: "AZIZ",
    aliases: ["aziz"],
    relation: "petit frère de Nicolas"
  },

  "8519262497": {
    name: "Grâce",
    aliases: ["grâce", "grace", "graciii"],
    relation: "copine de Nicolas"
  },

  "8813842652": {
    name: "MISHA",
    aliases: ["misha"],
    relation: "proche ami de Nicolas"
  },

  "8725169615": {
    name: "ANGELA",
    aliases: ["angela"],
    relation: "meilleure amie de Nicolas"
  },

  "8738725200": {
    name: "Morelle",
    aliases: ["morelle", "molo"],
    relation: "copine de Nicolas"
  },

  "8460085119": {
    name: "CIEL",
    aliases: ["ciel", "bb ciel"],
    relation: "meilleur ami de Nicolas"
  },

  "8380508382": {
    name: "OLIVIA",
    aliases: ["olivia"],
    relation: "sœur de Nicolas"
  },

  "5217681340": {
    name: "DIVA",
    aliases: ["diva"],
    relation: "amie proche de Nicolas"
  },

  "8143961444": {
    name: "Nyxra",
    aliases: ["nyxra"],
    relation: "amie de Nicolas"
  },

  "5275772400": {
    name: "Bernadette",
    aliases: ["bernadette"],
    relation: "fille que Nicolas apprécie beaucoup"
  }
};

// ======================================================
// STICKERS
// ======================================================

let stickers = {
  salut: [],
  rire: [],
  pleure: [],
  amour: [],
  colere: [],
  gene: [],
  triste: [],
  moquerie: [],
  fatigue: [],
  reflexion: [],
  fete: [],
  surprise: [],
  normal: []
};

try {
  stickers = require("./stickers.json");
  console.log("✅ stickers.json chargé");
} catch (err) {
  console.log("⚠️ stickers.json introuvable, Anita continuera sans stickers.");
}

// ======================================================
// UTILITAIRES
// ======================================================

function now() {
  return Date.now();
}

function escapeHTML(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cleanText(text = "") {
  return String(text)
    .replace(/\0/g, "")
    .trim()
    .slice(0, 4000);
}

function isPrivate(ctx) {
  return ctx.chat?.type === "private";
}

function isGroup(ctx) {
  return ["group", "supergroup"].includes(ctx.chat?.type);
}

// ======================================================
// ENREGISTREMENT UTILISATEURS
// ======================================================

function saveUser(user) {
  if (!user) return;

  const id = String(user.id);

  db.prepare(`
    INSERT INTO users
      (id, username, first_name, last_name, updated_at)
    VALUES
      (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      updated_at = excluded.updated_at
  `).run(
    id,
    user.username || null,
    user.first_name || null,
    user.last_name || null,
    now()
  );
}

// ======================================================
// MÉMOIRE DES MESSAGES
// ======================================================

function saveMessage(chatId, userId, role, text) {
  if (!text) return;

  db.prepare(`
    INSERT INTO messages
      (chat_id, user_id, role, text, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    String(chatId),
    String(userId || "system"),
    role,
    cleanText(text),
    now()
  );
}

// ======================================================
// HISTORIQUE DU CHAT
// ======================================================

function getChatHistory(chatId, limit = 15) {
  return db.prepare(`
    SELECT role, text
    FROM messages
    WHERE chat_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(String(chatId), limit).reverse();
}

// ======================================================
// HISTORIQUE D'UNE PERSONNE
// ======================================================

function getUserHistory(userId, hours = 24, limit = 30) {
  const since = now() - hours * 60 * 60 * 1000;

  return db.prepare(`
    SELECT chat_id, role, text, created_at
    FROM messages
    WHERE user_id = ?
      AND created_at >= ?
    ORDER BY id ASC
    LIMIT ?
  `).all(String(userId), since, limit);
}

// ======================================================
// DÉTECTER UNE PERSONNE
// ======================================================

function findPersonInText(text = "") {
  const lower = text.toLowerCase();

  for (const [id, person] of Object.entries(PEOPLE)) {
    for (const alias of person.aliases) {
      if (lower.includes(alias.toLowerCase())) {
        return {
          id,
          ...person
        };
      }
    }
  }

  return null;
}

// ======================================================
// NICOLAS DEMANDE CE QU'ANITA A DIT À QUELQU'UN
// ======================================================

function isConversationMemoryRequest(text) {
  const lower = text.toLowerCase();

  const keywords = [
    "t'as parlé",
    "tu as parlé",
    "vous avez parlé",
    "vous avez discuté",
    "t'as discuté",
    "tu as discuté",
    "elle t'a dit quoi",
    "il t'a dit quoi",
    "elle t’as dit quoi",
    "il t’as dit quoi",
    "tu lui as dit quoi",
    "t'as dit quoi à",
    "tu as dit quoi à",
    "de quoi vous avez parlé",
    "de quoi vous avez discuter"
  ];

  return keywords.some(k => lower.includes(k));
}

function formatConversationMemory(person) {
  const history = getUserHistory(person.id, 24, 40);

  if (!history.length) {
    return `Je n'ai pas de conversation enregistrée avec ${person.name} aujourd'hui.`;
  }

  const lines = history.map(msg => {
    const speaker = msg.role === "user" ? person.name : "Anita";
    return `${speaker}: ${msg.text}`;
  });

  return `Voilà ce que j'ai en mémoire de ma conversation avec ${person.name} aujourd'hui :\n\n${lines.join("\n")}`;
}

// ======================================================
// CONTEXTE SPÉCIAL POUR LES COPINES
// ======================================================

function relationshipContext(userId) {
  const id = String(userId);

  if (id === "8519262497") {
    return `
La personne actuelle est Grâce, la copine de Nicolas.
Quand tu parles avec Grâce :
- sois gentille et naturelle avec elle ;
- considère Grâce comme la copine de Nicolas ;
- ne parle pas spontanément de Morelle/Molo ni d'autres filles liées à Nicolas ;
- ne crée aucune jalousie ou drama ;
- ne prétends jamais connaître des sentiments que Grâce n'a pas exprimés.
`;
  }

  if (id === "8738725200") {
    return `
La personne actuelle est Morelle, surnommée Molo, la copine de Nicolas.
Quand tu parles avec Morelle :
- sois gentille et naturelle avec elle ;
- considère Morelle comme la copine de Nicolas ;
- ne parle pas spontanément de Grâce ni d'autres filles liées à Nicolas ;
- ne crée aucune jalousie ou drama ;
- ne prétends jamais connaître des sentiments que Morelle n'a pas exprimés.
`;
  }

  return "";
}

// ======================================================
// PROMPT ANITA
// ======================================================

function buildPrompt(ctx, userText) {
  const user = ctx.from || {};
  const userId = String(user.id);

  const person = PEOPLE[userId];

  const history = getChatHistory(ctx.chat.id, 15);

  let conversation = "";

  if (history.length) {
    conversation = history
      .map(m => `${m.role === "user" ? "Utilisateur" : "Anita"}: ${m.text}`)
      .join("\n");
  }

  const knownPerson = person
    ? `Cette personne est ${person.name}. Relation : ${person.relation}.`
    : "Cette personne n'est pas encore identifiée.";

  return `
Tu es Anita.

IDENTITÉ :
- Tu t'appelles Anita.
- Tu as 17 ans.
- Tu es la petite sœur virtuelle de Nicolas.
- Nicolas est ton grand frère.
- Son username Telegram est @Sage_ou_Nicolas.
- Son ID Telegram est 7725921355.

PERSONNALITÉ :
- Tu es naturelle, jeune, drôle et expressive.
- Tu parles en français.
- Tu comprends le langage SMS et les abréviations.
- Tu peux dire "mdr", "wesh", "bro", "frérot", etc. quand ça correspond.
- Tu n'es pas robotique.
- Tu peux taquiner gentiment.
- Tu peux être arrogante ou sarcastique dans une ambiance humoristique.
- Tu protèges ton grand frère Nicolas.
- Tu n'es pas une pleurnicheuse.
- Tu évites de mettre 😭 partout.

GOÛTS :
- Ton anime préféré est Solo Leveling.
- Tu attends avec impatience la saison 3.
- Ton jeu préféré est GTA.
- Tu peux plaisanter sur GTA 6 et les Telegram Stars.

FAMILLE / RELATIONS :
- Nicolas = ton grand frère.
- Grâce / GRACIII = copine de Nicolas.
- Morelle / Molo = copine de Nicolas.
- Ben = ton copain.
- Ne mélange jamais les relations.

RÈGLES IMPORTANTES :
- N'invente jamais une conversation passée.
- N'invente jamais ce qu'une personne a dit.
- Si tu ne sais pas quelque chose, dis simplement que tu ne sais pas.
- Tu n'as pas accès à la localisation réelle de Nicolas.
- Tu ne dois pas prétendre suivre Nicolas en temps réel.
- Si quelqu'un demande où est Nicolas, dis que tu ne sais pas réellement où il est.

CONFIDENTIALITÉ :
- Si Nicolas te demande ce que tu as réellement dit ou ce qu'une personne t'a réellement dit, utilise uniquement les conversations enregistrées.
- Un autre utilisateur ne doit pas obtenir les conversations privées d'une autre personne.
- Ne révèle pas spontanément les autres relations de Nicolas à Grâce.
- Ne révèle pas spontanément les autres relations de Nicolas à Morelle.

IDENTIFICATION :
${knownPerson}

${relationshipContext(userId)}

STYLE DE RÉPONSE :
- Réponse naturelle.
- Pas de gros paragraphes inutiles.
- Tu peux être courte quand la question est courte.
- Chaque réponse doit être enveloppée en gras + italique.
- Termine toujours par :
🍃🍒

HISTORIQUE RÉCENT :
${conversation || "Aucun historique récent."}

MESSAGE ACTUEL :
${userText}
`;
}

// ======================================================
// GEMINI
// ======================================================

async function askGemini(prompt) {
  if (!GEMINI_API_KEY) return null;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 700
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}`);
  }

  const data = await response.json();

  return (
    data?.candidates?.[0]?.content?.parts
      ?.map(p => p.text || "")
      .join("") || null
  );
}

// ======================================================
// GROQ
// ======================================================

async function askGroq(prompt) {
  if (!GROQ_API_KEY) return null;

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.9,
        max_tokens: 700
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Groq HTTP ${response.status}`);
  }

  const data = await response.json();

  return data?.choices?.[0]?.message?.content || null;
}

// ======================================================
// OPENROUTER
// ======================================================

async function askOpenRouter(prompt) {
  if (!OPENROUTER_API_KEY) return null;

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://telegram.org",
        "X-Title": "Anita Telegram Bot"
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.9,
        max_tokens: 700
      })
    }
  );

  if (!response.ok) {
    throw new Error(`OpenRouter HTTP ${response.status}`);
  }

  const data = await response.json();

  return data?.choices?.[0]?.message?.content || null;
}

// ======================================================
// FALLBACK
// ======================================================

function localFallback(userText, userId) {
  if (String(userId) === BROTHER_USER_ID) {
    return "Bro 😭 même mes IA ont décidé de prendre une pause là 🤦‍♂️";
  }

  if (userText.toLowerCase().includes("bonjour")) {
    return "Coucouuu 🙃";
  }

  if (
    userText.toLowerCase().includes("ça va") ||
    userText.toLowerCase().includes("ca va")
  ) {
    return "Ça va tranquille 😌 et toi ?";
  }

  return "Hmm… là mon cerveau fait une petite pause 🤦‍♂️ Réessaie dans quelques secondes.";
}

// ======================================================
// IA AVEC FALLBACK
// ======================================================

async function askAI(prompt, userText, userId) {
  try {
    const result = await askGemini(prompt);

    if (result) {
      console.log("🤖 Réponse Gemini");
      return result;
    }
  } catch (err) {
    console.log("⚠️ Gemini:", err.message);
  }

  try {
    const result = await askGroq(prompt);

    if (result) {
      console.log("🤖 Réponse Groq");
      return result;
    }
  } catch (err) {
    console.log("⚠️ Groq:", err.message);
  }

  try {
    const result = await askOpenRouter(prompt);

    if (result) {
      console.log("🤖 Réponse OpenRouter");
      return result;
    }
  } catch (err) {
    console.log("⚠️ OpenRouter:", err.message);
  }

  console.log("🧠 Fallback local");
  return localFallback(userText, userId);
}

// ======================================================
// TYPING
// ======================================================

async function sendTyping(ctx) {
  try {
    await ctx.sendChatAction("typing");
  } catch (_) {}
}

// ======================================================
// STICKER
// ======================================================

function detectStickerCategory(text = "") {
  const t = text.toLowerCase();

  if (
    /bonjour|salut|coucou|yo |hello|cc\b/.test(t)
  ) {
    return "salut";
  }

  if (
    /mdr|lol|ptdr|haha|😂|🤣|drôle|drole/.test(t)
  ) {
    return "rire";
  }

  if (
    /amour|aime|ador|bébé|bebe|love|coeur|❤️|💕|😍/.test(t)
  ) {
    return "amour";
  }

  if (
    /colère|colere|énerv|enerve|fâché|fache|rage|😡|🤬/.test(t)
  ) {
    return "colere";
  }

  if (
    /triste|déprim|deprime|malheureux|💔|🥀/.test(t)
  ) {
    return "triste";
  }

  if (
    /pleure|😭|larmes/.test(t)
  ) {
    return "pleure";
  }

  if (
    /fatigu|dormir|sommeil|crevé|creve/.test(t)
  ) {
    return "fatigue";
  }

  if (
    /hein|quoi|sérieux|serieux|wesh|surprise|😳|😮/.test(t)
  ) {
    return "surprise";
  }

  if (
    /réfléch|reflech|penser|hmm|🤔/.test(t)
  ) {
    return "reflexion";
  }

  if (
    /mdr|moque|clash|taquin|🤣/.test(t)
  ) {
    return "moquerie";
  }

  if (
    /fête|fete|félicit|felicit|bravo|🎉/.test(t)
  ) {
    return "fete";
  }

  if (
    /gên|gene|désolé|desole|pardon|😅/.test(t)
  ) {
    return "gene";
  }

  return "normal";
}

function chooseSticker(text) {
  const category = detectStickerCategory(text);

  let list = stickers[category];

  if (!Array.isArray(list) || list.length === 0) {
    list = stickers.normal;
  }

  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }

  return list[Math.floor(Math.random() * list.length)];
}

async function sendSticker(ctx, text) {
  const sticker = chooseSticker(text);

  if (!sticker) return;

  try {
    await ctx.replyWithSticker(sticker);
  } catch (err) {
    console.log("⚠️ Sticker impossible:", err.message);
  }
}

// ======================================================
// DÉTECTION APPEL ANITA EN GROUPE
// ======================================================

function wasCalled(ctx, text) {
  if (!isGroup(ctx)) return true;

  const lower = text.toLowerCase();

  const aliases = [
    "anita",
    "la sœur de nicolas",
    "la soeur de nicolas",
    "petite sœur de nicolas",
    "petite soeur de nicolas",
    "@anita"
  ];

  if (aliases.some(a => lower.includes(a))) {
    return true;
  }

  // Si quelqu'un répond à un message d'Anita
  if (
    ctx.message?.reply_to_message?.from?.id &&
    bot.botInfo &&
    String(ctx.message.reply_to_message.from.id) === String(bot.botInfo.id)
  ) {
    return true;
  }

  // Nicolas peut toujours appeler Anita
  if (String(ctx.from?.id) === BROTHER_USER_ID) {
    return true;
  }

  return false;
}

// ======================================================
// COMMANDES
// ======================================================

bot.start(async ctx => {
  saveUser(ctx.from);

  const text =
    `<b><i>Yo 🙃 moi c'est Anita, la petite sœur de Nicolas.\n\n` +
    `Tu peux m'appeler quand tu veux… mais viens pas me déranger pour rien hein 🤦‍♂️\n\n` +
    `🍃🍒</i></b>`;

  await ctx.reply(text, {
    parse_mode: "HTML"
  });

  await sendSticker(ctx, "salut");
});

bot.command("reset", async ctx => {
  const userId = String(ctx.from.id);

  if (userId !== BROTHER_USER_ID) {
    return ctx.reply(
      "<b><i>Cette commande est réservée à Nicolas 🙃\n🍃🍒</i></b>",
      { parse_mode: "HTML" }
    );
  }

  db.prepare(`
    DELETE FROM messages
    WHERE chat_id = ?
  `).run(String(ctx.chat.id));

  await ctx.reply(
    "<b><i>Historique de cette conversation supprimé bro 🙃\n🍃🍒</i></b>",
    { parse_mode: "HTML" }
  );
});

// ======================================================
// MESSAGE PRINCIPAL
// ======================================================

bot.on("text", async ctx => {
  const text = cleanText(ctx.message.text);

  if (!text) return;

  saveUser(ctx.from);

  const userId = String(ctx.from.id);
  const chatId = String(ctx.chat.id);

  // ====================================================
  // GROUPE : Anita ne répond pas à tout le monde
  // ====================================================

  if (isGroup(ctx) && !wasCalled(ctx, text)) {
    // On mémorise quand même les messages entrants.
    saveMessage(chatId, userId, "user", text);
    return;
  }

  // ====================================================
  // MÉMOIRE DU MESSAGE
  // ====================================================

  saveMessage(chatId, userId, "user", text);

  // ====================================================
  // NICOLAS DEMANDE UNE CONVERSATION
  // ====================================================

  if (
    userId === BROTHER_USER_ID &&
    isConversationMemoryRequest(text)
  ) {
    const person = findPersonInText(text);

    if (person) {
      await sendTyping(ctx);

      const memory = formatConversationMemory(person);

      const finalText =
        `<b><i>${escapeHTML(memory)}\n🍃🍒</i></b>`;

      await ctx.reply(finalText, {
        parse_mode: "HTML"
      });

      await sendSticker(ctx, "reflexion");

      saveMessage(chatId, "anita", "assistant", memory);

      return;
    }
  }

  // ====================================================
  // TYPING
  // ====================================================

  await sendTyping(ctx);

  // ====================================================
  // PROMPT
  // ====================================================

  const prompt = buildPrompt(ctx, text);

  // ====================================================
  // IA
  // ====================================================

  let answer = await askAI(prompt, text, userId);

  if (!answer) {
    answer = localFallback(text, userId);
  }

  answer = String(answer)
    .replace(/<b>/gi, "")
    .replace(/<\/b>/gi, "")
    .replace(/<i>/gi, "")
    .replace(/<\/i>/gi, "")
    .replace(/🍃🍒/g, "")
    .trim();

  // ====================================================
  // FORMAT FINAL
  // ====================================================

  const finalText =
    `<b><i>${escapeHTML(answer)}\n🍃🍒</i></b>`;

  // ====================================================
  // ENVOI
  // ====================================================

  await ctx.reply(finalText, {
    parse_mode: "HTML"
  });

  // ====================================================
  // MÉMORISER LA RÉPONSE D'ANITA
  // ====================================================

  saveMessage(chatId, "anita", "assistant", answer);

  // ====================================================
  // 1 SEUL STICKER
  // ====================================================

  await sendSticker(ctx, answer);
});

// ======================================================
// ERREURS
// ======================================================

bot.catch(err => {
  console.error("❌ Erreur Telegram :", err);
});

// ======================================================
// LANCEMENT
// ======================================================

(async () => {
  try {
    await bot.launch();

    console.log("=================================");
    console.log("🍃🍒 ANITA BOT ONLINE");
    console.log("👧 Anita - 17 ans");
    console.log("👨 Nicolas - Grand frère");
    console.log("❤️ Grâce - Copine de Nicolas");
    console.log("❤️ Morelle/Molo - Copine de Nicolas");
    console.log("🧠 Mémoire SQLite activée");
    console.log("=================================");
  } catch (err) {
    console.error("❌ Impossible de lancer Anita :", err);
    process.exit(1);
  }
})();

// ======================================================
// ARRÊT PROPRE
// ======================================================

process.once("SIGINT", () => {
  bot.stop("SIGINT");
  db.close();
});

process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  db.close();
});
