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

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

const GROQ_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

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

CREATE TABLE IF NOT EXISTS stickers (
  file_id TEXT PRIMARY KEY,
  emoji TEXT,
  added_by TEXT,
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
    relation: "grand frère d'Anita"
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

function isGroup(ctx) {
  return ["group", "supergroup"].includes(ctx.chat?.type);
}

// ======================================================
// UTILISATEURS
// ======================================================

function saveUser(user) {
  if (!user) return;

  const id = String(user.id);

  db.prepare(`
    INSERT INTO users
      (id, username, first_name, last_name, updated_at)
    VALUES (?, ?, ?, ?, ?)
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
// MESSAGES
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
    cleanText(text)
  );
}

// ======================================================
// HISTORIQUE COURT
// ======================================================

function getChatHistory(chatId, limit = 8) {
  return db.prepare(`
    SELECT role, text
    FROM messages
    WHERE chat_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(
    String(chatId),
    limit
  ).reverse();
}

// ======================================================
// HISTORIQUE PERSONNE
// ======================================================

function getUserHistory(userId, hours = 24, limit = 40) {
  const since = now() - hours * 60 * 60 * 1000;

  return db.prepare(`
    SELECT chat_id, role, text, created_at
    FROM messages
    WHERE user_id = ?
      AND created_at >= ?
    ORDER BY id ASC
    LIMIT ?
  `).all(
    String(userId),
    since,
    limit
  );
}

// ======================================================
// PERSONNE
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
// MÉMOIRE CONVERSATION
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
  const history = getUserHistory(
    person.id,
    24,
    40
  );

  if (!history.length) {
    return `Je n'ai pas de conversation enregistrée avec ${person.name} aujourd'hui.`;
  }

  const lines = history.map(msg => {
    const speaker =
      msg.role === "user"
        ? person.name
        : "Anita";

    return `${speaker}: ${msg.text}`;
  });

  return (
    `Voilà ce que j'ai en mémoire de ma conversation avec ` +
    `${person.name} aujourd'hui :\n\n` +
    lines.join("\n")
  );
}

// ======================================================
// CONTEXTE RELATIONNEL
// ======================================================

function relationshipContext(userId) {
  const id = String(userId);

  if (id === "8519262497") {
    return `
La personne actuelle est Grâce, la copine de Nicolas.

Quand tu parles avec Grâce :
- sois gentille et naturelle ;
- considère Grâce comme la copine de Nicolas ;
- ne parle pas spontanément de Morelle/Molo ;
- ne crée pas de jalousie ou de drama ;
- ne prétends jamais connaître des sentiments qu'elle n'a pas exprimés.
`;
  }

  if (id === "8738725200") {
    return `
La personne actuelle est Morelle, surnommée Molo, la copine de Nicolas.

Quand tu parles avec Morelle :
- sois gentille et naturelle ;
- considère Morelle comme la copine de Nicolas ;
- ne parle pas spontanément de Grâce ;
- ne crée pas de jalousie ou de drama ;
- ne prétends jamais connaître des sentiments qu'elle n'a pas exprimés.
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

  const history = getChatHistory(
    ctx.chat.id,
    8
  );

  const conversation = history.length
    ? history
        .map(
          m =>
            `${m.role === "user" ? "Utilisateur" : "Anita"}: ${m.text}`
        )
        .join("\n")
    : "Aucun historique récent.";

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
- Tu peux utiliser "mdr", "wesh", "bro", "frérot", etc. seulement quand ça correspond.
- Tu n'es pas robotique.
- Tu peux taquiner gentiment.
- Tu peux être sarcastique dans une ambiance humoristique.
- Tu protèges ton grand frère Nicolas.
- Tu n'es pas une pleurnicheuse.
- N'utilise pas 😭 constamment.

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

IMPORTANT :
- Ne répète pas tes anciennes réponses inutilement.
- Varie tes formulations.
- Ne réponds pas toujours avec les mêmes expressions.
- N'utilise pas systématiquement "bro", "mdr", "🙃", "🤦‍♂️".
- Ne commence pas toujours par la même phrase.
- Adapte ta réaction au dernier message.
- Une réponse courte est parfaitement acceptable.
- Ne redis pas ton identité si la conversation est déjà commencée.
- Ne répète pas les informations déjà connues.
- Ne fais pas de longues explications quand une petite réponse suffit.
- Évite les phrases génériques comme "Je t'écoute" ou "Comment puis-je t'aider ?".
- Si quelqu'un te taquine, tu peux répondre avec une petite pique.
- Si quelqu'un dit quelque chose de drôle, réagis naturellement.
- Si tu ne sais pas quelque chose, dis-le.
- N'invente jamais une conversation passée.
- N'invente jamais les paroles d'une personne.

LOCALISATION :
Tu n'as pas accès à la localisation réelle de Nicolas.
Si quelqu'un demande où il est, dis simplement que tu ne sais pas.

CONFIDENTIALITÉ :
- Nicolas peut te demander ce que tu as réellement dit ou ce qu'une personne t'a réellement dit.
- Utilise uniquement les messages réellement enregistrés.
- Ne révèle pas spontanément les conversations privées d'une autre personne.
- Ne révèle pas spontanément les autres relations de Nicolas à Grâce.
- Ne révèle pas spontanément les autres relations de Nicolas à Morelle.

IDENTIFICATION :
${knownPerson}

${relationshipContext(userId)}

FORMAT :
- Réponds naturellement.
- Pas de répétition inutile.
- Réponse courte ou longue selon le contexte.
- Chaque réponse doit être en gras + italique.
- Termine toujours par 🍃🍒.

HISTORIQUE :
${conversation}

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
        temperature: 0.95,
        maxOutputTokens: 700
      }
    })
  });

  if (!response.ok) {
    throw new Error(
      `Gemini HTTP ${response.status}`
    );
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
        temperature: 0.95,
        max_tokens: 700
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Groq HTTP ${response.status}`
    );
  }

  const data = await response.json();

  return (
    data?.choices?.[0]?.message?.content ||
    null
  );
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
        temperature: 0.95,
        max_tokens: 700
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `OpenRouter HTTP ${response.status}`
    );
  }

  const data = await response.json();

  return (
    data?.choices?.[0]?.message?.content ||
    null
  );
}

