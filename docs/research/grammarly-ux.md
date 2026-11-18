# Grammarly UX reference for Matra

Research date: 2026-11-18. Purpose: record how Grammarly designs each screen and interaction so Matra (a free macOS writing assistant for English and Bangla) can match its usability. We are not copying its branding.

## 0. Sources and coverage

**What Mobbin has.** Mobbin only lists **Grammarly on Web**: the app.grammarly.com editor, the documents home, account and admin, onboarding and pricing. Every Mobbin screen cited below comes from that web app. The Mobbin IDs are screen UUIDs, and each one opens at `https://mobbin.com/screens/<id>`.

**What Mobbin does not have.** It has nothing for the following surfaces:
- the Grammarly iOS or Android keyboard
- the macOS or Windows desktop app
- the browser extension, including the floating "G" button and the inline underline card on third-party sites

- An iOS search for "Grammarly app home screen" returned 0 results.
- A keyboard search returned only other apps.
- A deep web search for "browser extension floating G button" returned only web-editor screens and the marketing landing page.

**Fallback.** For those surfaces I used WebSearch (standard mode), which returned summaries of Grammarly and Superhuman help-center articles. I could not open the articles themselves: `support.grammarly.com` and `help.superhuman.com` do not resolve in this session's network. To quote them verbatim, those hosts would need to be allowed. Points that rest only on search summaries are marked **[help-center]**. Anything that isn't marked comes from a screen I looked at on Mobbin.

### Mobbin flows used

| Flow | Flow ID | Screens |
|---|---|---|
| Onboarding (21 screens) | `1d0b78d2-f696-489e-a84c-268513341743` | 8edde093 … 5e08e763 |
| Creating a document | `b5c6b0bc-d1d2-44ee-bcd6-2382f261e28f` | 5e08e763, 337f4502, d1fd8c2a, e36b29ab, 82d0d01f |
| Accepting a suggestion | `6523b98c-99a8-4b5b-b3f9-86fb4af806b6` | 82d0d01f, af085d44 |
| Asking for a suggestion ("Increase your impact") | `6f92ffb3-f38e-4524-a643-42521e76ea66` | 5fb58d62, f96806f1, 6ce56197, 39b90f0d, 13c14bfc |
| Writing with generative AI | `087fd7da-3382-4bdc-ab95-036a1492a5eb` | 12b275fc, 471e731a, ef979bb7, 4eade1bc |
| Setting voice | `d5913572-2d95-4dc5-8fd4-0c2df330c11e` | 471e731a, 373843b6, be218681, 760e6763, b46b1a5e, 56da231e |
| Setting goals | `a85efc96-548f-4172-beee-3bf0c8465bdb` | 12b275fc, ee48ae45, bf73d0e8, 352b524f |
| Formatting text | `eb13e825-483c-410b-8d1d-e9156314a840` | 12b275fc, d93c4fdf, 9dc84b51, 0b6f8474, faab72cd, 751f812b, af5c02a8 |
| Giving feedback | `d1e99e59-b778-41b1-b9de-73a3a5fab7d6` | 4eade1bc, 435dddab, e6aa864a, 725bddff, fc8dd542 |
| Subscribing to a plan | `b3fca439-33a3-455a-b58b-88c6cc9db3d9` | 81082b93 … 32d740da |

---

## 1. Web editor (app.grammarly.com)

### 1.1 Documents home
Screens: Creating a document flow (`337f4502`, `5e08e763`).

The left sidebar is about 120 px wide and holds:
- Documents
- Version history
- Trash
- Account
- Apps (with a numeric badge)
- Get Pro
- Support and Sign out, pinned at the bottom

The main area holds:
- the title **"Documents"**
- **Upload file** (secondary button) and **New document** (primary button, with a plus icon)
- a full-width search field
- documents grouped by date ("Today")

Each document card is about 115×105 px and shows:
- the date
- a bold title
- a 3-line preview
- a footer with a **circled red number**, which is that document's open-suggestion count, plus Download and Trash icons

**Pattern worth noting:** each document's issue count shows right on its card in the list.

### 1.2 Editor layout
Screens: `82d0d01f`, `d93c4fdf`, `12b275fc` / `faab72cd`, `e36b29ab`.

The screen is split in two columns:
- **Left, about 70%:** the document. The text column is centred and about 300 px wide at a 768 px viewport, so roughly 45–55 characters per line, with generous margins.
- **Right, about 28%:** a fixed assistant panel. A small `›` chevron sits at the panel's top-left edge and collapses it.

The top bar contains, from left to right:
- the logo and a hamburger menu
- the document title, inline-editable. It shows a grey "Untitled document" placeholder, and a faint **"Saved"** label appears next to it after edits (`af085d44`).
- a **Goals** chip
- a **score chip** such as "100 Overall score" or "92 Overall score". It shows "-- Overall score" while the document is empty and a spinner while it rechecks (`471e731a`).

The bottom bar contains:
- a help "?" icon at the far left
- a formatting toolbar: B, I, U, H1, H2, link, ordered list, bulleted list, clear-format
- a **"N words ^"** counter whose caret opens the Performance modal

