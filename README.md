# OPEN CALL — Art Grants & Exhibition Opportunities

A free, curated index of 400+ international art grants, open calls, residencies, exhibitions, and prizes.

🌐 **Live site:** [opencall.ca](https://opencall.ca)

---

## Structure

```
/
├── index.html      # Page structure (no inline CSS or JS)
├── style.css       # All styles
├── main.js         # All logic — fetches data.json on load
├── data.json       # All listings — EDIT THIS to add/remove/update entries
├── CNAME           # Custom domain
├── .nojekyll       # Prevents Jekyll processing
└── README.md
```

## How to update listings

**To add a listing** — open `data.json` and add a new entry to the array:
```json
{
  "id": 999,
  "type": "grant",
  "title": "Example Grant",
  "org": "Example Foundation",
  "location": "New York, USA",
  "region": "north-america",
  "deadline": "2026-09-01",
  "amount": "$10,000",
  "discipline": ["Visual Art"],
  "description": "Description here.",
  "eligibility": "Open internationally.",
  "url": "https://example.org"
}
```

**To update a deadline** — find the entry in `data.json` by title or id and change the `deadline` field.

**Expired listings are handled automatically** — any listing whose deadline has passed is sorted to the bottom and greyed out. No manual removal needed.

**To remove a listing** — delete its object from `data.json`.

After any change, commit and push to `main`. GitHub Pages deploys automatically within ~30 seconds.

---

## Deployment (GitHub Pages)

1. Push this folder to a GitHub repo
2. Go to **Settings → Pages → Source** → Deploy from branch `main`, folder `/` (root)
3. Add a custom domain under **Settings → Pages → Custom domain**: `opencall.ca`
4. Update your DNS records:

| Type  | Host | Value                   |
|-------|------|-------------------------|
| A     | @    | 185.199.108.153         |
| A     | @    | 185.199.109.153         |
| A     | @    | 185.199.110.153         |
| A     | @    | 185.199.111.153         |
| CNAME | www  | your-username.github.io |

---

© Open Call. All rights reserved.
