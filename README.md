# OPEN CALL — Art Grants & Exhibition Opportunities

A free, curated index of 400+ international art grants, open calls, residencies, exhibitions, and prizes. Search by region, medium, and deadline.

🌐 **Live site:** [opencall.ca](https://opencall.ca)

---

## About

OPEN CALL is a single-page static site built with plain HTML, CSS, and JavaScript — no build tools or dependencies required. All data is embedded directly in the HTML file.

## Deployment

This site is hosted via **GitHub Pages**.

To deploy:
1. Push changes to the `main` branch
2. In your repo settings, go to **Pages → Source** and set it to deploy from the `main` branch (root `/` or `/docs` folder, depending on your setup)
3. Point your custom domain (`opencall.ca`) to GitHub Pages by updating your DNS records

### Custom Domain DNS (for opencall.ca)

Add these DNS records with your domain registrar:

| Type  | Host | Value                   |
|-------|------|-------------------------|
| A     | @    | 185.199.108.153         |
| A     | @    | 185.199.109.153         |
| A     | @    | 185.199.110.153         |
| A     | @    | 185.199.111.153         |
| CNAME | www  | your-username.github.io |

Then add a `CNAME` file to this repo containing: `opencall.ca`

## Structure

```
/
├── index.html      # The entire site — all CSS, JS, and data inline
├── CNAME           # Custom domain (add this once you configure GitHub Pages)
├── .nojekyll       # Prevents GitHub from processing the site with Jekyll
└── README.md
```

## License

© Open Call. All rights reserved.
