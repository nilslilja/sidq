# Chrome Web Store submission

Everything the listing form asks for, written out. The reviewer's job is to
decide whether the permissions are justified; most rejections are a vague
justification rather than a real problem, so each one below says exactly which
line of code needs it.

## Listing

**Name**: Sidq

**Summary** (132 max)

> Carry a whole conversation from one AI assistant into another, word for word.
> Works with the Sidq Mac app. Nothing is uploaded.

**Description**

> Sidq moves an entire conversation from one AI assistant into a different one.
> Not a summary, the whole thing.
>
> This extension is the part that reads assistants running in a browser. It
> works with the Sidq app on your Mac, which reads the assistants that write
> conversations to disk. Together they put everything you have asked, in every
> tool, in one place you can search.
>
> Nothing is uploaded. The extension sends what it reads to the Sidq app on your
> own machine, over the loopback address 127.0.0.1, which by definition cannot
> leave the computer. There is no Sidq server involved at any point, and the
> extension has no ability to send your conversations anywhere else.
>
> Requires the Sidq app for macOS. Free.

**Category**: Productivity
**Language**: English

## Permission justifications

Reviewers reject vague answers, so each names the code.

**`activeTab`**
> Reads the conversation on the tab the user explicitly acts on, when they click
> the toolbar button. `chrome.tabs.sendMessage` in background.js, in the
> `chrome.action.onClicked` handler.

**`scripting`**
> Used to read the conversation out of the page via the declared content script.
> No remote code is executed and nothing is injected from outside the package.

**`storage`**
> Two things, both local. Whether the user dismissed the Sidq chip on a given
> site, so it is not shown again; and a twelve-hour cache of the selector table
> described below.

**Host permissions, the assistant sites**
> chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, perplexity.ai,
> grok.com, x.com/i/grok, chat.deepseek.com, chat.mistral.ai, github.com/copilot
>
> These are the assistants whose conversations the extension exists to read. It
> has no function on any other site and requests no other host.

**`http://127.0.0.1/*`**
> The loopback address of the user's own machine, where the Sidq desktop app
> listens on port 17872. This is how a conversation reaches the app. It is not a
> remote server: 127.0.0.1 is not routable off the device.
>
> The page's own Content-Security-Policy blocks this connection on several of
> these sites, which is why it is made from the service worker rather than the
> content script.

**`https://www.sidq.tech/*`**
> One file, `/extension/sources.json`, holding CSS selectors. These sites
> redesign without notice and a stale selector means the extension silently
> reads nothing. Fetching them lets a breakage be fixed the same day instead of
> waiting on a resubmission.
>
> Only the `turnSelectors` field is read and only as an array of strings. It is
> never evaluated and can never become code. See `applyOverrides` in content.js.

## Privacy

**Does it collect user data?** Yes, and none of it leaves the device.

| Type | Collected | Why | Leaves device |
|---|---|---|---|
| Website content | Yes | The conversation, to hand to the Sidq app | No |
| Personally identifiable info | No | | |
| Health, financial, location | No | | |
| Authentication information | No | | |
| Personal communications | Yes | An AI conversation may qualify | No |
| Web history | No | | |
| User activity | No | | |

Tick, truthfully:
- Not sold to third parties
- Not used for anything unrelated to the single purpose
- Not used to determine creditworthiness or for lending

**Single purpose**
> Reads the conversation on a supported AI assistant page and sends it to the
> Sidq application on the same computer.

**Privacy policy URL**: https://www.sidq.tech/privacy

## Screenshots (1280x800)

1. The chip on a blank ChatGPT: "17 conversations, 8 rules you set"
2. The Sidq picker open, a real list of conversations
3. The Sidq window, the numbers header and search results across assistants
4. A handover file open in a different assistant, mid-continuation

Shoot against Sidq's backdrop window, not a live desktop. `scripts/shoot.sh`.

## Before submitting

- [ ] Selectors audited on all ten hosts with `extension/audit.js`
- [ ] Loaded unpacked in Chrome; icon renders, no manifest warnings
- [ ] Chip appears on a blank conversation, dismissal survives a reload
- [ ] Toolbar button captures a conversation the Sidq app can then find in search
- [ ] `/extension/sources.json` returns JSON, not HTML
- [ ] Version bumped if this is a resubmission

Review is typically a few days and can be longer for broad host permissions.
Submit before the launch posts, not after.
