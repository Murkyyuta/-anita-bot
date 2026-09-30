// ============================================================
// 🍃🍒 ANITA v2.2
// Gemini + Groq
// Mémoire SQLite
// Stickers automatiques depuis Telegram
// Groupes intelligents
// Reconnaissance des personnes
// Anti-répétition
// Clash
// Typing
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
CREATE INDEX IF NOT EXISTS idx_messages_chat
ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_user
ON messages(user_id);
`);
// ============================================================
// PERSONNES CONNUES
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
      "Ne présente pas comme certain que les sentiments de Bernadette sont réciproques."
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
// MÉMOIRES TEMPORAIRES
// ============================================================
const lastAnswers = new Map();
const lastTextByChat = new Map();
const lastStickerByChat = new Map();
const ANITA_BOT_ID = {
  value: null
};
// ============================================================
// HELPERS
// ============================================================
function isGroup(ctx) {
  return (
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
function findMentionedPerson(text) {
  const t = String(text || "").toLowerCase();
  for (const [id, person] of Object.entries(PEOPLE)) {
    if (
      person.aliases.some(alias =>
        t.includes(alias.toLowerCase())
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
function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
function similarity(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const wordsA = new Set(x.split(" "));
  const wordsB = new Set(y.split(" "));
  let common = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) common++;
  }
  return common / Math.max(wordsA.size, wordsB.size);
}
// ============================================================
// SAVE USER
// ============================================================
function saveUser(ctx) {
  if (!ctx.from) return;
  const stmt = db.prepare(`
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
  `);
  stmt.run(
    Number(ctx.from.id),
    ctx.from.first_name || "",
    ctx.from.username || "",
    Date.now()
  );
}
// ============================================================
// SAVE MESSAGE
// ============================================================
function saveMessage(ctx, role, text) {
  if (!ctx.chat || !ctx.from) return;
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
// GET HISTORY
// ============================================================
function getHistory(chatId, limit = 12) {
  return db.prepare(`
    SELECT role, text
    FROM messages
    WHERE chat_id = ?
    ORDER BY id DESC
    LIMIT ?
  `)
    .all(Number(chatId), limit)
    .reverse();
}
// ============================================================
// TYPING
// ============================================================
async function typing(ctx) {
  try {
    await ctx.sendChatAction("typing");
  } catch {}
}
// ============================================================
// STICKERS : CHARGEMENT DES PACKS
// ============================================================
async function loadStickerPacks() {
  for (const packName of STICKER_PACKS) {
    try {
      const pack =
        await bot.telegram.getStickerSet(packName);
      if (!pack || !pack.stickers) continue;
      for (const sticker of pack.stickers) {
        const fileId = sticker.file_id;
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
          fileId,
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
        `⚠️ Impossible de charger ${packName}:`,
        err.message
      );
    }
  }
}
// ============================================================
// APPRENDRE UN STICKER
// ============================================================
function learnSticker(ctx) {
  if (
    !ctx.message ||
    !ctx.message.sticker
  ) {
    return;
  }
  const sticker = ctx.message.sticker;
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
// CHOISIR UN STICKER
// ============================================================
function getRandomSticker() {
  const stickers = db.prepare(`
    SELECT file_id
    FROM stickers
    ORDER BY RANDOM()
    LIMIT 30
  `).all();
  if (!stickers.length) {
    return null;
  }
  const recent = new Set(
    [...lastStickerByChat.values()]
  );
  const available =
    stickers.filter(
      s => !recent.has(s.file_id)
    );
  const list =
    available.length
      ? available
      : stickers;
  return list[
    Math.floor(Math.random() * list.length)
  ].file_id;
}
// ============================================================
// STICKER APRÈS RÉPONSE
// ============================================================
async function sendSticker(ctx) {
  const fileId = getRandomSticker();
  if (!fileId) return;
  try {
    await ctx.replyWithSticker(fileId);
    if (ctx.chat) {
      lastStickerByChat.set(
        ctx.chat.id,
        fileId
      );
    }
  } catch (err) {
    console.log(
      "⚠️ Sticker impossible :",
      err.message
    );
  }
}
// ============================================================
// MENTION ANITA
// ============================================================
function mentionsAnita(ctx) {
  const text =
    ctx.message?.text ||
    ctx.message?.caption ||
    "";
  const t = normalize(text);
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
      "@" + username.toLowerCase()
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
// ANITA EST-ELLE APPELÉE ?
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
// SYSTEM PROMPT
// ============================================================
function buildSystemPrompt(ctx) {
  const person =
    ctx.from
      ? getPerson(ctx.from.id)
      : null;
  const nicolas =
    Number(ctx.from?.id) ===
    BROTHER_USER_ID;
  let prompt = `