When formatting is unsupported, the bottom bar shows a **"Formatting tools are not available."** warning instead (gardening doc, `5fb58d62`).

The empty-document placeholder reads: *"Type or paste (⌘+V) your text here or upload a document."* The word "upload" is a link. (`d1fd8c2a`)

### 1.3 Inline underlines in the editor
Screens: `82d0d01f`, `b727d76e`, `59508691`, `352b524f`.

- Each underline is a thin 2 px line coloured by category:
  - Correctness: red
  - Clarity: blue
  - Engagement: green
  - Delivery: purple
  - Style guide: grey
- **The active suggestion gets a light tint over the whole word**, not only the underline. Example: "colors" gets a pink fill for a Correctness suggestion (`59508691`) and "involved" gets a light-blue fill for Clarity (`b727d76e`). This links the text to the open card in the panel.
- For long rewrites (Increase your impact, `f96806f1`), the whole affected paragraph gets a grey highlight.
- In the web editor, the suggestion card does not pop up over the text. **The matching card expands in the right panel instead.**

**Colorblind mode** (Editor settings, `da4aa02a`) is described as: "Use different underline styles to indicate suggestion types (Correctness, Clarity, Engagement, and Delivery)."

### 1.4 Suggestion card (web panel version)
Screens: `82d0d01f`, `b727d76e`, `59508691`, `352b524f`, `5fb58d62`.

The card has two states.

**Collapsed row.** It is about 40 px tall and shows:
- a category-coloured dot or icon
- a small grey action label, for example "Remove the phrase", "Change the wording", "Rephrase sentence", "Correct the sentence", "Use our best version"
- the affected text, truncated with an ellipsis

Clicking the row expands it.

**Expanded card.** From top to bottom it shows:
1. A header line: icon, then **"Category · Action"**, then an ⓘ icon. Examples: "Engagement · Choose a different word", "Clarity · Remove the phrase", "Correctness · Change the spelling", "Delivery · Rewrite the sentence".
2. A context snippet with ellipses on both sides, for example "…specific styles, ~~colors~~ **colours**, or fonts you…". Deleted text is struck through and inserted text is bold, all inline.
3. When there are several alternatives, they appear as **replacement chips**, for example `straightforward` (selected, outlined in green) next to `transparent`. Clicking a chip picks that option. (`82d0d01f`)
4. When no automatic fix exists, the card shows an explanation paragraph instead (Delivery, `352b524f`): *"Formal writing is almost always written in the third person. Rewrite this sentence to remove the personal pronoun **your**."* In that case only **Dismiss** and **⋯** are shown, with no Accept button.
5. A button row: **Accept** (filled primary), **Dismiss** (text button), **⋯** (overflow).

The **⋯ menu** (`b727d76e`) contains:
- "Turn off suggestions like this"
- a divider
- "Incorrect suggestion" (flag icon)
- "Offensive content" (flag icon)

How cards move and close:
- Accepting or dismissing collapses the card, and the list re-counts. "Review suggestions 2" becomes "Review suggestion 1" (`af085d44`).
- The score chip updates right away, for example from 92 to 97.

### 1.5 Assistant panel: tabs and grouping
Screens: `82d0d01f`, `fc8dd542`, `c07a37f6`.

The panel has three top tabs. Each has an icon above a two-line label, and the active tab has a green underline.
1. **Review suggestions**
2. **Write with generative AI**
3. **Check for AI text & plagiarism**

Under "Review suggestions":
- The header reads "Review suggestions" followed by a count badge.
- Below it is a **5-column category filter bar**: Correctness, Clarity, Engagement, Delivery, Style guide. Each column has a short coloured bar above its label, and clicking a column filters the list (Clarity is selected in `b727d76e`).
- Below that is a single list of collapsed rows, ordered by position in the document. Only one card is expanded at a time.
- At the bottom is a collapsible footer row, **"› Increase the impact of your text"**, with a **New!** badge.

**Empty states** each pair an illustration with a two-line message:
- Empty document: "The first word is the hardest." / "Suggestions will appear here." (`d1fd8c2a`)
- Text present, no issues yet: "Start writing to make the magic happen." / "Suggestions will appear here." (`d93c4fdf`)
- Variant: "Time to dig in." / "Suggestions will appear here." (`faab72cd`)
- Variant: "You got this." / "Suggestions will appear here." (`da4aa02a`)
- All fixed: **"You did it!" / "There are no more suggestions."** (`b0c31032`)
- Increase-impact list exhausted: "You're on point!" / "No more ideas for your audience." with a **Go back** button (`6ce56197`)

### 1.6 "Increase your impact" (goal-aware rewrite)
Flow: Asking for a suggestion (`5fb58d62` → `f96806f1` → `6ce56197`).

This opens a sub-view inside the panel. It has a back arrow and the title "Increase your impact", followed by:
- a dark green hero card with an audience-aware headline, for example: "Let's encourage new gardeners to start today. See how you can inspire readers to start gardening for mental and physical benefits."
- one rewrite card that states its intent ("Highlight the joy and tranquility gardening brings to make the audience feel relaxed and at peace") and shows the full paragraph with **added text highlighted in green**
- **Accept**, **Dismiss** and **⋯** buttons

