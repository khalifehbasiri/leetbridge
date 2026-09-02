# Chrome Web Store Listing

## Product details

**Name:** LeetBridge

**Summary:** Automatically sync accepted LeetCode solutions to a polished
GitHub repository.

**Category:** Developer Tools

**Language:** English

## Detailed description

LeetBridge saves accepted LeetCode solutions directly to a GitHub repository
chosen by the user.

After connecting GitHub, LeetBridge can:

- detect accepted submissions and capture the submitted code and language;
- organize solutions in naturally sorted problem folders;
- maintain per-problem documentation and a repository-wide progress table;
- preserve custom root README content outside its generated markers;
- prevent duplicate uploads using LeetCode submission IDs;
- import the latest accepted historical solution for each problem and
  language; and
- rebuild the README index from repository folders when needed.

Users never paste access tokens or edit extension code. GitHub access is
granted through the LeetBridge GitHub App and can be limited to one dedicated
solutions repository. LeetBridge has no developer-operated backend, no ads,
and no analytics.

## Single purpose

LeetBridge captures accepted LeetCode solutions and saves them to a
user-selected GitHub repository.

## Permission justifications

**activeTab:** Determines whether the active tab is a LeetCode problem page,
shows the current problem in the popup, and starts a user-requested historical
import from that page.

**storage:** Stores extension settings, GitHub authorization, the selected
repository, duplicate-submission identifiers, import progress, and the latest
sync result on the user's device.

**Host access to github.com:** Starts GitHub's Device Flow authorization and
opens the GitHub App installation page.

**Host access to api.github.com:** Lists repositories granted to the GitHub
App and reads or writes solution files and generated README files in the
repository selected by the user.

**Content script access to LeetCode problem pages:** Detects problem metadata,
submission status, language, submitted code, and the signed-in LeetCode
username. Historical submission history is read only after the user selects
Import previous solutions.

## Privacy disclosure notes

The extension handles authentication information, website content, and a
LeetCode username. This data is used only for the extension's single purpose,
is not sold, is not used for advertising or credit decisions, and is not sent
to a developer-operated server. Accepted code and generated metadata are sent
directly to the user's selected GitHub repository.

Use `PRIVACY.md` as the public privacy policy and ensure its hosted URL is
entered in the dashboard.

## Support links

- Homepage: https://github.com/khalifehbasiri/leetbridge
- Support: https://github.com/khalifehbasiri/leetbridge/issues
- Security: https://github.com/khalifehbasiri/leetbridge/security/advisories/new

## Graphic assets

- Store icon: `resources/icon128.png`
- Small promotional tile: `store-assets/small-promo-440x280.png`
- Product screenshots:
  - `store-assets/screenshot-popup-1280x800.png`
  - `store-assets/screenshot-github-setup-1280x800.png`
