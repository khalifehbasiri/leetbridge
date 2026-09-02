# LeetBridge

<img src="resources/LeetBridge-logo.png" alt="LeetBridge logo" width="128">

LeetBridge is a privacy-conscious Chrome extension that detects accepted
LeetCode submissions and saves the submitted source code to a GitHub
repository selected by the user.

> Chrome Web Store release in preparation.

## Features

- Detects the current LeetCode problem, difficulty, user, and submission state.
- Captures the language and exact source code only when the user submits it.
- Syncs accepted solutions directly from Chrome to GitHub.
- Limits GitHub access through a fine-grained GitHub App installation.
- Requires no personal access token, local Git installation, or code setup from
  extension users.

## How it works

```text
LeetCode problem page
        ↓
Content scripts normalize problem and submission data
        ↓
Background service worker stores the current state
        ↓
GitHub Contents API writes the accepted solution
        ↓
<number>-<slug>/solution.<extension>
```

Example output:

```text
1-two-sum/solution.py
```

## User flow

1. Install LeetBridge from the Chrome Web Store.
2. Open LeetBridge and choose **Connect GitHub**.
3. Grant LeetBridge access to a dedicated solutions repository and authorize
   the connection.
4. Select the repository in LeetBridge.
5. Submit a solution on LeetCode. Accepted solutions sync automatically.

Users never edit extension files or paste authentication tokens.

## Security and privacy

LeetBridge has no developer-operated data backend. GitHub credentials remain
in trusted Chrome extension storage, and accepted code is sent directly to the
repository chosen by the user. The repository contains only the public GitHub
App client ID and app slug, never a client secret or private key.

GitHub's Contents permission applies to the complete selected repository, so a
dedicated solutions repository is recommended to keep access isolated.

Read the complete [privacy policy](PRIVACY.md) and
[security policy](SECURITY.md).

## Development

1. Clone the repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this repository.
5. Open a LeetCode problem and inspect LeetBridge from the toolbar.

The production GitHub App registration and release checklist are documented in
[PUBLISHING.md](PUBLISHING.md). End users do not perform those steps.

## Project structure

```text
background/   GitHub authentication, API access, and trusted storage
content/      LeetCode detection and normalized data extraction
github/       In-extension GitHub connection screen
popup/        Toolbar popup
resources/    Extension artwork
```

## Status

LeetBridge is under active development. The LeetCode interface can change, so
selectors and submission detection are verified before each store release.

## License

LeetBridge is source available, not open source. The code may be viewed for
portfolio evaluation, but no permission is granted to use, copy, modify, or
redistribute it without prior written permission. See [LICENSE](LICENSE).