### 1.7 "Write with generative AI" tab
Flows: Writing with generative AI, Setting voice.

The default view (`471e731a`) contains:
- a promo banner: **"Set your voice"**, "Choose how you want your generated text to sound.", and a **Set voice** button
- **"What do you want to do?"** with the subtext "Here are some ideas", followed by quick prompts: Improve it, Identify any gaps, More ideas
- a free-text prompt box pinned to the bottom of the panel, with the placeholder **"Tell us to…"**

Clicking **More ideas** opens a grouped prompt menu (`ef979bb7`). Each item has an icon.
- **Rewrite:** Improve it
- **Evaluate:** Identify any gaps · Give me ideas for improvement · Pick out my main point
- **Ideate:** Generate ideas for a blog post · Brainstorm some thought-provoking questions · Generate ideas for a headline
- **Write:** Write a project progress report · Ask for a favor · Write an engaging introductory email · Write a thank you note · Generate a blog post · Tell a story · Politely ask for an update
- Footer: "Tell us to…"

A result (`fc8dd542`) shows:
- the prompt name with its icon ("Identify any gaps"), then the output text
- **⋯** and **copy** icons
- the prompt box, still docked below
- two small icons at the top-right of the panel, likely for history and voice

After the user gives feedback, a dark toast with a green check says "Thanks for the feedback!".

The **My voice** sub-view (`be218681`, `760e6763`) contains:
- **Formality:** chips for Casual, Neutral, Formal (choose one)
- **Tone:** "Select up to three"; chips with emoji for Personable, Confident, Empathetic, Engaging, Witty, Direct, and a check badge on each selected chip
- **Your profession:** a text field
- **I write in:** a dialect dropdown with flags: American, Australian, British, Canadian, Indian English
- the footnote "These voice settings will apply to any text you generate."
- footer buttons **Close** and **Use this voice**

### 1.8 Floating mini-toolbar on text selection (web editor)
Screens: `faab72cd`, `9dc84b51`, Formatting text flow.

When the user selects text, the selection gets a yellow highlight. A small pill (about 50×16 px) appears **just below the selection's start**, with two icons:
- a rewrite/sparkle action
- the generative-AI pin

This is the in-editor entry point to AI for a selection.

### 1.9 "Check for AI text & plagiarism" tab
Screens: `c07a37f6`, `b092ad71`.

- The header reads "Plagiarism and AI text check" and has a **citation-style dropdown** (APA).
- For each match, the card shows:
  - "This text matches **Source**"
  - the source title as a heading and its URL
  - a grey box labelled "Detected Reference" with the formatted citation
  - **Copy reference** (primary) and **Dismiss**
- The matched passage in the document gets a teal highlight.
- The summary is pinned at the bottom of the panel:
  - "6% of your text matches external sources — Matches were found on the web or in academic databases"
  - "We didn't detect common AI text patterns — Your document doesn't appear to contain AI-generated text"
- Copying shows a toast at the bottom-right: "Copied to clipboard".

### 1.10 Goals modal
Screens: `ee48ae45`, `bf73d0e8`; Setting goals flow.

The modal is centred, about 340 px wide, and has a target illustration with the title **"Set goals"** and the subtitle "Get tailored writing suggestions based on your goals and audience." Each row is a label on the left with segmented chips on the right, and a one-line explanation of the selected chip underneath.

For General / Business / Email / Casual / Creative:
- **Domain:** Academic, Business, General, Email, Casual, Creative. Example explanation: "General (default): Applies most rules and conventions with medium strictness."
- **Intent:** Inform, Describe, Convince, Tell A Story. Labelled "Experimental … won't affect your feedback today."
- **Audience:** General, Knowledgeable, Expert
- **Formality:** Informal, Neutral, Formal

When Domain is Academic, the rows change:
- **Type:** Essay, Report, Other
- **Format:** APA, MLA, Chicago, Other. Example explanation: "Applies APA style to in-text and full citations."

The footer has:
- a checkbox, "Show Set Goals when I start a new document"
- **Reset to defaults** (text button)
- **Done**

Goals change what the checker flags. With Academic goals set, a Delivery card about personal pronouns appears (`352b524f`).

### 1.11 Performance (stats) modal
Screens: `a417a346`, `bf5a48dc`, `87cd8f25`.

The modal is about 260 px wide and scrolls. It opens from the word counter. Sections:
- **Header:** "Great job! Your text scores 100 out of 100. This score represents the quality of writing in this document." with a large check icon
- **Word count:** Characters, Words, Sentences, Reading time, Speaking time. Values are bold and green.
- **Readability:** Word length and Sentence length, each with a mini bar and "Above average" or "Below average" ("Metrics compared to other Grammarly users"). Readability score is shown with ⓘ. Its tooltip reads: "In the Flesch reading-ease test, higher scores indicate material that is easier to read." A plain-language interpretation follows: "Your text is likely to be understood by a reader who has at least a 9th-grade education (age 15). Aim for the score of at least 60–70…"
- **Vocabulary:** Unique words and Rare words, each as a percentage with a bar and a comparison
- **Footer:** **DOWNLOAD PDF REPORT**, which shows "PREPARING PDF REPORT…" with a spinner while working, and **Close**

