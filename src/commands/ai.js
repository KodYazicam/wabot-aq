/** AI commands: chat with any OpenAI-compatible API (per-chat history). */

const histories = new Map() // chat jid → [{ role, content }]

export function resetHistory (jid) {
  histories.delete(jid)
}

export const commands = [
  {
    name: 'ai',
    aliases: ['gpt', 'chat', 'ask'],
    category: 'ai',
    description: 'Chat with an AI (OpenAI-compatible API)',
    usage: '<prompt>',
    cooldown: 10,
    async run (ctx) {
      const { apiKey, baseUrl, model } = ctx.config.ai
      if (!apiKey) return ctx.reply(ctx.t('ai.noKey', { prefix: ctx.usedPrefix }))
      if (!ctx.text) return ctx.reply(ctx.t('ai.usage', { cmd: ctx.usedPrefix + 'ai' }))

      const history = histories.get(ctx.m.chat) || []
      const messages = [
        { role: 'system', content: ctx.t('ai.systemPrompt', { bot: ctx.config.botName, locale: ctx.locale }) },
        ...history.slice(-10),
        { role: 'user', content: ctx.text }
      ]

      await ctx.m.react('⏳')
      const { fetchJson } = await import('../lib/utils.js')
      const data = await fetchJson(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model, messages, max_tokens: 1000, temperature: 0.7 })
      }, 120_000)

      const answer = data.choices?.[0]?.message?.content?.trim()
      if (!answer) throw new Error(ctx.t('ai.emptyResponse'))

      // update history
      history.push({ role: 'user', content: ctx.text }, { role: 'assistant', content: answer })
      histories.set(ctx.m.chat, history.slice(-12))

      await ctx.m.react('✅')
      await ctx.reply(answer.slice(0, 4000))
    }
  },
  {
    name: 'resetai',
    aliases: ['clearchat'],
    category: 'ai',
    description: 'Clear the AI conversation history of this chat',
    async run (ctx) {
      resetHistory(ctx.m.chat)
      await ctx.m.react('✅')
      await ctx.reply(ctx.t('ai.reset'))
    }
  }
]
