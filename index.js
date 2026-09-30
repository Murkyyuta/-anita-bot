require("dotenv").config();
const { Telegraf } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply(
    "***Coucou 🙃 Moi c'est Anita, la petite sœur de Nicolas. 🍥\\n\\nT'es qui toi ?*** 🍃🍒",
    { parse_mode: "Markdown" }
  );
});

bot.on("text", async (ctx) => {
  const message = ctx.message.text;

  await ctx.sendChatAction("typing");

  if (message.toLowerCase().includes("nicolas")) {
    return ctx.reply(
      "***Si tu cherches mon grand frère, j'sais pas où il est 🙃\\n\\nMais tiens : @Sage_ou_Nicolas\\nÉcris-lui toi-même 🤦‍♂️🍣*** 🍃🍒",
      { parse_mode: "Markdown" }
    );
  }

  return ctx.reply(
    "***Tu me parles à moi là ? 🙃🍥*** 🍃🍒",
    { parse_mode: "Markdown" }
  );
});

bot.launch();

console.log("🍃🍒 ANITA EST EN LIGNE !");