### 1.12 Editor settings modal
Screens: `da4aa02a` (all on), `8725e579` (all off).

It is opened from the hamburger menu. Toggles, each with a description:
- Auto-jump to the next suggestion: "When a suggestion is applied or rejected, automatically scroll the text to the next suggestion."
- Don't check text inside quotes
- Increase text font size
- Colorblind mode
- **Suggestion management** ↗: "Turn certain types of writing suggestions (like Oxford commas or passive voice) on and off."
- **Done**

### 1.13 Hamburger menu
Screens: `b7182200`, `8732d438`.

A left drawer with these sections:
- Close · My Grammarly
- **DOCUMENT:** New document · Upload file (".docx, .odt, .rtf, .txt") · Download ("as .docx") · Print ⌘P · Version history
- **EDIT:** Undo ⌘Z · Redo ⌘Y · Cut · Copy · Paste · Select all, each with its shortcut shown on the right
- Editor settings
- **ACCOUNT** (with a Pro badge): name and email · **Language preference ▸**, a submenu of English dialects with flags · Subscription · Sign out
- Support · What's new · Send product feedback · Privacy policy

### 1.14 Feedback flow
Flow: `d1e99e59…` (`e6aa864a`).

The feedback form shows inside the panel. It has a back arrow and the title "Share your thoughts", then:
- **"How do you like Grammarly?"** with three face icons: I dislike it / It's OK / I like it!
- a text area, "How can we improve?"
- **Submit**, disabled until something is entered

Submitting shows the toast "Thanks for the feedback!".

### 1.15 First-run coachmarks
Screens: `d1fd8c2a`, `e36b29ab`.

- A **NEW** popover in the panel says "Write faster with generative AI" with "Brainstorm, write, and rewrite with generative AI assistance at your fingertips." It has a terms disclaimer and **Skip** / **Try it out** buttons.
- A dark tooltip anchored under the first expanded card says "Review suggestions — Grammarly checks for mistakes and suggests ways to improve your text." with **Next** and ×. This is a step-through tour that is tied to a real suggestion.

---

## 2. Account and settings hub (account.grammarly.com)

Layout used on every settings screen:
- a 48 px icon rail: Bookmarks, Your account, Team, Writing, Tools, Analytics, with an avatar at the bottom
- a secondary nav column about 120 px wide with collapsible groups
- the content area, with a page title and a **bookmark icon** that pins the page to Bookmarks
- a global **"Search page"** field in the top bar

### 2.1 Personal dictionary
Screens: `98083186` (empty), `e9ce3028` (one word).

- Title "Your dictionary", with: "Improve your Grammarly experience by adding words to your personal dictionary. These words will no longer be flagged as misspellings."
- An **"Add a new word"** input with an **Assign** button
- A promo box: "New for Grammarly Pro … Set up team dictionary"
- An **"Added words"** list, one word per row, with a trash icon at the right

The Writing nav lists, under Personal style: Your dictionary · Language settings · Your preferences. Under Team style: Brand tones · Dialect settings · Team dictionary · Style rules · Team preferences.

The team dictionary (`a78250fd`) has an empty-state illustration, the line "Save time for your team by reducing spelling suggestions for commonly used words…", and an **Add entry** button. The Add entry modal has a single field, "Word or phrase", with Cancel and Save. **Import list** sits in the header.

### 2.2 Style rules (style guide)
Screens: `8c941f2c`, `aed5867c`, `8a2bad3a`, `b0ab0592`.

The style rules page is a table with these columns:
- checkbox
- Original text
- Replacement text, shown as an arrow and a green link
- Explanation, with a "Sample" tag on starter rows
- Viewed and Accepted counts
- a row ⋯ menu and ›

The page also has search, Columns, and Export controls. It **ships with sample rules**: Acmeco → AcmeCo, net-net → ultimately, QoS → quality of service, synergies (flag only). The header has **Import list** and **Add rule**.

The **Add Rule** modal contains:
- "Original text (required)" as a **token input**: several variants show as removable chips, for example `mobben ×`
- "Replacement text", also a token input
- "Explanation", a free-text field shown to the user (max 400 characters). Example: "Use a capital M for the word Mobbin, and remember it must be 'i,' not 'e.'"
- a collapsible **Formatting options** section:
  - "Original text is case-sensitive (Aa)"
  - "Replacement text is lowercase at the start of a sentence"
  - "Context awareness", with the example "brand, feature, or pricing"
- a collapsible **Related Materials** section: Link plus "Display name" (max 50)
- **Cancel** / **Save**

The first-time tutorial is a dark coachmark next to the field: "Let's add your first rule: organization name. What are some incorrect ways that your organization's name might be written?" with **Skip tutorial** / **Next Step**.

### 2.3 Writing preferences
Screens: `79948195`, `a8696fd6`, `f713293b`, `7af27432`.

Preferences are a table, one row per check. Columns:
- "Team setting", a dropdown defaulting to "No preference"
- Preference name
- Explanation, with an **Example** link
- Category