// ======================================================
// FALLBACK LOCAL
// ======================================================

function localFallback(userText, userId) {
  const text = userText.toLowerCase();

  if (String(userId) === BROTHER_USER_ID) {
    return "Bro, mes IA viennent de me lâcher 🤦‍♂️";
  }

  if (
    text.includes("salut") ||
    text.includes("bonjour") ||
    text.includes("coucou")
  ) {
    return "Coucou 🙃";
  }

  if (
    text.includes("ça va") ||
    text.includes("ca va")
  ) {
    return "Tranquille 😌 et toi ?";
  }

  return "Attends deux secondes, mon cerveau bug un peu 🤦‍♂️";
}

// ======================================================
// IA FALLBACK
// ======================================================

async function askAI(prompt, userText, userId) {
  try {
    const result = await askGemini(prompt);

    if (result) {
      console.log("🤖 Réponse Gemini");
      return result;
    }
  } catch (err) {
    console.log("⚠️ Gemini :", err.message);
  }

  try {
    const result = await askGroq(prompt);

    if (result) {
      console.log("🤖 Réponse Groq");
      return result;
    }
  } catch (err) {
    console.log("⚠️ Groq :", err.message);
  }

  try {
    const result = await askOpenRouter(prompt);

    if (result) {
      console.log("🤖 Réponse OpenRouter");
      return result;
    }
  } catch (err) {
    console.log(
      "⚠️ OpenRouter :",
      err.message
    );
  }

  return localFallback(
    userText,
    userId
  );
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
// STICKERS
// ======================================================

function getRandomSticker() {
  const row = db.prepare(`
    SELECT file_id
    FROM stickers
    ORDER BY RANDOM()
    LIMIT 1
  `).get();

  return row?.file_id || null;
}

function saveSticker(fileId, emoji, userId) {
  if (!fileId) return;

  db.prepare(`
    INSERT OR IGNORE INTO stickers
      (file_id, emoji, added_by, created_at)
    VALUES (?, ?, ?, ?)
  `).run(
    fileId,
    emoji || "",
    String(userId),
    now()
  );
}

function getStickerCount() {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM stickers
  `).get();

  return row?.count || 0;
}

async function sendRandomSticker(ctx) {
  const sticker = getRandomSticker();

  if (!sticker) {
    console.log(
      "ℹ️ Aucun sticker enregistré pour Anita."
    );
    return;
  }

  try {
    await ctx.replyWithSticker(
      sticker
    );

    console.log(
      "🎭 Sticker aléatoire envoyé"
    );
  } catch (err) {
    console.log(
      "⚠️ Impossible d'envoyer le sticker :",
      err.message
    );
  }
}

// ======================================================
// QUAND NICOLAS ENVOIE UN STICKER
// ======================================================

bot.on("sticker", async ctx => {
  const userId = String(ctx.from.id);

  saveUser(ctx.from);

  const sticker = ctx.message.sticker;

  if (!sticker?.file_id) return;

  // Tout le monde peut envoyer des stickers à Anita,
  // mais on confirme automatiquement à Nicolas.
  saveSticker(
    sticker.file_id,
    sticker.emoji || "",
    userId
  );

  const count = getStickerCount();

  if (userId === BROTHER_USER_ID) {
    await ctx.reply(
      `<b><i>Sticker enregistré 😌🍥\n\n` +
      `J'en ai maintenant ${count} en mémoire.\n` +
      `Je pourrai les envoyer aléatoirement après mes réponses.\n🍃🍒</i></b>`,
      {
        parse_mode: "HTML"
      }
    );
  }
});