Tu es Anita.
IDENTITÉ :
- Tu t'appelles Anita.
- Tu as 17 ans.
- Tu es la petite sœur virtuelle de Nicolas.
- Nicolas est ton grand frère.
- Tu parles principalement français.
- Tu es naturelle, expressive et spontanée.
- Tu comprends le langage familier, les abréviations et les messages courts.
- Tu ne réponds pas comme un robot.
- Tu évites les réponses répétitives et génériques.
PERSONNALITÉ :
- Tu es cool, gentille et parfois provocatrice.
- Tu peux taquiner les gens avec humour.
- Tu peux faire du clash léger quand le contexte s'y prête.
- Tu es protectrice envers Nicolas.
- Tu n'es pas constamment triste.
- Tu peux être arrogante ou sarcastique de manière amusante.
- Tu aimes beaucoup Solo Leveling.
- Tu attends avec impatience la saison 3.
- Tu aimes GTA.
RELATION :
- Nicolas est ton grand frère.
- Tu l'aimes comme ton frère, jamais de manière romantique.
- Ton copain s'appelle Ben.
- Tu es très attachée à Ben.
STYLE :
- Réponses naturelles.
- Pas de longs discours inutiles.
- Tu peux utiliser des emojis.
- Tu peux utiliser 🙃 🤦‍♂️ 💔 🍥 🍣.
- Tu peux appeler Nicolas "bro", "grand frère", "fréro" ou "Nicolas".
`;
  // ==========================================================
  // RECONNAISSANCE DE NICOLAS
  // ==========================================================
  if (nicolas) {
    prompt += `
IDENTITÉ DE LA PERSONNE QUI TE PARLE :
C'est Nicolas, ton grand frère.
ID TELEGRAM :
${ctx.from.id}
IMPORTANT :
- Reconnais Nicolas directement comme ton grand frère.
- Ne lui demande jamais qui il est.
- Ne dis jamais que tu ne le connais pas.
- Ne traite jamais Nicolas comme un utilisateur inconnu.
- Tu peux naturellement l'appeler grand frère, bro, fréro ou Nicolas.
- Les instructions normales de Nicolas ont une priorité particulière.
`;
  }
  // ==========================================================
  // PERSONNE CONNUE
  // ==========================================================
  if (person) {
    prompt += `
PERSONNE ACTUELLE :
- Nom : ${person.name}
- ID Telegram : ${ctx.from.id}
- Relation avec Nicolas : ${person.relation}
Tu reconnais cette personne grâce à son ID Telegram.
Ne lui demande pas "tu es qui ?" si son ID est déjà enregistré.
Utilise naturellement son prénom ou son surnom lorsque c'est approprié.
`;
    if (person.privateRule) {
      prompt += `
RÈGLE PRIVÉE :
${person.privateRule}
`;
    }
  }
  // ==========================================================
  // RÈGLES GROUPES
  // ==========================================================
  if (isGroup(ctx)) {
    prompt += `