Rows include:
- Detect AI text
- Adhere to APA, MLA, or Chicago citation styles
- Rewrite sentences for clarity (Clarity)
- Sound more confident (Voice and tone)
- Avoid starting sentences with conjunctions in academic writing (Formality)
- Use a consistent style of abbreviation (Consistency)
- Use consistent capitalization (Consistency)

The page also has **All Categories** filters and search. Preferences are organised into named sets.

### 2.4 Brand tones
Screens: `f881c119`, `ad5a6f78`, `a797af72`.

Brand tones are set up through the **"Set up your tone profile"** wizard:
- It asks scenario questions, for example "How would you want your team to ask a user for more information? (2/4)".
- Each question offers **three sample-sentence cards** plus "None of these", with a progress bar.
- A review step lists every question with the chosen quote in green italics.
- **Analyze Answers** leads to a success screen ("Grammarly has finished analyzing your answers…") with **View tone profile**.

**Pattern worth noting:** the user picks example sentences instead of abstract tone sliders.

### 2.5 Snippets
Screens: `9d92ac85`, `b8065802`, `d44eed0a`, `c551c593`; feature settings `d195f236`.

- Snippets are organised as a collection list, with columns for Collection (with count), Snippets shared with, Permissions, and Actions. The header has **Create snippet** and **Create collection**.
- An empty collection reads: "Turn commonly used phrases, sentences, and entire paragraphs into reusable snippets to save time." with a **Create snippet** button.
- **Import Snippets In Bulk** is a 2-step modal for CSV or Excel, with a drag-and-drop zone and **Import**.
- Under Feature customization, "Use snippets when I write" is a toggle, and **Assign shortcuts** sets:
  - "View snippet list" → `\`
  - "Create new snippet" → `ctrl + $`
  - Both are free text inputs with an **Assign** button.

### 2.6 Feature customization (personal)
Screen: `d195f236`.

- **Generative AI** toggles:
  - "Brainstorm, write, and rewrite with Grammarly's generative AI assistance"
  - "Show Generative AI on text selection"
  - "Show Generative AI for quick replies"
  - "Show recent prompt history"
- **Snippets**: as described in 2.5.
- **Suggestion bundles**: "Save time by accepting or dismissing multiple suggestions at once." with the toggle "Use bundles for spelling, punctuation, and grammar suggestions in the same sentence".

### 2.7 Analytics: "Your writing progress"
Screen: `a8266f21`.

- **Weekly Summary**, with a date range such as "January 13, 2025 — January 19, 2025"
- A **Performance Score** card. Its empty state reads "There was no activity last week". It explains: "This score represents the quality of your writing this week based on the number of writing issues addressed." Next to it is a line chart of weekly scores (0–100).
- **Top Tones Detected**: a ranked list with emoji and horizontal bars, for example Confident, Direct, Informative, Inspirational.
- A survey slide-in at the bottom-right: "Hello from Grammarly!… It shouldn't take more than **1 minute**." with **Take the survey** / Dismiss.

The email preferences page (`f292db01`, `8133aa6c`) offers a "Weekly Progress Reports" opt-in.

### 2.8 Profile, admin, team (low relevance)
Screens: `bc6b059e`, `f0d50660`, `fdde18ab`, `b3b25b14`.

- The profile page includes "About You" dropdowns ("Most of my writing is for", "My primary function is"), which are used to tailor features.
- Team feature access has per-feature toggles: Generative AI, App actions, Personal dictionary, Personal snippets, Grammarly for Microsoft Office.

### 2.9 Onboarding (web)
Flow: `1d0b78d2…`. I saw the preview frames only, not all 21 screens.

The frames I saw, in order:
1. Landing page (`8edde093`)
2. Email sign-up and **Verify your email**: a 6-box OTP ("This code expires within 15 minutes"), "Resend the code", and Google / Facebook / Apple sign-up buttons
3. Questionnaire, **"I work in:"** a dropdown with radio cards, **Step 2 of 4** progress bar, **Back** / **Next** (Next disabled until answered), and **Skip step** under the progress bar
4. Plan picker (paywall; skipped for Matra)
5. Documents home with a seeded **"Welcome to Grammarly"** demo document showing 18 issues

**Pattern worth noting:** onboarding drops the user into a seeded demo document with real issues to fix.

---

## 3. Browser extension and desktop overlay [help-center, no Mobbin screens]

None of this was seen on Mobbin. It is summarised from search snippets of Grammarly and Superhuman help articles:
- "Turn off Grammarly in a text field" (115000091572)
- "Turn off Grammarly on one or more websites" (115000091612)
- "Browser extension user guide" (115000091592 / 46242146411277)
- "I don't see the full list of suggestions…" (5321259769357)
- Desktop article 4412816078349

The only Mobbin artefact is a marketing mock on the landing page (`8edde093`). It shows a rounded card under an underlined phrase in a Slack-like field, reading "**Specify a deadline** to review the plan. **Show this change ›**", with the round G button at the bottom-right of the field. Treat it as illustrative only.

### 3.1 Floating G button
- **Position:** the lower-right corner of the focused text field.
- **States:**
  - While checking, the button shows activity.
  - When the check finishes, it shows **the number of suggestions**.
  - The toolbar icon shows a green check when it's active on a site, versus "Grammarly is off for this site".
  - I could not confirm the exact idle and all-clear glyphs from the text sources.
- **Click:** opens a **floating suggestion card**, or with many suggestions the expanded assistant, which "you can position anywhere on the screen".
- **Hover:** reveals a **power button**. Clicking it offers **"turn off until next visit"** or **"turn off forever"** for that field or site.
- **Desktop app (Mac):** the widget can be moved to other **anchor points marked by blue dots**, and **its location is saved per app or website**. Once the panel is open it can be dragged anywhere. Clicking × or switching windows returns it to its anchor.
- **Per-site and per-app control:**
  - In the browser, through the toolbar popup's toggles.
  - On Mac, through the **menu-bar icon**, which can turn Grammarly off for the current app.
  - **Settings › Block list** manages blocked apps and sites and lets you remove entries.
  - A known pain point: users who picked "forever" couldn't find how to undo it. Matra should make undo easy to find.

### 3.2 Inline suggestion card on underlines (extension and desktop)
- Clicking or hovering an underline opens a card with the suggestion. **Clicking the suggestion itself accepts it.**
- Other buttons:
  - Dismiss, shown as a trash icon or a "Dismiss" label
  - **Add to dictionary**, shown as a book icon in older versions, for spelling suggestions
  - the **⋯** menu, which contains **Edit settings** and, for some categories, **"Hide suggestions like this"**
- **"Review all"** on any card opens the full assistant panel.
- I did not find "See more in Grammarly" in any source, so the exact label is unconfirmed. Firefox's listing says you can "expand the suggestion to learn more about it", which fits an expandable explanation.
- The card stays docked near the word, and the assistant can be detached.

### 3.3 Generative AI on selection
- Selecting two or more words shows an **Improve** or **"Improve it"** affordance.
- That opens a menu of prompts (**Improve, Rephrase, Shorten, Friendly**, and more) plus a custom **"Tell us to…"** field.
- **Insert** replaces the selection. A **double-arrow** icon regenerates.
- In the newer Superhuman "Inline Intelligence", the icon sits at the **lower-right edge of the selection** and the menu offers Proofread, Rephrase, Shorten, and a custom prompt.

---

## 4. Mobile keyboard (iOS/Android) [help-center / App Store, no Mobbin screens]

Mobbin has no screens for the keyboard. From the App Store listing and help-article snippets:
- The keyboard offers spelling, grammar and conciseness suggestions in a strip above the keys.
- It has tone detection, plus tone rewrites on paid plans.
- AI rewrites cover the whole message and are offered in 19 or "20+" languages, depending on the source.
- The rewrite flow is **Improve** → pick a prompt or type in "Tell us to…" → **Insert**.

---

## 5. Agents (Grammarly Docs, Aug 2025+) [help-center / press]

These agents live in the new "Docs" editor at app.grammarly.com, which is desktop-browser only and English only. Mobbin's captures predate it, so I saw no screens.

| Agent | What it does (per Grammarly copy) |
|---|---|
| Reader Reactions | "See how your writing might land with readers and get tips to revise… for the impact you want" |
| AI Grader | Feedback against your rubric and course info, plus an estimated grade |
| Citation Finder | Finds sources, fact-checks claims, auto-generates citations |
| Proofreader | Grammar, clarity and structure as you write |
| Paraphraser | Rewrites toward academic, professional, creative or a **custom voice** |
| AI Detector | Flags AI-sounding passages and "know exactly where you need to edit" |
| Humanizer | Makes AI-assisted drafts read more naturally "without changing what you mean" |
| Plagiarism Checker / Expert Review | Listed by some sources; Pro-only at launch |

What's visible today in the pre-Docs editor:
- The "Increase your impact" card (1.6) is an early form of Reader Reactions.
- The AI/plagiarism tab (1.9) is an early form of the AI Detector and Plagiarism Checker.

---

## 6. Microcopy worth noting

| Context | Copy |
|---|---|
| Empty doc placeholder | "Type or paste (⌘+V) your text here or upload a document." |
| Panel empty states | "The first word is the hardest." · "Start writing to make the magic happen." · "Time to dig in." · "You got this." + "Suggestions will appear here." |
| All fixed | "You did it!" / "There are no more suggestions." |
| Impact done | "You're on point!" / "No more ideas for your audience." [Go back] |
| Card header | "Clarity · Remove the phrase", "Correctness · Change the spelling", "Engagement · Choose a different word" |
| Card buttons | Accept · Dismiss · ⋯ |
| ⋯ menu | "Turn off suggestions like this" · "Incorrect suggestion" · "Offensive content" |
| AI prompt box | "Tell us to…" |
| AI landing | "What do you want to do?" / "Here are some ideas" |
| Voice | "Select up to three" · "These voice settings will apply to any text you generate." · [Use this voice] |
| Goals | "Get tailored writing suggestions based on your goals and audience." · "Show Set Goals when I start a new document" · [Reset to defaults] [Done] |
| Score | "Great job! Your text scores 100 out of 100." |
| Readability | "…understood by a reader who has at least a 9th-grade education (age 15)." |
| Dictionary | "These words will no longer be flagged as misspellings." |
| Snippets empty | "Turn commonly used phrases, sentences, and entire paragraphs into reusable snippets to save time." |
| Feedback | "How do you like Grammarly?" I dislike it / It's OK / I like it! · "How can we improve?" |
| Toasts | "Thanks for the feedback!" · "Copied to clipboard" · "The preference set was added." |
| Plagiarism summary | "6% of your text matches external sources" · "We didn't detect common AI text patterns" |

---

## 7. What Matra should adopt (prioritized)

Paywall and upgrade patterns are skipped because Matra is free.

1. **Expanded suggestion card anatomy.** The header should read `Category · Action`, for example "Clarity · Remove the phrase", with an ⓘ icon. Below it, show a **context snippet with an inline diff** (old text struck through, new text bold) and **alternative chips** when there are several fixes. The buttons should be Accept (primary), Dismiss (text) and ⋯. Use the same component in the editor panel and the floating card. (`82d0d01f`, `b727d76e`, `59508691`)
2. **A ⋯ menu with "Turn off suggestions like this" and "Incorrect suggestion".** The first writes a rule into Matra's style or preferences. The second is a local false-positive log. Both cut repeated noise without opening settings. (`b727d76e`)
3. **Explanation-only cards** for issues with no safe automatic fix, such as person, tone or structure. Show only an explanation, Dismiss and ⋯, with no Accept button. Never offer a bad automatic fix. (`352b524f`)
4. **Highlight the active suggestion's word** with a category-tinted fill while its card is open. Tint the whole paragraph for paragraph-level rewrites. Do this in the editor and in Matra's in-app overlay. (`59508691`, `f96806f1`)
5. **A category filter bar with counts** above the suggestion list: Correctness, Clarity, Engagement, Delivery, and Style guide for Matra's rules. Use collapsed one-line rows with a single expanded card, and re-count live, including the singular "Review suggestion 1". (`82d0d01f`, `af085d44`)
6. **Instant score feedback.** The score chip should update right after Accept (92 → 97) and show a spinner while rechecking. Clicking the word count should open a stats modal with plain-language readability ("a reader with ~9th-grade education"), ⓘ tooltips that explain each metric, and an export option. (`471e731a`, `a417a346`, `87cd8f25`)
7. **Floating badge behaviour (macOS overlay).**
   - Show checking, count and all-clear states.
   - Let the user drag the badge between **snap anchors**, and remember the position **per app or bundle ID**.
   - On hover, reveal a power control with "Pause in this app until relaunch" and "Never in this app".
   - Add a **Block list** in settings with an easy **Re-enable** action.
   - Add a "Turn off for <App>" item in the menu-bar menu.
   - (help-center, 3.1)
8. **"Review all" on the floating card** opens Matra's full assistant panel, scrolled to the same suggestion. Also add a **suggestion-bundle** action: "Fix all spelling/punctuation in this sentence", with an on/off toggle in settings. (3.2, `d195f236`)
9. **A selection mini-toolbar.** When two or more words are selected, show a small pill just below or to the right of the selection. It opens rewrite presets plus a free "Tell Matra to…" field, with Insert or Replace and Regenerate (⟲). It should work in the main editor and through ⌃⌥M in other apps. (`faab72cd`, 3.3)
10. **Goals as segmented chips, one line of explanation per row,** plus a "Show goals when I start a new document" checkbox and Reset to defaults. Make goals visibly change the checks, as Academic does by flagging personal pronouns. Add Bangla-specific rows such as সাধু vs চলিত register. (`ee48ae45`, `bf73d0e8`)
11. **A "Voice" profile for generation:** Formality (choose one), Tone (up to three chips), Profession, and Dialect (en-US, en-GB, en-IN; for Bangla, Bangladesh vs West Bengal spelling). Apply it to Rewrite and Compose and say so in the UI ("applies to any text you generate"). (`be218681`, `760e6763`)
12. **Grouped AI prompt menu** (Rewrite / Evaluate / Ideate / Write) with the prompt box docked at the bottom of the panel, plus copy and ⋯ on each result. Add "Evaluate" prompts such as "Identify any gaps" and "Pick out my main point". (`ef979bb7`, `fc8dd542`)
13. **Friendly empty states** in four tiers (empty document → no issues yet → all fixed "You did it!" → goal ideas exhausted), each with an illustration, two short lines and, when it helps, a **Go back** button. Localise each into Bangla. (1.5)
14. **Style rule editor:** token inputs so one rule can catch several misspellings, a user-facing explanation (max 400 characters), case-sensitive and sentence-start options, an optional reference link, **Import list** (CSV), and **sample rules preloaded**. Also show per-rule "Viewed / Accepted" counts so users can prune dead rules. (`8a2bad3a`, `b0ab0592`, `8c941f2c`)
15. **Personal dictionary page:** a single "Add a new word" field with an Add button, an "Added words" list with delete buttons, and "Import list". Also offer **Add to dictionary** directly on spelling cards, and the same for Bangla words. (`e9ce3028`, 3.2)
16. **Editor settings** with toggles for auto-jump to the next suggestion, don't check inside quotes, larger font, **colorblind mode** (different underline styles per category), and a link to per-rule suggestion management. (`da4aa02a`)
17. **Weekly insights:** a weekly score line chart, Top tones detected with bars, and an empty state that reads "There was no activity last week". Keep this local, with an optional macOS notification instead of email. (`a8266f21`)
18. **First-run coachmarks tied to real UI:** anchor a "Review suggestions — Next" tooltip on the first real card, plus a seeded "Welcome to Matra" demo document with deliberate English and Bangla errors. The onboarding questionnaire should show "Step x of y" with **Skip step**. (`e36b29ab`, onboarding flow)
19. **Documents list cards** show each document's open-issue count, plus a "Saved" indicator in the editor title bar. (`337f4502`, `af085d44`)
20. **In-panel feedback form** with three faces, a free-text box and a toast. The data stays local or is opt-in. (`e6aa864a`)

---

## 8. Features Grammarly has that Matra still lacks

The list is ordered from most to least valuable for a free English and Bangla Mac app.

1. **Alternative-choice chips** on a single suggestion. Matra's small card shows one replacement.
2. **"Turn off suggestions like this"** and **"Incorrect suggestion"** feedback right on the card.
3. **"Increase your impact" / Reader Reactions:** audience-aware paragraph rewrites with a stated intent, shown with a green-highlighted diff.
4. **Selection-triggered AI pill** that offers rewrite and prompt on any selection, inside other apps too, without opening the panel.
5. **Snippets** with a trigger character (`\`), a create shortcut, collections, and CSV import.
6. **Suggestion bundles** that accept or dismiss every mechanical fix in a sentence at once.
7. **Per-app badge position memory, snap anchors, a pause option, and a block list UI.** Matra has a badge, but no documented controls for placing or pausing it.
8. **Writing preferences catalogue:** turn individual check types on or off (Oxford comma, passive voice, hedging, conjunction at sentence start, consistent abbreviations and capitalization), each with an explanation and an Example link.
9. **Tone profile wizard** built on sample sentences instead of abstract settings.
10. **Plagiarism and citation finding** (source match, "Copy reference" in APA/MLA/Chicago), and **Citation Finder**. These need a network or a search API. Consider an opt-in offline-friendly variant: a citation formatter only.
11. **AI-text detector and Humanizer:** flag AI-sounding passages and rewrite them to sound natural.
12. **AI Grader:** feedback against a rubric that the user pastes in.
13. **Readability benchmarks:** word length, sentence length, unique and rare words compared with a baseline, an explanation of education level, and a PDF stats report.
14. **Weekly progress history** with a score trend and top tones.
15. **Version history** and **upload or download** of .docx/.odt/.rtf/.txt for local documents.
16. **Dialect selection** for English (US/UK/CA/AU/IN), and the Bangla equivalent.
17. **Colorblind underline styles** and a **"don't check inside quotes"** option.
18. **Guided first run** with a seeded demo document and anchored coachmarks.

---

## 9. Sources (non-Mobbin)

These came through WebSearch summaries. The pages themselves could not be fetched because the hosts are blocked in this session.

- [Turn off Grammarly in a text field](https://support.grammarly.com/hc/en-us/articles/115000091572-Turn-off-Grammarly-in-a-text-field)
- [Turn off Grammarly on one or more websites](https://support.grammarly.com/hc/en-us/articles/115000091612-Turn-off-Grammarly-on-one-or-more-websites)
- [Grammarly's browser extension user guide](https://support.grammarly.com/hc/en-us/articles/115000091592-Grammarly-s-browser-extension-user-guide) / [Superhuman mirror](https://help.superhuman.com/hc/en-us/articles/46242146411277-Grammarly-s-browser-extension-user-guide)
- [I don't see the full list of suggestions (extension)](https://support.grammarly.com/hc/en-us/articles/5321259769357-I-don-t-see-the-full-list-of-suggestions-when-using-the-Grammarly-browser-extension)
- [Grammarly desktop article 4412816078349](https://support.grammarly.com/hc/en-us/articles/4412816078349)
- [Generative AI on mobile](https://support.grammarly.com/hc/en-us/articles/24086943816845-How-to-use-Grammarly-s-generative-AI-on-my-mobile-device)
- [Get started with Inline Intelligence](https://support.grammarly.com/hc/en-us/articles/47686551174029-Get-started-with-Inline-Intelligence)
- [Customize the Grammarly agent](https://support.grammarly.com/hc/en-us/articles/48202938578317-Customize-the-Grammarly-agent)
- [Grammarly Docs](https://www.grammarly.com/docs) · [AI agents](https://www.grammarly.com/ai-agents) · [SiliconANGLE launch coverage](https://siliconangle.com/?p=707436)
- [Grammarly Keyboard on the App Store](https://apps.apple.com/us/app/grammarly-keyboard-type-with-ease/id1158877342)