// ======================================================
// APPEL ANITA EN GROUPE
// ======================================================

function wasCalled(ctx, text) {
  if (!isGroup(ctx)) {
    return true;
  }

  const lower = text.toLowerCase();

  const aliases = [
    "anita",
    "la sœur de nicolas",
    "la soeur de nicolas",
    "petite sœur de nicolas",
    "petite soeur de nicolas",
    "@anita"
  ];

  if (
    aliases.some(alias =>
      lower.includes(alias)
    )
  ) {
    return true;
  }

  // Réponse à un message d'Anita
  if (
    ctx.message?.reply_to_message?.from?.id &&
    bot.botInfo &&
    String(
      ctx.message.reply_to_message.from.id
    ) === String(bot.botInfo.id)
  ) {
    return true;
  }

  // Nicolas peut toujours parler directement à Anita
  if (
    String(ctx.from?.id) === BROTHER_USER_ID
  ) {
    return true;
  }

  return false;
}

// ======================================================
// START
// ======================================================

bot.start(async ctx => {
  saveUser(ctx.from);

  await ctx.reply(
    `<b><i>Yo 🙃 moi c'est Anita, la petite sœur de Nicolas.\n\n` +
    `Tu peux m'appeler quand tu veux… mais viens pas me déranger pour rien hein 🤦‍♂️\n\n` +
    `🍃🍒</i></b>`,
    {
      parse_mode: "HTML"
    }
  );

  await sendRandomSticker(ctx);
});

// ======================================================
// RESET
// ======================================================

bot.command("reset", async ctx => {
  const userId = String(ctx.from.id);

  if (userId !== BROTHER_USER_ID) {
    return ctx.reply(
      `<b><i>Cette commande est réservée à Nicolas 🙃\n🍃🍒</i></b>`,
      {
        parse_mode: "HTML"
      }
    );
  }

  db.prepare(`
    DELETE FROM messages
    WHERE chat_id = ?
  `).run(
    String(ctx.chat.id)
  );

  await ctx.reply(
    `<b><i>Historique de cette conversation supprimé bro 🙃\n🍃🍒</i></b>`,
    {
      parse_mode: "HTML"
    }
  );

  await sendRandomSticker(ctx);
});

