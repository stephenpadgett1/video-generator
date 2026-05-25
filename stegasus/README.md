# stegasus — Ring 1 site

Static landing for `stegasus.net`. One page, no JS, no backend yet.

```
public/
├── index.html      # /  — landing + product framing
└── favicon.svg
```

## What's here

Single page. Brand mark, tagline, plain-English explainer of the 16-byte product, examples, $15 price, email-notify CTA (mailto, no backend).

That's Ring 1: make the URL embedded in the first video's audio watermark not a lie. When the viewer decodes `stegasus.net` from the audio and types it in, they land somewhere real that explains what they just found.

---

## Domain (your action)

You've registered **`stegasus.net`** already. ✓

Optionally also defensive: `stegasus.com`, `stegasus.io` (if you care about typo-traffic going to the wrong place).

---

## DNS + hosting — Cloudflare Pages

Free for static sites, free SSL, free custom domains. Deploys from a git repo.

### One-time setup

1. Push this `stegasus/` directory to a fresh GitHub repo (or include it in an existing one).
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
3. Build settings:
   - Framework preset: *None*
   - Build command: *(leave empty — static)*
   - Build output directory: `public` (or `stegasus/public` if not at repo root)
4. Cloudflare assigns a `*.pages.dev` URL — open it and confirm the page renders.

### Custom domain — `stegasus.net`

In the Pages project → Custom domains → Add → enter `stegasus.net`.
- Registrar is somewhere other than Cloudflare? Cloudflare gives you the DNS records to add at the registrar (nameserver delegation is cleanest; CNAME also works).
- Add `www.stegasus.net` too if you want both to resolve.

### Contact

CTA is a plain `mailto:` link to `stephen+stegasus@centaur-services.com`. Address is visible in page source — fine for this stage; the `+stegasus` tag makes it easy to filter signups in inbox rules. Swap to a form backend (Formspree, Basin, etc.) later if scraping becomes a problem.

---

## Verifying the loop

Once DNS propagates (5–60 min):

```bash
curl -sI https://stegasus.net/ | head -1
# → HTTP/2 200
```

Then the moment of truth: publish the video, decode the watermark from a downloaded copy with `audiowmark get`, see the bytes resolve to `stegasus.net` (plus four NULs), type it in the browser, land on the page. Loop closed.

---

## What's deliberately NOT here

Per the Ring 1 / Ring 2 / Ring 3 split:

- **No backend.** Email signup is `mailto:` for now. When you want a real list, swap in Buttondown / Listmonk / a tiny serverless function.
- **No hosted decoder.** Curious viewers install `audiowmark` themselves. That's fine — it filters for the right audience. Ring 2 ships a web-based decoder (drag a video file in, see the 16 bytes pop out).
- **No checkout.** The "$15" is positioning copy until the actual sender flow ships. Ring 2.
- **No moderation queue / submission form.** Ring 2.

---

## Cost summary

| | One-time | Ongoing |
|---|---|---|
| `stegasus.net` registration | ~$15 (.net first year) | ~$15/yr |
| Cloudflare Pages hosting | $0 | $0 |
| Cloudflare DNS | $0 | $0 |
| Cloudflare Email Routing (optional) | $0 | $0 |
| **Total Ring 1** | **~$15** | **~$15/yr** |
