# How changes reach the live site

Nothing goes to **typemywordz.ai** without being reviewed first. This is the path
every change takes.

## The path

1. **Work happens on the `preview` branch.** Never directly on `main`.
2. **Vercel builds it automatically** and publishes it at a private preview URL.
   `main` is untouched, so customers see nothing.
3. **A pull request** is opened from `preview` into `main`. That page shows exactly
   what changed, line by line, plus the preview link.
4. **A human clicks Merge.** Only then does Vercel rebuild typemywordz.ai.

If something looks wrong, close the pull request. Nothing ships.
If something is merged and turns out to be wrong, GitHub's "Revert" button undoes
it in one click.

## Why `preview` is long-lived

Firebase only allows Google sign-in from domains on its approved list. Vercel gives
each branch a **stable** preview URL, but a different one per branch name. Using a
single long-lived `preview` branch means that URL only has to be approved in Firebase
once, instead of every time we start a new piece of work.

The stable URL for this branch is registered under:

> Firebase Console → Authentication → Settings → Authorized domains

## Important: preview shares live data

The preview is a separate copy of the **front end only**. It talks to the same
backend, the same Firebase database and the same Stripe account as production.

- Browsing and looking at the preview: safe and free.
- Actually transcribing a file on the preview: creates a real transcription and
  uses real credits.
- Deleting things or testing payments on the preview: hits live records. Don't.

## Branch reference

| Branch | Purpose |
| --- | --- |
| `main` | Live. Deploys to typemywordz.ai on every push. |
| `preview` | Work in progress. Deploys to the private preview URL. |