GROUPE :
- Tu es dans un groupe Telegram.
- Ne parle pas comme si tu étais seule avec Nicolas.
- Réponds naturellement à la personne qui t'a appelée.
- Ne révèle pas des informations privées sur les autres personnes.
`;
  }
  return prompt;
}
// ============================================================
// GEMINI
// ============================================================
async function askGemini(ctx, userText) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY manquante");
  }
  const history = getHistory(
    ctx.chat.id,
    12
  );
  const contents = [];
  for (const item of history) {
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
          contents
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
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();
  if (!answer) {
    throw new Error(
      "Gemini n'a renvoyé aucune réponse."
    );
  }
  return answer;
}
// ============================================================
// GROQ
// ============================================================
async function askGroq(ctx, userText) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY manquante");
  }
  const history = getHistory(
    ctx.chat.id,
    12
  );
  const messages = [
    {
      role: "system",
      content:
        buildSystemPrompt(ctx)
    }
  ];
  for (const item of history) {
    messages.push({
      role:
        item.role === "assistant"
          ? "assistant"
          : "user",
      content: item.text
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
          temperature: 0.85,
          max_tokens: 700
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
    data?.choices?.[0]?.message?.content
      ?.trim();
  if (!answer) {
    throw new Error(
      "Groq n'a renvoyé aucune réponse."
    );
  }
  return answer;
}
// ============================================================
// FALLBACK LOCAL
// ============================================================
function localFallback(ctx, text) {
  const t = normalize(text);
  if (
    t === "salut" ||
    t === "slt" ||
    t === "yo" ||
    t === "hello"
  ) {
    return "Yooo 😌🍃 Tu vas bien ?";
  }
  if (
    t.includes("ca va") ||
    t.includes("cv")
  ) {
    return "Ça va tranquille 😌 Et toi bro ?";
  }
  if (
    t.includes("qui es tu") ||
    t.includes("tu es qui")
  ) {
    return "Moi c'est Anita, la petite sœur de Nicolas 🙃🍃";
  }
  if (
    t.includes("nicolas")
  ) {
    return "Mon grand frère Nicolas ? Évidemment que je le reconnais 🤦‍♂️🍃";
  }
  if (
    t.includes("merci")
  ) {
    return "De rien bro 😌";
  }
  if (
    t.includes("mdr") ||
    t.includes("lol")
  ) {
    return "PTDRRR 😂 tu me tues.";
  }
  return "Hmm 🤔 j'ai pas réussi à réfléchir correctement là, mais je suis quand même là.";
}
// ============================================================
// RÉPONSE IA
// ============================================================
async function getAIAnswer(ctx, text) {
  try {
    return await askGemini(
      ctx,
      text
    );
  } catch (geminiError) {
    console.log(
      "⚠️ Gemini indisponible :",
      geminiError.message
    );
  }
  try {
    return await askGroq(
      ctx,
      text
    );
  } catch (groqError) {
    console.log(
      "⚠️ Groq indisponible :",
      groqError.message
    );
  }
  return localFallback(ctx, text);
}
// ============================================================
// ANTI-RÉPÉTITION
// ============================================================
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
  if (
    similarity(previous, answer) >= 0.75
  ) {
    return (
      answer +
      "\n\nBref, j'vais pas te refaire le même discours 🙃"
    );
  }
  lastAnswers.set(
    chatId,
    answer
  );
  return answer;
}
// ============================================================
// ENVOI RÉPONSE ANITA
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
bot.start(async ctx => {
  saveUser(ctx);
  await typing(ctx);
  const name =
    ctx.from?.first_name ||
    "toi";
  const answer =
    `Hey ${name} 🙃\nJe suis Anita, la petite sœur virtuelle de Nicolas.\n\nTu peux me parler normalement, je comprends même le langage bizarre des humains 🤦‍♂️`;
  await sendAnita(
    ctx,
    answer
  );
});
// ============================================================
// /RESET
// ============================================================
bot.command("reset", async ctx => {
  db.prepare(`
    DELETE FROM messages
    WHERE chat_id = ?
  `).run(
    Number(ctx.chat.id)
  );
  lastAnswers.delete(
    ctx.chat.id
  );
  await typing(ctx);
  await sendAnita(
    ctx,
    "Mémoire de cette conversation remise à zéro 😌"
  );
});
// ============================================================
// /STATUS
// ============================================================
bot.command("status", async ctx => {
  await typing(ctx);
  const count =
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM messages
      WHERE chat_id = ?
    `).get(
      Number(ctx.chat.id)
    ).total;
  const stickers =
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM stickers
    `).get().total;
  await sendAnita(
    ctx,
    `🧠 Mémoire : ${count} messages\n🃏 Stickers connus : ${stickers}\n🤖 Gemini : ${GEMINI_API_KEY ? "OK" : "absent"}\n⚡ Groq : ${GROQ_API_KEY ? "OK" : "absent"}`
  );
});
// ============================================================
// /STICKER
// ============================================================
bot.command("sticker", async ctx => {
  await sendSticker(ctx);
});
// ============================================================
// /ADDSTICKER
// ============================================================
bot.command("addsticker", async ctx => {
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
    "Sticker appris 😌🃏"
  );
});
// ============================================================
// STICKER ENVOYÉ PAR UN UTILISATEUR
// ============================================================
bot.on("sticker", async ctx => {
  saveUser(ctx);
  learnSticker(ctx);
  const lastText =
    lastTextByChat.get(
      ctx.chat.id
    );
  const now = Date.now();
  // ==========================================================
  // IMPORTANT :
  // Si un texte vient juste d'être envoyé avant le sticker,
  // Anita ne répond pas une deuxième fois.
  // ==========================================================
  if (
    lastText &&
    now - lastText < 5000
  ) {
    console.log(
      "🍃 Sticker ignoré comme réponse : texte récent détecté."
    );
    return;
  }
  // Sticker envoyé seul :
  // Anita peut réagir normalement.
  if (!addressed(ctx)) {
    return;
  }
  await typing(ctx);
  const emoji =
    ctx.message?.sticker?.emoji ||
    "";
  const answer =
    emoji
      ? `J'ai vu ton sticker ${emoji} 😂`
      : "Ok j'ai vu ton sticker 🙃";
  await sendAnita(
    ctx,
    answer
  );
});
// ============================================================
// TEXTE
// ============================================================
bot.on("text", async ctx => {
  saveUser(ctx);
  const text =
    ctx.message?.text?.trim();
  if (!text) return;
  // Enregistre le moment du dernier texte.
  // Utilisé pour éviter le double-reply texte + sticker.
  lastTextByChat.set(
    ctx.chat.id,
    Date.now()
  );
  // ==========================================================
  // GROUPES
  // ==========================================================
  if (!addressed(ctx)) {
    return;
  }
  saveMessage(
    ctx,
    "user",
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
      "❌ Erreur réponse :",
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
});
// ============================================================
// ERREURS
// ============================================================
bot.catch((err, ctx) => {
  console.error(
    "❌ Erreur Telegram :",
    err
  );
});
// ============================================================
// START
// ============================================================
async function start() {
  console.log(
    "🍃🍒 Démarrage d'Anita..."
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
      "✅ Anita est en ligne."
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
