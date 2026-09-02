# Publishing LeetBridge

This file is for the extension publisher, not end users.

Before building the Chrome Web Store package:

1. Register the production LeetBridge GitHub App.
2. Give it **Contents: Read and write** repository permission.
3. Disable webhooks and enable Device Flow.
4. Put its public client ID and app slug in `background/github-config.js`.
5. Verify that the connection screen lets a test user grant access, sign in,
   select a repository, and sync an accepted solution.
6. Package the configured extension for the Chrome Web Store.

Never put a GitHub client secret, private key, or user access token in the
extension package.

## Public repository checklist

- Confirm that only the public GitHub App client ID and app slug are present.
- Search the working tree and Git history for tokens, private keys, and secrets.
- Confirm that GitHub secret scanning and push protection are enabled.
- Review `PRIVACY.md` against the current behavior and Chrome Web Store data
  disclosures.
- Run the JavaScript and manifest validation workflow.
- Review the staged diff before committing and pushing.

## Chrome Web Store package contents

Package only these runtime paths:

```text
manifest.json
background/
content/
github/
popup/
resources/
```

Do not include `.git`, `.github`, local environment files, documentation,
screenshots, editor settings, or development archives in the store ZIP.
