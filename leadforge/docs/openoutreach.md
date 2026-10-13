# Lead sourcing with OpenOutreach (free tier)

[OpenOutreach](https://github.com/eracle/OpenOutreach) finds B2B people who match a product description,
writes down *why* each one fits, and can buy a verified work email. It is GPLv3, so we run it as a separate
tool and import its CSV; no code is copied into LeadForge.

## What it costs
| Need | Free option |
|---|---|
| LLM key | Any OpenAI-compatible endpoint, e.g. Groq or Google Gemini's free tier, or local Ollama |
| Lead data | BetterContact free account: 40 credits, no card. **Searching is free**; 1 credit per verified email |
| Mailbox | Only needed for `openoutreach send`. Skip it and send from LeadForge instead |

## Steps
```bash
pip install uv                      # or: curl -LsSf https://astral.sh/uv/install.sh | sh
uv tool install openoutreach
openoutreach init                   # product + target market, LLM key, BetterContact key
openoutreach find 25 > leads.csv    # free: qualified leads without emails
openoutreach find 10 emails > leads.csv   # spends up to 10 credits for verified emails
```
Example target for Webtel: *"IT heads and owners of 50–500 employee manufacturing and logistics firms in
Tamil Nadu and Karnataka moving to cloud telephony / CRM."*

Then in LeadForge go to **People → Import CSV** and upload `leads.csv`. Each row becomes:
- a company lead (created if new, with its website), source `openoutreach`
- a person with title, LinkedIn URL and the verified email (stored in place of the guessed one)
- the person's notes get OpenOutreach's `reason`: why they fit. That is for you; don't paste it to the prospect

Each run outputs *all* leads found so far, so re-importing is safe: people are matched by company and name.