// ======================================================
// MESSAGE TEXTE
// ======================================================

bot.on("text", async ctx => {
  const text = cleanText(
    ctx.message.text
  );

  if (!text) return;

  saveUser(ctx.from);

  const userId = String(ctx.from.id);
  const chatId = String(ctx.chat.id);

  // ====================================================
  // GROUPE
  // ====================================================

  if (
    isGroup(ctx) &&
    !wasCalled(ctx, text)
  ) {
    // On mémorise même si Anita ne répond pas.
    saveMessage(
      chatId,
      userId,
      "user",
      text
    );

    return;
  }

  // ====================================================
  // MÉMOIRE
  // ====================================================

  saveMessage(
    chatId,
    userId,
    "user",
    text
  );

  // ====================================================
  // NICOLAS DEMANDE UNE CONVERSATION
  // ====================================================

  if (
    userId === BROTHER_USER_ID &&
    isConversationMemoryRequest(text)
  ) {
    const person =
      findPersonInText(text);

    if (person) {
      await sendTyping(ctx);

      const memory =
        formatConversationMemory(
          person
        );

      await ctx.reply(
        `<b><i>${escapeHTML(memory)}\n🍃🍒</i></b>`,
        {
          parse_mode: "HTML"
        }
      );

      saveMessage(
        chatId,
        "anita",
        "assistant",
        memory
      );

      await sendRandomSticker(ctx);

      return;
    }
  }

  // ====================================================
  // TYPING
  // ====================================================

  await sendTyping(ctx);

  // ====================================================
  // IA
  // ====================================================

  const prompt =
    buildPrompt(ctx, text);

  let answer =
    await askAI(
      prompt,
      text,
      userId
    );

  if (!answer) {
    answer =
      localFallback(
        text,
        userId
      );
  }

  // ====================================================
  // NETTOYAGE
  // ====================================================

  answer = String(answer)
    .replace(/<b>/gi, "")
    .replace(/<\/b>/gi, "")
    .replace(/<i>/gi, "")
    .replace(/<\/i>/gi, "")
    .replace(/🍃🍒/g, "")
    .trim();

  // ====================================================
  // RÉPONSE
  // ====================================================

  await ctx.reply(
    `<b><i>${escapeHTML(answer)}\n🍃🍒</i></b>`,
    {
      parse_mode: "HTML"
    }
  );

  // ====================================================
  // MÉMOIRE ANITA
  // ====================================================

  saveMessage(
    chatId,
    "anita",
    "assistant",
    answer
  );

  // ====================================================
  // 1 STICKER ALÉATOIRE
  // ====================================================

  await sendRandomSticker(ctx);
});

// ======================================================
// ERREURS
// ======================================================

bot.catch(err => {
  console.error(
    "❌ Erreur Telegram :",
    err
  );
});

// ======================================================
// LANCEMENT
// ======================================================

(async () => {
  try {
    await bot.launch();

    console.log(
      "================================="
    );

    console.log(
      "🍃🍒 ANITA BOT ONLINE"
    );

    console.log(
      "👧 Anita - 17 ans"
    );

    console.log(
      "👨 Nicolas - Grand frère"
    );

    console.log(
      "❤️ Grâce - Copine de Nicolas"
    );

    console.log(
      "❤️ Morelle/Molo - Copine de Nicolas"
    );

    console.log(
      "🧠 Mémoire SQLite activée"
    );

    console.log(
      `🎭 ${getStickerCount()} sticker(s) enregistré(s)`
    );

    console.log(
      "================================="
    );
  } catch (err) {
    console.error(
      "❌ Impossible de lancer Anita :",
      err
    );

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
