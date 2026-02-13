# The Agora — Deployment Guide

## What This Is

A complete, ready-to-deploy web application. Visitors to your site can submit any contested topic and receive a structured philosophical discourse examining it from multiple perspectives.

## What's In the Package

```
agora-deploy/
├── public/
│   └── index.html      ← The entire frontend (one file)
├── api/
│   └── generate.js     ← Serverless function (proxies to Anthropic API)
├── vercel.json          ← Vercel deployment configuration
├── package.json         ← Project metadata
└── DEPLOY.md            ← This file
```

## Deployment Steps (30 minutes, one time)

### Step 1: Get an Anthropic API Key

1. Go to https://console.anthropic.com
2. Sign up or log in
3. Navigate to "API Keys" in the left sidebar
4. Click "Create Key"
5. Copy the key somewhere safe — you'll need it in Step 4

To fund it: Add a credit card under Billing. Start with $20–50. The Agora uses Claude Sonnet, which costs roughly $0.01–0.03 per discourse cycle. At 5 cycles/day, you'd spend roughly $5–15/month.

### Step 2: Create a GitHub Account and Repository

1. Go to https://github.com and sign up (free)
2. Click the "+" icon (top right) → "New repository"
3. Name it `the-agora`
4. Set it to Public or Private (your choice)
5. Click "Create repository"
6. You'll see a page with instructions — leave this open

### Step 3: Upload the Files to GitHub

**Option A — Using the GitHub web interface (easiest):**

1. On your new repository page, click "uploading an existing file"
2. Drag all the files and folders from this package into the upload area
   - Make sure the folder structure is preserved (public/ and api/ folders)
3. Click "Commit changes"

**Option B — Using GitHub Desktop (more reliable):**

1. Download GitHub Desktop from https://desktop.github.com
2. Clone your new repository to your computer
3. Copy all files from this package into the cloned folder
4. In GitHub Desktop, you'll see the changes listed
5. Type a commit message like "Initial Agora deployment"
6. Click "Commit to main" then "Push origin"

### Step 4: Deploy to Vercel

1. Go to https://vercel.com and click "Sign Up" — use your GitHub account
2. Click "Add New..." → "Project"
3. You'll see your GitHub repositories — select `the-agora`
4. Under "Environment Variables", add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: (paste your API key from Step 1)
5. Click "Deploy"
6. Wait ~60 seconds. Vercel will give you a URL like `the-agora-abc123.vercel.app`

### Step 5: Test It

1. Visit your new URL
2. Click "Example Discourses" to see the pre-generated ones
3. Enter a topic and click "Begin Discourse"
4. Wait 15–30 seconds for the AI to generate the discourse

### Step 6 (Optional): Custom Domain

If you want this at `agora.stillthinking.org` or similar:

1. In Vercel, go to your project → Settings → Domains
2. Add your domain (e.g., `agora.stillthinking.org`)
3. Vercel will tell you what DNS records to add
4. Go to your domain registrar and add those records
5. Wait for DNS propagation (usually minutes, sometimes hours)

## Ongoing Costs

- **Vercel hosting**: Free tier is generous (100GB bandwidth/month)
- **Anthropic API**: ~$0.01–0.03 per discourse cycle
- **Domain**: Whatever you currently pay for stillthinking.org
- **Rate limit**: Currently set to 5 cycles per visitor per day (adjustable in api/generate.js)

## Making Changes

When you want to update the site:
1. Edit the files in your GitHub repository
2. Vercel automatically redeploys within seconds
3. Your URL stays the same

For content changes (intro text, examples, etc.) — edit `public/index.html`.
For API behaviour changes (rate limits, prompt, model) — edit `api/generate.js`.

## If Something Goes Wrong

- **Discourse generation fails**: Check that your ANTHROPIC_API_KEY is set correctly in Vercel → Settings → Environment Variables
- **Site won't load**: Check Vercel → Deployments for error logs
- **Rate limit hit**: Visitors see a clear message. Limit resets daily.
- **Costs too high**: Reduce the rate limit in api/generate.js (change the `>= 5` to a lower number)

## Getting Help

Bring any issues back to Claude. The codebase is simple enough that we can diagnose and fix most problems in a single conversation.
