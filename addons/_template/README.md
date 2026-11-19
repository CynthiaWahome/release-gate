# Add-on name

One or two sentences: what this adds and why you would want it.

## What it does

Describe the behaviour in plain English. Say what it changes about a release and what it leaves alone.

## Needs

- **Variables:** list each repository variable it reads and what it does, or "none".
- **Secrets:** list each secret by name only, or "none". Say which workflow step reads it.
- **Packages:** list any npm packages it needs, or "none".
- **Other add-ons:** list any it depends on, or "none".

## Wire it in

1. Copy the files from `files/` to the paths listed under `copies` in `addon.json`.
2. If `addon.json` lists any `patches`, make each edit described there.
3. Set the variables and secrets above.

Keep this to a few numbered steps. If it needs more, the add-on is probably doing too much.

## Safe by default

Say what happens with no configuration. A fresh copy of this add-on must not publish anything or change a store.

## How it was tested

State whether it was tested against a fake or the real service, with the exact commands you ran. If something could not be tested, say so.

## Why it exists

The problem it solved, in a few sentences. Keep the reasoning so it is not lost.
